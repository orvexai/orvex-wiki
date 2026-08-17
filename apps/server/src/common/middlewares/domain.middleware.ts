import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest, FastifyReply } from 'fastify';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { runInTenantScope } from '@docmost/db/rls/tenant-scope.context';
import {
  WorkspaceCellAssertionService,
  WorkspaceCellMismatchException,
} from '../cell-isolation/workspace-cell-assertion.service';

@Injectable()
export class DomainMiddleware implements NestMiddleware {
  constructor(
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
    private readonly cellAssertion: WorkspaceCellAssertionService,
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
        // Identity's global tenant-to-cell registry remains the cross-cell
        // source of truth and sole writer; the workspace row is its local
        // materialization, judged by the shared assertion used on every
        // tenant-data transport.
        try {
          this.cellAssertion.assertWorkspace(
            workspace,
            workspace.id,
            'HTTP hostname request',
          );
        } catch (error) {
          if (error instanceof WorkspaceCellMismatchException) {
            return this.rejectCellMismatch(res, error);
          }
          throw error;
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
      if (tokenWorkspaceId !== null) {
        try {
          await this.cellAssertion.assertWorkspaceId(
            tokenWorkspaceId,
            'HTTP bearer request',
          );
        } catch (error) {
          if (error instanceof WorkspaceCellMismatchException) {
            return this.rejectCellMismatch(res, error);
          }
          throw error;
        }
      }

      (req as any).workspaceId = tokenWorkspaceId ?? null;
    }

    next();
  }

  /**
   * HTTP middleware runs before Nest's exception layer, so serialize the same
   * canonical `contracts.Error` envelope carried by the shared exception.
   */
  private rejectCellMismatch(
    res: FastifyReply['raw'],
    error: WorkspaceCellMismatchException,
  ): void {
    res.statusCode = 421;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(error.getResponse()));
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
