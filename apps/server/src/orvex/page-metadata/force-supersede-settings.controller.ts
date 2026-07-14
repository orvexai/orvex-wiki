// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '../../database/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { ForceSupersedeSettingsService } from './force-supersede-settings.service';
import { UpdateForceSupersedeDto } from './dto/force-supersede-settings.dto';

/**
 * ENG-1434 AC5 — the per-workspace forced-supersede break-glass GET/POST
 * surface. Mirrors `RatifyGateSettingsController` (ENG-1445): thin
 * authn/z + a single service call, workspace-admin only.
 */
@UseGuards(JwtAuthGuard)
@Controller('orvex/settings/force-supersede')
export class ForceSupersedeSettingsController {
  constructor(
    private readonly forceSupersedeSettingsService: ForceSupersedeSettingsService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Get()
  async getForceSupersede(@AuthWorkspace() workspace: Workspace) {
    const enabled = await this.forceSupersedeSettingsService.getEnabled(
      workspace.id,
    );
    return { enabled };
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async updateForceSupersede(
    @Body() dto: UpdateForceSupersedeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }

    const enabled = await this.forceSupersedeSettingsService.updateEnabled(
      workspace.id,
      dto.enabled,
      user.id,
    );
    return { enabled };
  }
}
