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
 * amazing-MCP whole-doc apply-ops-on-an-existing-document primitive
 * (`ApplyOpsService.applyDocument`) — the engine leg wiki-api's
 * `PUT /v1/wiki/{loc}` (save_page update/upsert) composes over. Proves the
 * three write operations (replace/append/prepend) merge against the existing
 * root doc and that the SAME integer CAS + chokepoint-write machinery as the
 * block batch is used (a stale ifVersion 409s; the doc is captured by the
 * single `updatePage` call).
 */
class FakeRedisClient {
  private readonly store = new Map<string, string>();
  async set(key: string, value: string, ..._flags: unknown[]): Promise<'OK' | null> {
    if (_flags.includes('NX') && this.store.has(key)) return null;
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

function para(id: string, text: string) {
  return { type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] };
}

describe('ApplyOpsService.applyDocument — whole-doc replace/append/prepend', () => {
  const pageId = 'page-1';
  const workspaceId = 'ws-1';
  const userId = 'user-1';

  function build(casSucceeds: boolean) {
    const idempotencyStore = new IdempotencyStore({
      getOrNil: () => new FakeRedisClient() as unknown as Redis,
    } as RedisService);

    const existing = { type: 'doc', content: [para('a', 'existing')] };
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({
        id: pageId,
        workspaceId,
        deletedAt: null,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        content: existing,
      }),
      getPageMeta: jest.fn().mockResolvedValue({ version: 3, contentHash: null }),
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
    return { service, pageRepo };
  }

  const incoming = { type: 'doc', content: [para('b', 'incoming')] };

  it('replace makes the incoming doc the whole body', async () => {
    const { service, pageRepo } = build(true);
    await service.applyDocument(pageId, workspaceId, userId, {
      ifVersion: 3,
      document: incoming,
      writeOperation: 'replace',
    });
    const written = pageRepo.updatePage.mock.calls[0][0].content;
    expect(written.content.map((n: any) => n.content[0].text)).toEqual([
      'incoming',
    ]);
  });

  it('append adds the incoming blocks after the existing body', async () => {
    const { service, pageRepo } = build(true);
    await service.applyDocument(pageId, workspaceId, userId, {
      ifVersion: 3,
      document: incoming,
      writeOperation: 'append',
    });
    const written = pageRepo.updatePage.mock.calls[0][0].content;
    expect(written.content.map((n: any) => n.content[0].text)).toEqual([
      'existing',
      'incoming',
    ]);
  });

  it('prepend adds the incoming blocks before the existing body', async () => {
    const { service, pageRepo } = build(true);
    await service.applyDocument(pageId, workspaceId, userId, {
      ifVersion: 3,
      document: incoming,
      writeOperation: 'prepend',
    });
    const written = pageRepo.updatePage.mock.calls[0][0].content;
    expect(written.content.map((n: any) => n.content[0].text)).toEqual([
      'incoming',
      'existing',
    ]);
  });

  it('defaults to replace when writeOperation is omitted', async () => {
    const { service, pageRepo } = build(true);
    await service.applyDocument(pageId, workspaceId, userId, {
      ifVersion: 3,
      document: incoming,
    });
    const written = pageRepo.updatePage.mock.calls[0][0].content;
    expect(written.content).toHaveLength(1);
    expect(written.content[0].content[0].text).toBe('incoming');
  });

  it('a stale ifVersion 409s VERSION_MISMATCH under the same CAS (no partial write)', async () => {
    const { service, pageRepo } = build(false);
    await expect(
      service.applyDocument(pageId, workspaceId, userId, {
        ifVersion: 3,
        document: incoming,
        writeOperation: 'replace',
      }),
    ).rejects.toMatchObject({ response: { code: 'VERSION_MISMATCH' } });
    expect(pageRepo.updatePage).not.toHaveBeenCalled();
  });

  it('rejects a whole-doc write that is not content-model valid with INVALID_CONTENT_FORMAT (before any write)', async () => {
    const { service, pageRepo } = build(true);
    await expect(
      service.applyDocument(pageId, workspaceId, userId, {
        ifVersion: 3,
        // a paragraph nested directly inside a paragraph is invalid PM content
        document: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'paragraph' }] },
          ],
        },
        writeOperation: 'replace',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CONTENT_FORMAT' } });
    expect(pageRepo.updatePage).not.toHaveBeenCalled();
  });
});
