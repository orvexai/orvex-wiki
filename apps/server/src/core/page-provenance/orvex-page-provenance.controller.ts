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
import { PageService } from '../../core/page/services/page.service';
import { ContentFormat } from '../../core/page/dto/create-page.dto';
import { OrvexPageProvenanceService } from './orvex-page-provenance.service';
import { SetProvenanceDto } from './dto/set-provenance.dto';

/**
 * OrvexPageProvenanceController — human-facing provenance surface.
 *
 * Currently exposes the verify endpoint: a writer-or-above human marks a
 * page as `human_verified`. The AI/agent provenance writes (`ai_produced` /
 * `ai_edited`) happen server-side through {@link OrvexPageProvenanceService}
 * and are NOT exposed here.
 */
@Controller('pages/provenance')
@UseGuards(JwtAuthGuard)
export class OrvexPageProvenanceController {
  constructor(
    private readonly provenanceService: OrvexPageProvenanceService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbilityFactory: SpaceAbilityFactory,
    private readonly pageService: PageService,
  ) {}

  /**
   * POST /api/pages/provenance/verify
   *
   * Human verification. Gated to writer+ (Manage Page) via CASL. Strips
   * AI-authored marks from the current content, flips provenance_status to
   * human_verified, and persists the stripped content.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() dto: SetProvenanceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @AuthMethod() authMethod: 'api_key' | undefined,
  ): Promise<{ provenanceStatus: 'human_verified' }> {
    // AC3 — human_verified MUST be unreachable by any agent (api_key caller).
    // JwtAuthGuard accepts api_key JWTs (a valid signature = a valid
    // session), so we must explicitly reject them here — only a real human
    // browser session may certify a page as human_verified.
    if (authMethod === 'api_key') {
      throw new ForbiddenException({
        error: 'HUMAN_REQUIRED',
        message:
          'human_verified can only be set by a human browser session. ' +
          'An api_key caller cannot certify a page as human_verified.',
      });
    }

    const page = await this.pageRepo.findById(dto.pageId, {
      includeContent: true,
    });
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

    const { contentJson } = await this.provenanceService.verify(
      dto.pageId,
      { id: user.id, workspaceId: workspace.id },
      (page as any).content ?? null,
    );

    // Persist the stripped content through the Yjs collab gateway (the
    // canonical store), NOT a raw page.content column write — the live
    // ydoc would otherwise overwrite the strip on next load.
    if (contentJson != null) {
      await this.pageService.updatePageContent(
        dto.pageId,
        contentJson,
        'replace',
        'json' as ContentFormat,
        user,
      );
    }

    return { provenanceStatus: 'human_verified' };
  }
}
