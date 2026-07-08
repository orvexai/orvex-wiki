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
