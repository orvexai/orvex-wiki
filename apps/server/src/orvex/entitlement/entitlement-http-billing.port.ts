// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { BillingEntitlementPort } from './entitlement-billing.port';
import { Principal, EntitlementCheckResponse } from './entitlement.types';

/**
 * Real adapter for `BillingEntitlementPort` — calls
 * `orvex-studio-billing`'s `GET /v1/entitlements/{principal_type}/{principal_id}`
 * (ENG-1431). No Stripe client, no cap VALUES here (❌#8, ❌#10) — a plain
 * typed HTTP read of billing's projection.
 *
 * The base URL is injected via `ORVEX_BILLING_API_URL` (CS ❌#8 — no inline
 * credentialed client; there are no credentials on this read, but the
 * endpoint itself is still env-configured, never hard-coded).
 */
@Injectable()
export class HttpBillingEntitlementPort implements BillingEntitlementPort {
  private readonly logger = new Logger(HttpBillingEntitlementPort.name);

  constructor(private readonly environmentService: EnvironmentService) {}

  async checkEntitlement(
    principal: Principal,
  ): Promise<EntitlementCheckResponse> {
    const baseUrl = this.environmentService.getBillingApiUrl();
    if (!baseUrl) {
      throw new Error(
        'ENG-1382: ORVEX_BILLING_API_URL is not configured — billing entitlement port unreachable',
      );
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/v1/entitlements/${encodeURIComponent(
      principal.principal_type,
    )}/${encodeURIComponent(principal.principal_id)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
    } catch (err) {
      this.logger.warn(`billing entitlement fetch failed: ${err}`);
      throw err;
    }

    if (!response.ok) {
      throw new Error(
        `ENG-1382: billing entitlement check failed with status ${response.status}`,
      );
    }

    return (await response.json()) as EntitlementCheckResponse;
  }
}
