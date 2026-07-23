// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

import { EnvironmentService } from '../../integrations/environment/environment.service';
import { setAuthCookie } from '../auth/auth-cookie.helper';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { SessionExchangeRequestDto } from '../../orvex/http/dto/session-exchange.dto';
import { OrvexSessionMintService } from './orvex-session-mint.service';

/**
 * FR-W6 / A-AUTH / ADR-0049 — `POST /api/orvex/session/exchange`: consume an
 * identity-issued credential and mint an engine session.
 *
 * PUBLIC by design (`security: []` in the contract): this is the entry that
 * ESTABLISHES the session, so it cannot itself require one. No `JwtAuthGuard`,
 * no internal-bearer guard — the credential is the sole authority, and every
 * failure to verify/resolve it is a hard 401 (the mint service's deny-by-default
 * gates). Because the route is FA-EXEMPT (Traefik does NOT inject/sanitize the
 * assertion here), an `X-Orvex-Assertion` presented on this endpoint is trusted
 * ONLY through the mint service's full cryptographic verify — a forged header is
 * rejected exactly like a forged body token.
 *
 * TWO CREDENTIALS (dual-accept, ADR-0049 S2S step 1):
 *  - `X-Orvex-Assertion` header (PREFERRED) — an ES256 edge assertion
 *    (`aud=orvex-wiki`) the caller obtained from identity's delegation-exchange;
 *    verified locally against identity's internal JWKS. This is the path
 *    wiki-api/ai switch to so the raw caller bearer can be edge-stripped.
 *  - `exchangeToken` body field (TRANSIENT) — the pre-ADR-0049 opaque token,
 *    verified by a per-request introspect. Retained only for the migration
 *    window; removed (hard cut) once every upstream sends an assertion.
 * When BOTH are present the assertion wins (it is the strictly-verified,
 * bearer-independent credential the fleet is converging on).
 *
 * DELIVERY (the A-THIN fold-in): the engine session is delivered as the upstream
 * Docmost `authToken` session cookie (the SAME `setAuthCookie` chokepoint the
 * password-login and password-reset paths use), and the result body mirrors the
 * verified principal scope (`SessionExchangeResult{sub, workspaceId, expiresAt}`).
 * `@SkipTransform` keeps the body the bare contract shape (not the global
 * `{data, success, status}` envelope) so a consumer decodes the fields directly.
 *
 * THIN HANDLER (CS §6): pick the credential → one service call → set cookie →
 * shape body. All verify/resolve/mint logic lives in {@link OrvexSessionMintService}.
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
    @Headers('x-orvex-assertion') assertionHeader: string | undefined,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<{ sub: string; workspaceId: string; expiresAt: string }> {
    const assertion = assertionHeader?.trim();
    const minted = assertion
      ? await this.mintService.mintSessionFromAssertion(assertion)
      : await this.mintService.mintSession(this.requireExchangeToken(dto));
    setAuthCookie(res, minted.accessToken, this.environmentService);
    return {
      sub: minted.sub,
      workspaceId: minted.workspaceId,
      expiresAt: minted.expiresAt.toISOString(),
    };
  }

  /**
   * The introspect (transient) path requires a non-blank `exchangeToken`. The
   * DTO field is now optional (an assertion-path caller sends no body token), so
   * a request presenting NEITHER credential is a deny-by-default 401 here rather
   * than a 400 — a missing credential is an auth failure, not a schema error.
   */
  private requireExchangeToken(dto: SessionExchangeRequestDto): string {
    const token = dto.exchangeToken?.trim();
    if (!token) {
      throw new UnauthorizedException('no session credential presented');
    }
    return token;
  }
}
