// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2501 — `TestCloudBootCleanWithoutEeModule`, the named binary DoD gate.
 *
 * Integration layer (real Nest bootstrap of the REAL `AppModule` on a
 * FastifyAdapter, real testcontainers Postgres + Redis — CS §5: own code is
 * never mocked, DB/Redis are local-substitutable infra). `ee/` is GENUINELY
 * absent from this build tree (`apps/server/src/ee` does not exist — the
 * clean-room precondition `api-key-clean-room.static.spec.ts` pins), so the
 * `require('./ee/ee.module')` in `app.module.ts` fails for real at module
 * load and the CLOUD branch's catch is the code under test.
 *
 * Asserts (per the Issue's §5a):
 *  (1) AC1 — `CLOUD=true` + absent `ee/ee.module`: `AppModule` loads, the
 *      failure is caught and logged as a loud warning containing the stable
 *      substring `"CLOUD=true but ee/ absent"`, boot continues to
 *      `app.init()` — `process.exit` is NEVER called;
 *  (2) AC2 — a `{tenant}.wiki.{cell}.orvex.ai`-shaped request resolves
 *      `req.workspaceId` via label-0 (`split('.')[0]` →
 *      `workspaceRepo.findByHostname`), driven through `DomainMiddleware`'s
 *      exported `use()` contract with the booted app's REAL repo +
 *      environment service;
 *  (3) AC3 — a wrong-cell label-2 request is SOFT-rejected with the typed
 *      `CELL_LABEL_MISMATCH` marker (421 — one request, never a crash),
 *      proven end-to-end through the app's REAL mounted middleware, while
 *      the edge/principal-vs-CELL_ID check (cell-lint rule 3) remains the
 *      claim-superior control this test does not touch;
 *  (4) AC4 — no `ee/` dependency on the multi-tenant hot path beyond the
 *      single guarded require (grep-gate);
 *  (5) AC5 — under the `solo` sentinel (CELL_ID unset or `"solo"`) the
 *      label-2 assertion NO-OPS rather than rejecting;
 *  plus the NFR honesty gate (the new check documents itself as
 *  soft/defence-in-depth, never claims authority).
 *
 * Determinism: `CLOUD`/`CELL_ID` are set as explicit values per sub-case in
 * this spec's own setup (never inherited ambiently); the label-2 comparison
 * involves no wall-clock or randomness.
 */
import * as path from 'path';
import { promises as fs } from 'fs';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

import { DomainMiddleware } from '../../src/common/middlewares/domain.middleware';
import { EnvironmentService } from '../../src/integrations/environment/environment.service';
import { OrvexConfigService } from '../../src/orvex/config/orvex-config.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { startTestDatabase, TestDb } from './db-test-harness';

const TEST_APP_SECRET = 'eng-2501-test-secret-at-least-32-characters-long';

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

describe('TestCloudBootCleanWithoutEeModule (ENG-2501 DoD gate)', () => {
  jest.setTimeout(300_000);

  let testDb: TestDb;
  let redisContainer: StartedTestContainer;
  let app: NestFastifyApplication;
  let warnSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  let acmeWorkspaceId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    const pgHost = testDb.container.getHost();
    const pgPort = testDb.container.getMappedPort(5432);

    // Explicit env per sub-case discipline: every value the boot reads is
    // set HERE, never inherited from the runner's ambient environment.
    process.env.CLOUD = 'true';
    delete process.env.CELL_ID;
    delete process.env.ORVEX_MODULES_ENABLED;
    process.env.DATABASE_URL = `postgres://orvex:orvex@${pgHost}:${pgPort}/orvex_test`;
    process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
    process.env.APP_SECRET = TEST_APP_SECRET;
    process.env.APP_URL = 'http://localhost:3000';
    process.env.SUBDOMAIN_HOST = 'orvex.ai';

    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code}) called during CLOUD boot`);
      }) as never);

    // AC1 — load the REAL AppModule NOW (after env + spies are in place):
    // the module-scope `require('./ee/ee.module')` try/catch executes at
    // this require, against the real tree where `ee/` is genuinely absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../../src/app.module');

    const built = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = built.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const acme = await testDb.db
      .insertInto('workspaces')
      .values({ name: 'ENG-2501 acme', hostname: 'acme' })
      .returning('id')
      .executeTakeFirstOrThrow();
    acmeWorkspaceId = acme.id;
  });

  afterAll(async () => {
    // @nestjs/cache-manager (3.x) never disconnects the KeyvRedis store the
    // AppModule's CacheModule.registerAsync factory constructs, so its ioredis
    // socket would outlive app.close() and keep the shared integration jest
    // process from exiting (a CI-hang, not a test failure). Disconnect it
    // explicitly — test-harness hygiene only, no production behaviour change.
    const cacheManager = app?.get<{ disconnect?: () => Promise<void> }>(
      CACHE_MANAGER,
      { strict: false },
    );
    await app?.close();
    await cacheManager?.disconnect?.();
    warnSpy?.mockRestore();
    exitSpy?.mockRestore();
    restoreEnv();
    await testDb?.teardown();
    await redisContainer?.stop();
  });

  /** The booted app's REAL collaborators, with an EXPLICIT cell config bag. */
  function realMiddleware(cellId?: string): DomainMiddleware {
    return new DomainMiddleware(
      app.get(WorkspaceRepo),
      app.get(EnvironmentService),
      new OrvexConfigService(
        (cellId === undefined ? {} : { CELL_ID: cellId }) as NodeJS.ProcessEnv,
      ),
    );
  }

  function makeRes(): { res: any; state: { statusCode?: number; body?: string } } {
    const state: { statusCode?: number; body?: string } = {};
    const res = {
      statusCode: undefined as number | undefined,
      setHeader: jest.fn(),
      end: jest.fn((body?: string) => {
        state.statusCode = res.statusCode;
        state.body = body;
      }),
    };
    return { res, state };
  }

  it('AC1 — CLOUD=true with ee/ absent boots clean: app.init() resolved, loud warning logged, process.exit NEVER called', () => {
    // Boot already succeeded in beforeAll (a rejected init would have failed
    // the suite before any test ran) — pin the observable evidence.
    expect(app).toBeDefined();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some((call) =>
        String(call[0]).includes('CLOUD=true but ee/ absent'),
      ),
    ).toBe(true);
  });

  it('AC2 — a {tenant}.wiki.{cell}.orvex.ai request resolves workspaceId via label-0 against the booted app\'s real repo', async () => {
    const middleware = realMiddleware('eu1');
    const req: any = { headers: { host: 'acme.wiki.eu1.orvex.ai' } };
    const next = jest.fn();

    await middleware.use(req, makeRes().res, next);

    expect(app.get(EnvironmentService).isCloud()).toBe(true);
    expect(req.workspaceId).toBe(acmeWorkspaceId);
    expect(req.workspace?.id).toBe(acmeWorkspaceId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('AC3 — a wrong-cell label-2 request is SOFT-rejected with the typed CELL_LABEL_MISMATCH marker (421), never an unhandled crash', async () => {
    const middleware = realMiddleware('eu1');
    const req: any = { headers: { host: 'acme.wiki.us1.orvex.ai' } };
    const { res, state } = makeRes();
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(421);
    const body = JSON.parse(state.body ?? '{}');
    expect(body.code).toBe('CELL_LABEL_MISMATCH');
    expect(body.hostLabel2).toBe('us1');
    expect(body.podCellId).toBe('eu1');
  });

  it('AC3 (end-to-end) — the assertion is LIVE on the booted app\'s mounted middleware: a wrong-cell HTTP request is rejected 421 at the front door', async () => {
    // Explicit per-sub-case env injection: the mounted middleware's config
    // reader resolves CELL_ID from the value THIS case sets.
    process.env.CELL_ID = 'eu1';
    try {
      const rejected = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { host: 'acme.wiki.us1.orvex.ai' },
        payload: { email: 'nobody@example.com', password: 'irrelevant-pw' },
      });
      expect(rejected.statusCode).toBe(421);
      const body = rejected.json();
      expect(body.code).toBe('CELL_LABEL_MISMATCH');
      expect(body.hostLabel2).toBe('us1');
      expect(body.podCellId).toBe('eu1');

      // Matching cell: the SAME request shape passes the assertion (any
      // downstream status is fine — the front door did not 421 it).
      const passed = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { host: 'acme.wiki.eu1.orvex.ai' },
        payload: { email: 'nobody@example.com', password: 'irrelevant-pw' },
      });
      expect(passed.statusCode).not.toBe(421);
    } finally {
      delete process.env.CELL_ID;
    }
  });

  it('AC5 — under the solo sentinel (CELL_ID unset or "solo") a would-be mismatch NO-OPS: cell enforcement is off entirely', async () => {
    for (const cellId of [undefined, 'solo'] as const) {
      const middleware = realMiddleware(cellId);
      const req: any = { headers: { host: 'acme.wiki.us1.orvex.ai' } };
      const { res } = makeRes();
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(req.workspaceId).toBe(acmeWorkspaceId);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.end).not.toHaveBeenCalled();
    }
  });

  it('AC4 (grep-gate) — no ee/ dependency on the multi-tenant hot path beyond the single guarded require in app.module.ts', async () => {
    const appModuleSource = await fs.readFile(
      path.join(__dirname, '../../src/app.module.ts'),
      'utf-8',
    );
    // Zero static `ee/` imports.
    expect(appModuleSource).not.toMatch(/^import[^\n]*['"]\.\/ee\//m);
    // The ONLY require of ee/ee.module sits inside the guarded try/catch.
    const requires = appModuleSource.match(/require\('\.\/ee\/ee\.module'\)/g);
    expect(requires).not.toBeNull();
    expect(
      /try\s*\{[\s\S]*?require\('\.\/ee\/ee\.module'\)[\s\S]*?\}\s*catch/.test(
        appModuleSource,
      ),
    ).toBe(true);

    const middlewareSource = await fs.readFile(
      path.join(__dirname, '../../src/common/middlewares/domain.middleware.ts'),
      'utf-8',
    );
    expect(middlewareSource).not.toMatch(/['"][^'"]*\/ee\/|require\(.*\/ee\//);

    // And the ee/ tree is GENUINELY absent from this build (the AC1 premise).
    await expect(
      fs.stat(path.join(__dirname, '../../src/ee')),
    ).rejects.toThrow();
  });

  it('NFR honesty — the label-2 check documents itself as SOFT/defence-in-depth and carries no unfinished-work marker', async () => {
    const middlewareSource = await fs.readFile(
      path.join(__dirname, '../../src/common/middlewares/domain.middleware.ts'),
      'utf-8',
    );
    expect(middlewareSource).toMatch(/soft/i);
    expect(middlewareSource).toMatch(/defence-in-depth/i);
    expect(middlewareSource).not.toMatch(/TODO|FIXME/);
    // No wall-clock / randomness in the middleware's decision logic (❌#9).
    expect(middlewareSource).not.toMatch(/Date\.now\(\)|Math\.random/);
  });
});
