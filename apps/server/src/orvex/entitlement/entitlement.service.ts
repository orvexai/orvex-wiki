// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BILLING_ENTITLEMENT_PORT,
  BillingEntitlementPort,
} from './entitlement-billing.port';
import { ENTITLEMENT_CACHE, EntitlementCache } from './entitlement-cache';
import {
  capValueForResource,
  EntitlementCheckResponse,
  GatedFeature,
  Principal,
  QuotaResource,
} from './entitlement.types';
import {
  EntitlementUnavailableException,
  QuotaExceededException,
} from './quota.exception';

/**
 * `orvex/entitlement` — the deep module (CS §3) this leg adds. Small
 * interface (§3.6): `hasFeature`, `assertWithinQuota`, `resolve`. Composes
 * the billing port + the cache; callers never see the port/cache directly.
 *
 * Principal mapping (a real design decision, recorded here since it isn't
 * spelled out by billing's Principal-keyed model): the wiki engine is
 * workspace-scoped, not personal-account-scoped, so a workspace is billed
 * as an ORG principal keyed by its workspace id. This is the ONE place that
 * mapping lives — a future personal/solo-workspace billing model changes
 * only `toPrincipal`, never a call site.
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(
    @Inject(BILLING_ENTITLEMENT_PORT)
    private readonly billingPort: BillingEntitlementPort,
    @Inject(ENTITLEMENT_CACHE)
    private readonly cache: EntitlementCache,
  ) {}

  private toPrincipal(workspaceId: string): Principal {
    return { principal_type: 'org', principal_id: workspaceId };
  }

  /**
   * Resolves the current entitlement projection for a workspace: cache-first
   * (avoids a per-write billing call, CS §4i cost lens), falling through to
   * the billing port on a miss, and — on a port failure — falling back to
   * whatever last-known projection the cache holds (AC7). Only when BOTH the
   * port fails AND no cached projection exists does this fail closed.
   */
  private async resolve(workspaceId: string): Promise<EntitlementCheckResponse> {
    const principal = this.toPrincipal(workspaceId);

    const cached = await this.cache.get(principal);
    if (cached) {
      return cached;
    }

    try {
      const fresh = await this.billingPort.checkEntitlement(principal);
      await this.cache.set(principal, fresh);
      return fresh;
    } catch (err) {
      this.logger.warn(
        `EntitlementService.resolve: billing port unreachable for workspace ${workspaceId}: ${(err as Error).message}`,
      );
      // Re-check the cache: a concurrent successful resolve may have
      // populated it between our miss above and this failure.
      const lastKnown = await this.cache.get(principal);
      if (lastKnown) {
        return lastKnown;
      }
      throw new EntitlementUnavailableException();
    }
  }

  /**
   * AC5 — catalog-driven feature unlock. Returns exactly what billing's
   * catalog grants for the workspace's current plan; there is no local
   * all-true fallback (the retired `ORVEX_SELF_HOSTED_FEATURES` stub).
   *
   * ENG-1382 fix pass 2 (F1, tracked deviation — NOT fixed in this pass,
   * re-verified against the actual billing catalog this pass):
   * `hasFeature` has ZERO production callers.
   *
   * Two DISTINCT, non-overlapping reasons, both re-confirmed this pass:
   *
   * 1. `mcp` / `scim` / `security_settings` (the AC5 illustrative examples)
   *    are NOT billing entitlement-catalog features at all — they are not
   *    members of `orvex-studio-billing/gen.GatedFeature`
   *    (`gen/catalog.go` `AllFeatures()` is exactly `composer`,
   *    `curator_distillation`, `ask_wiki`, `improve_with_ai`,
   *    `memory_coach`). They are `LicenseCheckService`/EE-license features
   *    on a wholly separate axis. `space.service.ts` L~150-165,
   *    `workspace.service.ts` L350-383, and `share.controller.ts` calling
   *    `LicenseCheckService.hasFeature` for those is CORRECT and is not an
   *    unwired AC5 gate — there is no catalog feature there to wire.
   *    (Fix pass 2: the fake `'mcp' as unknown as GatedFeature` cast in
   *    `entitlement.service.spec.ts` has been removed and the test now
   *    exercises real catalog members instead.)
   * 2. The catalog's REAL five features (`composer`, `curator_distillation`,
   *    `ask_wiki`, `improve_with_ai`, `memory_coach`) have NO implementation
   *    surface anywhere in this repo to gate — confirmed by grep this pass
   *    (`grep -rliE 'curator|ask.?wiki|composer|improve.?with.?ai|memory.?coach'`
   *    across `apps/server/src` and `apps/client/src` matches only the
   *    entitlement module's own types/specs). The `ai_chats`/
   *    `ai_chat_messages` tables exist as a migration only — no service or
   *    controller reads them yet. There is no honest production call site
   *    to wire `hasFeature` into without inventing a new feature endpoint,
   *    which is out of this ticket's file-table and quota-bypass scope
   *    (CS §7/§13 — no speculative surface for a future leg).
   *
   * Mitigating (confirmed, not asserted): `ee/licence/license.service.ts`
   * does not exist in this repo (removed by an earlier AGPL/EE split), so
   * `LicenseCheckService` already fails CLOSED for the mcp/scim/
   * security_settings axis — no all-true bypass, no security regression.
   * AC5's literal service-level assertion (this method resolves true/false
   * from the catalog) passes and is test-covered against real catalog
   * values (see the spec).
   *
   * Follow-up: whichever ticket lands the first `composer`/`ask_wiki`/etc.
   * endpoint should call `EntitlementService.hasFeature` directly at that
   * new call site — there is no legacy stub left to migrate off of.
   */
  async hasFeature(workspaceId: string, feature: GatedFeature): Promise<boolean> {
    const entitlement = await this.resolve(workspaceId);
    return entitlement.features.includes(feature);
  }

  /**
   * AC1–AC4/AC6 — the F-QUOTA write-chokepoint primitive. `currentUsage` is
   * supplied by the caller (the count/aggregate query stays in the owning
   * repo — CS §6 store confinement; this domain module never runs a
   * Kysely/SQL query itself). The cap VALUE is always read from the
   * resolved entitlement — never a literal in this file (AC6/❌#10).
   *
   * A cap of `0` is billing's documented "uncapped" sentinel (see
   * `orvex-studio-billing/gen.EnterpriseCatalog` doc comment) — this leg
   * treats it as unlimited, never as a zero-quota block.
   */
  async assertWithinQuota(
    workspaceId: string,
    resource: QuotaResource,
    currentUsage: number,
  ): Promise<void> {
    const entitlement = await this.resolve(workspaceId);
    const limit = capValueForResource(entitlement.caps, resource);

    if (limit === 0) {
      return; // uncapped
    }

    if (currentUsage >= limit) {
      throw new QuotaExceededException(resource, limit);
    }
  }

  /**
   * ENG-1382 fix pass 1 (F3) — the AC4 literal: reject when an upload
   * "would exceed" the cap, not only when the workspace is ALREADY at/over
   * it. `assertWithinQuota` compares a pre-write count/aggregate against the
   * cap (correct for `pages`/`members`, where the unit being added is always
   * exactly 1); it is the wrong shape for a byte aggregate where the
   * increment size varies per call. This asserts
   * `projectedUsage = currentUsage + incrementAmount` against the cap
   * instead, so a workspace under the aggregate cap that uploads a file
   * large enough to cross it is correctly rejected.
   */
  async assertIncrementWithinQuota(
    workspaceId: string,
    resource: QuotaResource,
    currentUsage: number,
    incrementAmount: number,
  ): Promise<void> {
    const entitlement = await this.resolve(workspaceId);
    const limit = capValueForResource(entitlement.caps, resource);

    if (limit === 0) {
      return; // uncapped
    }

    if (currentUsage + incrementAmount > limit) {
      throw new QuotaExceededException(resource, limit);
    }
  }
}
