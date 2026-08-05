// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-3569 — the REQUEST-TIER half of the ENG-2502 RLS wiring, asserted for
 * the first time.
 *
 * ## What this pins
 *
 * `DomainMiddleware.use` enters `runInTenantScope(req.workspaceId, next)` so
 * that `executeTx` (`database/utils.ts`), reading `currentTenantScope()`, can
 * issue `set_config('app.workspace_id', $1, true)` as the first statement of
 * the transaction it opens. That is the whole mechanism by which the
 * fail-closed `orvex_rls_tenant_isolation_*` policies admit exactly the
 * caller's tenant.
 *
 * The invariant is therefore NOT "the middleware calls runInTenantScope" —
 * it demonstrably does, at line 60. The invariant is that the scope it
 * establishes is **still ambient when the route handler runs**, because that
 * is where every `executeTx` call ultimately happens. Nothing in the fleet
 * asserted that until this file.
 *
 * ## Why the existing ENG-2502 gate could not catch this
 *
 * `database/rls-transaction-scoped.integration.spec.ts` is a genuine
 * data-tier proof (real Postgres, real pgBouncer, real non-superuser
 * NOBYPASSRLS role) — but it calls `runInTenantScope` **directly, in
 * process**. It never drives the HTTP stack, so the one hop it exists to
 * guarantee — request boundary → transaction — is the one hop it does not
 * exercise. A test that never crosses the boundary cannot fail when the
 * boundary is where the value is lost.
 *
 * ## Why a REAL socket and not `app.inject`
 *
 * `light-my-request` (`app.inject`) synthesises the request object in the
 * caller's own async context. That can carry an `AsyncLocalStorage` store
 * across hops a real socket does not, which would make this suite pass for a
 * reason production never enjoys. So the app is bound to a real ephemeral
 * port and driven over real HTTP — the same shape as the ENG-3569
 * reproduction against the booted engine on :3199.
 *
 * Both verbs are driven deliberately: GET carries no body, POST does. Body
 * parsing resumes from the socket's async resource — created at connection
 * time, OUTSIDE any store `run()` established during the middleware phase —
 * which is the classic point at which an `AsyncLocalStorage` context is
 * lost. Every engine `/api/*` route this backstop protects is a POST.
 *
 * ## Collaborator doubles
 *
 * `WorkspaceRepo` and `EnvironmentService` are doubled exactly as the sibling
 * `domain.middleware.spec.ts` in this same directory already doubles them.
 * That is deliberate and not a gate-path own-code mock: the subject here is
 * the PROPAGATION mechanism, not the resolution logic. How the middleware
 * learns the tenant is irrelevant to whether the tenant survives to the
 * handler — and holding resolution fixed is what makes a failure here
 * unambiguously a propagation failure. `OrvexConfigService` is the real
 * class over an explicit env bag (never ambient `process.env`).
 */
import {
  Controller,
  Get,
  Module,
  Post,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import {
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import fastifyIp from 'fastify-ip';

import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { OrvexConfigService } from '../../orvex/config/orvex-config.service';
import { currentTenantScope } from '@docmost/db/rls/tenant-scope.context';
import { registerWorkspaceExemptPreHandler } from '../../orvex/http/orvex-workspace-exempt-paths';
import { DomainMiddleware } from './domain.middleware';

/** The single seeded tenant this harness resolves for every request. */
const TENANT_ID = '2f0f2f4b-7a3e-4a1e-9a1e-9d6a0b6c1f21';

/**
 * The probe. Reports, from INSIDE the route handler, the two values whose
 * equality is the whole invariant:
 *
 *  - `reqWorkspaceId`  — what `DomainMiddleware` resolved onto the request.
 *  - `scopeInHandler`  — what `currentTenantScope()` answers here, which is
 *                        byte-for-byte what `executeTx` will read when it
 *                        opens a transaction from this handler.
 */
@Controller('tenant-scope-probe')
class TenantScopeProbeController {
  @Get()
  get(@Req() req: FastifyRequest) {
    return {
      reqWorkspaceId: (req.raw as any).workspaceId ?? null,
      scopeInHandler: currentTenantScope(),
    };
  }

  @Post()
  post(@Req() req: FastifyRequest) {
    return {
      reqWorkspaceId: (req.raw as any).workspaceId ?? null,
      scopeInHandler: currentTenantScope(),
    };
  }

  /**
   * The same probe read one `await` deeper, i.e. after a real microtask
   * boundary — the shape every service method has before it reaches
   * `executeTx`. A scope that survives the handler entry but not its first
   * await would still leave every real transaction unscoped.
   */
  @Post('deferred')
  async deferred(@Req() req: FastifyRequest) {
    await new Promise((resolve) => setImmediate(resolve));
    return {
      reqWorkspaceId: (req.raw as any).workspaceId ?? null,
      scopeInHandler: currentTenantScope(),
    };
  }
}

@Module({
  controllers: [TenantScopeProbeController],
  providers: [
    {
      provide: WorkspaceRepo,
      useValue: {
        findFirst: async () => ({ id: TENANT_ID, name: 'probe tenant' }),
        findByHostname: async () => undefined,
      },
    },
    {
      provide: EnvironmentService,
      useValue: {
        isCloud: () => false,
        isSelfHosted: () => true,
        getAppSecret: () => 'probe-app-secret-at-least-32-characters-long',
      },
    },
    {
      provide: OrvexConfigService,
      useValue: new OrvexConfigService({} as NodeJS.ProcessEnv),
    },
    DomainMiddleware,
  ],
})
class TenantScopeProbeModule implements NestModule {
  /**
   * Registered EXACTLY as `core.module.ts:58-69` registers it — same
   * `.apply(DomainMiddleware)` / `.forRoutes('*')` shape, same excluded
   * routes — so this suite exercises the production wiring rather than a
   * bespoke re-registration that might propagate differently.
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(DomainMiddleware)
      .exclude(
        { path: 'auth/setup', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/live', method: RequestMethod.GET },
        { path: 'billing/stripe/webhook', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}

/**
 * Boots the probe app. `productionShaped: true` reproduces `main.ts`'s
 * `bootstrap()` as faithfully as a probe module can: the SAME
 * `FastifyAdapter` router options, the SAME `rawBody: true` factory flag
 * (which installs Nest's own raw-body content-type parsers — a stream read,
 * and the strongest candidate for an `AsyncLocalStorage` loss point), the
 * SAME plugin registrations in the SAME order, the SAME `onRequest` hook and
 * the REAL exported workspace-exempt `preHandler`, plus the global prefix and
 * `ValidationPipe`. If the store survives the minimal shape but not this one,
 * the culprit is whatever this adds — and the diff names it.
 */
async function bootProbeApp(productionShaped: boolean): Promise<{
  app: NestFastifyApplication;
  origin: string;
  base: string;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [TenantScopeProbeModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(
      productionShaped
        ? {
            trustProxy: true,
            routerOptions: {
              maxParamLength: 1000,
              ignoreTrailingSlash: true,
              ignoreDuplicateSlashes: true,
            },
          }
        : {},
    ),
    productionShaped ? { rawBody: true } : {},
  );

  if (productionShaped) {
    app.setGlobalPrefix('api');
    await app.register(fastifyIp as any);
    await app.register(fastifyMultipart as any);
    await app.register(fastifyCookie as any);
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (request, _reply, done) => {
        (request.raw as any).ip = request.ip;
        done();
      });
    // The REAL hook main.ts registers — imported, never hand-copied.
    registerWorkspaceExemptPreHandler(app);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        stopAtFirstError: true,
        transform: true,
      }),
    );
  }

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  // A REAL socket on an ephemeral port — see the header note on why
  // `app.inject` is not sufficient evidence here.
  await app.listen(0, '127.0.0.1');
  return {
    app,
    origin: await app.getUrl(),
    base: productionShaped ? 'api/tenant-scope-probe' : 'tenant-scope-probe',
  };
}

describe.each([
  ['minimal adapter', false],
  ['production-shaped bootstrap (main.ts parity)', true],
])(
  'ENG-3569 — the resolved tenant survives to the route handler [%s]',
  (_label, productionShaped) => {
    jest.setTimeout(60_000);

    let app: NestFastifyApplication;
    let origin: string;
    let base: string;

    beforeAll(async () => {
      ({ app, origin, base } = await bootProbeApp(productionShaped as boolean));
    });

    afterAll(async () => {
      await app?.close();
    });

  it('GET — the middleware resolves the tenant onto the request (control)', async () => {
    const res = await fetch(`${origin}/${base}`);
    const body = (await res.json()) as any;
    // Positive control: if THIS fails the harness is broken, not the
    // propagation — the middleware never ran or never resolved.
    expect(body.reqWorkspaceId).toBe(TENANT_ID);
  });

  it('GET — currentTenantScope() inside the handler equals req.workspaceId', async () => {
    const res = await fetch(`${origin}/${base}`);
    const body = (await res.json()) as any;
    expect(body.scopeInHandler).toBe(body.reqWorkspaceId);
    expect(body.scopeInHandler).toBe(TENANT_ID);
  });

  it('POST — currentTenantScope() inside the handler equals req.workspaceId', async () => {
    // Every engine /api/* route this backstop protects is a POST with a
    // body; body parsing is the async boundary the store is lost across.
    const res = await fetch(`${origin}/${base}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ probe: true }),
    });
    const body = (await res.json()) as any;
    expect(body.reqWorkspaceId).toBe(TENANT_ID);
    expect(body.scopeInHandler).toBe(TENANT_ID);
  });

  it('POST — the scope survives the handler’s first await (executeTx depth)', async () => {
    const res = await fetch(`${origin}/${base}/deferred`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ probe: true }),
    });
    const body = (await res.json()) as any;
    expect(body.reqWorkspaceId).toBe(TENANT_ID);
    // This is the value `executeTx` actually reads. `null` here means every
    // tenant-scoped transaction in the engine leaves `app.workspace_id`
    // unset and the FORCE-RLS policies deny — including for the owner.
    expect(body.scopeInHandler).toBe(TENANT_ID);
  });
  },
);
