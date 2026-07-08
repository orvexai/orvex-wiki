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
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { PageStatus } from '@orvex/extensions';
import { OrvexPageMetadataService } from './orvex-page-metadata.service';
import { PromotePageDto } from './dto/promote-page.dto';

/**
 * ENG-1445 AC5/AC6 — the real promote-to-`canonical` HTTP chokepoint
 * (review1 F1: "no promote chokepoint consults getRequired()").
 *
 * Thin (CS §12 ❌1): authn/z + read the caller's `AuthMethod`, then a single
 * `OrvexPageMetadataService.setStatus` call — `enforceRatifyGate` (the real
 * gate logic) lives entirely in the service, not here.
 */
@Controller('pages/promote')
@UseGuards(JwtAuthGuard)
export class OrvexPagePromoteController {
  constructor(
    private readonly metadataService: OrvexPageMetadataService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbilityFactory: SpaceAbilityFactory,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async promote(
    @Body() dto: PromotePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @AuthMethod() authMethod: 'api_key' | undefined,
  ): Promise<{ status: PageStatus }> {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
      throw new NotFoundException({ error: 'PAGE_NOT_FOUND' });
    }

    const ability = await this.spaceAbilityFactory.createForUser(
      user,
      page.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const fields = await this.metadataService.setStatus(
      dto.pageId,
      PageStatus.CANONICAL,
      undefined,
      undefined,
      {
        authMethod,
        actorId: user.id,
        ratifyToken: dto.ratifyToken,
        forceSelfRatify: dto.forceSelfRatify,
        forceReason: dto.forceReason,
      },
    );

    return { status: fields.status };
  }
}
