import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { JwtApiKeyPayload, JwtPayload, JwtType } from '../dto/jwt-payload';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { SessionActivityService } from '../../session/session-activity.service';
import { FastifyRequest } from 'fastify';
import { extractBearerTokenFromHeader, isUserDisabled } from '../../../common/helpers';
import { ApiKeyService } from '../../../core/api-key/api-key.service';
import { stampTokenScope } from '../../casl/scope-intersection';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private logger = new Logger('JwtStrategy');

  constructor(
    private userRepo: UserRepo,
    private workspaceRepo: WorkspaceRepo,
    private userSessionRepo: UserSessionRepo,
    private sessionActivityService: SessionActivityService,
    private readonly environmentService: EnvironmentService,
    private readonly apiKeyService: ApiKeyService,
  ) {
    super({
      jwtFromRequest: (req: FastifyRequest) => {
        return req.cookies?.authToken || extractBearerTokenFromHeader(req);
      },
      ignoreExpiration: false,
      secretOrKey: environmentService.getAppSecret(),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload | JwtApiKeyPayload) {
    if (!payload.workspaceId) {
      throw new UnauthorizedException();
    }

    if (req.raw.workspaceId && req.raw.workspaceId !== payload.workspaceId) {
      throw new UnauthorizedException('Workspace does not match');
    }

    if (payload.type === JwtType.API_KEY) {
      return this.validateApiKey(req, payload as JwtApiKeyPayload);
    }

    if (payload.type !== JwtType.ACCESS) {
      throw new UnauthorizedException();
    }

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);

    if (!workspace) {
      throw new UnauthorizedException();
    }
    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);

    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    if ((payload as JwtPayload).sessionId) {
      const sessionId = (payload as JwtPayload).sessionId;
      const session = await this.userSessionRepo.findActiveById(sessionId);
      if (!session || session.userId !== payload.sub || session.workspaceId !== payload.workspaceId) {
        throw new UnauthorizedException();
      }
      req.raw.sessionId = sessionId;
      this.sessionActivityService.trackActivity(sessionId, payload.sub, payload.workspaceId);
    }

    return { user, workspace, tokenScope: payload.scope ?? 'full' };
  }

  /**
   * ENG-1380 (rewires jwt.strategy.ts:83) — dispatches to the in-tree AGPL
   * in-tree AGPL api-key module (core/api-key) via normal Nest DI. No more dynamic
   * `require()` of an EE path: `ApiKeyService` is a first-class
   * constructor dependency, resolved from the module graph exactly like
   * every other collaborator here.
   */
  private async validateApiKey(req: any, payload: JwtApiKeyPayload) {
    const rawToken = extractBearerTokenFromHeader(req);

    const record = await this.apiKeyService.validate(
      { apiKeyId: payload.apiKeyId, workspaceId: payload.workspaceId },
      rawToken,
    );

    const workspace = await this.workspaceRepo.findById(record.workspaceId);
    if (!workspace) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepo.findById(
      record.creatorId,
      record.workspaceId,
    );
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    // ENG-1454 (C3/C4 wiring) — stamp the token's own scope grant onto the
    // resolved user at the auth seam. `SpaceAbilityFactory.createForUser`
    // is the sole reader (via `intersectWithTokenScope`), so every
    // space-scoped REST handler downstream is floored to this grant.
    const scopedUser = stampTokenScope(user, {
      readOnly: record.readOnly,
      spaceIds: record.scopes,
    });

    return {
      user: scopedUser,
      workspace,
      authMethod: 'api_key',
      apiKeyId: record.apiKeyId,
      tokenScope: payload.scope ?? 'full',
    };
  }
}
