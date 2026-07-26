// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import { promises as fs } from 'fs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import type { onStoreDocumentPayload } from '@hocuspocus/server';
import type { RedisService } from '@nestjs-labs/nestjs-ioredis';

import { PersistenceExtension } from './persistence.extension';
import { tiptapExtensions } from '../collaboration.util';
import { PageRepo } from '../../database/repos/page/page.repo';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import { WsService } from '../../ws/ws.service';
import { KyselyDB } from '../../database/types/kysely.types';
import { EntitlementService } from '../../orvex/entitlement/entitlement.service';
import { InMemoryEntitlementCache } from '../../orvex/entitlement/entitlement-cache';
import { QuotaFastCounter } from '../../orvex/entitlement/quota-fast-counter';
import { BillingEntitlementPort } from '../../orvex/entitlement/entitlement-billing.port';
import {
  EntitlementCaps,
  EntitlementCheckResponse,
  Principal,
} from '../../orvex/entitlement/entitlement.types';
import { CollabHistoryService } from '../services/collab-history.service';
import { TransclusionService } from '../../core/page/transclusion/transclusion.service';
import { OrvexPageProvenanceService } from '../../core/page-provenance/orvex-page-provenance.service';
import type { Queue } from 'bullmq';
import type { DB } from '../../database/types/db';

/**
 * ENG-2490 — `TestQuotaChokepointBlocksCollabPath` (the named DoD gate).
 *
 * Integration: the REAL `PersistenceExtension.onStoreDocument` lifecycle
 * hook (the exact Hocuspocus store entry point) is driven with a real Yjs
 * document against a real testcontainers Postgres. The `quota:*:{tenant}`
 * fast-counter runs on a behaviourally-real in-memory Redis double (the
 * repo's sanctioned miniredis-equivalent pattern — get/set-EX/eval are real
 * command semantics, never a mock of the counter's own logic, CS §5/❌#4).
 * The billing seam is the committed-replay-shaped stub the sibling
 * chokepoint specs already use (CS §5 true-external).
 *
 * Asserts (AC1/AC3 + the declared NFR degrade):
 *  - a tenant AT its page cap has a collab-path (Yjs) store write REJECTED —
 *    nothing persists to `pages` (the previously-open bypass is closed);
 *  - a tenant UNDER cap persists the same write (the chokepoint is a cap
 *    gate, not a collab-path outage);
 *  - the pre-flight usage read is O(1) counter-sourced: with a live counter
 *    the store-tier `COUNT(*)` is never issued (observed via a
 *    call-through spy on the real repo method — observation, not a mock);
 *  - an infrastructure failure inside the pre-flight (entitlement 503)
 *    fails OPEN per the cheap-page-counter class (ADR-0003) — the write
 *    persists, never an unhandled crash out of the store hook.
 */
describe('TestQuotaChokepointBlocksCollabPath (ENG-2490 DoD, integration)', () => {
  jest.setTimeout(180_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;
  let kyselyDb: KyselyDB;
  let pageRepo: PageRepo;
  let extension: PersistenceExtension;
  let entitlementService: EntitlementService;
  let cache: InMemoryEntitlementCache;
  let fastCounter: QuotaFastCounter;
  let inMemoryRedis: InMemoryRedis;

  const REPLAYED_PAGE_CAP = 2; // lives ONLY in this replay fixture (❌#10)

  /**
   * Behaviourally-real in-memory Redis double for the three commands the
   * fast-counter issues (`GET`, `SET key val EX ttl`, `EVAL` of the
   * conditional-INCRBY script). Real command semantics, no mock of own code.
   */
  class InMemoryRedis {
    store = new Map<string, string>();
    failing = false;

    private assertUp() {
      if (this.failing) {
        throw new Error('connection refused (simulated Redis outage)');
      }
    }

    async get(key: string): Promise<string | null> {
      this.assertUp();
      return this.store.has(key) ? this.store.get(key) : null;
    }

    async set(key: string, value: string): Promise<'OK'> {
      this.assertUp();
      this.store.set(key, value);
      return 'OK';
    }

    // The conditional INCRBY Lua: increments ONLY an existing key.
    async eval(
      _script: string,
      _numKeys: number,
      key: string,
      delta: string,
    ): Promise<number | null> {
      this.assertUp();
      if (!this.store.has(key)) {
        return null;
      }
      const next = Number(this.store.get(key)) + Number(delta);
      this.store.set(key, String(next));
      return next;
    }
  }

  function replayedCatalog(pageCap: number): EntitlementCheckResponse {
    const caps: EntitlementCaps = {
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 0,
      wiki_max_pages: pageCap,
      wiki_storage_bytes_aggregate: 1_000_000_000,
      wiki_max_file_bytes: 10_000_000,
      wiki_max_files: 2_000,
      wiki_max_members: 25,
      wiki_history_retention_versions: 10,
      wiki_history_retention_days: 180,
    };
    return {
      plan: 'free',
      plan_version: 'v1',
      features: [],
      caps,
      trial: { state: 'none' },
      throttle: { state: 'none' },
      version: 'entitlement-v1',
      evaluatedAt: '2026-07-01T00:00:00.000Z',
    };
  }

  class StubBillingEntitlementPort implements BillingEntitlementPort {
    catalogByWorkspace = new Map<string, EntitlementCheckResponse>();
    unreachable = false;
    async checkEntitlement(
      principal: Principal,
    ): Promise<EntitlementCheckResponse> {
      if (this.unreachable) {
        throw new Error('connection refused (simulated billing outage)');
      }
      const catalog = this.catalogByWorkspace.get(principal.principal_id);
      if (!catalog) {
        throw new Error('no committed catalog replay for principal');
      }
      return catalog;
    }
  }

  let stubPort: StubBillingEntitlementPort;

  const noopQueue = { add: async () => undefined } as unknown as Queue;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<Record<string, unknown>>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../../database/migrations');
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    // rawDb shares sqlClient with db below — single teardown in afterAll
    // (same F1 note as entitlement-write-chokepoint.integration.spec.ts).

    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });
    kyselyDb = db as unknown as KyselyDB;

    const eventEmitter = new EventEmitter2();
    pageRepo = new PageRepo(
      kyselyDb,
      undefined as unknown as SpaceMemberRepo, // unused by these paths
      eventEmitter,
      new OutboxWriter(kyselyDb),
      { emitInvalidate: () => undefined } as unknown as WsService,
    );

    stubPort = new StubBillingEntitlementPort();
    cache = new InMemoryEntitlementCache();
    entitlementService = new EntitlementService(stubPort, cache);

    inMemoryRedis = new InMemoryRedis();
    const redisServiceStub = {
      getOrNil: () => inMemoryRedis,
    } as unknown as RedisService;
    fastCounter = new QuotaFastCounter(redisServiceStub);

    extension = new PersistenceExtension(
      pageRepo,
      kyselyDb,
      noopQueue, // aiQueue
      noopQueue, // historyQueue
      noopQueue, // notificationQueue
      {
        addContributors: async () => undefined,
      } as unknown as CollabHistoryService,
      {
        syncPageTransclusions: async () => undefined,
        syncPageReferences: async () => undefined,
      } as unknown as TransclusionService,
      undefined as unknown as OrvexPageProvenanceService, // only on AI-authored stores
      entitlementService,
      fastCounter,
    );
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  beforeEach(() => {
    inMemoryRedis.store.clear();
    inMemoryRedis.failing = false;
    stubPort.unreachable = false;
    jest.restoreAllMocks();
  });

  let seedCounter = 0;
  async function seedWorkspace(pageCount: number) {
    seedCounter += 1;
    const ws = await db
      .insertInto('workspaces')
      .values({ name: `ENG-2490 Workspace ${seedCounter}` })
      .returning('id')
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto('users')
      .values({ email: `eng2490-${seedCounter}@example.com`, workspaceId: ws.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    const space = await db
      .insertInto('spaces')
      .values({
        name: 'Space',
        slug: `eng2490-space-${seedCounter}`,
        workspaceId: ws.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const pageIds: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      const page = await db
        .insertInto('pages')
        .values({
          title: `seeded-${i}`,
          spaceId: space.id,
          workspaceId: ws.id,
          slugId: `eng2490-${seedCounter}-${i}`,
          creatorId: user.id,
          lastUpdatedById: user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      pageIds.push(page.id);
    }

    cache.evict({ principal_type: 'org', principal_id: ws.id });
    stubPort.catalogByWorkspace.set(ws.id, replayedCatalog(REPLAYED_PAGE_CAP));

    return { workspaceId: ws.id, userId: user.id, spaceId: space.id, pageIds };
  }

  /** Drives the REAL onStoreDocument hook with a real Yjs document. */
  async function storeViaCollabPath(pageId: string, userId: string, text: string) {
    const ydoc = TiptapTransformer.toYdoc(
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text }] },
        ],
      },
      'default',
      tiptapExtensions,
    );
    Y.encodeStateAsUpdate(ydoc);
    // Hocuspocus's Document adds broadcastStateless over Y.Doc — a no-op
    // stand-in here (this spec asserts persistence, not realtime fan-out).
    (ydoc as unknown as { broadcastStateless: (p: string) => void }).broadcastStateless =
      () => undefined;

    await extension.onStoreDocument({
      documentName: `page.${pageId}`,
      document: ydoc,
      context: { user: { id: userId, name: 'ENG-2490', avatarUrl: null } },
    } as unknown as onStoreDocumentPayload);
  }

  async function readPageContent(pageId: string) {
    return db
      .selectFrom('pages')
      .select(['id', 'content', 'textContent'])
      .where('id', '=', pageId)
      .executeTakeFirstOrThrow();
  }

  it('AC3 (DoD) — a tenant AT the page cap has the collab-path store write REJECTED: nothing persists', async () => {
    const { userId, pageIds } = await seedWorkspace(REPLAYED_PAGE_CAP);
    const targetPageId = pageIds[0];

    const before = await readPageContent(targetPageId);
    expect(before.content).toBeNull(); // seeded without content

    await storeViaCollabPath(targetPageId, userId, 'over-cap collab write');

    const after = await readPageContent(targetPageId);
    expect(after.content).toBeNull(); // the ydoc write was dropped pre-Postgres
    expect(after.textContent).toBeNull();
  });

  it('AC3 (allow branch) — a tenant UNDER cap persists the SAME collab-path write', async () => {
    const { userId, pageIds } = await seedWorkspace(REPLAYED_PAGE_CAP - 1);
    const targetPageId = pageIds[0];

    await storeViaCollabPath(targetPageId, userId, 'under-cap collab write');

    const after = await readPageContent(targetPageId);
    expect(after.content).not.toBeNull();
    expect(after.textContent).toContain('under-cap collab write');
  });

  it('AC1 — with a live counter the pre-flight usage read is O(1): no store-tier COUNT runs', async () => {
    const { workspaceId, userId, pageIds } = await seedWorkspace(
      REPLAYED_PAGE_CAP,
    );
    // Seed the counter to the at-cap truth value — the O(1) read source.
    await fastCounter.seed(workspaceId, 'pages', REPLAYED_PAGE_CAP);

    const countSpy = jest.spyOn(pageRepo, 'countByWorkspaceId');
    await storeViaCollabPath(pageIds[0], userId, 'counter-sourced write');

    // The verdict still fired (write dropped) AND the aggregate never ran.
    expect(countSpy).not.toHaveBeenCalled();
    const after = await readPageContent(pageIds[0]);
    expect(after.content).toBeNull();
  });

  it('AC1 (miss path) — a counter miss falls back to the store-tier truth once, then re-seeds', async () => {
    const { workspaceId, userId, pageIds } = await seedWorkspace(
      REPLAYED_PAGE_CAP,
    );
    const countSpy = jest.spyOn(pageRepo, 'countByWorkspaceId');

    await storeViaCollabPath(pageIds[0], userId, 'first write, counter miss');
    expect(countSpy).toHaveBeenCalledTimes(1); // the one truth re-seed

    await storeViaCollabPath(pageIds[0], userId, 'second write, counter hit');
    expect(countSpy).toHaveBeenCalledTimes(1); // still 1 — O(1) thereafter
  });

  it('NFR — Redis outage on the counter degrades to the store-tier truth: enforcement still fires, no crash', async () => {
    const { userId, pageIds } = await seedWorkspace(REPLAYED_PAGE_CAP);
    inMemoryRedis.failing = true; // every Redis command now throws

    await storeViaCollabPath(pageIds[0], userId, 'redis-down write');

    const after = await readPageContent(pageIds[0]);
    expect(after.content).toBeNull(); // still rejected — truth-sourced verdict
  });

  it('NFR — an entitlement-resolution failure fails OPEN on the collab path (cheap-counter class, ADR-0003), never an unhandled crash', async () => {
    const { workspaceId, userId, pageIds } = await seedWorkspace(
      REPLAYED_PAGE_CAP,
    );
    stubPort.unreachable = true;
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    await storeViaCollabPath(pageIds[0], userId, 'billing-down write');

    const after = await readPageContent(pageIds[0]);
    expect(after.content).not.toBeNull(); // failed OPEN — the write persisted
    expect(after.textContent).toContain('billing-down write');
  });
});
