import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

// Test-infrastructure import ONLY (reproduces the live main.ts pipeline so the
// asserted 200 shapes are WIRE-TRUE) — production orvex code never imports
// upstream modules (A-THIN).
import { TransformHttpResponseInterceptor } from '../../common/interceptors/http-response.interceptor';
import { ORVEX_NOT_IMPLEMENTED } from '../not-implemented';
import { OrvexRootModule } from '../orvex-root.module';

/**
 * Flag-ON e2e through the exported OrvexRootModule surface (@nestjs/testing +
 * fastify), mirroring the live wiring: `api` global prefix + the same global
 * ValidationPipe as `main.ts`. Proves every noop-501 op answers with the typed
 * sentinel, the tenant-move Idempotency-Key header gates BEFORE the 501, and the
 * REAL source offer echoes its build-time env.
 */
describe('Orvex primitive surface (flag ON) — e2e', () => {
  let app: NestFastifyApplication;

  const GIT_SHA = 'e2e-sha-0123456789abcdef';
  const SOURCE_REPO = 'https://github.com/orvexai/orvex-wiki';

  const validManifest = {
    schema_version: 1,
    tenant_id: '9b2e4f6a-1c3d-4e5f-8a7b-0c1d2e3f4a5b',
    stores: [],
    s3_prefixes: [],
    cursors: [],
  };

  const saved: Record<string, string | undefined> = {};
  const setEnv = (key: string, value: string): void => {
    saved[key] = process.env[key];
    process.env[key] = value;
  };

  const sentinel = (operationId: string) => ({
    code: 'NOT_IMPLEMENTED',
    operationId,
    marker: ORVEX_NOT_IMPLEMENTED,
  });

  beforeAll(async () => {
    setEnv('ORVEX_MODULES_ENABLED', 'true');
    setEnv('ORVEX_GIT_SHA', GIT_SHA);
    setEnv('ORVEX_SOURCE_REPO', SOURCE_REPO);
    // identity unset -> the flag-gated OrvexRootModule session-mint composition
    // binds the fail-closed verifier. (The real FR-W6 exchange endpoint no
    // longer lives in this DB-free harness — see the FR-W6 note below.)
    saved['ORVEX_IDENTITY_URL'] = process.env.ORVEX_IDENTITY_URL;
    delete process.env.ORVEX_IDENTITY_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [OrvexRootModule.register()],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        stopAtFirstError: true,
      }),
    );
    // Same global 2xx envelope as main.ts: {data, success, status}.
    app.useGlobalInterceptors(
      new TransformHttpResponseInterceptor(app.get(Reflector)),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  // ENG-1652 — `orvexApplyOps` is no longer part of this DB-less flag-e2e
  // harness: the real orchestrator needs `PageRepo`/`@InjectKysely()`, so
  // the controller moved to `OrvexApplyOpsModule` (mounted unconditionally
  // by `PageModule`, its real DB-aware home) — see that module's docstring
  // and `OrvexHttpModule`'s. Its own DoD e2e (testcontainers Postgres) lives
  // at `page-blocks/orvex-apply-ops.controller.e2e.spec.ts`.

  it('orvexGetQuota -> 501 typed sentinel', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/orvex/quota' });
    expect(res.statusCode).toBe(501);
    expect(res.json()).toEqual(sentinel('orvexGetQuota'));
  });

  // FR-W6 — `orvexSessionExchange` (`POST /api/orvex/session/exchange`) is no
  // longer part of this DB-less flag-e2e harness: it stopped being a 501 stub.
  // The REAL session-mint needs `UserRepo`/`SessionService` (DB), so — the same
  // carve-out as `orvexApplyOps` above (and the A-BOUNDARY fence forbids orvex/*
  // importing @docmost/*) — it moved to the DB-backed, unconditionally-mounted
  // `OrvexSessionMintModule` under core. Its own DoD tests (verify → resolve →
  // mint, all deny-by-default) live at
  // `core/session-mint/orvex-session-mint.service.spec.ts` and
  // `core/session-mint/identity-introspector.spec.ts`. The former ENG-1490 AC4
  // regression (native-login guard must not touch the session-mint path) is now
  // STRUCTURALLY guaranteed rather than asserted: the mint controller lives in a
  // module that never mounts `OrvexNativeLoginGuard` (that guard is applied only
  // on `AuthController.login`), so there is no path for it to reach this route.

  it('orvexSourceOffer -> 200 REAL wire-true envelope {data:{sha,sourceRepo},success,status}', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/orvex/source' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: { sha: GIT_SHA, sourceRepo: SOURCE_REPO },
      success: true,
      status: 200,
    });
  });

  it('orvexSourceOffer WITHOUT env -> LOUD 500 "source offer not configured" (never nulls-200)', async () => {
    // Build a second app with the offer env absent: a compliance endpoint that
    // silently returned nulls would read healthy while offering nothing.
    const savedSha = process.env.ORVEX_GIT_SHA;
    const savedRepo = process.env.ORVEX_SOURCE_REPO;
    delete process.env.ORVEX_GIT_SHA;
    delete process.env.ORVEX_SOURCE_REPO;
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [OrvexRootModule.register()],
      }).compile();
      const bare = moduleRef.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter(),
      );
      bare.setGlobalPrefix('api');
      await bare.init();
      await bare.getHttpAdapter().getInstance().ready();
      const res = await bare.inject({ method: 'GET', url: '/api/orvex/source' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({
        statusCode: 500,
        message: 'source offer not configured',
      });
      await bare.close();
    } finally {
      if (savedSha !== undefined) process.env.ORVEX_GIT_SHA = savedSha;
      if (savedRepo !== undefined) process.env.ORVEX_SOURCE_REPO = savedRepo;
    }
  });

  const tenantMoveSteps: Array<[string, string]> = [
    ['quiesce', 'orvexTenantMoveQuiesce'],
    ['export', 'orvexTenantMoveExport'],
    ['import', 'orvexTenantMoveImport'],
    ['activate', 'orvexTenantMoveActivate'],
  ];

  it.each(tenantMoveSteps)(
    'tenant-move/%s WITHOUT Idempotency-Key -> 400 (header gates before the 501)',
    async (step) => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/orvex/tenant-move/${step}`,
        payload: validManifest,
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.json())).toContain('Idempotency-Key');
    },
  );

  it.each(tenantMoveSteps)(
    'tenant-move/%s WITH Idempotency-Key -> 501 typed sentinel',
    async (step, operationId) => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/orvex/tenant-move/${step}`,
        headers: { 'idempotency-key': 'test-key-1' },
        payload: validManifest,
      });
      expect(res.statusCode).toBe(501);
      expect(res.json()).toEqual(sentinel(operationId));
    },
  );
});
