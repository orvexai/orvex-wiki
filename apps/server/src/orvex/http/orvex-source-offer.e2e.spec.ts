import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

// Test-infrastructure import ONLY (reproduces the live main.ts pipeline so
// the asserted shapes are WIRE-TRUE) — production orvex code never imports
// upstream modules (A-THIN).
import { TransformHttpResponseInterceptor } from '../../common/interceptors/http-response.interceptor';
import { OrvexRootModule } from '../orvex-root.module';
import { DbFreeAuditKyselyStubModule } from '../__fixtures__/db-free-root-module-testing';
import {
  WORKSPACE_EXEMPT_PATHS,
  registerWorkspaceExemptPreHandler,
} from './orvex-workspace-exempt-paths';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

/**
 * TestSourceOfferReachableAndCanonical (ENG-2500 DoD) — the AGPL §13 source
 * offer, through the REAL HTTP surface (`app.inject()`, never a direct
 * method call):
 *
 *  1. AC1  — 200 unauthenticated with {sha, sourceRepo} in the vanilla boot.
 *  2. AC2b — 200 (not a pre-controller 404) in a CLOUD-mode boot where the
 *     request's Host resolves to NO workspace, under the REAL
 *     workspace-resolution preHandler hook (registerWorkspaceExemptPreHandler
 *     — the exact hook main.ts registers, imported, never hand-copied). A
 *     control request to a non-exempt route proves the hook is genuinely
 *     active, so the 200 is exemption, not a vacuous pass.
 *  3. AC2/AC4 — the fork's conflicting endpoints collapse to ONE canonical
 *     §13 value: VersionController stays JwtAuthGuard-gated and is
 *     disclaimed as NOT a §13 mechanism; only OrvexSourceController serves
 *     the offer.
 *  4. AC5 — unset ORVEX_GIT_SHA/ORVEX_SOURCE_REPO fails LOUD (500), never a
 *     silently-wrong sha — re-proven under the CLOUD-mode hook.
 *  5. AC3 — LICENSE-COMPLIANCE.md exists at the repo root and names the
 *     endpoint, the license, and the public source repository.
 *
 * Deterministic: fixed env fixtures; no live network call to GitHub or any
 * mirror host (the mirror's reachability is an ops/deploy-time fact).
 */
describe('TestSourceOfferReachableAndCanonical (ENG-2500)', () => {
  const GIT_SHA = 'src-offer-sha-0123456789abcdef';
  const SOURCE_REPO = 'https://github.com/orvexai/orvex-wiki';

  const saved: Record<string, string | undefined> = {};
  const setEnv = (key: string, value: string): void => {
    saved[key] = process.env[key];
    process.env[key] = value;
  };

  beforeAll(() => {
    setEnv('ORVEX_MODULES_ENABLED', 'true');
    setEnv('ORVEX_GIT_SHA', GIT_SHA);
    setEnv('ORVEX_SOURCE_REPO', SOURCE_REPO);
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function boot({ cloudHook }: { cloudHook: boolean }): Promise<NestFastifyApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [OrvexRootModule.register(), DbFreeAuditKyselyStubModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, stopAtFirstError: true }),
    );
    app.useGlobalInterceptors(
      new TransformHttpResponseInterceptor(app.get(Reflector)),
    );
    if (cloudHook) {
      // The REAL production hook — the CLOUD-mode workspace-resolution
      // preHandler main.ts registers. In this harness no DomainMiddleware
      // runs, so req.raw.workspaceId is never resolved: exactly the
      // "Host resolves to NO workspace" CLOUD shape AC2b names.
      registerWorkspaceExemptPreHandler(app);
    }
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  it('AC1 — vanilla boot: 200 unauthenticated with {sha, sourceRepo}', async () => {
    const app = await boot({ cloudHook: false });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/orvex/source' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: { sha: GIT_SHA, sourceRepo: SOURCE_REPO },
        success: true,
        status: 200,
      });
    } finally {
      await app.close();
    }
  });

  it('AC2b — CLOUD-mode boot, Host resolves to no workspace: STILL 200, not a pre-controller 404', async () => {
    const app = await boot({ cloudHook: true });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/orvex/source',
        headers: { host: 'no-such-workspace.example.com' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ sha: GIT_SHA, sourceRepo: SOURCE_REPO });
    } finally {
      await app.close();
    }
  });

  it('AC2b control — a non-exempt route under the same hook is blocked pre-controller (the hook is genuinely active)', async () => {
    const app = await boot({ cloudHook: true });
    try {
      // /api/orvex/quota answers a 501 typed sentinel when it is reached;
      // under the CLOUD hook with no resolved workspace it must NOT be
      // reached (the hook 404s it first) — proving the source-offer 200
      // above is the allow-list exemption at work, not a dead hook.
      const res = await app.inject({
        method: 'GET',
        url: '/api/orvex/quota',
        headers: { host: 'no-such-workspace.example.com' },
      });
      expect(res.statusCode).toBe(404);
      expect(res.statusCode).not.toBe(501);
    } finally {
      await app.close();
    }
  });

  it('AC5 — unset ORVEX_GIT_SHA/ORVEX_SOURCE_REPO fails LOUD (500) even under the CLOUD hook (reachable, then honest)', async () => {
    const savedSha = process.env.ORVEX_GIT_SHA;
    const savedRepo = process.env.ORVEX_SOURCE_REPO;
    delete process.env.ORVEX_GIT_SHA;
    delete process.env.ORVEX_SOURCE_REPO;
    try {
      const app = await boot({ cloudHook: true });
      try {
        const res = await app.inject({
          method: 'GET',
          url: '/api/orvex/source',
          headers: { host: 'no-such-workspace.example.com' },
        });
        expect(res.statusCode).toBe(500);
        expect(res.json()).toMatchObject({
          message: 'source offer not configured',
        });
      } finally {
        await app.close();
      }
    } finally {
      if (savedSha !== undefined) process.env.ORVEX_GIT_SHA = savedSha;
      if (savedRepo !== undefined) process.env.ORVEX_SOURCE_REPO = savedRepo;
    }
  });

  it('AC2b — /api/orvex/source is on the committed workspace-exempt allow-list (no wider exemption added)', () => {
    expect(WORKSPACE_EXEMPT_PATHS).toContain('/api/orvex/source');
  });

  it('AC2/AC4 — exactly ONE endpoint is the §13 mechanism; VersionController is disclaimed and stays auth-gated', () => {
    const versionController = readFileSync(
      path.join(REPO_ROOT, 'apps/server/src/integrations/security/version.controller.ts'),
      'utf8',
    );
    const versionService = readFileSync(
      path.join(REPO_ROOT, 'apps/server/src/integrations/security/version.service.ts'),
      'utf8',
    );
    // stays authenticated — it never becomes a public compliance surface
    expect(versionController).toContain('@UseGuards(JwtAuthGuard)');
    // both carry the explicit NOT-a-§13 disclaimer naming the canonical route
    expect(versionController).toContain('NOT an AGPL §13 mechanism');
    expect(versionController).toContain('GET /api/orvex/source');
    expect(versionService).toContain('NOT an AGPL §13 mechanism');
    expect(versionService).toContain('GET /api/orvex/source');
    // the canonical controller is the single owner of the orvex/source route
    const sourceController = readFileSync(
      path.join(REPO_ROOT, 'apps/server/src/orvex/http/orvex-source.controller.ts'),
      'utf8',
    );
    expect(sourceController).toContain("@Controller('orvex/source')");
  });

  it('AC3 — LICENSE-COMPLIANCE.md exists and names the endpoint, license, and public source repository', () => {
    const file = path.join(REPO_ROOT, 'LICENSE-COMPLIANCE.md');
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('GET /api/orvex/source');
    expect(text).toContain('AGPL-3.0');
    expect(text).toContain('https://github.com/orvexai/orvex-wiki');
    expect(text).toContain('ORVEX_GIT_SHA');
    expect(text).toContain('ORVEX_SOURCE_REPO');
    // honesty: a compliance statement with placeholder markers is no statement
    expect(text).not.toMatch(/TODO|FIXME|placeholder/i);
  });
});
