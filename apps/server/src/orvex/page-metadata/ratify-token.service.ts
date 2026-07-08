// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  RatifyTokenPayload,
  TokenVerifyResult,
} from './ratify-token.types';

/**
 * ENG-1445 — server-minted, HMAC-`APP_SECRET`-keyed `RATIFY_TOKEN` (AC1-AC3).
 *
 * Ported design decision (4e, already ratified in the fork): a stateless
 * signed token (option b) over an opaque DB-stored token (option a) — no
 * revoke store is needed within the 30-minute TTL, so mint/verify never
 * touch the database (CS §3 deep module: two methods, `issue`/`verify`,
 * neither a pass-through — `verify` does real timing-safe signature +
 * scope + expiry work, never just decodes).
 *
 * Security invariant (the whole point of this ticket): the mint path
 * requires the server-held `APP_SECRET` (read once at construction via
 * `EnvironmentService`, never inlined/hardcoded — CS §7 seam, ❌#8 guard).
 * An `api_key` (agent) caller can never reach this constructor with a
 * different secret, so it can never forge a token that `verify` accepts.
 * `APP_SECRET` is validated workspace-wide at boot (`EnvironmentVariables
 * .APP_SECRET`, `@MinLength(32)`) — this constructor re-asserts the
 * invariant defensively so a future refactor that bypasses that validator
 * still fails fast here rather than minting an effectively-unsigned token.
 */
@Injectable()
export class RatifyTokenService {
  static readonly TOKEN_PREFIX = 'rt1';
  static readonly HMAC_DOMAIN = 'orvex.ratify.v1';
  static readonly RATIFY_TOKEN_TTL_MS = 30 * 60 * 1000;

  private readonly secret: string;

  constructor(private readonly environmentService: EnvironmentService) {
    const appSecret = this.environmentService.getAppSecret();
    if (!appSecret || appSecret.length < 32) {
      // AC1 NFR — never mint under a missing/too-short secret. Hard
      // startup failure, never a silent unsigned token.
      throw new Error(
        'RatifyTokenService requires a real APP_SECRET (>= 32 chars)',
      );
    }
    this.secret = appSecret;
  }

  /**
   * AC1 — mints `token = rt1.<payloadB64>.<sig>` where
   * `sig = HMAC_SHA256(APP_SECRET, "orvex.ratify.v1." + payloadB64)`.
   * `now`/`ttlMs` are injectable so callers (and tests, AC3) never depend
   * on wall-clock (❌#9 guard).
   */
  issue(input: {
    pageId: string;
    workspaceId: string;
    confirmingUserId: string;
    ttlMs?: number;
    now?: number;
  }): { token: string; expiresAt: number } {
    const now = input.now ?? Date.now();
    const ttlMs = input.ttlMs ?? RatifyTokenService.RATIFY_TOKEN_TTL_MS;
    const payload: RatifyTokenPayload = {
      pageId: input.pageId,
      workspaceId: input.workspaceId,
      confirmingUserId: input.confirmingUserId,
      expiresAt: now + ttlMs,
    };
    const payloadB64 = encodePayload(payload);
    const sig = this.sign(payloadB64);
    return {
      token: `${RatifyTokenService.TOKEN_PREFIX}.${payloadB64}.${sig}`,
      expiresAt: payload.expiresAt,
    };
  }

  /**
   * AC2/AC3 — timing-safe, scope-bound, expiry-enforced verify. Never
   * throws-with-stack: every rejection is a typed `{ ok: false, reason }`.
   * Buffers of unequal length never reach `timingSafeEqual` (which throws
   * on length mismatch) — the length check itself short-circuits to a
   * typed `invalid` result.
   */
  verify(
    token: unknown,
    expectations: {
      expectPageId: string;
      expectWorkspaceId: string;
      now?: number;
    },
  ): TokenVerifyResult<RatifyTokenPayload> {
    if (typeof token !== 'string') {
      return { ok: false, reason: 'malformed' };
    }
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== RatifyTokenService.TOKEN_PREFIX) {
      return { ok: false, reason: 'malformed' };
    }
    const [, payloadB64, sig] = parts;

    const expectedSig = this.sign(payloadB64);
    if (!constantTimeEquals(sig, expectedSig)) {
      return { ok: false, reason: 'invalid' };
    }

    let payload: RatifyTokenPayload;
    try {
      payload = decodePayload(payloadB64);
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    const now = expectations.now ?? Date.now();
    if (payload.expiresAt <= now) {
      return { ok: false, reason: 'expired' };
    }

    if (
      payload.pageId !== expectations.expectPageId ||
      payload.workspaceId !== expectations.expectWorkspaceId
    ) {
      return { ok: false, reason: 'invalid' };
    }

    return { ok: true, payload };
  }

  private sign(payloadB64: string): string {
    return createHmac('sha256', this.secret)
      .update(`${RatifyTokenService.HMAC_DOMAIN}.${payloadB64}`)
      .digest('base64url');
  }
}

export function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodePayload<T>(payloadB64: string): T {
  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
}

/**
 * Length-safe, timing-safe string compare. `timingSafeEqual` throws on
 * unequal-length buffers, so an unequal-length pair is rejected via the
 * length check BEFORE reaching it — this itself does not leak timing
 * beyond "lengths differ", which is not secret (signatures are
 * fixed-length under a fixed algorithm; only a malformed/tampered token
 * hits this branch).
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
