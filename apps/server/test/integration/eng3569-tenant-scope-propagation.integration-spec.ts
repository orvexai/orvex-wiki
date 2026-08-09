// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-3569 — `TestTenantScopeReachesTheHandler`, the named DoD gate for the
 * REQUEST-tier half of the RLS backstop.
 *
 * ENG-2502 wired the tenant GUC at two ends:
 *
 *   request boundary  `DomainMiddleware.use` → `runInTenantScope(req.workspaceId, next)`
 *   txn chokepoint    `executeTx` → `currentTenantScope()` → `set_config('app.workspace_id', …, true)`
 *
 * and proved the SECOND end in-process
 * (`src/database/rls-transaction-scoped.integration.spec.ts`, which calls
 * `runInTenantScope` directly). Nothing in the fleet proved the JOIN: that the
 * scope established at the request boundary is still ambient when the route
 * handler — and therefore `executeTx` many frames deeper — actually runs.
 *
 * That join is the whole invariant. If it does not hold, `executeTx` reads
 * `null`, leaves the GUC unset, and under the deployed RLS posture
 * (`relforcerowsecurity=t`, engine role NOBYPASSRLS) the engine fail-CLOSES on
 * every tenant-scoped read AND write — including the owner's own — which is an
 * outage wearing the shape of isolation. Conversely, while it does not hold,
 * any "cross-tenant is refused" assertion is passing for the wrong reason:
 * everything is refused, so nothing about RLS-as-a-backstop is proven.
 *
 * WHAT THIS SUITE DRIVES (and why each choice is the faithful one):
 *
 *  - the REAL `AppModule` on a REAL `FastifyAdapter`, so `CoreModule`'s
 *    `consumer.apply(DomainMiddleware).forRoutes('*')` registration is the one
 *    under test — never a hand-mounted copy of it (CS §5 ❌#4);
 *  - a REAL listening socket (`app.listen(0)`) driven with a REAL `node:http`
 *    client, NOT `app.inject`. `light-my-request` synthesises the request off a fake
 *    socket and can keep an async context alive that a real socket's
 *    `'data'`/`'end'` emissions — originating from the connection's own async
 *    resource, created long before any per-request scope — would lose. Using
 *    `inject` here would be a harness that cannot observe the defect;
 *  - a POST with a JSON body, because EVERY engine `/api/*` route is a POST
 *    and body parsing is precisely where the request-scoped async context is
 *    at risk;
 *  - a REAL testcontainers Postgres (CS §5: Postgres is local-substitutable
 *    infra, own code is never mocked) so `WorkspaceRepo.findByHostname` is the
 *    real repo doing a real query.
 *
 * The only scaffolding is `TenantScopeProbeController` — a test-owned route
 * that reports what it observes. It fakes nothing: it is an OBSERVER of the
 * production middleware's effect, the same way a voltmeter is not a fake
 * circuit. Asserting the invariant needs somewhere to read it from, and no
 * production route exposes `currentTenantScope()`.
 *
 * Determinism: no wall-clock, no randomness; the workspace hostname and the
 * cell label are fixed literals set by this spec's own setup.
 */
import * as http from 'node:http';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Controller, Module, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

import { currentTenantScope } from '../../src/database/rls/tenant-scope.context';
import { executeTx } from '../../src/database/utils';
import { InjectKysely } from 'nestjs-kysely';
import type { KyselyDB } from '../../src/database/types/kysely.types';
import { sql } from 'kysely';
import { startTestDatabase, TestDb } from './db-test-harness';

const TEST_APP_SECRET = 'eng-3569-test-secret-at-least-32-characters-long';
const TENANT_HOSTNAME = 'acme';
const CELL_ID = 'eu1';
const HOST_HEADER = `${TENANT_HOSTNAME}.wiki.${CELL_ID}.orvex.ai`;

/**
 * The observer. Reports, for ONE real request:
 *  - what `DomainMiddleware` resolved onto the raw request (`req.workspaceId`);
 *  - what the ambient tenant scope is INSIDE the handler;
 *  - what `executeTx` — the shared transaction chokepoint every tenant-scoped
 *    service transaction funnels through — actually set the
 *    `app.workspace_id` GUC to for the transaction it opened.
 *
 * The third reading is the one that matters to RLS: the policies read the GUC,
 * not the ALS store, so a scope that is ambient in the handler but lost by the
 * time the transaction opens would still deny.
 */
@Controller('orvex-test/tenant-scope')
class TenantScopeProbeController {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  @Post()
  async probe(@Req() req: any) {
    const ambientInHandler = currentTenantScope();
    const gucInTransaction = await executeTx(this.db, async (trx) => {
      const row = await sql<{
        value: string;
      }>`select current_setting('app.workspace_id', true) as value`.execute(trx);
      return row.rows[0]?.value ?? null;
    });
    // The SAME nested work, but on a transaction opened OUTSIDE the
    // chokepoint (`db.transaction()` directly, then handed down as an
    // `existingTrx`) — the shape `PageController.create`/`update`,
    // `PageVerificationService` and `OrvexPageProvenanceService` used before
    // ENG-3569. `executeTx` deliberately does NOT re-scope a transaction it
    // did not open, so this one carries no tenant GUC and RLS denies every
    // statement in it. Recorded here so the hazard the fix removes is
    // observable, not merely asserted in a commit message.
    const gucInBypassTransaction = await this.db
      .transaction()
      .execute((outerTrx) =>
        executeTx(
          this.db,
          async (trx) => {
            const row = await sql<{
              value: string;
            }>`select current_setting('app.workspace_id', true) as value`.execute(
              trx,
            );
            return row.rows[0]?.value ?? null;
          },
          outerTrx,
        ),
      );
    return {
      reqWorkspaceId: req.raw?.workspaceId ?? req.workspaceId ?? null,
      ambientInHandler,
      gucInTransaction: gucInTransaction === '' ? null : gucInTransaction,
      gucInBypassTransaction:
        gucInBypassTransaction === '' ? null : gucInBypassTransaction,
    };
  }
}

@Module({ controllers: [TenantScopeProbeController] })
class TenantScopeProbeModule {}

const MANAGED_ENV_KEYS = [
  'CLOUD',
  'CELL_ID',
  'DATABASE_URL',
  'REDIS_URL',
  'APP_SECRET',
  'APP_URL',
  'SUBDOMAIN_HOST',
  'ORVEX_MODULES_ENABLED',
] as const;

const SAVED_ENV: Record<string, string | undefined> = {};
for (const key of MANAGED_ENV_KEYS) {
  SAVED_ENV[key] = process.env[key];
}

function restoreEnv(): void {
  for (const key of MANAGED_ENV_KEYS) {
    const value = SAVED_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('TestTenantScopeReachesTheHandler (ENG-3569 DoD gate)', () => {
  jest.setTimeout(300_000);

  let testDb: TestDb;
  let redisContainer: StartedTestContainer;
  let app: NestFastifyApplication;
  let listenPort: number;
  let acmeWorkspaceId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    const pgHost = testDb.container.getHost();
    const pgPort = testDb.container.getMappedPort(5432);

    process.env.CLOUD = 'true';
    process.env.CELL_ID = CELL_ID;
    delete process.env.ORVEX_MODULES_ENABLED;
    process.env.DATABASE_URL = `postgres://orvex:orvex@${pgHost}:${pgPort}/orvex_test`;
    process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
    process.env.APP_SECRET = TEST_APP_SECRET;
    process.env.APP_URL = 'http://localhost:3000';
    process.env.SUBDOMAIN_HOST = 'orvex.ai';

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../../src/app.module');

    const built = await Test.createTestingModule({
      imports: [AppModule, TenantScopeProbeModule],
    }).compile();

    // Boot options byte-faithful to `main.ts::bootstrap()` — `rawBody: true`
    // in particular swaps Fastify's content-type parsers for Nest's
    // raw-body-buffering ones, which is an extra async hop between the
    // middleware and the handler and therefore exactly the kind of thing that
    // could break request→handler async-context propagation. A harness that
    // omitted it would prove less than production runs.
    app = built.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        trustProxy: true,
        routerOptions: {
          maxParamLength: 1000,
          ignoreTrailingSlash: true,
          ignoreDuplicateSlashes: true,
        },
      }),
      { rawBody: true },
    );
    app.setGlobalPrefix('api');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await app.register(require('fastify-ip'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await app.register(require('@fastify/multipart'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    await app.register(require('@fastify/cookie'));
    await app.init();
    // A REAL listening socket — see the file header for why `inject` cannot
    // observe this defect.
    await app.listen(0, '127.0.0.1');
    listenPort = (app.getHttpServer().address() as { port: number }).port;

    const acme = await testDb.db
      .insertInto('workspaces')
      .values({ name: 'ENG-3569 acme', hostname: TENANT_HOSTNAME })
      .returning('id')
      .executeTakeFirstOrThrow();
    acmeWorkspaceId = acme.id;
  });

  afterAll(async () => {
    const cacheManager = app?.get<{ disconnect?: () => Promise<void> }>(
      CACHE_MANAGER,
      { strict: false },
    );
    await app?.close();
    await cacheManager?.disconnect?.();
    restoreEnv();
    await testDb?.teardown();
    await redisContainer?.stop();
  });

  /**
   * A REAL socket POST with an EXPLICIT `Host` header. `node:http` rather than
   * `fetch`: undici treats `host` as a forbidden header and silently replaces
   * it with the connection authority, which would defeat CLOUD-mode label-0
   * tenant resolution and make this probe measure nothing.
   */
  async function probe(): Promise<{
    reqWorkspaceId: string | null;
    ambientInHandler: string | null;
    gucInTransaction: string | null;
    gucInBypassTransaction: string | null;
  }> {
    const payload = JSON.stringify({ probe: 'eng-3569' });
    const { statusCode, body } = await new Promise<{
      statusCode: number;
      body: string;
    }>((resolve, reject) => {
      const request = http.request(
        {
          host: '127.0.0.1',
          port: listenPort,
          method: 'POST',
          path: '/api/orvex-test/tenant-scope',
          headers: {
            Host: HOST_HEADER,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let chunks = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (chunks += chunk));
          res.on('end', () =>
            resolve({ statusCode: res.statusCode ?? 0, body: chunks }),
          );
        },
      );
      request.on('error', reject);
      request.end(payload);
    });
    expect(statusCode).toBe(201);
    return JSON.parse(body);
  }

  it('AC0 (positive control) — the real DomainMiddleware resolves the tenant onto the request', async () => {
    const observed = await probe();
    expect(observed.reqWorkspaceId).toBe(acmeWorkspaceId);
  });

  it('AC1 — the tenant scope established at the request boundary is still ambient inside the route handler', async () => {
    const observed = await probe();
    expect(observed.ambientInHandler).toBe(acmeWorkspaceId);
  });

  it('AC2 — executeTx sets app.workspace_id to the request tenant for the transaction it opens', async () => {
    const observed = await probe();
    expect(observed.gucInTransaction).toBe(acmeWorkspaceId);
  });

  it('AC3 — a transaction opened OUTSIDE the chokepoint carries no tenant GUC, however healthy the request scope is', async () => {
    const observed = await probe();
    // Same request, same ambient scope (AC1 above) — yet the bypass
    // transaction is unscoped. This is why routing every request-path write
    // through `executeTx` is load-bearing and not a style preference, and why
    // `no-transaction-outside-chokepoint.static.spec.ts` guards it.
    expect(observed.ambientInHandler).toBe(acmeWorkspaceId);
    expect(observed.gucInBypassTransaction).toBeNull();
  });
});
