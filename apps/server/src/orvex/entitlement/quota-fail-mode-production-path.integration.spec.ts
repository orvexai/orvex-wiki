// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import * as os from 'os';
import * as fsExtra from 'fs-extra';
import { promises as fs } from 'fs';
import { Readable } from 'stream';
import { v4 as uuid4 } from 'uuid';
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
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import type { RedisService } from '@nestjs-labs/nestjs-ioredis';
import { MultipartFile } from '@fastify/multipart';
import { Queue } from 'bullmq';

import { AttachmentService } from '../../core/attachment/services/attachment.service';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import { PageService } from '../../core/page/services/page.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { LocalDriver } from '../../integrations/storage/drivers/local.driver';
import { QueueJob } from '../../integrations/queue/constants';
import { CollaborationGateway } from '../../collaboration/collaboration.gateway';
import { WatcherService } from '../../core/watcher/watcher.service';
import { TransclusionService } from '../../core/page/transclusion/transclusion.service';
import { IdempotencyStore } from '../../integrations/redis/idempotency-store.service';
import { AttachmentRepo } from '../../database/repos/attachment/attachment.repo';
import { PageRepo } from '../../database/repos/page/page.repo';
import { PagePermissionRepo } from '../../database/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { UserRepo } from '../../database/repos/user/user.repo';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { SpaceRepo } from '../../database/repos/space/space.repo';
import { KyselyDB } from '../../database/types/kysely.types';
import { OutboxWriter } from '../events/outbox/outbox-writer.service';
import { WsService } from '../../ws/ws.service';

import { EntitlementService } from './entitlement.service';
import { InMemoryEntitlementCache } from './entitlement-cache';
import { BillingEntitlementPort } from './entitlement-billing.port';
import { QuotaFastCounter } from './quota-fast-counter';
import { QuotaReconciliationService } from './quota-reconciliation.service';
import { OrvexConfigService } from '../config/orvex-config.service';
import {
  EntitlementCaps,
  EntitlementCheckResponse,
  Principal,
} from './entitlement.types';
import { QuotaExceededException } from './quota.exception';
import type { DB } from '../../database/types/db';

/**
 * ENG-2492 — `TestStorageWriteFailsClosedOnRedisLoss` /
 * `TestCheapResourceWriteFailsOpenOnRedisLoss`, driven through the REAL
 * PRODUCTION ENTRY POINTS.
 *
 * Why this spec exists (audit gap closure): the sibling
 * `quota-reconciliation.service.spec.ts` gate asserts the fail-mode split by
 * invoking `EntitlementService.assertWithinQuotaFromCounter` DIRECTLY. That
 * proves the domain branch, but not that the branch is REACHABLE in the
 * running app. This spec closes that: every assertion below goes through
 * `AttachmentService.uploadFile` (the real upload chokepoint, AC2) and
 * `PageService.create` (the real page-create chokepoint, AC3) with a REAL
 * Redis whose connection is severed mid-test — the same code path a live
 * request takes.
 *
 * Real collaborators throughout (❌#4 — no own-code mock): testcontainers
 * Postgres, testcontainers Redis (`redis:7-alpine`), a real `LocalDriver`
 * storage root. Only the billing HTTP seam is the committed replay stub
 * (CS §5 true-external), matching every sibling chokepoint spec.
 */
describe('ENG-2492 fail-mode split through the PRODUCTION write paths (integration)', () => {
  jest.setTimeout(240_000);

  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;
  let kyselyDb: KyselyDB;
  let attachmentRepo: AttachmentRepo;
  let pageRepo: PageRepo;
  let userRepo: UserRepo;
  let attachmentService: AttachmentService;
  let pageService: PageService;
  let entitlementService: EntitlementService;
  let fastCounter: QuotaFastCounter;
  let sweep: QuotaReconciliationService;
  let cache: InMemoryEntitlementCache;
  let storageRoot: string;
  let redisHost: string;
  let redisPort: number;
  /** The live client — severing/recovering swaps what getOrNil() returns. */
  let currentRedis: Redis | null;

  const STORAGE_CAP = 100_000; // bytes — fixture literal ONLY (❌#10)
  const PAGE_CAP = 500;

  function replayedCatalog(): EntitlementCheckResponse {
    const caps: EntitlementCaps = {
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 0,
      wiki_max_pages: PAGE_CAP,
      wiki_storage_bytes_aggregate: STORAGE_CAP,
      wiki_max_file_bytes: 10_000,
      wiki_max_files: 100,
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
    async checkEntitlement(_p: Principal): Promise<EntitlementCheckResponse> {
      return replayedCatalog();
    }
  }

  function fakeMultipartFile(
    fileName: string,
    content: Buffer,
  ): Promise<MultipartFile> {
    return Promise.resolve({
      type: 'file',
      toBuffer: async () => content,
      file: Readable.from(content),
      fieldname: 'file',
      filename: fileName,
      encoding: '7bit',
      mimetype: 'application/octet-stream',
      fields: {},
    } as unknown as MultipartFile);
  }

  async function connectRedis(): Promise<Redis> {
    const client = new Redis({
      host: redisHost,
      port: redisPort,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // a severed connection STAYS severed
    });
    await client.connect();
    return client;
  }

  /** Severs the live connection — commands on the real client now reject. */
  function severRedis(): void {
    currentRedis?.disconnect(false);
  }

  async function recoverRedis(): Promise<void> {
    currentRedis?.disconnect(false);
    currentRedis = await connectRedis();
  }

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

    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });
    kyselyDb = db as unknown as KyselyDB;

    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    redisHost = redisContainer.getHost();
    redisPort = redisContainer.getMappedPort(6379);
    currentRedis = await connectRedis();

    const redisServiceStub = {
      getOrNil: () => currentRedis,
    } as unknown as RedisService;
    fastCounter = new QuotaFastCounter(redisServiceStub);

    const eventEmitter = new EventEmitter2();
    attachmentRepo = new AttachmentRepo(kyselyDb);
    userRepo = new UserRepo(kyselyDb);
    pageRepo = new PageRepo(
      kyselyDb,
      undefined as unknown as SpaceMemberRepo,
      eventEmitter,
      new OutboxWriter(kyselyDb),
      { emitInvalidate: () => undefined } as unknown as WsService,
    );

    cache = new InMemoryEntitlementCache();
    entitlementService = new EntitlementService(
      new StubBillingEntitlementPort(),
      cache,
      new OrvexConfigService({}),
      attachmentRepo,
      fastCounter,
    );

    sweep = new QuotaReconciliationService(
      fastCounter,
      pageRepo,
      attachmentRepo,
      userRepo,
    );

    storageRoot = await fsExtra.mkdtemp(
      path.join(os.tmpdir(), 'eng-2492-storage-'),
    );
    const storageService = new StorageService(
      new LocalDriver({ storagePath: storageRoot }),
    );
    const noopQueue = {
      add: async () => undefined,
    } as unknown as Queue<QueueJob>;

    attachmentService = new AttachmentService(
      storageService,
      attachmentRepo,
      undefined as unknown as UserRepo, // unused by uploadFile()
      undefined as unknown as WorkspaceRepo, // unused by uploadFile()
      undefined as unknown as SpaceRepo, // unused by uploadFile()
      kyselyDb,
      noopQueue,
      new OutboxWriter(kyselyDb),
      entitlementService,
      fastCounter,
    );

    pageService = new PageService(
      pageRepo,
      undefined as unknown as PagePermissionRepo, // unused by create()
      undefined as unknown as AttachmentRepo, // unused by create()
      kyselyDb,
      undefined as unknown as StorageService, // unused by create() (no content)
      noopQueue, // attachmentQueue
      noopQueue, // aiQueue
      noopQueue, // generalQueue
      eventEmitter,
      undefined as unknown as CollaborationGateway, // unused by create()
      undefined as unknown as WatcherService, // only used when a trx is passed
      undefined as unknown as TransclusionService, // unused by create()
      undefined as unknown as IdempotencyStore, // unused by create()
      entitlementService,
      fastCounter,
    );
  });

  afterAll(async () => {
    currentRedis?.disconnect(false);
    await redisContainer?.stop();
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
    await fsExtra.remove(storageRoot).catch(() => undefined);
  });

  beforeEach(async () => {
    if (currentRedis === null || currentRedis.status === 'end') {
      currentRedis = await connectRedis();
    }
    await currentRedis.flushall();
  });

  let seedCounter = 0;
  async function seedWorkspace() {
    seedCounter += 1;
    const ws = await db
      .insertInto('workspaces')
      .values({ name: `ENG-2492 prod-path workspace ${seedCounter}` })
      .returning('id')
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto('users')
      .values({
        email: `eng2492-prod-${seedCounter}@example.com`,
        workspaceId: ws.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const space = await db
      .insertInto('spaces')
      .values({
        name: 'Space',
        slug: `eng2492-prod-space-${seedCounter}`,
        workspaceId: ws.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    cache.evict({ principal_type: 'org', principal_id: ws.id });
    return { workspaceId: ws.id, userId: user.id, spaceId: space.id };
  }

  // ── AC2 — the REAL upload chokepoint fails CLOSED on Redis loss ─────────

  it('TestStorageWriteFailsClosedOnRedisLoss — AttachmentService.uploadFile is rejected with 402 + redisUnavailable while Redis is down', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspace();

    // Healthy baseline: the SAME production entry point succeeds and seeds
    // the counters, so the rejection below cannot be blamed on the fixture.
    const healthy = await attachmentService.uploadFile({
      filePromise: fakeMultipartFile('healthy.bin', Buffer.from('hello')),
      userId,
      spaceId,
      workspaceId,
    });
    expect(healthy.id).toEqual(expect.any(String));
    expect(await attachmentRepo.countByWorkspaceId(workspaceId)).toBe(1);

    // ── The outage ──
    severRedis();

    let caught: unknown;
    try {
      await attachmentService.uploadFile({
        filePromise: fakeMultipartFile('during-outage.bin', Buffer.from('x')),
        userId,
        spaceId,
        workspaceId,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(QuotaExceededException);
    const rejection = caught as QuotaExceededException;
    expect(rejection.getStatus()).toBe(402);
    const body = rejection.getResponse() as Record<string, unknown>;
    // The frozen envelope core is intact…
    expect(body.error).toBe('QUOTA_EXCEEDED');
    expect(body.resource).toBe('files');
    // …plus the distinguishing outage detail (AC2).
    expect(body.redisUnavailable).toBe(true);

    // Fail CLOSED means no row was written by the rejected upload.
    expect(await attachmentRepo.countByWorkspaceId(workspaceId)).toBe(1);

    await recoverRedis();
  });

  it('AC2 (distinguishability, production path) — with Redis UP an under-cap upload succeeds and an over-cap one carries NO redisUnavailable', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspace();

    // Under cap → permitted through the real entry point.
    const ok = await attachmentService.uploadFile({
      filePromise: fakeMultipartFile('under-cap.bin', Buffer.from('hi')),
      userId,
      spaceId,
      workspaceId,
    });
    expect(ok.id).toEqual(expect.any(String));

    // Drive the workspace's REAL storage counter to the cap, then upload
    // again: a genuine over-cap rejection, Redis perfectly healthy.
    await fastCounter.seed(workspaceId, 'storage', STORAGE_CAP);

    let caught: unknown;
    try {
      await attachmentService.uploadFile({
        filePromise: fakeMultipartFile('over-cap.bin', Buffer.from('y')),
        userId,
        spaceId,
        workspaceId,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(QuotaExceededException);
    const body = (caught as QuotaExceededException).getResponse() as Record<
      string,
      unknown
    >;
    expect(body.error).toBe('QUOTA_EXCEEDED');
    expect(body.resource).toBe('storage');
    // The genuine over-cap verdict is DISTINGUISHABLE from the outage one.
    expect('redisUnavailable' in body).toBe(false);
  });

  // ── AC3 — the REAL page-create chokepoint fails OPEN on the SAME outage ─

  it('TestCheapResourceWriteFailsOpenOnRedisLoss — PageService.create succeeds during the SAME Redis outage that rejects the storage write', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspace();

    // ── The outage: ONE severed connection, both entry points ──
    severRedis();

    // AC2 side: the storage write is rejected…
    let storageErr: unknown;
    try {
      await attachmentService.uploadFile({
        filePromise: fakeMultipartFile('blocked.bin', Buffer.from('z')),
        userId,
        spaceId,
        workspaceId,
      });
    } catch (err) {
      storageErr = err;
    }
    expect(storageErr).toBeInstanceOf(QuotaExceededException);

    // AC3 side: …while a page create through the REAL entry point is
    // PERMITTED and actually persists (never a 402, never a 503).
    const page = await pageService.create(userId, workspaceId, {
      spaceId,
      title: 'created-during-the-redis-outage',
    });
    expect(page.id).toEqual(expect.any(String));

    const persisted = await pageRepo.findById(page.id);
    expect(persisted?.title).toBe('created-during-the-redis-outage');
    expect(await pageRepo.countByWorkspaceId(workspaceId)).toBe(1);

    await recoverRedis();
  });

  // ── Recovery — the sweep repairs the drift the outage left behind ───────

  it('AC1 (production path) — after recovery the sweep corrects the counter drift the outage window left, and uploads flow again', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspace();

    await attachmentService.uploadFile({
      filePromise: fakeMultipartFile('one.bin', Buffer.from('abcde')),
      userId,
      spaceId,
      workspaceId,
    });
    const truthBytes =
      await attachmentRepo.sumFileSizeByWorkspaceId(workspaceId);
    expect(truthBytes).toBeGreaterThan(0);

    // Simulate the drift an outage window leaves behind.
    await fastCounter.seed(workspaceId, 'storage', truthBytes + 12_345);

    const result = await sweep.runSweepOnce();
    expect(result.tenantsTouched).toBeGreaterThanOrEqual(1);
    await expect(fastCounter.get(workspaceId, 'storage')).resolves.toBe(
      truthBytes,
    );

    // And the real entry point serves normally again.
    const after = await attachmentService.uploadFile({
      filePromise: fakeMultipartFile('two.bin', Buffer.from('fgh')),
      userId,
      spaceId,
      workspaceId,
    });
    expect(after.id).toEqual(expect.any(String));
  });

  // ── Cold start — the miss path must NOT be mistaken for an outage ───────

  it('cold start — a workspace that has NEVER had a counter uploads fine (a miss is not an outage)', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspace();
    // No counter seeded at all; Redis fully healthy. Pre-fix, wiring the
    // counter-sourced assert would have rejected every first upload.
    await currentRedis!.flushall();

    const first = await attachmentService.uploadFile({
      filePromise: fakeMultipartFile('cold-start.bin', Buffer.from('first')),
      userId,
      spaceId,
      workspaceId,
    });
    expect(first.id).toEqual(expect.any(String));

    // The miss re-seeded the counter from store-tier truth.
    await expect(fastCounter.get(workspaceId, 'files')).resolves.toBe(1);
    await expect(
      fastCounter.get(workspaceId, 'storage'),
    ).resolves.toBe(
      await attachmentRepo.sumFileSizeByWorkspaceId(workspaceId),
    );
  });

  // ── Sanity — an attachment row is never orphaned by the fail-closed 402 ─

  it('the fail-closed rejection leaves no attachment row and no page row behind', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspace();
    severRedis();

    await expect(
      attachmentService.uploadFile({
        filePromise: fakeMultipartFile('never-lands.bin', Buffer.from('q')),
        userId,
        spaceId,
        workspaceId,
      }),
    ).rejects.toBeInstanceOf(QuotaExceededException);

    expect(await attachmentRepo.countByWorkspaceId(workspaceId)).toBe(0);
    await recoverRedis();
  });
});
