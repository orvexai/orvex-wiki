import {
  Injectable,
  Logger,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { verify } from 'jsonwebtoken';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import {
  CELL_SOLO,
  OrvexConfigService,
} from '../../orvex/config/orvex-config.service';

/**
 * ENG-2501 AC3/AC5 — the typed SOFT rejection marker the label-2 cell
 * assertion surfaces on a mismatch (never a raw thrown `Error` with no code):
 * a greppable operator signal, distinct from a generic 500.
 */
export interface CellLabelMismatch {
  code: 'CELL_LABEL_MISMATCH';
  hostLabel2: string;
  podCellId: string;
}

@Injectable()
export class DomainMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DomainMiddleware.name);

  constructor(
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
    private orvexConfigService: OrvexConfigService,
  ) {}
  async use(
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
        // ENG-2501 AC3 — the SOFT label-2 cell assertion runs immediately
        // after label-0 resolution succeeds. On a definite mismatch the one
        // request is rejected with a typed marker; the process never dies.
        const mismatch = this.assertLabel2CellSoft(
          header,
          this.orvexConfigService.cellId,
        );
        if (mismatch) {
          this.logger.warn(
            `soft cell assertion rejected request: code=${mismatch.code} hostLabel2=${mismatch.hostLabel2} podCellId=${mismatch.podCellId}`,
          );
          res.statusCode = 421;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              ...mismatch,
              message:
                'Request reached a pod outside its cell (defence-in-depth soft check; the edge routing layer remains authoritative).',
            }),
          );
          return;
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
      (req as any).workspaceId = this.resolveWorkspaceIdFromToken(req) ?? null;
    }

    next();
  }

  /**
   * ENG-2501 (FR-W20, A-TENANCY) — the SOFT label-2 cell assertion.
   *
   * Compares the `Host` header's label-2 segment (the cell segment, e.g.
   * `eu1` in `acme.wiki.eu1.orvex.ai`) against this pod's own configured
   * `CELL_ID`. This is EXPLICITLY a soft, defence-in-depth SECOND layer —
   * the edge/principal-vs-`CELL_ID` check (cell-lint rule 3, an
   * ingress-level control outside this middleware) remains the
   * claim-superior, authoritative tenant-isolation gate. This check only
   * flags a request the edge should never have routed here.
   *
   * No-op (returns null) when:
   *  - the pod runs under the `solo` sentinel (`CELL_ID` unset or the
   *    literal `"solo"`, mirroring the outbox relay's sentinel semantics) —
   *    cell enforcement is off entirely in solo mode (AC5);
   *  - the host does not carry a cell-shaped label-2 (fewer than four
   *    labels) — a soft check never guesses on an ambiguous host;
   *  - the label-2 matches the pod's cell.
   *
   * Pure in-memory string comparison: no I/O, no store call, no wall-clock.
   */
  private assertLabel2CellSoft(
    host: string | undefined,
    podCellId: string | null,
  ): CellLabelMismatch | null {
    if (podCellId === null || podCellId === CELL_SOLO) {
      return null;
    }

    const hostname = host?.split(':')[0];
    const labels = hostname?.split('.') ?? [];
    const hostLabel2 = labels.length >= 4 ? labels[2] : undefined;

    if (!hostLabel2 || hostLabel2 === podCellId) {
      return null;
    }

    return { code: 'CELL_LABEL_MISMATCH', hostLabel2, podCellId };
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
      const payload = verify(token, this.environmentService.getAppSecret()) as {
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
