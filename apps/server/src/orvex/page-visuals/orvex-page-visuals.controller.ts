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
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../database/types/kysely.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '../../database/types/entity.types';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import {
  ChangelogQueryDto,
  PageVisualsPageIdDto,
} from './dto/page-visuals.dto';
import {
  ChangelogResult,
  FreshnessResult,
  OrvexPageVisualsService,
  SubpageCardsResult,
} from './orvex-page-visuals.service';

/**
 * ENG-1376 — ported (re-authored, behavior-parity) from the fork's
 * `orvex-page-visuals.controller.ts#L37-L264` (P7 subpage-cards / freshness
 * / changelog projections). Thin read handler (CS §6): guard → CASL → ONE
 * query (delegated to {@link OrvexPageVisualsService}) → serialize. No
 * domain mutation lives here — these are pure reads.
 */
@Controller('orvex/page-visuals')
@UseGuards(JwtAuthGuard)
export class OrvexPageVisualsController {
  constructor(
    private readonly visualsService: OrvexPageVisualsService,
    private readonly spaceAbilityFactory: SpaceAbilityFactory,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  @Post('subpage-cards')
  @HttpCode(HttpStatus.OK)
  async subpageCards(
    @Body() dto: PageVisualsPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<SubpageCardsResult> {
    await this.authorizePageRead(dto.pageId, user, workspace);
    return this.visualsService.subpageCards(dto.pageId);
  }

  @Post('freshness')
  @HttpCode(HttpStatus.OK)
  async freshness(
    @Body() dto: PageVisualsPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<FreshnessResult> {
    await this.authorizePageRead(dto.pageId, user, workspace);
    return this.visualsService.freshness(dto.pageId);
  }

  @Post('changelog')
  @HttpCode(HttpStatus.OK)
  async changelog(
    @Body() dto: ChangelogQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<ChangelogResult> {
    await this.authorizePageRead(dto.pageId, user, workspace);
    return this.visualsService.changelog(dto.pageId, dto.limit);
  }

  /**
   * AC6 — JWT (via `@UseGuards(JwtAuthGuard)`) + CASL read guard, per-page
   * and per-workspace scoped. A page in a different workspace, or missing/
   * soft-deleted, yields `404 PAGE_NOT_FOUND` (no cross-tenant existence
   * leak) BEFORE any CASL check runs. A caller with no role in the page's
   * space (i.e. genuinely lacking `Read`) yields `403` — `SpaceAbilityFactory`
   * itself throws `NotFoundException` for a non-member, which we translate
   * to `Forbidden` here since the caller already knows the page exists (it
   * resolved in-workspace above); only the cross-workspace case gets the
   * existence-hiding 404.
   */
  private async authorizePageRead(
    pageId: string,
    user: User,
    workspace: Workspace,
  ): Promise<{ id: string; spaceId: string }> {
    const page = await this.db
      .selectFrom('pages')
      .select(['id', 'spaceId', 'workspaceId', 'deletedAt'])
      .where('id', '=', pageId)
      .executeTakeFirst();

    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException({ error: 'PAGE_NOT_FOUND' });
    }

    let ability;
    try {
      ability = await this.spaceAbilityFactory.createForUser(
        user,
        page.spaceId,
      );
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new ForbiddenException();
      }
      throw err;
    }

    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return { id: page.id, spaceId: page.spaceId };
  }
}
