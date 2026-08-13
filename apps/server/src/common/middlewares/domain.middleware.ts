import {
  Injectable,
  Logger,
  NestMiddleware,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest, FastifyReply } from 'fastify';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import {
  CELL_SOLO,
  OrvexConfigService,
} from '../../orvex/config/orvex-config.service';
import { runInTenantScope } from '@docmost/db/rls/tenant-scope.context';

/**
 * The typed rejection marker the cell assertion surfaces on a mismatch (never
 * a raw thrown `Error` with no code): a greppable operator signal, distinct
 * from a generic 500.
 *
 * Deliberately carries NO tenant identifier. The two cell ids are operational
 * facts about the DEPLOYMENT; the workspace id is the tenant's own, and is
 * logged server-side rather than echoed to a caller this pod has just decided
 * it should not be serving.
 */
export interface WorkspaceCellMismatch {
  code: 'WORKSPACE_CELL_MISMATCH' | 'WORKSPACE_CELL_ABSENT';
  workspaceCellId: string;
  podCellId: string;
}

@Injectable()
export class DomainMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DomainMiddleware.name);

  constructor(
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
    private orvexConfigService: OrvexConfigService,
    @Optional() private jwtService: JwtService = new JwtService(),
  ) {}
  /**
   * ENG-2502 (FR-W8, AC1) — the request-lifecycle half of the RLS wiring.
   *
   * Every `next()` below is entered INSIDE `runInTenantScope(req.workspaceId,
   * …)`, so the tenant this middleware just resolved is the ambient scope for
   * the whole downstream request. `executeTx` (`database/utils.ts`), the
   * shared transaction chokepoint every tenant-scoped service transaction
   * funnels through, reads that scope and runs
   * `set_config('app.workspace_id', $1, true)` as the first statement of the
   * transaction it opens. A request that resolves NO workspace enters the
   * scope with `null` — the GUC stays unset and RLS denies by default (AC5),
   * never defaults-open.
   *
   * `AsyncLocalStorage.run` must WRAP `next()` (not merely be called before
   * it): the store is bound to the async execution context the callback
   * runs in.
   */
  async use(
    req: FastifyRequest['raw'],
    res: FastifyReply['raw'],
    next: () => void,
  ) {
    return this.resolve(req, res, () =>
      runInTenantScope((req as any).workspaceId ?? null, next),
    );
  }

  private async resolve(
    req: FastifyRequest['raw'],
    res: FastifyReply['raw'],
    next: () => void,
  ) {
    if (this.environmentService.isSelfHosted()) {
      const workspace = await this.workspaceRepo.findFirst();
      if (!workspace) {
        //throw new NotFoundException('Workspace not found');
        (req as any).workspaceId = null;
        return next();
      }

      (req as any).workspaceId = workspace.id;
      (req as any).workspace = workspace;
    } else if (this.environmentService.isCloud()) {
      const header = req.headers.host;
      const subdomain = header?.split('.')[0];

      const workspace = subdomain
        ? await this.workspaceRepo.findByHostname(subdomain)
        : undefined;

      if (workspace) {
        // The cell assertion runs immediately after resolution succeeds. On a
        // definite mismatch the one request is rejected with a typed marker;
        // the process never dies.
        const mismatch = this.assertWorkspaceCell(workspace);
        if (mismatch) {
          return this.rejectCellMismatch(res, mismatch, workspace.id);
        }

        (req as any).workspaceId = workspace.id;
        (req as any).workspace = workspace;
        return next();
      }

      // ENG-1559 FR-W6 — federated workspace resolution. The hostname did not
      // resolve a workspace (the norm for a cluster-internal / cell host, or a
      // tenant addressed by a bearer session rather than a dedicated subdomain).
      // Resolve the tenant from the request's OWN engine session token so
      // token-scoped API calls carry their workspace context past the
      // workspace-required preHandler (main.ts) and the JwtStrategy workspace
      // match check. This ONLY establishes req.workspaceId from a
      // signature-verified token; it deliberately does NOT set req.workspace, so
      // @AuthWorkspace still reads the JwtStrategy-verified req.user.workspace.
      // JwtStrategy independently re-validates the SAME token (signature +
      // workspace existence + user-in-workspace + active session) before any
      // guarded handler runs, so a forged/expired token resolves nothing here
      // (verify throws) and is rejected downstream — no auth is bypassed and no
      // cross-tenant context is possible (a token can only carry its own tenant).
      const tokenWorkspaceId = this.resolveWorkspaceIdFromToken(req);

      // THE PATH THAT ACTUALLY CARRIES PRODUCTION TRAFFIC. The hostname
      // branch above cannot gate a federated tenant, because
      // `PrincipalProvisioningService.materializeWorkspace` mints those
      // deliberately WITHOUT a hostname ("reached by its tenant-claim UUID,
      // not by hostname") and the deployed HTTPRoute serves exactly one fixed
      // host. A cell check that lived only up there would be dead code in
      // every real cell — which is precisely what the old label-count guess
      // was. So the assertion is made here too, against the same
      // authoritative record.
      if (tokenWorkspaceId !== null && this.cellEnforcementActive()) {
        const workspace = await this.workspaceRepo.findById(tokenWorkspaceId);
        // An ABSENT row is not a mismatch — this pod has no cell claim to
        // compare against, so it makes none (the check never guesses). The
        // request keeps its existing fate: JwtStrategy re-validates the token
        // against workspace existence and rejects it there.
        if (workspace) {
          const mismatch = this.assertWorkspaceCell(workspace);
          if (mismatch) {
            return this.rejectCellMismatch(res, mismatch, workspace.id);
          }
        }
      }

      (req as any).workspaceId = tokenWorkspaceId ?? null;
    }

    next();
  }

  /**
   * Is this pod in a cell that can meaningfully be enforced?
   *
   * No when it runs the `solo` sentinel (`CELL_ID` unset or the literal
   * `"solo"`, mirroring the outbox relay's sentinel semantics): cell
   * enforcement is off entirely in solo mode, so dev/crew/self-hosted pay
   * neither the comparison nor the lookup it would require.
   */
  private cellEnforcementActive(): boolean {
    const podCellId = this.orvexConfigService.cellId;
    return podCellId !== null && podCellId !== CELL_SOLO;
  }

  /**
   * (FR-W20, A-TENANCY) — the cell assertion.
   *
   * Compares the RESOLVED workspace's own recorded `cellId` against this
   * pod's configured `CELL_ID`. This replaces an earlier check that inferred
   * the cell from the `Host` header's label-2 segment, which was wrong in two
   * ways that compounded: it could only fire on hosts with four or more
   * labels (so it silently no-opped for custom domains, `*.localhost`, and
   * every short host), and it sat behind a hostname→workspace lookup that
   * never succeeds in the real deploy — so in production it was not a lenient
   * gate, it was an absent one.
   *
   * Reading the stored assignment removes the guess entirely: a custom-domain
   * tenant and a `wiki.<cell>.orvex.ai` tenant are now judged by the same
   * authoritative fact, and the host's shape stops mattering at all.
   *
   * Identity's global tenant→cell registry stays the cross-cell source of
   * truth and its sole writer; `workspaces.cell_id` is that truth
   * materialized cell-locally so the request path can enforce it without a
   * per-request network hop to identity.
   *
   * No-op (returns null) under the `solo` sentinel, or when the stored cell
   * matches. A stored `solo` against a real pod cell IS a mismatch: it means
   * a row this cell did not mint (a restore from another environment, a
   * hand-inserted row) and refusing to serve it is the correct outcome. An
   * absent/empty/whitespace-only stored cell is ALSO refused (never a silent
   * no-op) — see the dedicated `WORKSPACE_CELL_ABSENT` branch below.
   *
   * Pure in-memory string comparison: no I/O, no wall-clock.
   */
  private assertWorkspaceCell(workspace: {
    cellId?: string | null;
  }): WorkspaceCellMismatch | null {
    if (!this.cellEnforcementActive()) {
      return null;
    }
    const podCellId = this.orvexConfigService.cellId as string;
    const workspaceCellId = workspace.cellId;

    if (workspaceCellId === podCellId) {
      return null;
    }

    // Fleet C-cell (AD-4/AD-13): an absent, empty, or whitespace-only cell
    // claim is REFUSED, never silently served. The column is NOT NULL and the
    // repo's `baseFields` carries `cellId` precisely so this branch should
    // never be reached in a healthy deploy — but "should never happen" is not
    // a guard; a row read through a projection that omitted the column, or a
    // legacy/corrupt row that never got one, carries the SAME risk as a wrong
    // cell (this pod cannot show the tenant belongs here), so it gets the
    // same fail-closed 421 outcome under its own typed code, distinct from a
    // definite cross-cell mismatch.
    if (
      workspaceCellId === undefined ||
      workspaceCellId === null ||
      workspaceCellId.trim() === ''
    ) {
      return {
        code: 'WORKSPACE_CELL_ABSENT',
        workspaceCellId: workspaceCellId ?? '',
        podCellId,
      };
    }

    return {
      code: 'WORKSPACE_CELL_MISMATCH',
      workspaceCellId,
      podCellId,
    };
  }

  /**
   * The one place a cell mismatch becomes a response: 421 Misdirected
   * Request, a typed body, and a greppable operator log carrying the tenant
   * id the body deliberately omits. Rejects the ONE request; the process
   * never dies.
   */
  private rejectCellMismatch(
    res: FastifyReply['raw'],
    mismatch: WorkspaceCellMismatch,
    workspaceId: string,
  ): void {
    this.logger.warn(
      `cell assertion rejected request: code=${mismatch.code} workspaceId=${workspaceId} workspaceCellId=${mismatch.workspaceCellId} podCellId=${mismatch.podCellId}`,
    );
    res.statusCode = 421;
    res.setHeader('content-type', 'application/json');
    const message =
      mismatch.code === 'WORKSPACE_CELL_ABSENT'
        ? 'Request reached a pod that cannot confirm the tenant’s cell (the workspace record carries no usable cell claim).'
        : 'Request reached a pod outside the tenant’s cell (the workspace’s recorded cell does not match this deployment).';
    res.end(
      JSON.stringify({
        ...mismatch,
        message,
      }),
    );
  }

  /**
   * Extracts a tenant (workspaceId) from the request's bearer engine session
   * token, but ONLY after cryptographically verifying the token against the
   * app secret (the same key JwtStrategy verifies with). Returns null for a
   * missing / malformed / bad-signature / expired token, or a token type that
   * does not carry an authenticated tenant context — deny-by-default: a token
   * that fails verification never establishes a workspace context.
   */
  private resolveWorkspaceIdFromToken(
    req: FastifyRequest['raw'],
  ): string | null {
    const authorization = req.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.environmentService.getAppSecret(),
      }) as {
        workspaceId?: string;
        type?: string;
      };
      // Only session ACCESS tokens and API keys carry an authenticated tenant
      // context we should resolve from (never a collab/exchange/attachment/etc.
      // token — those are not general request credentials).
      if (
        payload?.workspaceId &&
        (payload.type === 'access' || payload.type === 'api_key')
      ) {
        return payload.workspaceId;
      }
    } catch {
      // Invalid / expired / wrong-signature token: establish no context here;
      // JwtStrategy will reject it (guarded routes) or the preHandler will 404
      // (unguarded routes that require a workspace) — unchanged behaviour.
    }
    return null;
  }
}
