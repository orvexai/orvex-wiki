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
  ORVEX_HEALTH_COLLAB_WS_PROBE,
  ORVEX_HEALTH_KAFKA_PROBE,
  ORVEX_HEALTH_POSTGRES_PROBE,
  ORVEX_HEALTH_REDIS_PROBE,
  ORVEX_HEALTH_STORAGE_PROBE,
  makeCollabWsProbe,
} from './orvex-health.probes';
import { OrvexHealthModule } from './orvex-health.module';

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
 *  AC1 (worker relay heartbeat) is genuinely BLOCKED on ENG-2496 — the base
 *  relay-liveness/lag heartbeat does NOT exist at HEAD (grep-verified: no
 *  heartbeat/lag/drainedAt code in orvex/events/outbox) and this story must
 *  not build it (§5d). Its portion of this gate lands with ENG-2496's
 *  extension commit, per the ticket's own §5e.1 carve-out — recorded here,
 *  never silently skipped.
 *  AC5 (per-role deploy-manifest probes) is blocked on a role-split
 *  topology: the committed manifest deploys ONE Deployment running all
 *  roles in-process, so distinct worker/collab probe DEFINITIONS have no
 *  role Deployment to attach to today.
 *
 * Deterministic: controlled up/down endpoint states (a listener bound then
 * closed — never a wall-clock race); fixed env fixtures.
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
});
