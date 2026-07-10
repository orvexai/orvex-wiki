// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { OrvexRootModule } from '../orvex-root.module';

/**
 * ENG-1360 §5b route test (review1 F1) — `/metrics` sits OUTSIDE the `/api`
 * global prefix (AC6). Boots the real `OrvexRootModule` tree (flag ON) and
 * applies the IDENTICAL `setGlobalPrefix('api', { exclude: [...] })` call
 * `main.ts` makes, so this proves the actual exclude wiring, not a
 * hand-rolled substitute. `app.inject` (no bearer/CIDR configured) is
 * enough here: AC6 only cares whether the route RESOLVES vs 404s — the
 * fail-closed 401 body (AC4) is covered separately in
 * `metrics.controller.spec.ts`/`metrics-auth.spec.ts`.
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
    // Mirrors main.ts:52-56 exactly (same exclude list, same call shape).
    app.setGlobalPrefix('api', {
      exclude: ['robots.txt', 'share/:shareId/p/:pageSlug', 'mcp', 'metrics'],
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
});
