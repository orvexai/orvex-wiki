// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { EntitlementService } from '../entitlement.service';

/**
 * The quota/feature surface of {@link EntitlementService} that delivery-path
 * collaborators (PageService, AttachmentService, …) actually call.
 *
 * `Pick<EntitlementService, …>` — NOT a hand-written interface — is the
 * load-bearing part: the member list and every signature are re-derived from
 * the REAL service, so a change to the quota surface reds THIS one file at
 * compile time.
 *
 * WHY THIS EXISTS: ENG-2493 added `assertWithinQuotaFromCounter` and routed
 * PageService/AttachmentService through it (PR #145, 59569bad). Four specs
 * carried hand-rolled `{ assertWithinQuota, hasFeature } as any` doubles; the
 * `as any` meant TypeScript never saw the gap, so the drift surfaced only at
 * runtime as `TypeError: this.entitlementService.assertWithinQuotaFromCounter
 * is not a function` — 41 failing tests across 6 suites, red on `dev` from
 * 2026-07-27. One typed double, imported by every such spec, makes the next
 * quota-surface change a compile error in one place instead of a runtime
 * explosion in many.
 */
export type EntitlementServiceQuotaSurface = Pick<
  EntitlementService,
  'assertWithinQuota' | 'assertWithinQuotaFromCounter' | 'hasFeature'
>;

/**
 * A never-blocking {@link EntitlementService} double for specs whose subject
 * is something OTHER than F-QUOTA (upsert dedup, block-id stamping,
 * provenance atomicity, …).
 *
 * Semantics are deliberately the pre-ENG-2493 ones — every assertion resolves
 * (no cap is ever hit) and every feature is entitled — so the scenarios these
 * specs assert are unaffected by quota policy. Specs that DO assert quota
 * behaviour must use the real `EntitlementService` (see
 * `entitlement-*-chokepoint.integration.spec.ts`), never this double.
 *
 * The cast at the return boundary is `as unknown as EntitlementService`, not
 * `as any`: the object literal is still fully checked against
 * {@link EntitlementServiceQuotaSurface} before the widening, so a signature
 * drift cannot slip past.
 */
export function nonBlockingEntitlementServiceDouble(): EntitlementService {
  const surface: EntitlementServiceQuotaSurface = {
    assertWithinQuota: async () => undefined,
    assertWithinQuotaFromCounter: async () => undefined,
    hasFeature: async () => true,
  };
  return surface as unknown as EntitlementService;
}
