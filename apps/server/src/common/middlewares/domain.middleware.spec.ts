import { sign } from 'jsonwebtoken';
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
    findByHostname: jest.fn().mockResolvedValue(opts.findByHostname ?? undefined),
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
      const { middleware } = buildMiddleware({ cloud: false, findFirst: undefined });
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

  describe('cloud — ENG-2501 soft label-2 cell assertion', () => {
    const ws = { id: 'tenant-by-host' };

    it('AC3 — a definite label-2 vs CELL_ID mismatch is soft-rejected with the typed CELL_LABEL_MISMATCH marker (421), request does not proceed', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: ws,
        cellId: 'eu1',
      });
      const req = makeReq('acme.wiki.us1.orvex.ai');
      const { res, written } = makeRes();
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(req.workspaceId).toBeUndefined();
      expect(written().statusCode).toBe(421);
      const body = JSON.parse(written().body ?? '{}');
      expect(body.code).toBe('CELL_LABEL_MISMATCH');
      expect(body.hostLabel2).toBe('us1');
      expect(body.podCellId).toBe('eu1');
    });

    it('AC3 — a MATCHING label-2 passes through unaffected (workspace resolved, next called)', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: ws,
        cellId: 'eu1',
      });
      const req = makeReq('acme.wiki.eu1.orvex.ai');
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe('tenant-by-host');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('AC5 — under the `solo` sentinel a would-be mismatch NO-OPS (cell enforcement off entirely in solo mode)', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: ws,
        cellId: 'solo',
      });
      const req = makeReq('acme.wiki.us1.orvex.ai');
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe('tenant-by-host');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('AC5 — with CELL_ID unset the assertion no-ops identically (null-on-unset semantics, no fabricated cell)', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: ws,
      });
      const req = makeReq('acme.wiki.us1.orvex.ai');
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe('tenant-by-host');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('a host with no cell-shaped label-2 (fewer than four labels) is never soft-rejected — the check does not guess', async () => {
      const { middleware } = buildMiddleware({
        cloud: true,
        findByHostname: ws,
        cellId: 'eu1',
      });
      const req = makeReq('acme.localhost');
      const next = jest.fn();

      await middleware.use(req, {} as any, next);

      expect(req.workspaceId).toBe('tenant-by-host');
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('cloud — federated token fallback (no hostname match)', () => {
    it('resolves workspaceId from a signature-verified ACCESS token, without setting req.workspace', async () => {
      const { middleware } = buildMiddleware({ cloud: true, findByHostname: undefined });
      const token = sign(
        { sub: 'user-1', workspaceId: TENANT, type: 'access' },
        APP_SECRET,
      );
      const req = makeReq('orvex-wiki.orvex-wiki-dev.svc.cluster.local', `Bearer ${token}`);
      const next = jest.fn();
      await middleware.use(req, {} as any, next);
      expect(req.workspaceId).toBe(TENANT);
      // never trust a middleware-decoded workspace object — JwtStrategy owns it.
      expect(req.workspace).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('resolves workspaceId from a verified API_KEY token', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const token = sign(
        { sub: 'user-1', workspaceId: TENANT, type: 'api_key', apiKeyId: 'k1' },
        APP_SECRET,
      );
      const req = makeReq('svc.internal', `Bearer ${token}`);
      await middleware.use(req, {} as any, jest.fn());
      expect(req.workspaceId).toBe(TENANT);
    });

    it('sets workspaceId null for a BAD-SIGNATURE token (deny-by-default)', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const token = sign({ sub: 'x', workspaceId: TENANT, type: 'access' }, 'a-different-secret');
      const req = makeReq('svc.internal', `Bearer ${token}`);
      await middleware.use(req, {} as any, jest.fn());
      expect(req.workspaceId).toBeNull();
      expect(req.workspace).toBeUndefined();
    });

    it('sets workspaceId null for an EXPIRED token', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const token = sign(
        { sub: 'x', workspaceId: TENANT, type: 'access' },
        APP_SECRET,
        { expiresIn: -10 },
      );
      const req = makeReq('svc.internal', `Bearer ${token}`);
      await middleware.use(req, {} as any, jest.fn());
      expect(req.workspaceId).toBeNull();
    });

    it('sets workspaceId null for a non-request token type (e.g. collab)', async () => {
      const { middleware } = buildMiddleware({ cloud: true });
      const token = sign({ sub: 'x', workspaceId: TENANT, type: 'collab' }, APP_SECRET);
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
