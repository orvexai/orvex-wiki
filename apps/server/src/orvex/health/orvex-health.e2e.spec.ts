import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  ORVEX_HEALTH_KAFKA_PROBE,
  ORVEX_HEALTH_POSTGRES_PROBE,
  ORVEX_HEALTH_REDIS_PROBE,
  ORVEX_HEALTH_STORAGE_PROBE,
} from './orvex-health.probes';
import { OrvexHealthModule } from './orvex-health.module';

/**
 * ENG-1604 AC8.1/AC8.3 — e2e over the real HTTP surface (no DatabaseModule,
 * mirroring the DB-free `orvex-http.e2e.spec.ts` harness — AC8.6). Probes are
 * overridden at the DI boundary so no real network/DB I/O happens in CI.
 */
describe('OrvexHealthController — health/orvex e2e', () => {
  let app: NestFastifyApplication;

  async function boot(overrides: {
    postgres?: () => Promise<{ ok: boolean; error?: string }>;
  }): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      imports: [OrvexHealthModule],
    })
      .overrideProvider(ORVEX_HEALTH_POSTGRES_PROBE)
      .useValue(overrides.postgres ?? (async () => ({ ok: true })))
      .overrideProvider(ORVEX_HEALTH_REDIS_PROBE)
      .useValue(async () => ({ ok: true }))
      .overrideProvider(ORVEX_HEALTH_STORAGE_PROBE)
      .useValue(async () => ({ ok: true, driver: 'local' }))
      .overrideProvider(ORVEX_HEALTH_KAFKA_PROBE)
      .useValue(async () => ({ ok: true }))
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('AC8.1 — returns HTTP 200 when every dependency is healthy', async () => {
    await boot({});

    const res = await app.inject({ method: 'GET', url: '/health/orvex' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.checks.postgres.ok).toBe(true);
  });

  it('AC8.1 — still returns HTTP 200 (never 503) when postgres is down', async () => {
    await boot({
      postgres: async () => ({ ok: false, error: 'connection refused' }),
    });

    const res = await app.inject({ method: 'GET', url: '/health/orvex' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('degraded');
    expect(body.checks.postgres.ok).toBe(false);
  });
});
