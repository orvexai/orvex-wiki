// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  BILLING_ENTITLEMENT_PORT,
  BillingEntitlementPort,
  BillingUnconfiguredError,
} from './entitlement-billing.port';
import { ENTITLEMENT_CACHE, EntitlementCache } from './entitlement-cache';
import {
  capValueForResource,
  EntitlementCheckResponse,
  GatedFeature,
  INTERIM_FREE_ENTITLEMENT,
  LARGEST_FILES_LIMIT,
  LargestFileEntry,
  Principal,
  QUOTA_WARN_MODE_HARD_STOP_MULTIPLIER,
  QuotaResource,
  STORAGE_SHAPED_RESOURCES,
} from './entitlement.types';
import { QuotaFastCounter } from './quota-fast-counter';
import {
  EntitlementUnavailableException,
  QuotaExceededException,
  QuotaExceededExtras,
} from './quota.exception';
import { OrvexConfigService } from '../config/orvex-config.service';
import { AttachmentRepo } from '../../database/repos/attachment/attachment.repo';

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
    // ENG-2491 — rejection-enrichment collaborators. @Optional so existing
    // direct constructions (specs, older harnesses) keep working: without
    // them the frozen 402 core is unchanged and the additive fields degrade
    // (upgradeUrl omitted, largestFiles empty) — never a crash (CS §10).
    @Optional() private readonly orvexConfig?: OrvexConfigService,
    @Optional() private readonly attachmentRepo?: AttachmentRepo,
    // ENG-2492 — the Redis usage-counter the fail-mode-aware variant
    // (`assertWithinQuotaFromCounter`) reads. @Optional: without it that
    // variant treats the counter as unavailable (the same fail-mode split
    // applies); the caller-supplied-usage methods are unaffected.
    @Optional() private readonly quotaFastCounter?: QuotaFastCounter,
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
   *
   * ENG-2377 AC5 — delegated-principal keying: `actingForPrincipal`, when
   * given, is the principal this read is keyed on (billing request + cache
   * key) instead of the workspace's own org principal — the acting
   * delegated principal (an MCP act-as-user call, an `ai` agentic hop, or a
   * workload-identity call acting for a user), NEVER the caller/service
   * identity minting the request. This mirrors the Go
   * `orvex-studio-lib/entitlements.Client.Resolve(ctx, caller, actingFor)`
   * design (CS §3.7 design-it-twice, Sketch A: an explicit parameter,
   * chosen over an implicit context-carried marker, since a
   * dropped/forgotten context key is the wrong risk profile for a
   * security-relevant keying decision — see that package's doc.go for the
   * full two-sketch rationale, authored once and mirrored here rather than
   * re-litigated). Every existing call site omits this parameter and keeps
   * resolving on the workspace's own org principal, unchanged.
   */
  private async resolve(
    workspaceId: string,
    actingForPrincipal?: Principal,
  ): Promise<EntitlementCheckResponse> {
    const principal = actingForPrincipal ?? this.toPrincipal(workspaceId);

    const cached = await this.cache.get(principal);
    if (cached) {
      return cached;
    }

    try {
      const fresh = await this.billingPort.checkEntitlement(principal);
      await this.cache.set(principal, fresh);
      return fresh;
    } catch (err) {
      // ENG-2489 AC3 — billing SoR ABSENT (unconfigured, the free-only
      // launch window) is NOT a failure: serve the disclosed interim
      // hardcode-Free constant behind this same interface. Deliberately
      // not cached, so configuring billing later takes effect on the next
      // read without waiting out a TTL.
      if (err instanceof BillingUnconfiguredError) {
        this.logger.debug(
          `EntitlementService.resolve: billing SoR absent — serving the interim hardcode-Free entitlement for principal ${principal.principal_type}/${principal.principal_id}`,
        );
        return INTERIM_FREE_ENTITLEMENT;
      }
      this.logger.warn(
        `EntitlementService.resolve: billing port unreachable for principal ${principal.principal_type}/${principal.principal_id}: ${(err as Error).message}`,
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
   * ENG-2377 AC5 — the delegated-call entry point: resolves the effective
   * entitlement for `actingForPrincipal`, the acting delegated principal
   * (an MCP act-as-user call, an `ai` agentic hop, or a workload-identity
   * call acting for a user), never the calling service's own identity.
   * `workspaceId` is retained ONLY as a diagnostic/log correlation value
   * (unused for keying) — the request and cache key are keyed exclusively
   * on `actingForPrincipal`. Callers that are not delegated calls use
   * `hasFeature`/`assertWithinQuota`/`assertIncrementWithinQuota` directly,
   * unchanged.
   */
  async hasFeatureFor(
    actingForPrincipal: Principal,
    feature: GatedFeature,
  ): Promise<boolean> {
    const entitlement = await this.resolve(
      actingForPrincipal.principal_id,
      actingForPrincipal,
    );
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
      await this.rejectOrWarn(workspaceId, resource, limit, currentUsage + 1);
    }
  }

  /**
   * ENG-2492 AC2/AC3 — the fail-mode-aware, counter-sourced variant: reads
   * `currentUsage` from the Redis fast-counter itself (the caller supplies
   * no number). DISTINCT from `resolve()`'s existing catalog fail-closed
   * path — that seam answers "can we resolve the cap VALUE at all"; this
   * one answers "can we resolve the current USAGE count":
   *
   *  - counter readable → the normal verdict (incl. `warn`-mode branch);
   *  - counter unknown (Redis down/unconfigured/unseeded) → the ADR-0003
   *    split: storage-shaped resources fail CLOSED (a `QUOTA_EXCEEDED`
   *    rejection carrying `redisUnavailable: true` under the frozen
   *    envelope — distinguishable from a genuine over-cap verdict) until
   *    the reconciliation sweep restores the counter; cheap resources
   *    (`pages`/`members`) fail OPEN with a logged degrade — the same
   *    outage must never block a page create or a member join.
   *
   * The fail-closed branch deliberately ignores `warn` mode: it is an
   * outage safety rail, not a cap-calibration verdict.
   */
  async assertWithinQuotaFromCounter(
    workspaceId: string,
    resource: QuotaResource,
  ): Promise<void> {
    const entitlement = await this.resolve(workspaceId);
    const limit = capValueForResource(entitlement.caps, resource);

    if (limit === 0) {
      return; // uncapped
    }

    const read = this.quotaFastCounter
      ? await this.quotaFastCounter.readCounter(workspaceId, resource)
      : ({ kind: 'unavailable' } as const);

    if (read.kind === 'value') {
      if (read.value >= limit) {
        await this.rejectOrWarn(workspaceId, resource, limit, read.value + 1);
      }
      return;
    }

    if (STORAGE_SHAPED_RESOURCES.includes(resource)) {
      this.logger.warn(
        `EntitlementService: usage counter unreadable (${read.kind}) for ${resource}/${workspaceId} — failing CLOSED for the storage-shaped resource class (the ratified fail-mode split)`,
      );
      throw await this.buildRejection(workspaceId, resource, limit, {
        redisUnavailable: true,
      });
    }

    this.logger.warn(
      `EntitlementService: usage counter unreadable (${read.kind}) for ${resource}/${workspaceId} — failing OPEN for the cheap-resource class (the ratified fail-mode split)`,
    );
  }

  /**
   * ENG-2491 AC4 — the SSO/SCIM JIT overage variant: permits usage up to
   * `floor(limit * overageMultiplier)` before rejecting, so a first login
   * never breaks a tenant already slightly over via a stale SCIM sync. The
   * ONE caller is `PrincipalProvisioningService.provision`'s JIT path (with
   * `JIT_MEMBER_OVERAGE_MULTIPLIER`); manual invites keep calling
   * {@link assertWithinQuota} — the unmodified 100% boundary. The comparison
   * lives HERE (the domain), never at a call site (❌#1); the overage is
   * bounded and documented, never a ceiling change (❌#10).
   */
  async assertWithinQuotaAllowingOverage(
    workspaceId: string,
    resource: QuotaResource,
    currentUsage: number,
    overageMultiplier: number,
  ): Promise<void> {
    const entitlement = await this.resolve(workspaceId);
    const limit = capValueForResource(entitlement.caps, resource);

    if (limit === 0) {
      return; // uncapped
    }

    const allowedThrough = Math.floor(limit * overageMultiplier);
    if (currentUsage >= allowedThrough) {
      // The frozen body reports the REAL cap, never the internal overage
      // bound — the overage is an allowance policy, not a different limit.
      await this.rejectOrWarn(workspaceId, resource, limit, currentUsage + 1);
    }
  }

  /**
   * ENG-2492 AC4 — the single over-cap decision point shared by every
   * assert variant: in the default enforcing mode an over-cap write is
   * rejected; under `ORVEX_QUOTAS_ENFORCE=warn` (the calibration rollout)
   * it is permitted with a machine-greppable `QUOTA_WARN_MODE_OVERCAP`
   * warning — EXCEPT past the absolute
   * {@link QUOTA_WARN_MODE_HARD_STOP_MULTIPLIER} hard stop (ADR-0003),
   * which rejects even in warn mode ("a Redis reset cannot open free-tier
   * abuse"). `projectedUsage` is the post-write usage the decision is made
   * against.
   */
  private async rejectOrWarn(
    workspaceId: string,
    resource: QuotaResource,
    limit: number,
    projectedUsage: number,
    extraFields?: QuotaExceededExtras,
  ): Promise<void> {
    const warnMode =
      (this.orvexConfig?.quotasEnforceMode ?? 'enforce') === 'warn';
    if (
      warnMode &&
      projectedUsage <= limit * QUOTA_WARN_MODE_HARD_STOP_MULTIPLIER
    ) {
      this.logger.warn(
        `QUOTA_WARN_MODE_OVERCAP: permitted an over-cap ${resource} write for workspace ${workspaceId} (projected ${projectedUsage} vs cap ${limit}) — ORVEX_QUOTAS_ENFORCE=warn calibration; the ${QUOTA_WARN_MODE_HARD_STOP_MULTIPLIER}x hard stop still applies`,
      );
      return;
    }
    throw await this.buildRejection(
      workspaceId,
      resource,
      limit,
      extraFields,
    );
  }

  /**
   * ENG-2491 AC1/AC3 — assembles the enriched `402 QUOTA_EXCEEDED` (frozen
   * core + `upgradeUrl` + storage-shaped `largestFiles`). Enrichment is
   * best-effort by contract: a missing config omits `upgradeUrl`, a failing
   * largest-files read degrades to `[]` — the rejection itself is
   * unconditional and never becomes a 500 (CS §10 never-white-screen).
   */
  private async buildRejection(
    workspaceId: string,
    resource: QuotaResource,
    limit: number,
    extraFields?: QuotaExceededExtras,
  ): Promise<QuotaExceededException> {
    const extras: QuotaExceededExtras = { ...(extraFields ?? {}) };

    const upgradeUrl = this.buildUpgradeUrl(workspaceId);
    if (upgradeUrl !== undefined) {
      extras.upgradeUrl = upgradeUrl;
    }

    if (STORAGE_SHAPED_RESOURCES.includes(resource)) {
      extras.largestFiles = await this.largestFilesFor(workspaceId);
    }

    return new QuotaExceededException(resource, limit, extras);
  }

  /**
   * ENG-2491 AC1 — the workspace-scoped upgrade deep-link: the
   * env-configured base (`ORVEX_BILLING_UPGRADE_URL`, ❌#8 — never a URL
   * literal in this module) carrying the workspace id. Unset/invalid base →
   * `undefined` (field omitted), never a fabricated URL (CS §11).
   */
  private buildUpgradeUrl(workspaceId: string): string | undefined {
    const base = this.orvexConfig?.billingUpgradeUrl;
    if (!base) {
      return undefined;
    }
    try {
      const url = new URL(base);
      url.searchParams.set('workspaceId', workspaceId);
      return url.toString();
    } catch {
      this.logger.warn(
        'EntitlementService: ORVEX_BILLING_UPGRADE_URL is not a valid URL — omitting upgradeUrl from the QUOTA_EXCEEDED body',
      );
      return undefined;
    }
  }

  /**
   * ENG-2491 AC3 — the one-click largest-files list (top-N by `fileSize`,
   * real `attachments` rows via the owning repo — CS §6 store confinement).
   * Degrades to `[]` on a transient query failure or an un-injected repo:
   * the 402 always returns (CS §10), never fabricated data (CS §11).
   */
  private async largestFilesFor(
    workspaceId: string,
  ): Promise<LargestFileEntry[]> {
    if (!this.attachmentRepo) {
      return [];
    }
    try {
      const rows = await this.attachmentRepo.findLargestByWorkspaceId(
        workspaceId,
        LARGEST_FILES_LIMIT,
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.fileName,
        fileSize: row.fileSize,
      }));
    } catch (err) {
      this.logger.warn(
        `EntitlementService: largest-files read failed for workspace ${workspaceId} — serving an empty list on the QUOTA_EXCEEDED rejection: ${(err as Error).message}`,
      );
      return [];
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
      await this.rejectOrWarn(
        workspaceId,
        resource,
        limit,
        currentUsage + incrementAmount,
      );
    }
  }
}
