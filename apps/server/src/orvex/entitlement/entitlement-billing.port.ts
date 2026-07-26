// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Principal, EntitlementCheckResponse } from './entitlement.types';

/**
 * The injected port to the `orvex-studio-billing` entitlement seam (CS §7 —
 * a true network sibling; a port IS justified here, ❌#3 n/a). The engine
 * never talks Stripe, never owns cap VALUES (❌#10) — it only reads the
 * current entitlement projection for a principal.
 */
export const BILLING_ENTITLEMENT_PORT = Symbol('BILLING_ENTITLEMENT_PORT');

/**
 * ENG-2489 AC3 — thrown by an adapter when the billing SoR is ABSENT
 * (not configured at all), as opposed to configured-but-unreachable.
 * `EntitlementService.resolve` distinguishes the two: absent → serve the
 * disclosed interim hardcode-Free constant behind the same interface;
 * unreachable → last-known cached projection, else fail closed (503).
 */
export class BillingUnconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingUnconfiguredError';
  }
}

export interface BillingEntitlementPort {
  /**
   * Resolves the current entitlement for a principal from billing's
   * `GET /v1/entitlements/{principal_type}/{principal_id}`. MUST reject
   * (never resolve a degraded/default value) on any transport or non-2xx
   * failure — the caller (EntitlementService) owns the fail-closed/cached
   * fallback decision (AC7), not this port.
   */
  checkEntitlement(principal: Principal): Promise<EntitlementCheckResponse>;
}
