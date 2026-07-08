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
import { RatifyGateSettingsService } from './ratify-gate-settings.service';
import { UpdateRatifyGateDto } from './dto/ratify-gate-settings.dto';

/**
 * ENG-1445 AC5 — the per-workspace ratify-gate GET/POST surface. Thin
 * (authn/z via the guard + ability check → one service call), mirroring
 * `WorkspaceController`'s own `WorkspaceCaslAction.Manage,
 * WorkspaceCaslSubject.Settings` gate (CS §12 ❌1: no domain logic here —
 * `RatifyGateSettingsService` owns the read/write + audit).
 */
@UseGuards(JwtAuthGuard)
@Controller('orvex/settings/ratify-gate')
export class RatifyGateSettingsController {
  constructor(
    private readonly ratifyGateSettingsService: RatifyGateSettingsService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Get()
  async getRatifyGate(@AuthWorkspace() workspace: Workspace) {
    const required = await this.ratifyGateSettingsService.getRequired(
      workspace.id,
    );
    return { required };
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async updateRatifyGate(
    @Body() dto: UpdateRatifyGateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }

    const required = await this.ratifyGateSettingsService.updateRequired(
      workspace.id,
      dto.required,
      user.id,
    );
    return { required };
  }
}
