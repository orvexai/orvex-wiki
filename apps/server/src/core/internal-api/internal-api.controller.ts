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
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { IsUUID } from 'class-validator';
import { InternalApiAuthGuard } from './internal-api-auth.guard';
import { InternalApiService } from './internal-api.service';
import { AclFilterDto } from './dto/internal-api.dto';

class WorkspaceUserQueryDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  userId: string;
}

class WorkspaceQueryDto {
  @IsUUID()
  workspaceId: string;
}

/**
 * InternalApiController (ENG-1957) — the engine-internal HTTP surface for
 * knowledge's ACL/export/resolve/ai-search seam (`internal/clients.Engine`
 * in `orvex-studio-knowledge`).
 *
 * PLACEMENT (AC5): sits OUTSIDE the `/api` global prefix (see
 * `orvex-global-prefix-exclude.ts`'s `internal/(.*)` entry) and behind
 * `InternalApiAuthGuard` (fail-closed shared bearer token) — NOT the
 * public/tenant-facing `JwtAuthGuard` session auth. This controller never
 * applies `JwtAuthGuard`, so the route is reached purely by
 * `InternalApiAuthGuard`; it is NOT reachable without a valid
 * `INTERNAL_API_BEARER_TOKEN` bearer (AC1/AC5).
 *
 * THIN HANDLER (CS §6): auth guard -> parse DTO -> one service call ->
 * shape response. All ACL/export/resolve/settings logic lives in
 * `InternalApiService`, which composes the engine's own existing
 * authorization primitives (never reimplements them).
 */
@UseGuards(InternalApiAuthGuard)
@Controller('internal')
export class InternalApiController {
  constructor(private readonly internalApiService: InternalApiService) {}

  /** AC1 — POST /internal/acl/filter */
  @HttpCode(HttpStatus.OK)
  @Post('acl/filter')
  async aclFilter(@Body() dto: AclFilterDto) {
    const pageIds = await this.internalApiService.filterAccessiblePages(
      dto.workspaceId,
      dto.userId,
      dto.pageIds,
    );
    return { pageIds };
  }

  /** AC2 — GET /internal/pages/{id}/export */
  @Get('pages/:id/export')
  async exportPage(
    @Param('id') pageId: string,
    @Query() query: WorkspaceUserQueryDto,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const { content } = await this.internalApiService.exportPage(
      query.workspaceId,
      query.userId,
      pageId,
    );
    // Explicit, never a mime-lookup fallback that could resolve to the SPA
    // catch-all's text/html (AC2's CI gate: Content-Type must never be
    // text/html).
    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    reply.send(content);
  }

  /** AC3 — GET /internal/pages/{id}/resolve */
  @HttpCode(HttpStatus.OK)
  @Get('pages/:id/resolve')
  async resolvePage(
    @Param('id') pageId: string,
    @Query() query: WorkspaceUserQueryDto,
  ) {
    return this.internalApiService.resolvePage(
      query.workspaceId,
      query.userId,
      pageId,
    );
  }

  /** AC4 — GET /internal/settings/ai-search */
  @HttpCode(HttpStatus.OK)
  @Get('settings/ai-search')
  async aiSearchSettings(@Query() query: WorkspaceQueryDto) {
    return this.internalApiService.getAiSearchSettings(query.workspaceId);
  }
}
