import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AI_CHAT_THROTTLER,
  AUTH_THROTTLER,
} from '../../orvex/orvex-throttler-names';
import { AuthService } from './services/auth.service';
import { SessionService } from '../session/session.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VerifyUserTokenDto } from './dto/verify-user-token.dto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';

/**
 * AuthController owns the identity-backed auth survivors. Native email /
 * password handlers live in NativeAuthController and are registered only for
 * vanilla deployments; the hosted route table therefore contains no native
 * login fallback.
 */
@SkipThrottle({ [AI_CHAT_THROTTLER]: true })
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private sessionService: SessionService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('verify-token')
  async verifyResetToken(
    @Body() verifyUserTokenDto: VerifyUserTokenDto,
    @AuthWorkspace() workspace: { id: string },
  ) {
    return this.authService.verifyUserToken(verifyUserTokenDto, workspace.id);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('collab-token')
  async collabToken(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: { id: string },
  ) {
    return this.authService.getCollabToken(user, workspace.id);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @AuthUser() user: User,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const sessionId = (req.raw as any).sessionId;
    if (sessionId) {
      await this.sessionService.revokeSession(
        sessionId,
        user.id,
        user.workspaceId,
      );
    }

    res.clearCookie('authToken');

    await this.auditService.log(
      {
        event: AuditEvent.USER_LOGOUT,
        resourceType: AuditResource.USER,
        resourceId: user.id,
      },
      { workspaceId: user.workspaceId, actorId: user.id, actorType: 'user' },
    );
  }
}
