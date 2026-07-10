// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { resolveGlobalPrefixExclude } from '../http/orvex-global-prefix-exclude';
import { OrvexRootModule } from '../orvex-root.module';

/**
 * ENG-1360 §5b route test (review1 F1) — `/metrics` sits OUTSIDE the `/api`
 * global prefix (AC6). Boots the real `OrvexRootModule` tree (flag ON) and
 * applies the IDENTICAL `setGlobalPrefix('api', { exclude: resolveGlobalPrefixExclude() })`
 * call `main.ts` makes — the production resolver, not a hand-copied
 * literal — so this is a failing-if-broken guard: dropping 'metrics' from
 * `UPSTREAM_GLOBAL_PREFIX_EXCLUDE` fails this suite instead of silently
 * passing against a stale duplicate list (review1 F1). `app.inject` (no
 * bearer/CIDR configured) is enough here: AC6 only cares whether the route
 * RESOLVES vs 404s — the fail-closed 401 body (AC4) is covered separately
 * in `metrics.controller.spec.ts`/`metrics-auth.spec.ts`.
 */
describe('AC6 — /metrics route sits outside the /api global prefix', () => {
  let app: NestFastifyApplication;

  const saved: Record<string, string | undefined> = {};
  const setEnv = (key: string, value: string): void => {
    saved[key] = process.env[key];
    process.env[key] = value;
  };

  beforeAll(async () => {
    setEnv('ORVEX_MODULES_ENABLED', 'true');

    const moduleRef = await Test.createTestingModule({
      imports: [OrvexRootModule.register()],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    // Calls the SAME production resolver main.ts:56 calls — not a
    // hand-copied literal — so a future edit to the exclude list is caught
    // here, not silently rubber-stamped (review1 F1).
    app.setGlobalPrefix('api', {
      exclude: resolveGlobalPrefixExclude(),
    });
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

  it('GET /metrics resolves to the controller (not a 404)', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    // No CIDR/bearer configured in this harness => fail-closed 401 (AC4),
    // NOT 404 — proving the route resolved under the excluded prefix.
    expect(res.statusCode).not.toBe(404);
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/metrics 404s — the route is not double-mounted under /api', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(res.statusCode).toBe(404);
  });

  it("resolveGlobalPrefixExclude() actually contains 'metrics' (review1 F1 literal guard)", () => {
    expect(resolveGlobalPrefixExclude()).toContain('metrics');
  });
});
