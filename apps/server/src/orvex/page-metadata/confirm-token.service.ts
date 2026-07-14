// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable } from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  constantTimeEquals,
  decodePayload,
  encodePayload,
} from './ratify-token.service';
import {
  ConfirmTokenAction,
  ConfirmTokenPayload,
  TokenVerifyResult,
} from './ratify-token.types';
import { createHmac } from 'crypto';

/**
 * ENG-1445 AC4 — server-minted, HMAC-`APP_SECRET`-keyed, ACTION-scoped
 * `CONFIRM_TOKEN` for destructive operations (`supersede` | `bulk_delete`).
 *
 * Sibling of `RatifyTokenService` (same stateless-HMAC design, own HMAC
 * domain string so a `RATIFY_TOKEN` can never be replayed as a
 * `CONFIRM_TOKEN` or vice versa). The extra dimension over
 * `RatifyTokenService` is the `action` scope: a token minted for
 * `bulk_delete` MUST fail verification when presented at a `supersede`
 * chokepoint, and vice versa (AC4).
 */
@Injectable()
export class ConfirmTokenService {
  static readonly TOKEN_PREFIX = 'ct1';
  static readonly HMAC_DOMAIN = 'orvex.confirm.v1';
  static readonly CONFIRM_TOKEN_TTL_MS = 30 * 60 * 1000;

  private readonly secret: string;

  constructor(private readonly environmentService: EnvironmentService) {
    const appSecret = this.environmentService.getAppSecret();
    if (!appSecret || appSecret.length < 32) {
      throw new Error(
        'ConfirmTokenService requires a real APP_SECRET (>= 32 chars)',
      );
    }
    this.secret = appSecret;
  }

  issue(input: {
    workspaceId: string;
    action: ConfirmTokenAction;
    scopeId: string;
    confirmingUserId: string;
    ttlMs?: number;
    now?: number;
  }): { token: string; expiresAt: number } {
    const now = input.now ?? Date.now();
    const ttlMs = input.ttlMs ?? ConfirmTokenService.CONFIRM_TOKEN_TTL_MS;
    const payload: ConfirmTokenPayload = {
      workspaceId: input.workspaceId,
      action: input.action,
      scopeId: input.scopeId,
      confirmingUserId: input.confirmingUserId,
      expiresAt: now + ttlMs,
    };
    const payloadB64 = encodePayload(payload);
    const sig = this.sign(payloadB64);
    return {
      token: `${ConfirmTokenService.TOKEN_PREFIX}.${payloadB64}.${sig}`,
      expiresAt: payload.expiresAt,
    };
  }

  /**
   * AC4 — verifies scope AND `expectations.expectAction`. A token minted
   * for a different action is rejected as `invalid`, never silently
   * accepted for "close enough" actions.
   */
  verify(
    token: unknown,
    expectations: {
      expectWorkspaceId: string;
      expectAction: ConfirmTokenAction;
      expectScopeId: string;
      now?: number;
    },
  ): TokenVerifyResult<ConfirmTokenPayload> {
    if (typeof token !== 'string') {
      return { ok: false, reason: 'malformed' };
    }
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== ConfirmTokenService.TOKEN_PREFIX) {
      return { ok: false, reason: 'malformed' };
    }
    const [, payloadB64, sig] = parts;

    const expectedSig = this.sign(payloadB64);
    if (!constantTimeEquals(sig, expectedSig)) {
      return { ok: false, reason: 'invalid' };
    }

    let payload: ConfirmTokenPayload;
    try {
      payload = decodePayload<ConfirmTokenPayload>(payloadB64);
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    const now = expectations.now ?? Date.now();
    if (payload.expiresAt <= now) {
      return { ok: false, reason: 'expired' };
    }

    if (
      payload.workspaceId !== expectations.expectWorkspaceId ||
      payload.scopeId !== expectations.expectScopeId ||
      payload.action !== expectations.expectAction
    ) {
      return { ok: false, reason: 'invalid' };
    }

    return { ok: true, payload };
  }

  private sign(payloadB64: string): string {
    return createHmac('sha256', this.secret)
      .update(`${ConfirmTokenService.HMAC_DOMAIN}.${payloadB64}`)
      .digest('base64url');
  }
}
