// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '../../database/types/entity.types';
import { PageRepo } from '../../database/repos/page/page.repo';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { OrvexModulesEnabledGuard } from '../llms/orvex-modules-enabled.guard';
import {
  ApplyDocumentRequestDto,
  ApplyOpsRequestDto,
} from '../http/dto/apply-ops.dto';
import {
  ApplyOpsService,
  ApplyOpsSettledEnvelope,
} from './apply-ops.service';

/**
 * ENG-1652 — the real `POST /orvex/pages/:pageId/apply-ops` write
 * primitive, replacing the `orvexApplyOps` 501 stub.
 *
 * Thin (CS §12 ❌1): authn/z + a single `ApplyOpsService.applyOps` call —
 * the batch grammar, CAS/idempotency, and settled-envelope logic all live
 * in the service. Guarded by `OrvexModulesEnabledGuard` for the same
 * DB-dependency reason `OrvexLlmsModule`'s routes are (this controller
 * needs `PageRepo`/`@InjectKysely()`, so it cannot live in the DB-less
 * `OrvexHttpModule` mounted by `OrvexRootModule.register()` — see that
 * guard's docstring): flag off -> 404 (AC6 vanilla byte-parity), flag on ->
 * pass through to `JwtAuthGuard`.
 */
@Controller('orvex/pages')
@UseGuards(OrvexModulesEnabledGuard, JwtAuthGuard)
export class OrvexApplyOpsController {
  constructor(
    private readonly applyOpsService: ApplyOpsService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbilityFactory: SpaceAbilityFactory,
  ) {}

  @Post(':pageId/apply-ops')
  @HttpCode(HttpStatus.OK)
  async applyOps(
    @Param('pageId') pageId: string,
    @Body() dto: ApplyOpsRequestDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ApplyOpsSettledEnvelope> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });
    }

    const ability = await this.spaceAbilityFactory.createForUser(
      user,
      page.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.applyOpsService.applyOps(
      pageId,
      workspace.id,
      user.id,
      dto,
      idempotencyKey,
    );
  }

  /**
   * amazing-MCP whole-doc apply-ops-on-an-existing-document primitive — the
   * engine leg wiki-api's `PUT /v1/wiki/{loc}` (save_page update/upsert)
   * composes over. Same thin authn/z posture as `applyOps` above (CASL Edit +
   * workspace scope); the replace/append/prepend merge, CAS/idempotency, and
   * settled-envelope logic all live in `ApplyOpsService.applyDocument`.
   */
  @Post(':pageId/apply-doc')
  @HttpCode(HttpStatus.OK)
  async applyDocument(
    @Param('pageId') pageId: string,
    @Body() dto: ApplyDocumentRequestDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ApplyOpsSettledEnvelope> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND' });
    }

    const ability = await this.spaceAbilityFactory.createForUser(
      user,
      page.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.applyOpsService.applyDocument(
      pageId,
      workspace.id,
      user.id,
      {
        ifVersion: dto.ifVersion,
        document: dto.document as never,
        writeOperation: dto.writeOperation,
      },
      idempotencyKey,
    );
  }
}
