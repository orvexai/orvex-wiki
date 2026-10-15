// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, Logger } from '@nestjs/common';
import { OrvexConfigService } from '../config/orvex-config.service';

/** The ONE downstream this credential is ever requested for. */
export const BILLING_SERVICE_TARGET = 'orvex-studio-billing';

/** Refresh this many seconds before `exp` so an in-flight call never expires. */
const EXPIRY_MARGIN_SECONDS = 15;

/** Hard ceiling on how long any one assertion is reused, whatever `exp` says. */
const MAX_REUSE_SECONDS = 90;

/**
 * fix/wiki-billing-delegated-credential — obtains the tenant-bound service
 * credential billing's `GET /v1/entitlements/{type}/{id}` requires
 * (`X-Orvex-Assertion`, aud=orvex-studio-billing, scope billing:read).
 *
 * The engine performs that read from contexts with NO user assertion
 * (identity's `/internal/principals/provision` call during `/v1/exchange`,
 * background quota checks), so it cannot forward a user's assertion.
 * Instead it asks identity's origin-locked `POST /internal/service-assertion`
 * — authenticated by the SAME engine<->identity seam secret
 * (`INTERNAL_API_BEARER_TOKEN`) the registry client already uses — for an
 * assertion bound to exactly ONE tenant. Identity fixes the scope; billing
 * refuses any path principal that is not that tenant.
 *
 * Assertions are cached per tenant for at most their lifetime minus a margin.
 * Neither the seam secret nor any assertion is ever logged.
 */
@Injectable()
export class BillingServiceCredentialProvider {
  private readonly logger = new Logger(BillingServiceCredentialProvider.name);
  private readonly cache = new Map<
    string,
    { assertion: string; refreshAt: number }
  >();

  constructor(
    private readonly config: OrvexConfigService,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** True when identity URL + seam secret are both configured. */
  isConfigured(): boolean {
    return !!this.config.identityUrl && !!this.config.internalApiBearerToken;
  }

  /**
   * Returns an assertion for `tenant`, or throws. Never returns an empty
   * string: a caller that cannot authenticate must fail (and fall back to its
   * cached projection) rather than call billing anonymously.
   */
  async assertionFor(tenant: string): Promise<string> {
    const hit = this.cache.get(tenant);
    if (hit && hit.refreshAt > this.now()) {
      return hit.assertion;
    }
    const identityUrl = this.config.identityUrl;
    const secret = this.config.internalApiBearerToken;
    if (!identityUrl || !secret) {
      throw new Error(
        'billing service credential unavailable: ORVEX_IDENTITY_URL or INTERNAL_API_BEARER_TOKEN is not configured',
      );
    }
    const res = await fetch(
      `${identityUrl.replace(/\/+$/, '')}/internal/service-assertion`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ tenant, target: BILLING_SERVICE_TARGET }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `billing service credential refused by identity with status ${res.status}`,
      );
    }
    const body = (await res.json()) as { assertion?: unknown };
    if (
      typeof body?.assertion !== 'string' ||
      body.assertion.split('.').length !== 3
    ) {
      throw new Error(
        'billing service credential response carried no assertion',
      );
    }
    this.cache.set(tenant, {
      assertion: body.assertion,
      refreshAt: this.refreshAt(body.assertion),
    });
    return body.assertion;
  }

  /** Drop a cached assertion (billing rejected it). */
  evict(tenant: string): void {
    this.cache.delete(tenant);
  }

  private refreshAt(assertion: string): number {
    const nowMs = this.now();
    const ceiling = nowMs + MAX_REUSE_SECONDS * 1000;
    try {
      const payload = JSON.parse(
        Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8'),
      ) as { exp?: unknown };
      if (typeof payload.exp === 'number') {
        return Math.min(ceiling, (payload.exp - EXPIRY_MARGIN_SECONDS) * 1000);
      }
    } catch {
      this.logger.debug(
        'billing service credential: unreadable exp, using reuse ceiling',
      );
    }
    return Math.min(ceiling, nowMs + 30_000);
  }
}
