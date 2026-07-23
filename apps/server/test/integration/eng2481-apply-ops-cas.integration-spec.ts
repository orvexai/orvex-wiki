// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2481 — DoD integration proof for the apply-ops CAS/atomicity
 * chokepoint (`ApplyOpsService`, shipped at HEAD as of this ticket).
 *
 * VERIFY + HARDEN, not rebuild: `ApplyOpsService` already composes the
 * replay-lookup -> advisory precheck (`assertIfVersionMatches`) -> in-memory
 * `applyOpsBatch` validation -> idempotency claim -> single tx
 * (`casIncrementMeta` + `updatePage`) -> release-on-failure -> settled read
 * ordering. This file proves that shipped behaviour end-to-end against a
 * REAL testcontainers Postgres (CS §5 — Postgres is local-substitutable
 * infra, never mocked) — never against internal helpers, always through
 * `ApplyOpsService.applyOps` and a fresh re-read of the persisted row state.
 *
 * Zero-mock-of-own-packages: `PageRepo`, `OutboxWriter`, and
 * `IdempotencyStore` are all REAL production classes wired against the real
 * testcontainers `Kysely<DB>` handle, following the exact
 * `eng1447-provenance-atomicity.integration-spec.ts` convention. The only
 * double anywhere in this file is the Redis CLIENT itself (a true external,
 * CS §5 mock-boundary table) — reused verbatim from
 * `apply-ops.service.race.spec.ts`'s sanctioned `FakeRedisClient` (a real
 * SET-NX/DEL backing), never `IdempotencyStore` itself.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { ApplyOpsService } from 'src/orvex/page-blocks/apply-ops.service';
import { applyOpsBatch, PmOpInput } from 'src/orvex/page-blocks/apply-ops-batch.util';
import { stampBlockIds } from 'src/collaboration/collaboration.util';
import { IdempotencyStore } from 'src/integrations/redis/idempotency-store.service';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

/**
 * The sanctioned in-process Redis double (verbatim convention from
 * `apply-ops.service.race.spec.ts`) — a real `SET NX`/`GET`/`DEL` backing so
 * the REAL `IdempotencyStore` under test never degrades to the
 * no-Redis/no-dedup fallback. Postgres stays the real testcontainer; this is
 * the true-external boundary double, never a mock of an owned package.
 */
class FakeRedisClient {
  private readonly store = new Map<string, string>();

  async set(key: string, value: string, ..._flags: unknown[]): Promise<'OK' | null> {
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

function buildIdempotencyStoreWithFakeRedis(): IdempotencyStore {
  const fakeRedis = new FakeRedisClient();
  const redisService = {
    getOrNil: () => fakeRedis as unknown as Redis,
  } as RedisService;
  return new IdempotencyStore(redisService);
}

function buildNilIdempotencyStore(): IdempotencyStore {
  // No `idempotencyKey` is ever passed by the AC1-AC5 tests below, so
  // `IdempotencyStore` is never actually invoked (every call site in
  // `ApplyOpsService` is `if (idempotencyKey) { ... }`) — a nil-Redis store
  // is the honest "unused seam" double here, distinct from the FakeRedis
  // double T6 needs to observe real claim/release behaviour.
  const redisService = { getOrNil: () => null } as unknown as RedisService;
  return new IdempotencyStore(redisService);
}

/** `grep -rnE <pattern> <dir>` — exit code 1 (no matches) is a clean 0-hit
 * result, never a thrown error; exit code >1 is a genuine grep failure. */
function grepMatchCount(pattern: string, target: string): number {
  const result = spawnSync('grep', ['-rnE', pattern, target], {
    encoding: 'utf-8',
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `grep failed (status ${result.status}): ${result.stderr}`,
    );
  }
  return result.stdout.split('\n').filter(Boolean).length;
}

describe('ENG-2481 — ApplyOpsService CAS/atomicity DoD (real Postgres)', () => {
  let testDb: TestDb;
  let pageRepo: PageRepo;
  let service: ApplyOpsService;
  let workspaceId: string;
  let spaceId: string;
  let userId: string;
  let seq = 0;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const eventEmitter = new EventEmitter2();
    const outboxWriter = new OutboxWriter(testDb.db as any);
    pageRepo = new PageRepo(
      testDb.db as any,
      {} as any, // spaceMemberRepo — never touched on the apply-ops write path
      eventEmitter,
      outboxWriter,
      { emitInvalidate: () => {} } as any, // wsService — realtime sweep is not under test
    );

    service = new ApplyOpsService(
      pageRepo,
      testDb.db as any,
      buildNilIdempotencyStore(),
    );

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
  }, 120000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function freshPage(content: object) {
    seq += 1;
    return seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: null,
      title: `ENG-2481 fixture ${seq}`,
      content,
    });
  }

  // T1/T2 — AC1/AC2/AC3: the DoD binary gate.
  describe('TestApplyOpsAtomicCasOr409', () => {
    const seedDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'seed-para' },
          content: [{ type: 'text', text: 'Seed content' }],
        },
      ],
    };
    const appendOps: PmOpInput[] = [
      {
        type: 'append',
        node: {
          type: 'paragraph',
          attrs: { id: 'appended-para' },
          content: [{ type: 'text', text: 'Appended' }],
        },
      },
    ];

    it('AC1: applyOps(ifVersion=1) on a freshly-seeded page (no meta row) atomically bumps version to 2, seeds meta, and persists exactly the in-memory applyOpsBatch output', async () => {
      const page = await freshPage(seedDoc);

      // Sanity: no meta row exists yet — the engine reports this page as
      // version 1 purely via the documented `meta?.version ?? 1` default
      // (ENG-2041 D2), never a pre-seeded row.
      expect(await pageRepo.getPageMeta(page.id)).toBeUndefined();

      const expectedContent = stampBlockIds(
        applyOpsBatch(seedDoc, appendOps),
      ).content;

      const envelope = await service.applyOps(
        page.id,
        workspaceId,
        userId,
        { ifVersion: 1, ops: appendOps },
        undefined,
      );

      expect(envelope.version).toBe(2);

      // settledUpdatedAt — presence + ISO-parsability ONLY, never a
      // Date.now() comparison (❌#9: no wall-clock assertions on projected
      // values).
      expect(typeof envelope.settledUpdatedAt).toBe('string');
      expect(new Date(envelope.settledUpdatedAt).toISOString()).toBe(
        envelope.settledUpdatedAt,
      );

      const meta = await pageRepo.getPageMeta(page.id);
      expect(meta?.version).toBe(2);
      expect(meta?.workspaceId).toBe(workspaceId);

      const persisted = await pageRepo.findById(page.id, {
        includeContent: true,
      });
      expect((persisted as any).content).toEqual(expectedContent);
    });

    it('AC2: a stale applyOps(ifVersion=1) against a page already at meta version 2 409s at the advisory precheck, leaving meta.version and pages.content byte-unchanged', async () => {
      const page = await freshPage(seedDoc);
      // Establish the meta row at version 2 exactly as AC1 does.
      const expectedContent = stampBlockIds(
        applyOpsBatch(seedDoc, appendOps),
      ).content;
      await service.applyOps(
        page.id,
        workspaceId,
        userId,
        { ifVersion: 1, ops: appendOps },
        undefined,
      );

      await expect(
        service.applyOps(
          page.id,
          workspaceId,
          userId,
          { ifVersion: 1, ops: appendOps },
          undefined,
        ),
      ).rejects.toMatchObject({ response: { code: 'VERSION_MISMATCH' } });

      const meta = await pageRepo.getPageMeta(page.id);
      expect(meta?.version).toBe(2);

      const persisted = await pageRepo.findById(page.id, {
        includeContent: true,
      });
      expect((persisted as any).content).toEqual(expectedContent);
    });

    it('AC3: an op referencing an unknown blockId (patch-by-id -> MISSING_REF_BLOCK_ID) 400s before any transaction opens — no meta row is ever seeded, content is byte-unchanged', async () => {
      const page = await freshPage(seedDoc);

      await expect(
        service.applyOps(
          page.id,
          workspaceId,
          userId,
          {
            ifVersion: 1,
            ops: [
              {
                type: 'patch-by-id',
                blockId: 'does-not-exist',
                patch: { customFlag: true },
              },
            ],
          },
          undefined,
        ),
      ).rejects.toMatchObject({
        response: { code: 'MISSING_REF_BLOCK_ID' },
      });

      // No transaction ever opened — the CAS guard never seeded a meta row.
      expect(await pageRepo.getPageMeta(page.id)).toBeUndefined();

      const persisted = await pageRepo.findById(page.id, {
        includeContent: true,
      });
      expect((persisted as any).content).toEqual(seedDoc);
    });
  });

  // T2 — AC4: untargeted sibling subtree preserved byte-for-byte.
  describe('TestApplyOpsPreservesUntargetedNode', () => {
    it('AC4: patching block A leaves the PRE-STAMPED sibling block B JSON subtree deep-equal before/after re-read', async () => {
      const blockA = {
        type: 'paragraph',
        attrs: { id: 'block-a' },
        content: [{ type: 'text', text: 'A' }],
      };
      const blockB = {
        type: 'paragraph',
        attrs: { id: 'block-b' },
        content: [{ type: 'text', text: 'B' }],
      };
      const seedDoc = { type: 'doc', content: [blockA, blockB] };
      const page = await freshPage(seedDoc);

      const ops: PmOpInput[] = [
        {
          type: 'patch-by-id',
          blockId: 'block-a',
          // `textAlign` is a real declared attr on `paragraph`
          // (`TextAlign.configure({ types: ['heading', 'paragraph'] })` in
          // `collaboration.util.ts`) — `stampBlockIds` round-trips the
          // whole doc through `Node.fromJSON(schema, doc).toJSON()`
          // (`@docmost/editor-ext`'s `addUniqueIdsToDoc`), which normalizes
          // every node's attrs to its schema's declared attr set (an
          // undeclared probe attr would silently vanish, and every node —
          // targeted or not — picks up the schema's default value for
          // attrs it didn't specify). So "untouched" is verified against
          // the SAME real pipeline's expected output for block B, never
          // against the pre-call raw fixture, which would spuriously fail
          // on that normalization alone.
          patch: { textAlign: 'center' },
        },
      ];
      const expectedContent = stampBlockIds(applyOpsBatch(seedDoc, ops))
        .content as any;
      const expectedB = expectedContent.content.find(
        (n: any) => n.attrs?.id === 'block-b',
      );

      const envelope = await service.applyOps(
        page.id,
        workspaceId,
        userId,
        { ifVersion: 1, ops },
        undefined,
      );
      expect(envelope.version).toBe(2);

      const persisted = await pageRepo.findById(page.id, {
        includeContent: true,
      });
      const persistedContent = (persisted as any).content.content as any[];
      const persistedA = persistedContent.find(
        (n) => n.attrs?.id === 'block-a',
      );
      const persistedB = persistedContent.find(
        (n) => n.attrs?.id === 'block-b',
      );

      // The targeted block DID change...
      expect(persistedA.attrs.textAlign).toBe('center');
      // ...but the untargeted sibling's JSON subtree is untouched relative
      // to what the SAME real apply-ops + stampBlockIds pipeline produces
      // for an untargeted node — proving `patch-by-id` itself never
      // touched it (as opposed to merely surviving schema normalization).
      expect(persistedB).toEqual(expectedB);
    });

    it('grounding gate: apply-ops never delegates to the still-stubbed @orvex/dfm opaque serializer (`serializeOpaque`)', () => {
      const dir = path.resolve(__dirname, '../../src/orvex/page-blocks');
      expect(grepMatchCount('serializeOpaque', dir)).toBe(0);
    });
  });

  // T3 — AC5: no composition-grammar leakage into the block-op engine.
  describe('TestApplyOpsNoCompositionGrammarInEngine', () => {
    it('grep gate: no dfmToOps/headingResolution/opaqueReattach references anywhere under page-blocks/', () => {
      const dir = path.resolve(__dirname, '../../src/orvex/page-blocks');
      expect(
        grepMatchCount('dfmToOps|headingResolution|opaqueReattach', dir),
      ).toBe(0);
    });

    it('apply-ops.service.ts has no @orvex/dfm import', () => {
      const servicePath = path.resolve(
        __dirname,
        '../../src/orvex/page-blocks/apply-ops.service.ts',
      );
      const source = fs.readFileSync(servicePath, 'utf-8');
      expect(source.includes('@orvex/dfm')).toBe(false);
    });
  });

  // NFR honesty gate.
  describe('TestApplyOpsNoTodoOrPlaceholder', () => {
    it('grep gate: no TODO/FIXME/placeholder markers in apply-ops.service.ts or apply-ops-batch.util.ts', () => {
      const servicePath = path.resolve(
        __dirname,
        '../../src/orvex/page-blocks/apply-ops.service.ts',
      );
      const batchUtilPath = path.resolve(
        __dirname,
        '../../src/orvex/page-blocks/apply-ops-batch.util.ts',
      );
      expect(
        grepMatchCount('TODO|FIXME|placeholder', servicePath) +
          grepMatchCount('TODO|FIXME|placeholder', batchUtilPath),
      ).toBe(0);
    });
  });

  // T6 — NFR operability: the idempotency slot-release race proof.
  describe('TestApplyOpsIdempotencySlotReleasedOnCasRace', () => {
    it('two concurrent applyOps at the same stale-prone ifVersion=1 with DISTINCT idempotency keys: exactly one wins (v->2), the loser 409s VERSION_MISMATCH, and the loser key is FREE afterwards (not pinned pending)', async () => {
      const seedDoc = { type: 'doc', content: [] as any[] };
      const page = await freshPage(seedDoc);

      const idempotencyStore = buildIdempotencyStoreWithFakeRedis();
      const raceService = new ApplyOpsService(
        pageRepo,
        testDb.db as any,
        idempotencyStore,
      );

      const dto = {
        ifVersion: 1,
        ops: [
          {
            type: 'append',
            node: { type: 'paragraph', attrs: { id: 'race-block' } },
          },
        ] as PmOpInput[],
      };

      const [r1, r2] = await Promise.allSettled([
        raceService.applyOps(page.id, workspaceId, userId, dto, 'key-A'),
        raceService.applyOps(page.id, workspaceId, userId, dto, 'key-B'),
      ]);

      const results: Array<{
        key: string;
        outcome: PromiseSettledResult<unknown>;
      }> = [
        { key: 'key-A', outcome: r1 },
        { key: 'key-B', outcome: r2 },
      ];

      const fulfilled = results.filter((r) => r.outcome.status === 'fulfilled');
      const rejected = results.filter((r) => r.outcome.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const winnerEnvelope = (
        fulfilled[0].outcome as PromiseFulfilledResult<any>
      ).value;
      expect(winnerEnvelope.version).toBe(2);

      const loserReason = (rejected[0].outcome as PromiseRejectedResult)
        .reason;
      expect(loserReason).toMatchObject({
        response: { code: 'VERSION_MISMATCH' },
      });

      // Exactly one meta row landed at version 2 — no double-apply.
      const meta = await pageRepo.getPageMeta(page.id);
      expect(meta?.version).toBe(2);

      // The invariant under test: the LOSER's idempotency slot must be
      // FREE afterwards (release() ran), never left pinned to
      // `{pending:true}` for the retry to poll out to a fabricated
      // false-success envelope.
      const loserKey = rejected[0].key;
      const retryClaim = await idempotencyStore.claim(
        'apply-ops',
        page.id,
        userId,
        loserKey,
      );
      expect(retryClaim.claimed).toBe(true);
      expect(retryClaim.degraded).toBe(false);
    });
  });
});
