// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';

import { EnvironmentService } from '../../integrations/environment/environment.service';
import { setAuthCookie } from '../auth/auth-cookie.helper';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { SessionExchangeRequestDto } from '../../orvex/http/dto/session-exchange.dto';
import { OrvexSessionMintService } from './orvex-session-mint.service';

/**
 * FR-W6 / A-AUTH — `POST /api/orvex/session/exchange`: consume an
 * identity-minted exchange token and mint an engine session.
 *
 * PUBLIC by design (`security: []` in the contract): this is the entry that
 * ESTABLISHES the session, so it cannot itself require one. No `JwtAuthGuard`,
 * no internal-bearer guard — the token in the body is the sole credential, and
 * every failure to verify/resolve it is a hard 401 (the mint service's
 * deny-by-default gates).
 *
 * DELIVERY (the A-THIN fold-in): the engine session is delivered as the upstream
 * Docmost `authToken` session cookie (the SAME `setAuthCookie` chokepoint the
 * password-login and password-reset paths use), and the result body mirrors the
 * verified principal scope (`SessionExchangeResult{sub, workspaceId, expiresAt}`).
 * `@SkipTransform` keeps the body the bare contract shape (not the global
 * `{data, success, status}` envelope) so a consumer decodes the fields directly.
 *
 * THIN HANDLER (CS §6): parse DTO → one service call → set cookie → shape body.
 * All verify/resolve/mint logic lives in {@link OrvexSessionMintService}.
 */
@Controller('orvex/session')
export class OrvexSessionExchangeController {
  constructor(
    private readonly mintService: OrvexSessionMintService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Post('exchange')
  async exchange(
    @Body() dto: SessionExchangeRequestDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<{ sub: string; workspaceId: string; expiresAt: string }> {
    const minted = await this.mintService.mintSession(dto.exchangeToken);
    setAuthCookie(res, minted.accessToken, this.environmentService);
    return {
      sub: minted.sub,
      workspaceId: minted.workspaceId,
      expiresAt: minted.expiresAt.toISOString(),
    };
  }
}
