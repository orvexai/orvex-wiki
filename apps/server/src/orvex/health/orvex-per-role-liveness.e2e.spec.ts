import * as path from 'path';
import { promises as fs } from 'fs';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Hocuspocus } from '@hocuspocus/server';
import { createServer, Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { WebSocketServer } from 'ws';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  ORVEX_HEALTH_COLLAB_WS_PROBE,
  ORVEX_HEALTH_KAFKA_PROBE,
  ORVEX_HEALTH_POSTGRES_PROBE,
  ORVEX_HEALTH_REDIS_PROBE,
  ORVEX_HEALTH_RELAY_PROBE,
  ORVEX_HEALTH_STORAGE_PROBE,
  defaultRelayOutboxProbe,
  makeCollabWsProbe,
} from './orvex-health.probes';
import { OrvexHealthModule } from './orvex-health.module';
import { OutboxRelayService } from '../events/outbox/outbox-relay.service';
import { InMemoryKafkaPublisher } from '../events/outbox/__tests__/in-memory-kafka-publisher';
import type { DbInterface } from '../../database/types/db.interface';
import type { KyselyDB } from '../../database/types/kysely.types';
import type { Json } from '../../database/types/db';

/**
 * ENG-2510 §5a — TestPerRoleLivenessAndHealthEchoesCell, the ONE named DoD
 * gate for per-role liveness + the cell-param health echo, asserted through
 * the REAL HTTP surface (never a direct service-method call):
 *
 *  AC3 — `GET /health/orvex` echoes BOTH `cellId` and `clusterName`
 *        (cell-contract rule #4), each matching its test-configured env
 *        value; an unset pair surfaces as `null` under the UNCHANGED
 *        ADR-0020 never-throw/HTTP-200 contract.
 *  AC2 — `GET /health/orvex/collab` reflects the collab role's REAL state:
 *        200 when a real Hocuspocus WS endpoint completes a handshake
 *        (a real in-process Hocuspocus server, the same library production
 *        runs, wired through the same noServer-upgrade shape as
 *        CollabWsAdapter — the collaboration.handler.spec precedent);
 *        503 naming the handshake error when the collab process is
 *        deliberately down. The SAME production probe (makeCollabWsProbe)
 *        is used for both, pointed at the real/downed endpoint — never a
 *        mock of the probe or the WS server (❌#4).
 *
 *  AC1 — ENG-2496's base relay-liveness/lag heartbeat HAS since landed
 *        (`outbox-relay-heartbeat.service.ts` + `defaultRelayOutboxProbe`),
 *        so this story's own AC1 leg is no longer blocked and is asserted
 *        here: `TestWorkerRelayKillFlipsProbeRedApiStaysGreen` drives the
 *        REAL `defaultRelayOutboxProbe` against a REAL testcontainers
 *        Postgres through `GET /health/orvex/relay`, proving a DEAD relay
 *        flips the worker role red while `GET /health/orvex` (api) stays
 *        independently green. This story adds only the per-role/health-echo
 *        FRAMING (`role` + `cellId`/`clusterName` on every role body) — the
 *        heartbeat SIGNAL itself stays ENG-2496's (§5d, no rebuild here).
 *
 * Deterministic (❌#9): the dead-relay condition is a CONTROLLED STALL — the
 * relay's poll loop is never started and fixture rows carry an EXPLICIT
 * past `createdAt`, aged by the DATABASE's own clock — never a bare
 * `setTimeout` race. Green is reached only by the REAL relay actually
 * draining rows, never by time passing. Collab up/down is likewise a
 * listener deliberately bound or closed, plus fixed env fixtures.
 */
describe('TestPerRoleLivenessAndHealthEchoesCell (ENG-2510)', () => {
  const CELL_ID = 'cell-eu-central-1a';
  const CLUSTER_NAME = 'orvex-prod-blue';

  let app: NestFastifyApplication | undefined;

  async function boot(collabWsUrl?: string): Promise<NestFastifyApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [OrvexHealthModule],
    })
      .overrideProvider(ORVEX_HEALTH_POSTGRES_PROBE)
      .useValue(async () => ({ ok: true }))
      .overrideProvider(ORVEX_HEALTH_REDIS_PROBE)
      .useValue(async () => ({ ok: true }))
      .overrideProvider(ORVEX_HEALTH_STORAGE_PROBE)
      .useValue(async () => ({ ok: true, driver: 'local' }))
      .overrideProvider(ORVEX_HEALTH_KAFKA_PROBE)
      .useValue(async () => ({ ok: true }))
      // The REAL production probe implementation, pointed at the test's
      // real (or deliberately-down) collab WS endpoint — never a stub.
      .overrideProvider(ORVEX_HEALTH_COLLAB_WS_PROBE)
      .useValue(makeCollabWsProbe(collabWsUrl))
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  describe('AC3 — health body echoes CELL_ID + CLUSTER_NAME', () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
      saved.CELL_ID = process.env.CELL_ID;
      saved.CLUSTER_NAME = process.env.CLUSTER_NAME;
    });

    afterEach(() => {
      for (const key of ['CELL_ID', 'CLUSTER_NAME'] as const) {
        if (saved[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = saved[key];
        }
      }
    });

    it('echoes both cell params, distinct values, from the configured env', async () => {
      process.env.CELL_ID = CELL_ID;
      process.env.CLUSTER_NAME = CLUSTER_NAME;
      await boot();

      const res = await app!.inject({ method: 'GET', url: '/health/orvex' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.cellId).toBe(CELL_ID);
      expect(body.clusterName).toBe(CLUSTER_NAME);
      expect(body.cellId).not.toBe(body.clusterName); // distinct params
      // AC1 framing: the aggregate names WHICH role it speaks for, so a
      // scraped body is attributable without out-of-band knowledge.
      expect(body.role).toBe('api');
    });

    it('AC1 framing — EVERY role-scoped body self-identifies and echoes the SAME cell params as the api aggregate', async () => {
      process.env.CELL_ID = CELL_ID;
      process.env.CLUSTER_NAME = CLUSTER_NAME;
      // No DATABASE_URL ⇒ the real relay probe returns a typed red; the
      // FRAMING assertion below holds regardless of the signal's colour.
      const savedDbUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        const port = await (async () => {
          const srv = createServer();
          await new Promise<void>((resolve) =>
            srv.listen(0, '127.0.0.1', resolve),
          );
          const p = (srv.address() as AddressInfo).port;
          await new Promise<void>((resolve) => srv.close(() => resolve()));
          return p;
        })();
        await boot(`ws://127.0.0.1:${port}/collab`);

        const bodies = await Promise.all(
          (
            [
              ['/health/orvex', 'api'],
              ['/health/orvex/relay', 'worker'],
              ['/health/orvex/collab', 'collab'],
            ] as const
          ).map(async ([url, role]) => {
            const res = await app!.inject({ method: 'GET', url });
            return { role, body: JSON.parse(res.body) };
          }),
        );

        for (const { role, body } of bodies) {
          expect(body.role).toBe(role);
          expect(body.cellId).toBe(CELL_ID);
          expect(body.clusterName).toBe(CLUSTER_NAME);
        }
        // Three DISTINCT role identities off one pod — the per-role
        // separation this story exists to make observable.
        expect(new Set(bodies.map((b) => b.body.role)).size).toBe(3);
      } finally {
        if (savedDbUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = savedDbUrl;
      }
    });

    it('NFR never-throw: unset cell params surface as null in a 200 body, never a 5xx', async () => {
      delete process.env.CELL_ID;
      delete process.env.CLUSTER_NAME;
      await boot();

      const res = await app!.inject({ method: 'GET', url: '/health/orvex' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.cellId).toBeNull();
      expect(body.clusterName).toBeNull();
      expect(body.status).toBe('ok'); // missing cell metadata is not degradation
    });
  });

  describe('AC2 — collab role WS liveness probe', () => {
    let collabHttp: HttpServer | undefined;
    let collabWss: WebSocketServer | undefined;
    let hocuspocus: Hocuspocus | undefined;

    /**
     * A REAL Hocuspocus WS endpoint (the library production runs), mounted
     * via the same noServer WebSocketServer upgrade wiring as
     * CollabWsAdapter.handleUpgrade — on an ephemeral local port.
     */
    async function startRealCollabWs(): Promise<number> {
      hocuspocus = new Hocuspocus({});
      collabHttp = createServer();
      collabWss = new WebSocketServer({ noServer: true });
      const wss = collabWss;
      const hp = hocuspocus;
      collabHttp.on('upgrade', (request, socket, head) => {
        const baseUrl = 'ws://' + request.headers.host + '/';
        const pathname = new URL(request.url ?? '/', baseUrl).pathname;
        if (pathname === '/collab') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            hp.handleConnection(ws, request);
          });
        } else {
          socket.destroy();
        }
      });
      await new Promise<void>((resolve) =>
        collabHttp!.listen(0, '127.0.0.1', resolve),
      );
      return (collabHttp.address() as AddressInfo).port;
    }

    /** An ephemeral port with NOTHING listening — a deliberately-down collab process. */
    async function downedCollabPort(): Promise<number> {
      const srv = createServer();
      await new Promise<void>((resolve) =>
        srv.listen(0, '127.0.0.1', resolve),
      );
      const port = (srv.address() as AddressInfo).port;
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      return port;
    }

    afterEach(async () => {
      collabWss?.close();
      collabWss?.clients.forEach((client) => client.terminate());
      collabWss = undefined;
      if (collabHttp) {
        await new Promise<void>((resolve) =>
          collabHttp!.close(() => resolve()),
        );
        collabHttp = undefined;
      }
      hocuspocus?.closeConnections();
      hocuspocus = undefined;
    });

    it('200 with ok:true when a REAL Hocuspocus WS endpoint completes the handshake', async () => {
      const port = await startRealCollabWs();
      await boot(`ws://127.0.0.1:${port}/collab`);

      const res = await app!.inject({
        method: 'GET',
        url: '/health/orvex/collab',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.role).toBe('collab');
      expect(body.ok).toBe(true);
    });

    it('503 naming the handshake failure when the collab process is down — a dead component never reads green', async () => {
      const port = await downedCollabPort();
      await boot(`ws://127.0.0.1:${port}/collab`);

      const res = await app!.inject({
        method: 'GET',
        url: '/health/orvex/collab',
      });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(false);
      expect(typeof body.error).toBe('string');
      expect(body.error.length).toBeGreaterThan(0);
    });

    it('the api role aggregate stays independent of the collab role state (per-role separation)', async () => {
      const port = await downedCollabPort();
      await boot(`ws://127.0.0.1:${port}/collab`);

      // collab dead...
      const collab = await app!.inject({
        method: 'GET',
        url: '/health/orvex/collab',
      });
      expect(collab.statusCode).toBe(503);

      // ...while the api aggregate is untouched by it (ADR-0020 contract).
      const api = await app!.inject({ method: 'GET', url: '/health/orvex' });
      expect(api.statusCode).toBe(200);
      expect(JSON.parse(api.body).status).toBe('ok');
    });
  });

  /**
   * ENG-2510 §5b — TestWorkerRelayKillFlipsProbeRedApiStaysGreen (AC1).
   *
   * The story's own "so that" clause, proven end-to-end through the REAL
   * HTTP surface: a dead relay silently stops all emission while the api
   * role's health stays green — so per-role liveness must make the WORKER
   * role red on its own endpoint, without dragging api down with it.
   *
   * Real everything (❌#4): a real testcontainers Postgres, the real
   * `defaultRelayOutboxProbe` reading the real `orvex_event_outbox` backlog
   * over its own raw-`pg` path, and the real `OutboxRelayService` doing the
   * draining. Nothing in `orvex/health/**` or `orvex/events/outbox/**` is
   * mocked.
   *
   * Deterministic (❌#9): "dead relay" is a CONTROLLED STALL — the relay's
   * `@Interval` poll loop is never started and fixture rows carry an
   * EXPLICIT past `createdAt`, aged by the DATABASE's own clock against the
   * configured staleness bound. No wall-clock race, and green is reached
   * only by rows ACTUALLY being relayed.
   */
  describe('AC1 — TestWorkerRelayKillFlipsProbeRedApiStaysGreen', () => {
    jest.setTimeout(180_000);

    let pgContainer: StartedPostgreSqlContainer;
    let sqlClient: ReturnType<typeof postgres>;
    let db: KyselyDB;
    let workspaceId: string;
    let savedDatabaseUrl: string | undefined;

    beforeAll(async () => {
      pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
      sqlClient = postgres(pgContainer.getConnectionUri());

      const rawDb = new Kysely<DbInterface>({
        dialect: new PostgresJSDialect({ postgres: sqlClient }),
      });
      const migrator = new Migrator({
        db: rawDb,
        provider: new FileMigrationProvider({
          fs,
          path,
          migrationFolder: path.join(__dirname, '../../database/migrations'),
        }),
      });
      const { error } = await migrator.migrateToLatest();
      if (error) throw error;
      await rawDb.destroy();

      db = new Kysely<DbInterface>({
        dialect: new PostgresJSDialect({ postgres: sqlClient }),
        plugins: [new CamelCasePlugin()],
      });
    }, 180_000);

    afterAll(async () => {
      await db?.destroy();
      await sqlClient?.end();
      await pgContainer?.stop();
    });

    beforeEach(async () => {
      // The REAL production relay probe resolves its DSN off this env var —
      // pointing it at the container is what makes the booted app's
      // `/health/orvex/relay` read the real backlog.
      savedDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = pgContainer.getConnectionUri();

      const ws = await db
        .insertInto('workspaces')
        .values({
          name: 'ENG-2510 per-role liveness WS',
          hostname: `perrole-${Date.now()}-${Math.random()}`,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      workspaceId = ws.id;
    });

    afterEach(async () => {
      if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedDatabaseUrl;

      await db
        .deleteFrom('orvexEventOutbox')
        .where('workspaceId', '=', workspaceId)
        .execute();
      await db.deleteFrom('workspaces').where('id', '=', workspaceId).execute();
    });

    /**
     * Fixture rows left UNRELAYED with an explicit `createdAt` — the exact
     * residue a killed relay leaves behind. `ageSeconds` is measured against
     * the DATABASE's `now()` by the probe itself, so the fixture is anchored
     * relative to it rather than to a client wall-clock read in an assertion.
     */
    async function insertUnrelayedRows(
      count: number,
      ageSeconds: number,
    ): Promise<void> {
      const createdAt = new Date(Date.now() - ageSeconds * 1_000);
      for (let i = 0; i < count; i++) {
        await db
          .insertInto('orvexEventOutbox')
          .values({
            type: 'page.created',
            aggregateId: `00000000-0000-7000-8000-0000000001${String(i).padStart(2, '0')}`,
            workspaceId,
            payload: { fixture: 'ENG-2510-AC1' } as unknown as Json,
            createdAt,
          })
          .execute();
      }
    }

    it('a killed relay flips the WORKER role red on /health/orvex/relay while the api role stays independently green', async () => {
      // A live collab endpoint so the ONLY red role in this assertion is the
      // worker — per-role separation, not a blanket outage.
      await boot();

      // (1) Relay alive-and-drained baseline: empty backlog reads green.
      const green = await app!.inject({
        method: 'GET',
        url: '/health/orvex/relay',
      });
      expect(green.statusCode).toBe(200);
      const greenBody = JSON.parse(green.body);
      expect(greenBody.role).toBe('worker');
      expect(greenBody.status).toBe('pass');
      expect(greenBody.relay.ok).toBe(true);
      expect(greenBody.relay.unrelayedCount).toBe(0);

      // (2) KILL the relay: its poll loop is never started (this harness
      // mounts only OrvexHealthModule — the relay's @Interval scheduler is
      // genuinely absent), and events keep landing in the outbox. Rows age
      // past the staleness bound exactly as they would behind a dead worker.
      await insertUnrelayedRows(3, 600);

      const red = await app!.inject({
        method: 'GET',
        url: '/health/orvex/relay',
      });
      expect(red.statusCode).toBe(200); // family health ruling: body carries the state
      const redBody = JSON.parse(red.body);
      expect(redBody.role).toBe('worker');
      expect(redBody.status).toBe('fail'); // ← a dead component never reads green
      expect(redBody.relay.ok).toBe(false);
      expect(redBody.relay.unrelayedCount).toBe(3);
      expect(redBody.relay.oldestUnrelayedAgeSeconds).toBeGreaterThan(
        redBody.relay.thresholdSeconds,
      );

      // (3) ...and the API role is untouched by the worker's death — the
      // precise false-positive-healthy state this story closes: before
      // per-role liveness, THIS green was the only signal an operator saw.
      const api = await app!.inject({ method: 'GET', url: '/health/orvex' });
      expect(api.statusCode).toBe(200);
      const apiBody = JSON.parse(api.body);
      expect(apiBody.role).toBe('api');
      expect(apiBody.status).toBe('ok');

      // (4) Only the REAL relay ACTUALLY draining turns the worker green
      // again — never the passage of time.
      const relay = new OutboxRelayService(db, new InMemoryKafkaPublisher(), {
        cellId: null,
        kafkaBrokersConfigured: false,
      });
      const run = await relay.run();
      expect(run.failed).toBe(0);
      expect(run.published).toBeGreaterThanOrEqual(3);

      const recovered = await app!.inject({
        method: 'GET',
        url: '/health/orvex/relay',
      });
      const recoveredBody = JSON.parse(recovered.body);
      expect(recoveredBody.status).toBe('pass');
      expect(recoveredBody.relay.unrelayedCount).toBe(0);
    });
  });
});
