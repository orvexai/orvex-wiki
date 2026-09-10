import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AI_CHAT_THROTTLER,
  AUTH_THROTTLER,
} from '../../orvex/orvex-throttler-names';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './services/auth.service';
import { SetupGuard } from './guards/setup.guard';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { validateSsoEnforcement } from './auth.util';
import { setAuthCookie } from './auth-cookie.helper';
import { OrvexEnforceSsoCheckService } from '../../orvex/enforce-sso/orvex-enforce-sso-check.service';
import { OrvexNativeLoginGuard } from '../../orvex/http/orvex-native-login.guard';

/**
 * NativeAuthController contains the legacy email/password surface while the
 * removal flag is disabled. AuthModule does not register this controller when
 * NATIVE_LOGIN_REMOVED is exactly "true", so those routes are absent from
 * Nest's route table rather than merely rejected by a request guard. With the
 * flag off, the existing OrvexNativeLoginGuard behavior remains in force.
 */
@SkipThrottle({ [AI_CHAT_THROTTLER]: true })
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class NativeAuthController {
  private readonly logger = new Logger(NativeAuthController.name);

  constructor(
    private authService: AuthService,
    private environmentService: EnvironmentService,
    private moduleRef: ModuleRef,
    private readonly enforceSso: OrvexEnforceSsoCheckService,
  ) {}

  @UseGuards(OrvexNativeLoginGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() loginInput: LoginDto,
    @Req() req: FastifyRequest,
  ) {
    await this.enforceSso.checkOrThrow(workspace, loginInput.email, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    let MfaModule: any;
    let isMfaModuleReady = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      MfaModule = require('./../../ee/mfa/services/mfa.service');
      isMfaModuleReady = true;
    } catch (err) {
      this.logger.debug(
        'MFA module requested but EE module not bundled in this build',
      );
      isMfaModuleReady = false;
    }
    if (isMfaModuleReady) {
      const mfaService = this.moduleRef.get(MfaModule.MfaService, {
        strict: false,
      });

      const mfaResult = await mfaService.checkMfaRequirements(
        loginInput,
        workspace,
        res,
      );

      if (mfaResult) {
        if (mfaResult.userHasMfa || mfaResult.requiresMfaSetup) {
          return {
            userHasMfa: mfaResult.userHasMfa,
            requiresMfaSetup: mfaResult.requiresMfaSetup,
            isMfaEnforced: mfaResult.isMfaEnforced,
          };
        } else if (mfaResult.authToken) {
          setAuthCookie(res, mfaResult.authToken, this.environmentService);
          return;
        }
      }
    }

    const authToken = await this.authService.login(loginInput, workspace.id);
    setAuthCookie(res, authToken, this.environmentService);
  }

  @UseGuards(SetupGuard)
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  async setupWorkspace(
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() createAdminUserDto: CreateAdminUserDto,
  ) {
    const { workspace, authToken } =
      await this.authService.setup(createAdminUserDto);

    setAuthCookie(res, authToken, this.environmentService);
    return workspace;
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    const currentSessionId = (req.raw as any).sessionId;
    return this.authService.changePassword(
      dto,
      user.id,
      workspace.id,
      currentSessionId,
    );
  }

  @UseGuards(OrvexNativeLoginGuard)
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    validateSsoEnforcement(workspace);
    return this.authService.forgotPassword(forgotPasswordDto, workspace);
  }

  @UseGuards(OrvexNativeLoginGuard)
  @HttpCode(HttpStatus.OK)
  @Post('password-reset')
  async passwordReset(
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() passwordResetDto: PasswordResetDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    validateSsoEnforcement(workspace);

    const result = await this.authService.passwordReset(
      passwordResetDto,
      workspace,
    );

    if (result.requiresLogin) {
      return {
        requiresLogin: true,
      };
    }

    setAuthCookie(res, result.authToken, this.environmentService);
    return {
      requiresLogin: false,
    };
  }
}
