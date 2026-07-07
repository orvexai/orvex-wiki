import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthTokenScope } from '../../common/decorators/auth-token-scope.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { ApiKeyService, TokenScope } from './api-key.service';
import { OrvexBearerAuthGuard } from './orvex-bearer-auth.guard';
import {
  CreateApiKeyDto,
  RevokeApiKeyDto,
  UpdateApiKeyDto,
} from './dto/api-key.dto';

/**
 * ENG-1380 — clean-room AGPL api-key HTTP surface (placement: core/api-key, see api-key.module.ts)
 * (never `ee/api-key`). Every handler stays a thin 4-step pass-through
 * (authn/z via the guard/decorators → parse the DTO → one service call →
 * marshal the result) — all escalation/hash/audit logic lives in
 * {@link ApiKeyService} (CS §12 ❌1: no domain logic in the handler).
 */
@UseGuards(OrvexBearerAuthGuard)
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @Body() dto: CreateApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @AuthTokenScope() tokenScope: TokenScope,
  ) {
    return this.apiKeyService.create(
      { name: dto.name, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null },
      { creator: user, workspaceId: workspace.id, tokenScope },
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(
    @Body() dto: UpdateApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @AuthTokenScope() tokenScope: TokenScope,
  ) {
    return this.apiKeyService.update(
      { apiKeyId: dto.apiKeyId, name: dto.name },
      { actor: user, workspaceId: workspace.id, tokenScope },
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  revoke(
    @Body() dto: RevokeApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @AuthTokenScope() tokenScope: TokenScope,
  ) {
    return this.apiKeyService.revoke(
      { apiKeyId: dto.apiKeyId },
      { actor: user, workspaceId: workspace.id, tokenScope },
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  list(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @AuthTokenScope() tokenScope: TokenScope,
  ) {
    return this.apiKeyService.list({
      workspaceId: workspace.id,
      caller: user,
      tokenScope,
      isAdminView: false,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('admin-list')
  adminList(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @AuthTokenScope() tokenScope: TokenScope,
  ) {
    return this.apiKeyService.list({
      workspaceId: workspace.id,
      caller: user,
      tokenScope,
      isAdminView: true,
    });
  }
}
