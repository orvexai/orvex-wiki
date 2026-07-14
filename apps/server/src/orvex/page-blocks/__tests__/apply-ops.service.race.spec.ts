// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { ApplyOpsService } from '../apply-ops.service';
import { IdempotencyStore } from '../../../integrations/redis/idempotency-store.service';
import { PageRepo } from '../../../database/repos/page/page.repo';
import { KyselyDB } from '../../../database/types/kysely.types';

/**
 * ENG-1652 fix pass 2 — review-2 finding: "a 409 never poisons the slot"
 * is only true if the claim-WINNER's atomic CAS can fail too, not just the
 * claim-LOSER's replay path (which the original AC3 test alone drove).
 *
 * This is a real `SET NX`/`DEL` Redis double (CS zero-mock: fake the true
 * external at its client boundary) wired to the REAL `IdempotencyStore`, and
 * a hand-rolled `PageRepo`/`KyselyDB` double standing in for Postgres so the
 * race can be forced deterministically: `casIncrementMeta` always reports a
 * conflict, simulating a concurrent writer bumping the version in the
 * window between the (advisory, non-atomic) line-85 precheck and this
 * transaction's atomic CAS.
 */
class FakeRedisClient {
  private readonly store = new Map<string, string>();

  async set(
    key: string,
    value: string,
    ..._flags: unknown[]
  ): Promise<'OK' | null> {
    if (_flags.includes('NX') && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

describe('ApplyOpsService — AC3 slot-poisoning race (fix pass 2)', () => {
  const pageId = 'page-1';
  const workspaceId = 'ws-1';
  const userId = 'user-1';
  const idempotencyKey = 'race-key-1';

  const page = {
    id: pageId,
    workspaceId,
    deletedAt: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    content: { type: 'doc', content: [] },
  };

  function buildService(casSucceeds: boolean) {
    const fakeRedis = new FakeRedisClient();
    const redisService = {
      getOrNil: () => fakeRedis as unknown as Redis,
    } as RedisService;
    const idempotencyStore = new IdempotencyStore(redisService);

    const pageRepo = {
      findById: jest.fn().mockResolvedValue({ ...page }),
      getPageMeta: jest
        .fn()
        .mockResolvedValue({ version: 1, contentHash: null }),
      casIncrementMeta: jest.fn().mockResolvedValue(casSucceeds),
      updatePage: jest.fn().mockResolvedValue(undefined),
    };

    const db = {
      transaction: () => ({
        execute: (cb: (trx: unknown) => Promise<unknown>) => cb({}),
      }),
    };

    const service = new ApplyOpsService(
      pageRepo as unknown as PageRepo,
      db as unknown as KyselyDB,
      idempotencyStore,
    );

    return { service, idempotencyStore, pageRepo, fakeRedis };
  }

  const dto = {
    ifVersion: 1,
    ops: [
      {
        type: 'append' as const,
        node: { type: 'paragraph', attrs: { id: 'p1' } },
      },
    ],
  };

  it('releases the claimed slot when the atomic CAS 409s (claim-WINNER fails), so a same-key retry does NOT get a fabricated false-success', async () => {
    const { service, idempotencyStore, pageRepo } = buildService(false);

    await expect(
      service.applyOps(pageId, workspaceId, userId, dto, idempotencyKey),
    ).rejects.toMatchObject({
      response: { code: 'VERSION_MISMATCH' },
    });

    // The tx rolled back before the write — the CAS guard fired, the
    // chokepoint write never ran.
    expect(pageRepo.updatePage).not.toHaveBeenCalled();

    // The bug under fix: BEFORE the fix, this slot stayed pinned to
    // `{pending:true}` for the full TTL, so a same-key retry's `claim()`
    // would fall into the loser branch — poll out unresolved, and the
    // service would return `readSettledEnvelope(pageId)` (the concurrent
    // writer's state) as a fabricated 200. AFTER the fix, `release()` DELs
    // the key on the tx failure, so a fresh claim for the SAME key
    // succeeds again (`claimed: true`) instead of losing to a ghost.
    const retryClaim = await idempotencyStore.claim(
      'apply-ops',
      pageId,
      userId,
      idempotencyKey,
    );
    expect(retryClaim.claimed).toBe(true);
    expect(retryClaim.degraded).toBe(false);
  });

  it('ENG-1652 fix pass 3 (review-3 finding): a same-key retry with a STALE ifVersion replays the recorded envelope instead of 409ing at the precheck — the lookup() short-circuit runs before assertIfVersionMatches', async () => {
    const { service, idempotencyStore, pageRepo } = buildService(true);

    // getPageMeta reports the CURRENT (post-commit) version — 2 — while
    // the retry below sends the now-stale `ifVersion: 1` it originally
    // computed against. Before the fix, this combination 409s at the
    // line-~90 precheck (assertIfVersionMatches sees ifVersion !==
    // meta.version). After the fix, the read-only `lookup()` short-circuit
    // returns the settled envelope before the precheck is ever reached.
    pageRepo.getPageMeta.mockResolvedValue({ version: 2, contentHash: null });

    const recordedEnvelope = {
      version: 2,
      settledUpdatedAt: '2026-01-01T00:00:05.000Z',
      contentHash: 'winner-hash',
    };
    // Seed a settled (non-pending) record directly via the REAL store —
    // simulates the winner having already committed and record()-ed.
    await idempotencyStore.claim('apply-ops', pageId, userId, idempotencyKey);
    await idempotencyStore.record(
      'apply-ops',
      pageId,
      userId,
      idempotencyKey,
      recordedEnvelope,
    );

    const result = await service.applyOps(
      pageId,
      workspaceId,
      userId,
      dto, // dto.ifVersion === 1 — stale relative to the mocked meta.version 2
      idempotencyKey,
    );

    expect(result).toEqual(recordedEnvelope);
    // The CAS/tx path was never entered — this was a pure replay, not a
    // fresh (successful-by-luck) re-apply.
    expect(pageRepo.casIncrementMeta).not.toHaveBeenCalled();
    expect(pageRepo.updatePage).not.toHaveBeenCalled();
  });

  it('control: a successful CAS records the slot, so a same-key retry replays the recorded envelope (no regression on the happy path)', async () => {
    const { service, idempotencyStore } = buildService(true);
    // Retarget findById's second call (post-commit read in
    // readSettledEnvelope) to resolve — reuse the same mock resolved value.

    const result = await service.applyOps(
      pageId,
      workspaceId,
      userId,
      dto,
      idempotencyKey,
    );
    expect(result).toBeDefined();

    const retryClaim = await idempotencyStore.claim(
      'apply-ops',
      pageId,
      userId,
      idempotencyKey,
    );
    // The slot is now genuinely recorded (not pending) — the loser branch
    // returns the winner's real recorded result, not a fresh claim.
    expect(retryClaim.claimed).toBe(false);
    expect(retryClaim.result).toEqual(result);
  });
});
