// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { BillingEntitlementPort } from './entitlement-billing.port';
import { Principal, EntitlementCheckResponse } from './entitlement.types';

/**
 * ENG-1382 fix pass 1 (F2, review1) — the field-for-field cap keys
 * `EntitlementCaps` mirrors. Kept as a literal list (not
 * `Object.keys<EntitlementCaps>` — TS types don't exist at runtime) so
 * `assertCapsShape` can verify EVERY cap field is present and numeric
 * before the response is trusted. Whenever `EntitlementCaps` in
 * `entitlement.types.ts` gains/loses a field, this list must move with it
 * (enforced by `entitlement-no-hardcoded-caps.spec.ts`'s sibling coverage
 * for this file, and by the fixture in this port's own spec exercising
 * every field).
 */
const REQUIRED_CAP_FIELDS = [
  'ai_monthly_budget_gbp',
  'embedding_monthly_budget_gbp',
  'curator_distillation_monthly',
  'trial_weekly_actions_advisory',
  'trial_weekly_actions_throttle',
  'demo_ai_actions',
  'wiki_max_pages',
  'wiki_storage_bytes_aggregate',
  'wiki_max_file_bytes',
  'wiki_max_files',
  'wiki_max_members',
  'wiki_history_retention_versions',
  'wiki_history_retention_days',
] as const;

/**
 * ENG-1382 fix pass 1 (F2, review1) — zero-trust validation of a 2xx
 * catalog body (ruling 5 / CS §10: never an unbounded allow on a malformed
 * upstream response). Before this guard, a 200 missing/mistyping `caps`
 * made `capValueForResource` return `undefined`, and
 * `EntitlementService.assertWithinQuota`'s `currentUsage >= undefined`
 * compare is always `false` — a silent, unbounded allow. This validates
 * the SHAPE only (never a cap VALUE, ❌#10) and throws on any defect so the
 * caller (`EntitlementService.resolve`) treats it exactly like a network
 * failure: fall back to a cached projection, else fail closed (AC7, 503).
 */
function assertValidEntitlementCheckResponse(
  body: unknown,
): asserts body is EntitlementCheckResponse {
  if (typeof body !== 'object' || body === null) {
    throw new Error(
      'ENG-1382: billing entitlement response was not a JSON object',
    );
  }

  const caps = (body as { caps?: unknown }).caps;
  if (typeof caps !== 'object' || caps === null) {
    throw new Error(
      'ENG-1382: billing entitlement response is missing a `caps` object',
    );
  }

  for (const field of REQUIRED_CAP_FIELDS) {
    const value = (caps as Record<string, unknown>)[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `ENG-1382: billing entitlement response caps.${field} is missing or not a finite number`,
      );
    }
  }
}

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

    const body: unknown = await response.json();
    assertValidEntitlementCheckResponse(body);
    return body;
  }
}
