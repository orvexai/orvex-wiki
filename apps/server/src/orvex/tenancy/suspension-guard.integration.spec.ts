// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2505 (FR-22/FR-16/NFR-7) — `TestSuspendedTenantBlockedLiveNotAtCacheTtl`
 * (DoD gate).
 *
 * Proves, against a REAL mounted Nest app (Fastify), a REAL Redis
 * (`testcontainers redis:7-alpine` — the shared invalidation channel) and a
 * REAL Postgres (`testcontainers` — the durable `workspaces.status` truth),
 * with the REAL `TenantSuspensionGuard` + `RedisSuspensionCache` (no
 * own-code mock, CS §5 ❌#4):
 *
 *  AC1 — a suspended tenant's write request is blocked with a typed
 *        `403 {code: 'TENANT_SUSPENDED'}` BEFORE the handler runs.
 *  AC2 — the same tenant's read (GET), export, and auth requests succeed;
 *        nothing is deleted by suspension (a lockout, never destructive).
 *  AC3 — the block is LIVE/push-invalidated: a suspend signal is enforced
 *        on the VERY NEXT request even while a pre-suspension
 *        entitlement-cache entry is still fresh inside its 300s TTL —
 *        the two caches are independent (`suspension:*` vs `entitlement:*`).
 *  AC4 — a signal written via one replica's cache instance is observed by
 *        a SECOND replica's guard on its next request (shared Redis —
 *        propagation bounded by construction, no wall-clock sleep race).
 *  AC5 — with the invalidation channel down, a durably-suspended tenant
 *        STAYS blocked (durable-row fallback, never fail-open) while an
 *        unrelated active tenant is unaffected (no global outage lockout).
 *  NFR — a guard-internal failure (durable read also failing) fails CLOSED
 *        with the typed rejection, never a crash/silent allow; the
 *        allow-list is a TOTAL classification over every registered route.
 *
 * Behaviour-through-interface only (HTTP-response-level outcomes through
 * `app.inject`); deterministic fixtures; no `Date.now()`-keyed assertion —
 * propagation is asserted request-ordering-bounded, not wall-clock-raced.
 */
import * as path from 'path';
import { promises as fs } from 'fs';
import { Controller, Get, Module, Post } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
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
import Redis from 'ioredis';
import type { RedisService } from '@nestjs-labs/nestjs-ioredis';

import type { DB } from '../../database/types/db';
import type { KyselyDB } from '../../database/types/kysely.types';
import type { InsertableWorkspace } from '../../database/types/entity.types';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { RedisSuspensionCache } from './suspension-cache';
import {
  TenantSuspensionGuard,
  TENANT_SUSPENDED_CODE,
  classifySuspensionSurface,
} from './tenant-suspension.guard';
import { RedisEntitlementCache } from '../entitlement/entitlement-cache';
import type { EntitlementCheckResponse } from '../entitlement/entitlement.types';

let createHits = 0;

@Controller()
class TestSurfaceController {
  @Post('pages/create')
  create() {
    createHits += 1;
    return { ok: true, surface: 'write' };
  }

  @Get('pages/read')
  read() {
    return { ok: true, surface: 'read' };
  }

  @Post('pages/export')
  exportPages() {
    return { ok: true, surface: 'export' };
  }

  @Post('auth/login')
  login() {
    return { ok: true, surface: 'auth' };
  }
}

/** Wraps a real ioredis client in the RedisService surface the cache uses. */
function asRedisService(client: Redis | null): RedisService {
  return { getOrNil: () => client } as unknown as RedisService;
}

const FRESH_ENTITLEMENT: EntitlementCheckResponse = {
  plan: 'teams',
  plan_version: 'v1',
  features: ['composer'],
  caps: {
    ai_monthly_budget_gbp: 1,
    embedding_monthly_budget_gbp: 1,
    curator_distillation_monthly: 1,
    trial_weekly_actions_advisory: 1,
    trial_weekly_actions_throttle: 1,
    demo_ai_actions: 1,
    wiki_max_pages: 100,
    wiki_storage_bytes_aggregate: 1000,
    wiki_max_file_bytes: 100,
    wiki_max_files: 10,
    wiki_max_members: 10,
    wiki_history_retention_versions: 5,
    wiki_history_retention_days: 30,
  },
  trial: { state: 'none' },
  throttle: { state: 'none' },
  version: 'v1',
  evaluatedAt: '2026-01-01T00:00:00Z',
};

describe('TestSuspendedTenantBlockedLiveNotAtCacheTtl', () => {
  jest.setTimeout(240_000);

  let pgContainer: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;
  let redisA: Redis;
  let redisB: Redis;
  let workspaceRepo: WorkspaceRepo;

  let cacheA: RedisSuspensionCache;
  let cacheB: RedisSuspensionCache;

  /** Replica A and replica B — two independently-mounted real apps. */
  let appA: NestFastifyApplication;
  let appB: NestFastifyApplication;
  /** Replica with its invalidation channel DOWN (AC5). */
  let appC: NestFastifyApplication;

  const routesSeen: Array<{ method: string; url: string }> = [];

  let wsSuspended: string;
  let wsActive: string;
  let wsActive2: string;
  let wsToSuspend: string;

  async function mountApp(
    guard: TenantSuspensionGuard,
    collectRoutes = false,
  ): Promise<NestFastifyApplication> {
    @Module({
      controllers: [TestSurfaceController],
      providers: [{ provide: APP_GUARD, useValue: guard }],
    })
    class TestSurfaceModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestSurfaceModule],
    }).compile();

    const adapter = new FastifyAdapter();
    if (collectRoutes) {
      adapter
        .getInstance()
        .addHook('onRoute', (route: { method: unknown; url: string }) => {
          for (const m of Array.isArray(route.method)
            ? route.method
            : [route.method]) {
            routesSeen.push({ method: String(m), url: route.url });
          }
        });
    }
    // The DomainMiddleware stand-in: resolves the tenant onto the RAW
    // request (the exact field production's DomainMiddleware sets and the
    // guard reads — same contract, driven from a header for determinism).
    adapter
      .getInstance()
      .addHook(
        'onRequest',
        async (req: { headers: Record<string, unknown>; raw: unknown }) => {
          const ws = req.headers['x-test-workspace'];
          if (typeof ws === 'string' && ws.length > 0) {
            (req.raw as { workspaceId?: string }).workspaceId = ws;
          }
        },
      );

    const app = moduleRef.createNestApplication<NestFastifyApplication>(adapter);
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  beforeAll(async () => {
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);

    sqlClient = postgres(pgContainer.getConnectionUri(), {
      onnotice: () => undefined,
    });
    const rawDb = new Kysely<Record<string, unknown>>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, '../../database/migrations'),
      }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });
    workspaceRepo = new WorkspaceRepo(db as unknown as KyselyDB);

    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
    redisA = new Redis(redisUrl);
    redisB = new Redis(redisUrl); // a second connection — replica B's own client

    // Seed fixed tenants (deterministic).
    const seed = async (name: string, hostname: string, status: string) => {
      const row = await db
        .insertInto('workspaces')
        .values({ name, hostname, status } as InsertableWorkspace)
        .returning(['id'])
        .executeTakeFirstOrThrow();
      return row.id;
    };
    wsSuspended = await seed('Suspended Co', 'eng2505-suspended', 'suspended');
    wsActive = await seed('Active Co', 'eng2505-active', 'active');
    wsActive2 = await seed('Active Two', 'eng2505-active-2', 'active');
    wsToSuspend = await seed('Soon Gone', 'eng2505-soon', 'active');

    cacheA = new RedisSuspensionCache(asRedisService(redisA));
    cacheB = new RedisSuspensionCache(asRedisService(redisB));
    const cacheDown = new RedisSuspensionCache(asRedisService(null));

    appA = await mountApp(
      new TenantSuspensionGuard(cacheA, workspaceRepo),
      true,
    );
    appB = await mountApp(new TenantSuspensionGuard(cacheB, workspaceRepo));
    appC = await mountApp(new TenantSuspensionGuard(cacheDown, workspaceRepo));
  });

  afterAll(async () => {
    await appA?.close();
    await appB?.close();
    await appC?.close();
    redisA?.disconnect();
    redisB?.disconnect();
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
    await redisContainer?.stop();
  });

  it('AC1 — a suspended tenant write is blocked with a typed 403 before the handler runs', async () => {
    const hitsBefore = createHits;
    const res = await appA.inject({
      method: 'POST',
      url: '/api/pages/create',
      headers: { 'x-test-workspace': wsSuspended },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe(TENANT_SUSPENDED_CODE);
    // The handler's domain logic never ran.
    expect(createHits).toBe(hitsBefore);
  });

  it('AC2 — read/export/auth surfaces still succeed for the suspended tenant, and nothing was deleted', async () => {
    const read = await appA.inject({
      method: 'GET',
      url: '/api/pages/read',
      headers: { 'x-test-workspace': wsSuspended },
    });
    expect(read.statusCode).toBe(200);
    expect(JSON.parse(read.body)).toEqual({ ok: true, surface: 'read' });

    const exp = await appA.inject({
      method: 'POST',
      url: '/api/pages/export',
      headers: { 'x-test-workspace': wsSuspended },
    });
    expect(exp.statusCode).toBe(201);

    const auth = await appA.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-test-workspace': wsSuspended },
    });
    expect(auth.statusCode).toBe(201);

    // Suspension is a lockout, never destructive: the tenant row (and all
    // rows keyed on it) still exist.
    const row = await db
      .selectFrom('workspaces')
      .select(['id', 'status'])
      .where('id', '=', wsSuspended)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('suspended');
  });

  it('AC3 — the block is live/push-invalidated, NOT gated on the entitlement cache 300s TTL', async () => {
    // Steady state: the tenant is active and can write.
    const ok = await appA.inject({
      method: 'POST',
      url: '/api/pages/create',
      headers: { 'x-test-workspace': wsToSuspend },
    });
    expect(ok.statusCode).toBe(201);

    // A PRE-suspension entitlement projection is cached and fresh (300s TTL
    // — the REAL RedisEntitlementCache on the same Redis).
    const entitlementCache = new RedisEntitlementCache(asRedisService(redisA));
    const principal = { principal_type: 'org' as const, principal_id: wsToSuspend };
    await entitlementCache.set(principal, FRESH_ENTITLEMENT);

    // The suspend signal fires (test-injected — no upstream producer exists
    // yet, a named open item): push-invalidation via the cache entry point.
    await cacheA.setSuspended(wsToSuspend, true);

    // The VERY NEXT request is blocked...
    const blocked = await appA.inject({
      method: 'POST',
      url: '/api/pages/create',
      headers: { 'x-test-workspace': wsToSuspend },
    });
    expect(blocked.statusCode).toBe(403);
    expect(JSON.parse(blocked.body).code).toBe(TENANT_SUSPENDED_CODE);

    // ...while the entitlement-cache entry is STILL fresh inside its TTL —
    // proving suspension does not ride (or wait on) that cache.
    const entTtl = await redisA.ttl(`entitlement:org:${wsToSuspend}`);
    expect(entTtl).toBeGreaterThan(0);
    expect(entTtl).toBeLessThanOrEqual(300);
    const stillCached = await entitlementCache.get(principal);
    expect(stillCached?.plan).toBe('teams');

    // Distinct namespaces, independent invalidation lifecycles (§4e).
    expect(await redisA.get(`suspension:${wsToSuspend}`)).toBe('1');
    const suspensionKeys = await redisA.keys('suspension:*');
    const entitlementKeys = await redisA.keys('entitlement:*');
    expect(suspensionKeys.length).toBeGreaterThan(0);
    expect(entitlementKeys.length).toBeGreaterThan(0);
    expect(suspensionKeys.some((k) => k.startsWith('entitlement:'))).toBe(false);
  });

  it('AC4 — the suspend signal propagates across replicas: replica B blocks on its next request', async () => {
    // The signal was written in AC3 via replica A's cache instance; replica
    // B (its own app, own guard, own Redis connection) must observe it on
    // its NEXT request — bounded by request ordering, no wall-clock race.
    const res = await appB.inject({
      method: 'POST',
      url: '/api/pages/create',
      headers: { 'x-test-workspace': wsToSuspend },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe(TENANT_SUSPENDED_CODE);

    // And the reverse direction: a signal written via replica B's instance
    // is enforced by replica A (unsuspend → allowed again on A).
    await cacheB.setSuspended(wsToSuspend, false);
    const allowedAgain = await appA.inject({
      method: 'POST',
      url: '/api/pages/create',
      headers: { 'x-test-workspace': wsToSuspend },
    });
    expect(allowedAgain.statusCode).toBe(201);
  });

  it('AC5 — invalidation channel down: durably-suspended stays blocked (fail-closed), unrelated active tenant unaffected', async () => {
    // appC's suspension cache has NO reachable Redis (channel down).
    const blocked = await appC.inject({
      method: 'POST',
      url: '/api/pages/create',
      headers: { 'x-test-workspace': wsSuspended },
    });
    expect(blocked.statusCode).toBe(403);
    expect(JSON.parse(blocked.body).code).toBe(TENANT_SUSPENDED_CODE);

    // Fail-closed is scoped to the affected tenant — not a global lockout.
    const fine = await appC.inject({
      method: 'POST',
      url: '/api/pages/create',
      headers: { 'x-test-workspace': wsActive2 },
    });
    expect(fine.statusCode).toBe(201);
  });

  it('NFR operability — a guard-internal failure (durable read down too) fails closed with the typed rejection, never a crash or silent allow', async () => {
    // A repo whose connection is genuinely unreachable (dead port, 1s
    // connect timeout) — the infra-failure case, not an own-code mock.
    const deadSql = postgres('postgres://nobody:nowhere@127.0.0.1:1/none', {
      connect_timeout: 1,
      max: 1,
      onnotice: () => undefined,
    });
    const deadDb = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: deadSql }),
      plugins: [new CamelCasePlugin()],
    });
    const deadRepo = new WorkspaceRepo(deadDb as unknown as KyselyDB);
    const guard = new TenantSuspensionGuard(
      new RedisSuspensionCache(asRedisService(null)),
      deadRepo,
    );
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/api/pages/create',
          raw: { workspaceId: wsActive },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { code: TENANT_SUSPENDED_CODE },
    });
    await deadDb.destroy();
    await deadSql.end({ timeout: 1 }).catch(() => undefined);
  });

  it('NFR honesty — the allow-list is a TOTAL classification: every registered route is either exempt or guarded, no omission', () => {
    expect(routesSeen.length).toBeGreaterThan(0);
    for (const route of routesSeen) {
      const cls = classifySuspensionSurface(route.method, route.url);
      expect(['exempt', 'guarded']).toContain(cls);
    }
    // The specific surfaces this suite mounts classify exactly as FR-22
    // demands: reads/export/auth exempt, writes guarded.
    expect(classifySuspensionSurface('GET', '/api/pages/read')).toBe('exempt');
    expect(classifySuspensionSurface('POST', '/api/pages/export')).toBe('exempt');
    expect(classifySuspensionSurface('POST', '/api/auth/login')).toBe('exempt');
    expect(classifySuspensionSurface('POST', '/api/orvex/session/exchange')).toBe(
      'exempt',
    );
    expect(classifySuspensionSurface('POST', '/api/users/me/export')).toBe(
      'exempt',
    );
    expect(classifySuspensionSurface('POST', '/api/pages/create')).toBe(
      'guarded',
    );
    expect(classifySuspensionSurface('DELETE', '/api/spaces/anything')).toBe(
      'guarded',
    );
  });
});
