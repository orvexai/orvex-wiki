import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { verify } from 'jsonwebtoken';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';

@Injectable()
export class DomainMiddleware implements NestMiddleware {
  constructor(
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
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

      // TODO: unify
      (req as any).workspaceId = workspace.id;
      (req as any).workspace = workspace;
    } else if (this.environmentService.isCloud()) {
      const header = req.headers.host;
      const subdomain = header?.split('.')[0];

      const workspace = subdomain
        ? await this.workspaceRepo.findByHostname(subdomain)
        : undefined;

      if (workspace) {
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
