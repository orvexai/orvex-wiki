// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageIdDto } from './dto/page.dto';
import {
  CreateVerificationDto,
  RejectApprovalDto,
  UpdateVerificationDto,
} from './dto/page-verification.dto';
import { PageVerificationService } from './page-verification.service';
import { PageVerificationEntitlementGuard } from './page-verification-entitlement.guard';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';

/**
 * ENG-1459 — QMS page-verification routes (entitlement-gated, thin
 * controller — all decisioning lives in `PageVerificationService`/
 * `PageVerificationRepo`). Mounted on `PageModule` but every handler is
 * gated by `PageVerificationEntitlementGuard` (AC2): an unentitled
 * workspace gets a 404 on every route below, same as if this controller
 * were never mounted at all.
 */
@UseGuards(JwtAuthGuard, PageVerificationEntitlementGuard)
@Controller('pages')
export class PageVerificationController {
  constructor(
    private readonly verificationService: PageVerificationService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  private async requireReadablePage(pageId: string, user: User, workspace: Workspace) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    return page;
  }

  private async requireEditablePage(pageId: string, user: User, workspace: Workspace) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    return page;
  }

  @HttpCode(HttpStatus.OK)
  @Post('verification-info')
  async getVerificationInfo(
    @Body() dto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireReadablePage(dto.pageId, user, workspace);
    return this.verificationService.getVerificationInfo(dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create-verification')
  async createVerification(
    @Body() dto: CreateVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.requireEditablePage(dto.pageId, user, workspace);
    return this.verificationService.createVerification(
      dto,
      user.id,
      workspace.id,
      page.spaceId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-verification')
  async updateVerification(
    @Body() dto: UpdateVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireEditablePage(dto.pageId, user, workspace);
    return this.verificationService.updateVerification(dto, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete-verification')
  async deleteVerification(
    @Body() dto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireEditablePage(dto.pageId, user, workspace);
    await this.verificationService.removeVerification(dto.pageId, workspace.id);
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify')
  async verifyPage(
    @Body() dto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireEditablePage(dto.pageId, user, workspace);
    return this.verificationService.verifyPage(dto.pageId, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('submit-for-approval')
  async submitForApproval(
    @Body() dto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireEditablePage(dto.pageId, user, workspace);
    return this.verificationService.submitForApproval(dto.pageId, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reject-approval')
  async rejectApproval(
    @Body() dto: RejectApprovalDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireEditablePage(dto.pageId, user, workspace);
    return this.verificationService.rejectApproval(
      dto.pageId,
      dto.comment,
      user.id,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('mark-obsolete')
  async markObsolete(
    @Body() dto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireEditablePage(dto.pageId, user, workspace);
    return this.verificationService.markObsolete(dto.pageId, workspace.id);
  }
}
