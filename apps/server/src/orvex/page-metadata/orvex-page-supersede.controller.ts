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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthMethod } from '../../common/decorators/auth-method.decorator';
import { AuthApiKeyId } from '../../common/decorators/auth-api-key-id.decorator';
import { User, Workspace } from '../../database/types/entity.types';
import { PageRepo } from '../../database/repos/page/page.repo';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { PageStatus } from '@orvex/extensions';
import { OrvexPageMetadataService } from './orvex-page-metadata.service';
import { SupersedePageDto } from './dto/supersede-page.dto';
import { UnsupersedePageDto } from './dto/unsupersede-page.dto';
import { StatusPageDto } from './dto/status-page.dto';
import { OrvexPageMetaFields } from '@orvex/extensions';

/**
 * ENG-1434 — the real page-lifecycle HTTP surface: `/supersede`,
 * `/unsupersede`, `/status`. Thin (CS §12 ❌1): authn/z + a single
 * `OrvexPageMetadataService` call each — `supersedeAtomic` (AC12's ONE
 * chokepoint), the XOR guard, the CONFIRM_TOKEN/forced-supersede gates,
 * and the archive-reason contract all live entirely in the service.
 */
@Controller('orvex/pages')
@UseGuards(JwtAuthGuard)
export class OrvexPageSupersedeController {
  constructor(
    private readonly metadataService: OrvexPageMetadataService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbilityFactory: SpaceAbilityFactory,
  ) {}

  @Post('supersede')
  @HttpCode(HttpStatus.OK)
  async supersede(
    @Body() dto: SupersedePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @AuthMethod() authMethod: 'api_key' | undefined,
    @AuthApiKeyId() apiKeyId: string | undefined,
  ): Promise<OrvexPageMetaFields> {
    const page = await this.assertPageInWorkspace(dto.pageId, workspace.id);
    await this.assertCanManage(user, page.spaceId);

    return this.metadataService.supersedeAtomic(
      dto.pageId,
      { supersedes: dto.supersedes, supersededBy: dto.supersededBy },
      {
        authMethod,
        actorId: user.id,
        confirmToken: dto.confirmToken,
        forceSupersede: dto.forceSupersede,
        forceReason: dto.forceReason,
        // review2 F1 — the api_key CLIENT's own identity (distinct from
        // `actorId`, the confirming human), threaded onto the AC4 audit row.
        clientId: apiKeyId,
        // review1 F1 — authorizes the RESOLVED TARGET's space too, not
        // just the requesting page's (`page` above). Invoked by the
        // service after it resolves the target, before any mutation.
        authorizeTargetSpace: (targetSpaceId: string) =>
          this.assertCanManage(user, targetSpaceId),
      },
    );
  }

  @Post('unsupersede')
  @HttpCode(HttpStatus.OK)
  async unsupersede(
    @Body() dto: UnsupersedePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<OrvexPageMetaFields> {
    const page = await this.assertPageInWorkspace(dto.pageId, workspace.id);
    await this.assertCanManage(user, page.spaceId);

    return this.metadataService.unsupersedeAtomic(
      dto.pageId,
      dto.restoredStatus ?? PageStatus.PUBLISHED,
    );
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  async setStatus(
    @Body() dto: StatusPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @AuthMethod() authMethod: 'api_key' | undefined,
  ): Promise<OrvexPageMetaFields> {
    const page = await this.assertPageInWorkspace(dto.pageId, workspace.id);
    await this.assertCanManage(user, page.spaceId);

    return this.metadataService.setStatus(
      dto.pageId,
      dto.status as PageStatus,
      { archiveReason: dto.archiveReason },
      undefined,
      {
        authMethod,
        actorId: user.id,
        ratifyToken: undefined,
      },
    );
  }

  private async assertPageInWorkspace(pageId: string, workspaceId: string) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== workspaceId || page.deletedAt) {
      throw new NotFoundException({ error: 'PAGE_NOT_FOUND' });
    }
    return page;
  }

  private async assertCanManage(user: User, spaceId: string): Promise<void> {
    const ability = await this.spaceAbilityFactory.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }
}
