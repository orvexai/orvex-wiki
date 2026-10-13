// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  BillingEntitlementPort,
  BillingUnconfiguredError,
} from './entitlement-billing.port';
import { Principal, EntitlementCheckResponse } from './entitlement.types';
import { BillingServiceCredentialProvider } from './billing-service-credential';

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

/** Billing statuses meaning "this assertion is no good" → drop the cached one. */
const CREDENTIAL_REJECTED_STATUSES: ReadonlySet<number> = new Set([
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.MISDIRECTED,
]);

/**
 * Real adapter for `BillingEntitlementPort` — calls
 * `orvex-studio-billing`'s `GET /v1/entitlements/{principal_type}/{principal_id}`
 * (ENG-1431). No Stripe client, no cap VALUES here (❌#8, ❌#10) — a plain
 * typed HTTP read of billing's projection.
 *
 * The base URL is injected via `ORVEX_BILLING_API_URL` (CS ❌#8 — no inline
 * credentialed client; the endpoint is env-configured, never hard-coded).
 *
 * fix/wiki-billing-delegated-credential: billing has required a verified
 * `X-Orvex-Assertion` with billing:read on this route since d2d459b, so an
 * anonymous call 401s and broke every new user's setup. Org reads now carry
 * the tenant-bound service assertion from `BillingServiceCredentialProvider`.
 */
@Injectable()
export class HttpBillingEntitlementPort implements BillingEntitlementPort {
  private readonly logger = new Logger(HttpBillingEntitlementPort.name);

  constructor(
    private readonly environmentService: EnvironmentService,
    @Optional()
    private readonly credentials?: BillingServiceCredentialProvider,
  ) {}

  async checkEntitlement(
    principal: Principal,
  ): Promise<EntitlementCheckResponse> {
    const baseUrl = this.environmentService.getBillingApiUrl();
    if (!baseUrl) {
      // ENG-2489 AC3 — billing SoR ABSENT (free-only launch, no configured
      // billing endpoint). Typed distinctly from a transport failure so the
      // caller can serve the disclosed interim hardcode-Free constant
      // instead of failing closed.
      throw new BillingUnconfiguredError(
        'ENG-1382: ORVEX_BILLING_API_URL is not configured — billing entitlement port unreachable',
      );
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/v1/entitlements/${encodeURIComponent(
      principal.principal_type,
    )}/${encodeURIComponent(principal.principal_id)}`;

    const headers: Record<string, string> = { accept: 'application/json' };
    // Only org (workspace) principals are tenant-bound service reads; identity
    // refuses to mint for a user-keyed tenant, so none is requested.
    const tenant =
      principal.principal_type === 'org' ? principal.principal_id : null;
    if (tenant && this.credentials?.isConfigured()) {
      // Throws on refusal → EntitlementService falls back to its cached
      // projection or fails closed; never an anonymous billing call.
      headers['x-orvex-assertion'] =
        await this.credentials.assertionFor(tenant);
    }

    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers });
    } catch (err) {
      this.logger.warn(`billing entitlement fetch failed: ${err}`);
      throw err;
    }

    if (tenant && CREDENTIAL_REJECTED_STATUSES.has(response.status)) {
      this.credentials?.evict(tenant);
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
