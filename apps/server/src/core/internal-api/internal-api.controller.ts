// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalApiAuthGuard } from './internal-api-auth.guard';
import { InternalApiService } from './internal-api.service';
import { AclFilterDto, TenantQueryDto } from './dto/internal-api.dto';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

/**
 * InternalApiController (ENG-1957; ENG-1559 principal-resolution) — the
 * engine-internal HTTP surface for knowledge's ACL/export/resolve/ai-search
 * seam (`internal/clients.Engine` in `orvex-studio-knowledge`).
 *
 * PLACEMENT (AC5): sits OUTSIDE the `/api` global prefix (see
 * `orvex-global-prefix-exclude.ts`'s `internal/(.*)` entry) and behind
 * `InternalApiAuthGuard` (fail-closed shared bearer token) — NOT the
 * public/tenant-facing `JwtAuthGuard` session auth. This controller never
 * applies `JwtAuthGuard`, so the route is reached purely by
 * `InternalApiAuthGuard`; it is NOT reachable without a valid
 * `INTERNAL_API_BEARER_TOKEN` bearer (AC1/AC5).
 *
 * RULED CONTRACT (ENG-1559, 2026-07-12, fork (a)): the wire surface is the
 * IdP-agnostic PRINCIPAL the consumer sends — `{subject, tenant}` on
 * `acl/filter`, `?tenant=` on the workspace-scoped reads — and the engine
 * (sole owner of the workspace/user mapping) resolves it internally. Response
 * shapes match the consumer's decode types exactly: `{allowed}`, `{text_repr}`,
 * `{title, content}`, `{enabled}`.
 *
 * RAW BODY (@SkipTransform, per handler): the sole consumer decodes these BARE
 * shapes off the top level, so every handler opts OUT of the global
 * `TransformHttpResponseInterceptor`'s `{data, success, status}` envelope —
 * the same pattern the other machine-facing surfaces use (`/metrics`,
 * `/health`, `/llms.txt`). Without this the consumer sees `{data:{...}}` and
 * decodes every field as empty (fail-closed for the whole seam). The metadata
 * is read via `reflector.get(getHandler())`, so it MUST sit on each method, not
 * the class.
 *
 * THIN HANDLER (CS §6): auth guard -> parse DTO -> one service call -> shape
 * response. All resolution + ACL/export logic lives in `InternalApiService`.
 */
@UseGuards(InternalApiAuthGuard)
@Controller('internal')
export class InternalApiController {
  constructor(private readonly internalApiService: InternalApiService) {}

  /** AC1 — POST /internal/acl/filter — `{subject, tenant, page_ids}` -> `{allowed}` */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Post('acl/filter')
  async aclFilter(@Body() dto: AclFilterDto) {
    const allowed = await this.internalApiService.filterAccessiblePages(
      dto.tenant,
      dto.subject,
      dto.page_ids,
    );
    return { allowed };
  }

  /** AC2 — GET /internal/pages/{id}/export?tenant= -> `{text_repr}` (workspace-scoped) */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Get('pages/:id/export')
  async exportPage(@Param('id') pageId: string, @Query() query: TenantQueryDto) {
    const text_repr = await this.internalApiService.exportPage(
      query.tenant,
      pageId,
    );
    return { text_repr };
  }

  /** AC3 — GET /internal/pages/{id}/resolve?tenant= -> `{title, content}` (workspace-scoped) */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Get('pages/:id/resolve')
  async resolvePage(
    @Param('id') pageId: string,
    @Query() query: TenantQueryDto,
  ) {
    return this.internalApiService.resolvePage(query.tenant, pageId);
  }

  /** AC4 — GET /internal/settings/ai-search?tenant= -> `{enabled}` */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Get('settings/ai-search')
  async aiSearchSettings(@Query() query: TenantQueryDto) {
    const enabled = await this.internalApiService.getAiSearchEnabled(
      query.tenant,
    );
    return { enabled };
  }
}
