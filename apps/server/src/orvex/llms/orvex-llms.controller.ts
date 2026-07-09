// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { User } from '../../database/types/entity.types';
import { OrvexBearerAuthGuard } from '../../core/api-key/orvex-bearer-auth.guard';
import { OrvexModulesEnabledGuard } from './orvex-modules-enabled.guard';
import { OrvexLlmsService } from './orvex-llms.service';

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

/**
 * OrvexLlmsController (ENG-1492 / F29) — the token-scope-filtered LLM
 * discovery surface, ported from the docmost fork's `orvex/llms` leg.
 *
 * Guard order matters (both fail-closed, evaluated left-to-right):
 * {@link OrvexModulesEnabledGuard} first (AC6 — 404 byte-parity when the
 * orvex module tree is off), THEN {@link OrvexBearerAuthGuard} (AC5 — 401
 * on no/invalid bearer). Every handler is a thin 3-step pass-through
 * (authn via the guards/decorator -> one `OrvexLlmsService` call -> marshal
 * as Markdown) — all ACL composition + DfM conversion lives in
 * {@link OrvexLlmsService} (CS §12 ❌1: no domain logic in the handler).
 */
@UseGuards(OrvexModulesEnabledGuard, OrvexBearerAuthGuard)
@Controller('orvex')
export class OrvexLlmsController {
  constructor(private readonly llmsService: OrvexLlmsService) {}

  /**
   * AC1 — `GET /api/orvex/llms.txt`: workspace sitemap, cap 500.
   * `@SkipTransform` — the response body is raw Markdown text, never the
   * global `{data, success, status}` JSON envelope (CS §10; matches
   * `RobotsTxtController`'s precedent for a non-JSON discovery surface).
   */
  @SkipTransform()
  @Header('Content-Type', MARKDOWN_CONTENT_TYPE)
  @Get('llms.txt')
  llmsTxt(@AuthUser() user: User): Promise<string> {
    return this.llmsService.llmsTxt(user);
  }

  /** AC3 — `GET /api/orvex/llms-full.txt`: hydrated bodies, cap 100. */
  @SkipTransform()
  @Header('Content-Type', MARKDOWN_CONTENT_TYPE)
  @Get('llms-full.txt')
  llmsFullTxt(@AuthUser() user: User): Promise<string> {
    return this.llmsService.llmsFullTxt(user);
  }

  /** AC4 — `GET /api/orvex/pages/:pageId/page.md`: per-page DfM export. */
  @SkipTransform()
  @Header('Content-Type', MARKDOWN_CONTENT_TYPE)
  @Get('pages/:pageId/page.md')
  pageMarkdown(
    @AuthUser() user: User,
    @Param('pageId') pageId: string,
  ): Promise<string> {
    return this.llmsService.pageMarkdown(user, pageId);
  }
}
