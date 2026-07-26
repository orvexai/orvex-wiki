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
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import type { RedisService } from '@nestjs-labs/nestjs-ioredis';

import { QuotaReconciliationService } from './quota-reconciliation.service';
import { QuotaFastCounter } from './quota-fast-counter';
import { EntitlementService } from './entitlement.service';
import { InMemoryEntitlementCache } from './entitlement-cache';
import { BillingEntitlementPort } from './entitlement-billing.port';
import {
  EntitlementCaps,
  EntitlementCheckResponse,
  Principal,
} from './entitlement.types';
import { QuotaExceededException } from './quota.exception';
import { OrvexConfigService } from '../config/orvex-config.service';
import { PageRepo } from '../../database/repos/page/page.repo';
import { AttachmentRepo } from '../../database/repos/attachment/attachment.repo';
import { UserRepo } from '../../database/repos/user/user.repo';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import { WsService } from '../../ws/ws.service';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import { KyselyDB } from '../../database/types/kysely.types';
import type { DB } from '../../database/types/db';

/**
 * ENG-2492 — `TestQuotaFailsClosedForStorageOnRedisLoss` (the named DoD
 * gate) plus the AC1 sweep-correctness and AC4 warn-mode suites.
 *
 * Integration: a REAL Redis (testcontainers `redis:7-alpine`) whose
 * connection is deliberately SEVERED mid-test (the real ioredis client is
 * disconnected with reconnection disabled — a genuine connection-loss code
 * path, never a miniredis/in-memory stand-in, since the fail-mode branch
 * itself is under test) and a REAL testcontainers Postgres for the
 * store-tier truth the sweep diffs against. No own-code mock (❌#4).
 *
 * Asserts:
 *  - AC2: with Redis unreadable, a storage-shaped counter-sourced check
 *    fails CLOSED — the frozen `402 QUOTA_EXCEEDED` envelope carrying the
 *    distinguishing `redisUnavailable: true` detail;
 *  - AC3: the SAME outage fails OPEN for the cheap resources
 *    (`pages`/`members`) — the check permits the write;
 *  - recovery: once Redis is reachable again the sweep corrects the drift
 *    accumulated during the outage and the counter-sourced verdict serves
 *    real values again;
 *  - AC1: the sweep corrects k-of-N drifted counters in O(changed) —
 *    `tenantsTouched` reports exactly k, all N candidates end equal to
 *    truth, and an immediately-following pass touches zero;
 *  - AC4: `ORVEX_QUOTAS_ENFORCE=warn` permits an over-cap write (with the
 *    default mode rejecting the identical write) but still hard-stops past
 *    200% of cap.
 */
describe('TestQuotaFailsClosedForStorageOnRedisLoss (ENG-2492 DoD, integration)', () => {
  jest.setTimeout(240_000);

  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;
  let kyselyDb: KyselyDB;
  let pageRepo: PageRepo;
  let attachmentRepo: AttachmentRepo;
  let userRepo: UserRepo;
  let fastCounter: QuotaFastCounter;
  let sweep: QuotaReconciliationService;
  let redisHost: string;
  let redisPort: number;
  /** The mutable live client — severing/recovering swaps what getOrNil returns. */
  let currentRedis: Redis | null;

  const REPLAYED_PAGE_CAP = 100;
  const REPLAYED_STORAGE_CAP = 1_000; // bytes — fixture literals ONLY (❌#10)

  function replayedCatalog(): EntitlementCheckResponse {
    const caps: EntitlementCaps = {
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 0,
      wiki_max_pages: REPLAYED_PAGE_CAP,
      wiki_storage_bytes_aggregate: REPLAYED_STORAGE_CAP,
      wiki_max_file_bytes: 100,
      wiki_max_files: 50,
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

  function buildEntitlementService(env?: NodeJS.ProcessEnv): EntitlementService {
    return new EntitlementService(
      new StubBillingEntitlementPort(),
      new InMemoryEntitlementCache(),
      new OrvexConfigService(env ?? {}),
      undefined, // attachmentRepo — largest-files enrichment not under test here
      fastCounter,
    );
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
    await client.connect(); // ready before the first command — no offline queue
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
    pageRepo = new PageRepo(
      kyselyDb,
      undefined as unknown as SpaceMemberRepo,
      eventEmitter,
      new OutboxWriter(kyselyDb),
      { emitInvalidate: () => undefined } as unknown as WsService,
    );
    attachmentRepo = new AttachmentRepo(kyselyDb);
    userRepo = new UserRepo(kyselyDb);

    sweep = new QuotaReconciliationService(
      fastCounter,
      pageRepo,
      attachmentRepo,
      userRepo,
    );
  });

  afterAll(async () => {
    currentRedis?.disconnect(false);
    await redisContainer?.stop();
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  beforeEach(async () => {
    if (currentRedis === null || currentRedis.status === 'end') {
      currentRedis = await connectRedis();
    }
    await currentRedis.flushall();
  });

  let seedCounter = 0;
  async function seedWorkspace(opts: { pages: number; attachmentBytes: number[] }) {
    seedCounter += 1;
    const ws = await db
      .insertInto('workspaces')
      .values({ name: `ENG-2492 Workspace ${seedCounter}` })
      .returning('id')
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto('users')
      .values({ email: `eng2492-${seedCounter}@example.com`, workspaceId: ws.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    const space = await db
      .insertInto('spaces')
      .values({
        name: 'Space',
        slug: `eng2492-space-${seedCounter}`,
        workspaceId: ws.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    for (let i = 0; i < opts.pages; i++) {
      await db
        .insertInto('pages')
        .values({
          title: `seeded-${i}`,
          spaceId: space.id,
          workspaceId: ws.id,
          slugId: `eng2492-${seedCounter}-${i}`,
          creatorId: user.id,
          lastUpdatedById: user.id,
        })
        .execute();
    }

    for (let i = 0; i < opts.attachmentBytes.length; i++) {
      await db
        .insertInto('attachments')
        .values({
          type: AttachmentType.File,
          filePath: `eng2492/${seedCounter}/file-${i}`,
          fileName: `file-${i}.bin`,
          fileSize: opts.attachmentBytes[i],
          fileExt: '.bin',
          mimeType: 'application/octet-stream',
          creatorId: user.id,
          workspaceId: ws.id,
        })
        .execute();
    }

    return { workspaceId: ws.id, userId: user.id };
  }

  async function catch402(fn: () => Promise<void>): Promise<QuotaExceededException> {
    let caught: unknown;
    try {
      await fn();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(QuotaExceededException);
    expect((caught as QuotaExceededException).getStatus()).toBe(402);
    return caught as QuotaExceededException;
  }

  // ── The DoD gate: fail-closed storage / fail-open cheap on Redis loss ──

  it('DoD — Redis severed: storage fails CLOSED (402 + redisUnavailable), pages/members fail OPEN; the sweep repairs drift after recovery', async () => {
    const { workspaceId } = await seedWorkspace({
      pages: 2,
      attachmentBytes: [400, 100], // truth: 500 bytes, well under the cap
    });
    const service = buildEntitlementService();

    // Healthy baseline: counter-sourced checks pass from REAL counters.
    await fastCounter.seed(workspaceId, 'storage', 500);
    await fastCounter.seed(workspaceId, 'pages', 2);
    await expect(
      service.assertWithinQuotaFromCounter(workspaceId, 'storage'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertWithinQuotaFromCounter(workspaceId, 'pages'),
    ).resolves.toBeUndefined();

    // ── The outage ──
    severRedis();

    // AC2 — storage-shaped: fail CLOSED, distinguishable under the frozen envelope.
    const storageErr = await catch402(() =>
      service.assertWithinQuotaFromCounter(workspaceId, 'storage'),
    );
    const storageBody = storageErr.getResponse() as Record<string, unknown>;
    expect(storageBody.error).toBe('QUOTA_EXCEEDED');
    expect(storageBody.resource).toBe('storage');
    expect(storageBody.limit).toBe(REPLAYED_STORAGE_CAP);
    expect(storageBody.redisUnavailable).toBe(true);

    const filesErr = await catch402(() =>
      service.assertWithinQuotaFromCounter(workspaceId, 'files'),
    );
    expect(
      (filesErr.getResponse() as Record<string, unknown>).redisUnavailable,
    ).toBe(true);

    // AC3 — the SAME outage: cheap resources fail OPEN (permitted).
    await expect(
      service.assertWithinQuotaFromCounter(workspaceId, 'pages'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertWithinQuotaFromCounter(workspaceId, 'members'),
    ).resolves.toBeUndefined();

    // ── Recovery: drift accumulated during the outage is swept back to truth ──
    await recoverRedis();
    await fastCounter.seed(workspaceId, 'storage', 9_999); // drifted vs truth 500
    const result = await sweep.runSweepOnce();
    expect(result.tenantsTouched).toBe(1);
    await expect(fastCounter.get(workspaceId, 'storage')).resolves.toBe(500);

    // The counter-sourced verdict serves real values again.
    await expect(
      service.assertWithinQuotaFromCounter(workspaceId, 'storage'),
    ).resolves.toBeUndefined();
  });

  it('AC2 (distinguishability) — a GENUINE over-cap storage rejection carries NO redisUnavailable detail', async () => {
    const { workspaceId } = await seedWorkspace({
      pages: 0,
      attachmentBytes: [],
    });
    const service = buildEntitlementService();

    await fastCounter.seed(workspaceId, 'storage', REPLAYED_STORAGE_CAP); // at cap
    const err = await catch402(() =>
      service.assertWithinQuotaFromCounter(workspaceId, 'storage'),
    );
    const body = err.getResponse() as Record<string, unknown>;
    expect(body.error).toBe('QUOTA_EXCEEDED');
    expect('redisUnavailable' in body).toBe(false);
  });

  it('AC2/AC3 (miss path) — an unseeded counter with Redis UP classifies the same: storage closed, pages open', async () => {
    const { workspaceId } = await seedWorkspace({
      pages: 1,
      attachmentBytes: [10],
    });
    const service = buildEntitlementService();
    // No counters seeded — a Redis reset/flush is exactly this state.

    const err = await catch402(() =>
      service.assertWithinQuotaFromCounter(workspaceId, 'storage'),
    );
    expect(
      (err.getResponse() as Record<string, unknown>).redisUnavailable,
    ).toBe(true);

    await expect(
      service.assertWithinQuotaFromCounter(workspaceId, 'pages'),
    ).resolves.toBeUndefined();
  });

  // ── AC1 — the O(changed) sweep ─────────────────────────────────────────

  it('AC1 — the sweep corrects EXACTLY the k drifted counters of N candidates; all N end equal to truth', async () => {
    const wsA = await seedWorkspace({ pages: 1, attachmentBytes: [] });
    const wsB = await seedWorkspace({ pages: 2, attachmentBytes: [] });
    const wsC = await seedWorkspace({ pages: 3, attachmentBytes: [] });

    await fastCounter.seed(wsA.workspaceId, 'pages', 1); // correct
    await fastCounter.seed(wsB.workspaceId, 'pages', 7); // DRIFTED (truth 2)
    await fastCounter.seed(wsC.workspaceId, 'pages', 3); // correct

    const first = await sweep.runSweepOnce();
    expect(first.candidates).toBe(3);
    expect(first.tenantsTouched).toBe(1); // exactly k, never N

    await expect(fastCounter.get(wsA.workspaceId, 'pages')).resolves.toBe(1);
    await expect(fastCounter.get(wsB.workspaceId, 'pages')).resolves.toBe(2);
    await expect(fastCounter.get(wsC.workspaceId, 'pages')).resolves.toBe(3);

    // A drift-free follow-up pass touches nothing.
    const second = await sweep.runSweepOnce();
    expect(second.candidates).toBe(3);
    expect(second.tenantsTouched).toBe(0);
  });

  it('AC1 (outage) — with Redis unreadable the sweep degrades to an empty candidate set, never a crash', async () => {
    severRedis();
    const result = await sweep.runSweepOnce();
    expect(result).toEqual({ candidates: 0, tenantsTouched: 0 });
    await recoverRedis();
  });

  // ── AC4 — warn-mode calibration + the 200% hard stop ───────────────────

  it('AC4 — warn mode permits an over-cap write (default mode rejects it) but still hard-stops past 200% of cap', async () => {
    const workspaceId = 'ws-warn-mode';
    const enforcing = buildEntitlementService();
    const warning = buildEntitlementService({ ORVEX_QUOTAS_ENFORCE: 'warn' });

    // 150% of the page cap: rejected under enforcement…
    await catch402(() =>
      enforcing.assertWithinQuota(
        workspaceId,
        'pages',
        REPLAYED_PAGE_CAP * 1.5,
      ),
    );
    // …permitted under warn-mode calibration…
    await expect(
      warning.assertWithinQuota(workspaceId, 'pages', REPLAYED_PAGE_CAP * 1.5),
    ).resolves.toBeUndefined();

    // …while a write CROSSING 200% still hard-stops even in warn mode
    // (projected 201% of cap).
    await catch402(() =>
      warning.assertIncrementWithinQuota(
        workspaceId,
        'pages',
        REPLAYED_PAGE_CAP * 2,
        1,
      ),
    );

    // The boundary itself (projected exactly 200%) is warn-permitted —
    // the hard stop fires only PAST it.
    await expect(
      warning.assertIncrementWithinQuota(
        workspaceId,
        'pages',
        REPLAYED_PAGE_CAP * 2 - 1,
        1,
      ),
    ).resolves.toBeUndefined();
  });

  it('AC4 (counter-sourced) — warn mode applies to the counter-sourced verdict too; the fail-closed outage branch stays closed even in warn mode', async () => {
    const { workspaceId } = await seedWorkspace({
      pages: 0,
      attachmentBytes: [],
    });
    const warning = buildEntitlementService({ ORVEX_QUOTAS_ENFORCE: 'warn' });

    // Counter readable at 150% of cap → warn-permitted.
    await fastCounter.seed(workspaceId, 'pages', REPLAYED_PAGE_CAP * 1.5);
    await expect(
      warning.assertWithinQuotaFromCounter(workspaceId, 'pages'),
    ).resolves.toBeUndefined();

    // The outage rail is NOT a calibration knob: storage still fails
    // closed under warn mode when the counter is unreadable.
    severRedis();
    const err = await catch402(() =>
      warning.assertWithinQuotaFromCounter(workspaceId, 'storage'),
    );
    expect(
      (err.getResponse() as Record<string, unknown>).redisUnavailable,
    ).toBe(true);
    await recoverRedis();
  });
});
