import { JwtService } from '@nestjs/jwt';
import { DomainMiddleware } from './domain.middleware';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { OrvexConfigService } from '../../orvex/config/orvex-config.service';

// FR-W6 (ENG-1559) — DomainMiddleware federated workspace resolution. The
// closing wall behind CLOUD mode was that a cluster-internal / cell host
// resolves no workspace by hostname, so req.workspaceId stayed null and the
// main.ts workspace-required preHandler 404'd every token-scoped API call. This
// suite pins the three resolution branches, and in particular the token
// fallback: a signature-verified session/api-key token establishes req.workspaceId
// (so the request clears the preHandler + the JwtStrategy match check), while any
// unverifiable token establishes nothing (deny-by-default) and req.workspace is
// NEVER set from the token (so @AuthWorkspace uses the JwtStrategy-verified
// req.user.workspace, never a middleware-trusted object).
//
// ENG-2501 (FR-W20, A-TENANCY) adds the SOFT label-2 cell assertion cases:
// a definite Host-label-2 vs pod-CELL_ID mismatch is soft-rejected with a
// typed CELL_LABEL_MISMATCH marker (421, one request, never a crash), while
// the `solo` sentinel / unset CELL_ID no-ops the check entirely.

const APP_SECRET = 'test-app-secret-value-at-least-32-chars-long';
const TENANT = 'f799e55a-478a-4ca7-9b0e-6e1324b6c6a7';
const jwtService = new JwtService();

function makeReq(host?: string, authorization?: string): any {
  return { headers: { host, authorization } };
}

/** A minimal raw-ServerResponse double capturing the typed soft rejection. */
function makeRes(): {
  res: any;
  written: () => { statusCode?: number; body?: string };
} {
  const state: { statusCode?: number; body?: string } = {};
  const res = {
    statusCode: undefined as number | undefined,
    setHeader: jest.fn(),
    end: jest.fn((body?: string) => {
      state.statusCode = res.statusCode;
      state.body = body;
    }),
  };
  return { res, written: () => state };
}

function buildMiddleware(opts: {
  cloud: boolean;
  findFirst?: any;
  findByHostname?: any;
  /** The workspace row `findById` returns — the token-fallback path's record. */
  findById?: any;
  /** Explicit CELL_ID env value for this case (absent = unset). */
  cellId?: string;
}) {
  const environmentService = {
    isCloud: () => opts.cloud,
    isSelfHosted: () => !opts.cloud,
    getAppSecret: () => APP_SECRET,
  } as unknown as EnvironmentService;

  const workspaceRepo = {
    findFirst: jest.fn().mockResolvedValue(opts.findFirst ?? undefined),
    findByHostname: jest
      .fn()
      .mockResolvedValue(opts.findByHostname ?? undefined),
    findById: jest.fn().mockResolvedValue(opts.findById ?? undefined),
  } as unknown as WorkspaceRepo;

  // Explicit env bag — never the ambient process.env (determinism gate).
  const orvexConfigService = new OrvexConfigService(
    (opts.cellId === undefined
      ? {}
      : { CELL_ID: opts.cellId }) as NodeJS.ProcessEnv,
  );

  return {
    middleware: new DomainMiddleware(
      workspaceRepo,
      environmentService,
      orvexConfigService,
      jwtService,
    ),
    workspaceRepo,
  };
}

describe('DomainMiddleware', () => {
  describe('self-hosted', () => {
    it('sets workspaceId + workspace from findFirst', async () => {
      const ws = { id: 'oldest-id' };
      const { middleware } = buildMiddleware({ cloud: false, findFirst: ws });
      const req = makeReq('anything.example.com');
      const next = jest.fn();
      await middleware.use(req, {} as any, next);
      expect(req.workspaceId).toBe('oldest-id');
      expect(req.workspace).toBe(ws);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('sets workspaceId null when there is no workspace', async () => {
      const { middleware } = buildMiddleware({
        cloud: false,
        findFirst: undefined,
      });
      const req = makeReq('anything.example.com');
      const next = jest.fn();
      await middleware.use(req, {} as any, next);
      expect(req.workspaceId).toBeNull();
    });
  });

  describe('cloud — hostname resolution', () => {
    it('resolves the workspace by subdomain when a hostname matches', async () => {
      const ws = { id: 'tenant-by-host' };
      const { middleware, workspaceRepo } = buildMiddleware({
        cloud: true,
        findByHostname: ws,
      });
      const req = makeReq('acme.wiki.eu1.orvex.dev');
      const next = jest.fn();
      await middleware.use(req, {} as any, next);
      expect(workspaceRepo.findByHostname).toHaveBeenCalledWith('acme');
      expect(req.workspaceId).toBe('tenant-by-host');
      expect(req.workspace).toBe(ws);
    });
  });

  describe('cloud — workspace-record cell assertion', () => {
    const inCell = { id: 'tenant-by-host', cellId: 'eu1' };
    const otherCell = { id: 'tenant-by-host', cellId: 'us1' };

    it('a definite workspace-cell vs CELL_ID mismatch is rejected with the typed WORKSPACE_CELL_MISMATCH marker (421), request does not proceed', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: otherCell,
        cellId: 'eu1',
      });
      const req = makeReq('acme.wiki.eu1.orvex.ai');
      const { res, written } = makeRes();
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.workspaceId).toBeUndefined();
      expect(written().statusCode).toBe(421);
      const body = JSON.parse(written().body ?? '{}');
      expect(body.code).toBe('WORKSPACE_CELL_MISMATCH');
      expect(body.workspaceCellId).toBe('us1');
      expect(body.podCellId).toBe('eu1');
      // The tenant id is an operator-log fact, never echoed to a caller this
      // pod has just decided it should not be serving.
      expect(body.workspaceId).toBeUndefined();
    });

    it('a MATCHING workspace cell passes through unaffected (workspace resolved, next called)', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: inCell,
        cellId: 'eu1',
      });
      const req = makeReq('acme.wiki.eu1.orvex.ai');
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe('tenant-by-host');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('the standard wiki.CELLTOKEN.orvex.ai deploy host is judged by the record, not by its label count', async () => {
      // The deployed HTTPRoute serves exactly this 4-label host, whose label-2
      // is `orvex` — the segment the retired label-count check would have read
      // as the cell and rejected against every real CELL_ID. The record says
      // the tenant is here, so the request proceeds.
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: inCell,
        cellId: 'eu1',
      });
      const req = makeReq('wiki.eu1.orvex.ai');
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe('tenant-by-host');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('under the `solo` sentinel a would-be mismatch NO-OPS (cell enforcement off entirely in solo mode)', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: otherCell,
        cellId: 'solo',
      });
      const req = makeReq('acme.wiki.us1.orvex.ai');
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe('tenant-by-host');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('with CELL_ID unset the assertion no-ops identically (null-on-unset semantics, no fabricated cell)', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: otherCell,
      });
      const req = makeReq('acme.wiki.us1.orvex.ai');
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe('tenant-by-host');
      expect(next).toHaveBeenCalledTimes(1);
    });

    describe('short / ambiguous / custom-domain hosts', () => {
      // These are the hosts the retired label-count check could never judge:
      // fewer than four labels meant it silently no-opped, so a wrong-cell
      // custom-domain tenant was served. The record-based check has no such
      // blind spot — the host's shape stops mattering entirely.

      it('a custom-domain workspace whose recorded cell MATCHES this deployment proceeds', async () => {
        const { middleware } = buildMiddleware({
          cloud: true,
          findByHostname: inCell,
          cellId: 'eu1',
        });
        const req = makeReq('docs.acme.com');
        const next = jest.fn();

        await middleware.use(req, {} as any, next);

        expect(req.workspaceId).toBe('tenant-by-host');
        expect(next).toHaveBeenCalledTimes(1);
      });

      it('a custom-domain workspace whose recorded cell MISMATCHES is rejected — the old label-count check let this through', async () => {
        const { middleware } = buildMiddleware({
          cloud: true,
          findByHostname: otherCell,
          cellId: 'eu1',
        });
        const req = makeReq('docs.acme.com');
        const { res, written } = makeRes();
        const next = jest.fn();

        await middleware.use(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(written().statusCode).toBe(421);
        expect(JSON.parse(written().body ?? '{}').code).toBe(
          'WORKSPACE_CELL_MISMATCH',
        );
      });

      it('the two-label `acme.localhost` case is judged too (it is no longer waved through as ambiguous)', async () => {
        const { middleware } = buildMiddleware({
          cloud: true,
          findByHostname: otherCell,
          cellId: 'eu1',
        });
        const req = makeReq('acme.localhost');
        const { res, written } = makeRes();
        const next = jest.fn();

        await middleware.use(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(written().statusCode).toBe(421);
      });
    });

    it('a workspace stamped `solo` in a REAL cell is a mismatch (a row this cell did not mint)', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: { id: 'tenant-by-host', cellId: 'solo' },
        cellId: 'eu1',
      });
      const req = makeReq('acme.wiki.eu1.orvex.ai');
      const { res, written } = makeRes();
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(written().statusCode).toBe(421);
      expect(JSON.parse(written().body ?? '{}').workspaceCellId).toBe('solo');
    });

    describe('C-cell — absent/empty/unparseable stored cell claim (fleet AD-4/AD-13)', () => {
      // Fail-CLOSED, not fail-open: a resolved workspace whose OWN recorded
      // cellId cannot be read as a real cell is refused 421-shaped under a
      // dedicated typed code, never silently waved through. Enforcement must
      // be genuinely active (a real, non-solo CELL_ID) for any of these to
      // fire — see the paired "no-op" cases above.
      it.each([
        ['undefined', undefined],
        ['null', null],
        ['empty string', ''],
        ['whitespace-only', '   '],
      ])(
        'a %s stored cellId is rejected 421 WORKSPACE_CELL_ABSENT, request does not proceed',
        async (_label, storedCellId) => {
          const { middleware } = buildMiddleware({
            cloud: true,
            findByHostname: { id: 'tenant-by-host', cellId: storedCellId },
            cellId: 'eu1',
          });
          const req = makeReq('acme.wiki.eu1.orvex.ai');
          const { res, written } = makeRes();
          const next = jest.fn();

          await middleware.use(req, res, next);

          expect(next).not.toHaveBeenCalled();
          expect(req.workspaceId).toBeUndefined();
          expect(written().statusCode).toBe(421);
          const body = JSON.parse(written().body ?? '{}');
          expect(body.code).toBe('WORKSPACE_CELL_ABSENT');
          expect(body.podCellId).toBe('eu1');
        },
      );

      it('is a no-op under the `solo` sentinel even with an absent stored cellId (enforcement off entirely)', async () => {
        const { middleware } = buildMiddleware({
          cloud: true,
          findByHostname: { id: 'tenant-by-host', cellId: undefined },
          cellId: 'solo',
        });
        const req = makeReq('acme.wiki.solo.orvex.ai');
        const next = jest.fn();

        await middleware.use(req, {} as any, next);

        expect(req.workspaceId).toBe('tenant-by-host');
        expect(next).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('cloud — cell assertion on the TOKEN-fallback path', () => {
    // The path production traffic actually takes: federated tenants are
    // minted WITHOUT a hostname, so the hostname branch never resolves them
    // and a check living only up there would be dead in every real cell.
    const accessToken = () =>
      jwtService.sign(
        { sub: 'user-1', workspaceId: TENANT, type: 'access' },
        { secret: APP_SECRET },
      );

    it('rejects a token-resolved workspace whose recorded cell mismatches this deployment', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: undefined,
        findById: { id: TENANT, cellId: 'us1' },
        cellId: 'eu1',
      });
      const req = makeReq(
        'orvex-wiki.orvex-wiki-dev.svc.cluster.local',
        `Bearer ${accessToken()}`,
      );
      const { res, written } = makeRes();
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.workspaceId).toBeUndefined();
      expect(written().statusCode).toBe(421);
      const body = JSON.parse(written().body ?? '{}');
      expect(body.code).toBe('WORKSPACE_CELL_MISMATCH');
      expect(body.workspaceCellId).toBe('us1');
      expect(body.podCellId).toBe('eu1');
    });

    it('passes a token-resolved workspace recorded in THIS cell, still without setting req.workspace', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findById: { id: TENANT, cellId: 'eu1' },
        cellId: 'eu1',
      });
      const req = makeReq('svc.internal', `Bearer ${accessToken()}`);
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe(TENANT);
      // JwtStrategy still owns req.workspace — the cell lookup must not leak
      // a middleware-trusted workspace object into the request.
      expect(req.workspace).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('makes NO lookup at all under the `solo` sentinel (enforcement off costs nothing)', async () => {
      const { middleware, workspaceRepo } = buildMiddleware({
        cloud: true,
        findById: { id: TENANT, cellId: 'us1' },
        cellId: 'solo',
      });
      const req = makeReq('svc.internal', `Bearer ${accessToken()}`);
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(workspaceRepo.findById).not.toHaveBeenCalled();
      expect(req.workspaceId).toBe(TENANT);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects a token-resolved workspace whose recorded cell is ABSENT (empty string), same 421 WORKSPACE_CELL_ABSENT shape as the hostname path', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: undefined,
        findById: { id: TENANT, cellId: '' },
        cellId: 'eu1',
      });
      const req = makeReq(
        'orvex-wiki.orvex-wiki-dev.svc.cluster.local',
        `Bearer ${accessToken()}`,
      );
      const { res, written } = makeRes();
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.workspaceId).toBeUndefined();
      expect(written().statusCode).toBe(421);
      const body = JSON.parse(written().body ?? '{}');
      expect(body.code).toBe('WORKSPACE_CELL_ABSENT');
      expect(body.podCellId).toBe('eu1');
    });

    it('an ABSENT workspace row is not treated as a mismatch — no cell claim exists to compare, downstream still rejects', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findById: undefined,
        cellId: 'eu1',
      });
      const req = makeReq('svc.internal', `Bearer ${accessToken()}`);
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe(TENANT);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('makes no lookup when the token resolves no tenant (deny-by-default is unchanged)', async () => {
      const { middleware, workspaceRepo } = buildMiddleware({
        cloud: true,
        cellId: 'eu1',
      });
      const req = makeReq('svc.internal', 'Bearer not-a-jwt');
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(workspaceRepo.findById).not.toHaveBeenCalled();
      expect(req.workspaceId).toBeNull();
    });
  });

  describe('cloud — federated token fallback (no hostname match)', () => {
    it('resolves workspaceId from a signature-verified ACCESS token, without setting req.workspace', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: undefined,
      });
      const token = jwtService.sign(
        { sub: 'user-1', workspaceId: TENANT, type: 'access' },
        { secret: APP_SECRET },
      );
      const req = makeReq(
        'orvex-wiki.orvex-wiki-dev.svc.cluster.local',
        `Bearer ${token}`,
      );
      const next = jest.fn();
      await middleware.use(req, {} as any, next);
      expect(req.workspaceId).toBe(TENANT);
      // never trust a middleware-decoded workspace object — JwtStrategy owns it.
      expect(req.workspace).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('resolves workspaceId from a verified API_KEY token', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const token = jwtService.sign(
        { sub: 'user-1', workspaceId: TENANT, type: 'api_key', apiKeyId: 'k1' },
        { secret: APP_SECRET },
      );
      const req = makeReq('svc.internal', `Bearer ${token}`);
      await middleware.use(req, {} as any, jest.fn());
      expect(req.workspaceId).toBe(TENANT);
    });

    it('sets workspaceId null for a BAD-SIGNATURE token (deny-by-default)', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const token = jwtService.sign(
        { sub: 'x', workspaceId: TENANT, type: 'access' },
        { secret: 'a-different-secret' },
      );
      const req = makeReq('svc.internal', `Bearer ${token}`);
      await middleware.use(req, {} as any, jest.fn());
      expect(req.workspaceId).toBeNull();
      expect(req.workspace).toBeUndefined();
    });

    it('sets workspaceId null for an EXPIRED token', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const token = jwtService.sign(
        { sub: 'x', workspaceId: TENANT, type: 'access' },
        { secret: APP_SECRET, expiresIn: -10 },
      );
      const req = makeReq('svc.internal', `Bearer ${token}`);
      await middleware.use(req, {} as any, jest.fn());
      expect(req.workspaceId).toBeNull();
    });

    it('sets workspaceId null for a non-request token type (e.g. collab)', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const token = jwtService.sign(
        { sub: 'x', workspaceId: TENANT, type: 'collab' },
        { secret: APP_SECRET },
      );
      const req = makeReq('svc.internal', `Bearer ${token}`);
      await middleware.use(req, {} as any, jest.fn());
      expect(req.workspaceId).toBeNull();
    });

    it('sets workspaceId null when there is no bearer credential', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const req = makeReq('svc.internal', undefined);
      await middleware.use(req, {} as any, jest.fn());
      expect(req.workspaceId).toBeNull();
    });

    it('ignores a non-bearer Authorization scheme', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const req = makeReq('svc.internal', 'Basic abc123');
      await middleware.use(req, {} as any, jest.fn());
      expect(req.workspaceId).toBeNull();
    });
  });
});
