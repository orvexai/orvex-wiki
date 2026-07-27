import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { resolveGlobalPrefixExclude } from '../../src/orvex/http/orvex-global-prefix-exclude';
import { startTestDatabase, TestDb } from './db-test-harness';

describe('route dump', () => {
  jest.setTimeout(300_000);
  let testDb: TestDb;
  let redisContainer: StartedTestContainer;
  let app: NestFastifyApplication;
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
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (redisContainer) await redisContainer.stop();
    if (testDb) await testDb.teardown();
  });

  it('dumps', () => {
    console.log('ROUTE_DUMP_START');
    console.log(JSON.stringify([...new Set(routes)].sort(), null, 1));
    console.log('ROUTE_DUMP_END');
    expect(routes.length).toBeGreaterThan(0);
  });
});
