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
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '../../database/types/entity.types';
import { PageRepo } from '../../database/repos/page/page.repo';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import {
  DriftedStamp,
  ENGINE_DRIFT_HEAD_SENTINEL,
  PageMetaVerificationService,
} from './page-meta-verification.service';

/** wiki-api's drift StampVerification body. `verifiedAgainst` is the HEAD
 * identifier (the page content hash in "sha" mode); `bodyHash` is the rendered
 * body hash (equal to it in this unified model); `eventKind` is audit metadata. */
class StampVerificationDto {
  @IsString()
  verifiedAgainst!: string;

  @IsOptional()
  @IsString()
  bodyHash?: string;

  @IsOptional()
  @IsString()
  verifiedAt?: string;

  @IsOptional()
  @IsString()
  eventKind?: string;
}

/**
 * amazing-MCP drift-502 fix — the engine leg for wiki-api's doc-governance
 * drift verifier (`GET/POST /v1/wiki/{loc}/drift`). Those routes 502'd because
 * this controller never existed: `PageMetaVerificationService` shipped the
 * `orvex_page_meta` stamp accessor (ENG-1379) but nothing exposed it over HTTP,
 * so wiki-api's `DriftClient` calls (`/api/orvex/page-meta/:id/verify-context`,
 * `.../:id/stamp`, `.../stamps`) hit a 404 → surfaced as 502.
 *
 * Thin (CS §12 ❌1): authn/z (JwtAuthGuard + workspace scope + per-page ACL)
 * and a single service call each. Workspace-scoped throughout (a page outside
 * the caller's tenant is a no-leak 404); the caller's own view/edit ACL is the
 * only authorization decision.
 *
 * `@SkipTransform()` on every handler — wiki-api's `DriftClient`
 * (internal/store/engine) decodes these BARE (`json.Decode(&VerifyContext{})`
 * / `{headSha, pages}`), NOT through the `{data,success,status}` envelope the
 * other engine clients unwrap, so these routes must return the raw shape.
 */
@Controller('orvex/page-meta')
@UseGuards(JwtAuthGuard)
export class OrvexPageMetaDriftController {
  constructor(
    private readonly verificationService: PageMetaVerificationService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbilityFactory: SpaceAbilityFactory,
  ) {}

  /**
   * The one-round-trip verify seed: `{canEdit, currentBody, headSha,
   * lastVerifiedHash, lastVerifiedFound}`. `canEdit` comes from the caller's
   * own per-page ACL (never a self-declared header); a page the caller may not
   * view surfaces as a no-leak 403/404.
   */
  @Get(':pageId/verify-context')
  @SkipTransform()
  async verifyContext(
    @Param('pageId') pageId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });
    }

    const ability = await this.spaceAbilityFactory.createForUser(
      user,
      page.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      // No-leak: a non-viewer sees the same 403 shape, no body revealed.
      throw new ForbiddenException();
    }
    const canEdit = ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);

    const seed = await this.verificationService.getVerifyContext(
      pageId,
      workspace.id,
    );
    if (!seed) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });
    }

    return { canEdit, ...seed };
  }

  /**
   * Persists the verification stamp (`verified_against`/`verified_at`) for a
   * page the caller may EDIT. In the unified "sha" model `verified_against` is
   * the current content hash, so a later edit reads as drift.
   */
  @Post(':pageId/stamp')
  @HttpCode(HttpStatus.OK)
  @SkipTransform()
  async stamp(
    @Param('pageId') pageId: string,
    @Body() dto: StampVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ ok: true }> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });
    }

    // A stamp mutates governance state — require edit, not just view.
    const ability = await this.spaceAbilityFactory.createForUser(
      user,
      page.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    await this.verificationService.stampVerification({
      pageId,
      verifiedAgainst: dto.verifiedAgainst,
      verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : new Date(),
    });

    return { ok: true };
  }

  /**
   * Lists the workspace's DRIFTED pages for the read-only HEAD comparison
   * (`GetDrift`). Returns `{headSha, pages}` where `headSha` is a sentinel that
   * never equals a real content hash and `pages` are exactly the drifted rows
   * (see the service + sentinel docstrings for why the standalone-wiki drift
   * mode cannot mint a real global HEAD SHA).
   */
  @Get('stamps')
  @SkipTransform()
  async stamps(
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ headSha: string; pages: DriftedStamp[] }> {
    const pages = await this.verificationService.listDriftedStamps(
      workspace.id,
    );
    return { headSha: ENGINE_DRIFT_HEAD_SENTINEL, pages };
  }
}
