/**
 * ENG-1384 — named DoD test (re-scoped per PO Q22 ruling, AC1/AC2/AC4/AC5 only;
 * AC3/AC6 moved to a satellite ticket — see Linear ENG-1384 comment thread):
 *
 *   EngineProbesAreSatelliteIndependentSpec
 *
 * Integration test against REAL Postgres + Redis (testcontainers/GenericContainer,
 * CS §5: DB/Redis are local-substitutable infra, never mocked). There is no AI
 * subsystem in this engine to stub down — AC1/AC4/AC5 are proven by asserting the
 * AI-aggregation surface (`/health/orvex`, `workspaceAiCredentials`,
 * `orvex:ai:litellm-health`) is simply ABSENT from the tree, so liveness/readiness
 * cannot possibly be gated on it (ruling 5, ruling 10).
 *
 * Uses the same FastifyAdapter as the live main.ts (see
 * `src/orvex/http/orvex-http.e2e.spec.ts` for the sibling pattern) so the
 * asserted response shapes are wire-true.
 */
import { execSync } from 'child_process';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { TerminusModule } from '@nestjs/terminus';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

import { HealthController } from '../../src/integrations/health/health.controller';
import { PostgresHealthIndicator } from '../../src/integrations/health/postgres.health';
import { RedisHealthIndicator } from '../../src/integrations/health/redis.health';
import { EnvironmentService } from '../../src/integrations/environment/environment.service';
import { startTestDatabase, TestDb } from './db-test-harness';

// nestjs-kysely's InjectKysely() (no namespace) resolves to this exact token —
// mirrored here (not imported) so the test wires the REAL indicator against a
// REAL Postgres handle without importing the whole DatabaseModule.
const KYSELY_TOKEN = 'KyselyModuleConnectionToken';

async function buildApp(
  dbProvider: unknown,
  redisUrl: string,
): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [TerminusModule],
    controllers: [HealthController],
    providers: [
      PostgresHealthIndicator,
      RedisHealthIndicator,
      { provide: KYSELY_TOKEN, useValue: dbProvider },
      { provide: EnvironmentService, useValue: { getRedisUrl: () => redisUrl } },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('EngineProbesAreSatelliteIndependentSpec (ENG-1384)', () => {
  let app: NestFastifyApplication;
  let testDb: TestDb;
  let redisContainer: StartedTestContainer;
  let redisUrl: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    app = await buildApp(testDb.db, redisUrl);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await redisContainer?.stop();
    await testDb?.teardown();
  });

  // AC1 — liveness is engine-local-only: there is no AI subsystem in this
  // engine to be down, so `/health/live` cannot reference or depend on one.
  it('AC1: GET /health/live returns 200 "ok", satellite-independent (no AI subsystem to gate on)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('ok');
    expect(res.body.toLowerCase()).not.toMatch(/litellm|ai|workspace/);
  });

  // AC2 — readiness is gated ONLY on DB+Redis (the upstream Terminus
  // pingCheck('database') + pingCheck('redis')), never on a satellite.
  it('AC2: GET /health returns 200 healthy when DB+Redis are up (readiness = DB/Redis only)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.info).toHaveProperty('database');
    expect(body.info).toHaveProperty('redis');
  });

  it('AC2: GET /health returns 503 when Postgres is unreachable (readiness genuinely tracks DB, not vacuously green)', async () => {
    const deadDbApp = await buildApp(
      {
        // Any query against this handle rejects, simulating DB-down — proves
        // the readiness probe is a REAL check, not a stub 200.
        selectFrom: () => {
          throw new Error('connection refused');
        },
      },
      redisUrl,
    );
    try {
      const res = await deadDbApp.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
    } finally {
      await deadDbApp.close();
    }
  });

  // AC4 (negative) — the AI-aggregation surface was never ported into this
  // engine (confirmed by source-absence grep below), so it cannot be served.
  it('AC4: GET /health/orvex is absent from the engine (404) — no AI-aggregation route exists', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/orvex' });
    expect(res.statusCode).toBe(404);
  });

  it('AC4/AC5: source grep — apps/server/src contains zero references to the AI-aggregation surface (workspaceAiCredentials, orvex:ai:litellm-health, orvex/health)', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const serverSrc = path.join(repoRoot, 'apps/server/src');

    const grep = (pattern: string): string => {
      try {
        return execSync(`grep -rl "${pattern}" "${serverSrc}" || true`, {
          encoding: 'utf8',
        }).trim();
      } catch {
        return '';
      }
    };

    expect(grep('workspaceAiCredentials')).toBe('');
    expect(grep('orvex:ai:litellm-health')).toBe('');
    expect(
      execSync(
        `[ -d "${path.join(serverSrc, 'orvex/health')}" ] && echo present || echo absent`,
        { encoding: 'utf8' },
      ).trim(),
    ).toBe('absent');
  });

  // AC5 — the retained probes never expose workspace/tenant-enumeration data.
  it('AC5: /health and /health/live responses contain no workspaceId / tenant-enumeration data', async () => {
    const [live, ready] = await Promise.all([
      app.inject({ method: 'GET', url: '/health/live' }),
      app.inject({ method: 'GET', url: '/health' }),
    ]);
    expect(live.body).not.toMatch(/workspaceId/i);
    expect(ready.body).not.toMatch(/workspaceId/i);
  });
});
