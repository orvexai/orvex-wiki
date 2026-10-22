import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import RedisClient from 'ioredis';
import { resolveGlobalPrefixExclude } from '../../src/orvex/http/orvex-global-prefix-exclude';
import { startTestDatabase, TestDb } from './db-test-harness';

/**
 * ENG-2508 AC1 (behavioural, FULL app) — the no-Swagger assertion over the
 * REAL composed application.
 *
 * The unit-tier gate (`src/orvex/orvex-portability.spec.ts`) boots only
 * `OrvexRootModule.register()` — the additive orvex subtree, ~17 of the
 * engine's ~50 controllers — so a `/docs` route mounted anywhere in the
 * upstream Docmost core would not be seen by it. That is the gap the audit
 * found. Booting the whole `AppModule` needs Postgres + Redis, hence this
 * integration-tier sibling: same assertion, full route table.
 */
describe('TestEngineHasNoSwaggerAndDegradesGracefully — AC1 over the FULL app route table (ENG-2508)', () => {
  jest.setTimeout(300_000);
  let testDb: TestDb;
  let redisContainer: StartedTestContainer;
  let app: NestFastifyApplication;
  let appInitWaitedForCollaborationSubscription = false;
  const routes: string[] = [];

  beforeAll(async () => {
    testDb = await startTestDatabase();
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    const pgHost = testDb.container.getHost();
    const pgPort = testDb.container.getMappedPort(5432);
    process.env.DATABASE_URL = `postgres://orvex:orvex@${pgHost}:${pgPort}/orvex_test`;
    process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
    process.env.APP_SECRET = 'eng-2508-test-secret-at-least-32-characters-long';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.ORVEX_MODULES_ENABLED = 'true';

    let releaseSubscription!: () => void;
    const subscriptionHold = new Promise<void>((resolve) => {
      releaseSubscription = resolve;
    });
    let signalSubscriptionAck!: () => void;
    const subscriptionAcked = new Promise<void>((resolve) => {
      signalSubscriptionAck = resolve;
    });
    const originalSubscribe = RedisClient.prototype.subscribe;
    const subscribeSpy = jest
      .spyOn(RedisClient.prototype, 'subscribe')
      .mockImplementation(function (this: RedisClient, ...args: any[]) {
        const command = originalSubscribe.apply(this, args as any);
        if (!args.includes('collabMsg')) return command;
        return command.then(async (count) => {
          signalSubscriptionAck();
          await subscriptionHold;
          return count;
        });
      });

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AppModule } = require('../../src/app.module');
      const built = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = built.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter(),
      );
      app.setGlobalPrefix('api', { exclude: resolveGlobalPrefixExclude() });
      app
        .getHttpAdapter()
        .getInstance()
        .addHook('onRoute', (r) => {
          routes.push(`${String(r.method)} ${r.url}`);
        });

      const initialization = app.init();
      let acknowledgementTimeout: NodeJS.Timeout | undefined;
      const acknowledgementResult = await Promise.race([
        subscriptionAcked.then(() => 'acknowledged' as const),
        initialization.then(() => 'initialized' as const),
        new Promise<'timeout'>((resolve) => {
          acknowledgementTimeout = setTimeout(() => resolve('timeout'), 10_000);
        }),
      ]);
      if (acknowledgementTimeout) clearTimeout(acknowledgementTimeout);
      if (acknowledgementResult !== 'acknowledged') {
        throw new Error(
          `Collaboration Redis SUBSCRIBE did not reach its acknowledgement before app.init(): ${acknowledgementResult}`,
        );
      }

      let initTimeout: NodeJS.Timeout | undefined;
      const initResult = await Promise.race([
        initialization.then(() => 'initialized' as const),
        new Promise<'waiting'>((resolve) => {
          initTimeout = setTimeout(() => resolve('waiting'), 1000);
        }),
      ]);
      if (initTimeout) clearTimeout(initTimeout);
      appInitWaitedForCollaborationSubscription = initResult === 'waiting';
      releaseSubscription();
      await initialization;
      await app.getHttpAdapter().getInstance().ready();
    } finally {
      releaseSubscription();
      subscribeSpy.mockRestore();
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    if (redisContainer) await redisContainer.stop();
    if (testDb) await testDb.teardown();
  });

  it('the FULL composed route table carries no /docs, swagger or openapi path', () => {
    // Non-vacuous: the real app registered a substantial route table — far
    // more than the orvex subtree the unit-tier gate sees.
    const unique = [...new Set(routes)];
    expect(unique.length).toBeGreaterThan(50);

    const offenders = unique.filter((r) => /docs|swagger|openapi/i.test(r));
    expect(offenders).toEqual([]);
  });

  it('does not resolve the real app.init() while the collaboration Redis SUBSCRIBE acknowledgement is in flight', () => {
    expect(appInitWaitedForCollaborationSubscription).toBe(true);
  });

  it('the route table proves it spans the CORE controllers, not just the orvex subtree (guards the scope the unit gate misses)', () => {
    const unique = [...new Set(routes)];
    // Upstream-core surfaces that live OUTSIDE OrvexRootModule; their
    // presence is what makes the assertion above meaningful.
    for (const core of ['/api/pages/', '/api/spaces/', '/api/auth/']) {
      expect(unique.some((r) => r.includes(core))).toBe(true);
    }
  });
});
