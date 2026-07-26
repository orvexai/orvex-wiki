// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1382 — typed mirror of the billing entitlement contract (AC8, ❌#12).
 *
 * Ownership: `orvex-studio-billing` (`internal/entitlement`, `gen/catalog.go`,
 * `gen/principal.go`) is the system-of-record for these shapes; billing's own
 * `CheckResponse` doc comment records it as "the hand-authored mirror until
 * codegen lands" from `orvex-studio-contracts`. This file is that SAME
 * hand-authored mirror on the wiki-engine side of the seam — field-for-field
 * parity with:
 *   - `orvex-studio-billing/gen/principal.go`  (Principal / PrincipalType)
 *   - `orvex-studio-billing/gen/catalog.go`    (PlanID, GatedFeature, Caps)
 *   - `orvex-studio-billing/internal/entitlement/entitlement.go`
 *     (`CheckResponse`, served at `GET /v1/entitlements/{principal_type}/{principal_id}`)
 *
 * A future `orvex-studio-contracts` codegen package supersedes this file
 * without a call-site change (AC8 forward-compat) — swap the import, keep
 * the shape. Nothing here hard-codes a cap VALUE (❌#10) — only the shape.
 */

export type PrincipalType = 'user' | 'org';

export interface Principal {
  principal_type: PrincipalType;
  principal_id: string;
}

export type PlanId = 'free' | 'personal' | 'teams' | 'enterprise';

export type GatedFeature =
  | 'composer'
  | 'curator_distillation'
  | 'ask_wiki'
  | 'improve_with_ai'
  | 'memory_coach';

/**
 * The F-QUOTA resources this leg enforces at the engine's write chokepoints.
 * Mirrors the `Wiki*` fields of `gen.Caps` (billing owns the VALUES; this
 * leg only names the resource it is checking, per ❌#10 — never a number).
 */
export type QuotaResource =
  | 'pages'
  | 'storage'
  | 'members'
  | 'files'
  | 'file_bytes';

/** Field-for-field mirror of `orvex-studio-billing/gen.Caps` (json tags). */
export interface EntitlementCaps {
  ai_monthly_budget_gbp: number;
  embedding_monthly_budget_gbp: number;
  curator_distillation_monthly: number;
  trial_weekly_actions_advisory: number;
  trial_weekly_actions_throttle: number;
  demo_ai_actions: number;

  wiki_max_pages: number;
  wiki_storage_bytes_aggregate: number;
  wiki_max_file_bytes: number;
  wiki_max_files: number;
  wiki_max_members: number;
  wiki_history_retention_versions: number;
  wiki_history_retention_days: number;
}

export type TrialState = 'none' | 'active' | 'ended';
export type ThrottleState = 'none' | 'advisory' | 'throttled';

/**
 * Field-for-field mirror of `orvex-studio-billing/internal/entitlement.CheckResponse`
 * (the wire shape of `GET /v1/entitlements/{principal_type}/{principal_id}`).
 */
export interface EntitlementCheckResponse {
  plan: PlanId;
  plan_version: string;
  features: GatedFeature[];
  caps: EntitlementCaps;
  trial: {
    state: TrialState;
    endsAt?: string;
  };
  throttle: {
    state: ThrottleState;
    windowResetAt?: string;
  };
  version: string;
  evaluatedAt: string;
}

/**
 * ENG-2489 AC3 — the INTERIM hardcode-Free entitlement, served behind the
 * entitlement-reader interface ONLY when the billing SoR is ABSENT (no
 * `ORVEX_BILLING_API_URL` configured — the free-only launch window), never
 * when billing is merely unreachable (that path stays: last-known cache,
 * else fail closed 503).
 *
 * DISCLOSED interim measure, not a silent permanent SoR: these are the
 * D-S7/ENG-2036 human-ratified Free-tier constants (200 pages / 1 GiB
 * aggregate / 10 MiB per file / 2,000 files / 25 members /
 * min(10 versions, 180 days) history), unchanged by this story and removed
 * wholesale once billing's paid-plan SoR is live (the AC4 swap point —
 * see {@link assertNoPaidPlanSellableWhileInterimFree}). These literals
 * live ONLY here, inside the entitlement-reader (ENG-2489 AC5); the
 * enforcement path reads them exclusively through `resolve()`.
 *
 * The ai/trial budget caps are NOT wiki-engine-enforced surfaces (no
 * chokepoint in this repo reads them); they carry billing's documented `0`
 * "uncapped/absent" sentinel rather than an invented number. `features` is
 * empty — the interim constant unlocks nothing (fail-closed for gated
 * features, honest for the Free tier). `evaluatedAt`/versions are fixed
 * sentinel literals (never derived from a clock) so the constant is fully
 * deterministic.
 */
export const INTERIM_FREE_ENTITLEMENT: EntitlementCheckResponse =
  Object.freeze({
    plan: 'free',
    plan_version: 'interim-free',
    features: [],
    caps: Object.freeze({
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 0,
      wiki_max_pages: 200,
      wiki_storage_bytes_aggregate: 1_073_741_824, // 1 GiB
      wiki_max_file_bytes: 10_485_760, // 10 MiB
      wiki_max_files: 2_000,
      wiki_max_members: 25,
      wiki_history_retention_versions: 10,
      wiki_history_retention_days: 180,
    }),
    trial: Object.freeze({ state: 'none' as TrialState }),
    throttle: Object.freeze({ state: 'none' as ThrottleState }),
    version: 'interim-free',
    evaluatedAt: 'interim-hardcode-free', // sentinel, not a fabricated timestamp
  }) as EntitlementCheckResponse;

/**
 * ENG-2489 AC4 — the plans this deployment is allowed to SELL while the
 * interim hardcode-Free fallback is still the active billing-absent code
 * path. Exactly `['free']` until the billing SoR read replaces
 * {@link INTERIM_FREE_ENTITLEMENT}; widening this list without removing the
 * interim constant trips the swap-point guard below at module init.
 */
export const SELLABLE_PLAN_IDS: readonly PlanId[] = Object.freeze(['free']);

/**
 * ENG-2489 AC4 — the paid-plan swap-point guard: fails LOUDLY (at
 * `EntitlementModule` construction, i.e. boot) if any paid `PlanId` is
 * marked sellable while the interim-Free constant is still the active
 * billing-absent fallback. Removing `INTERIM_FREE_ENTITLEMENT` (wiring the
 * real billing SoR read as the only source) is the sanctioned way to widen
 * {@link SELLABLE_PLAN_IDS} — never deleting this guard.
 */
export function assertNoPaidPlanSellableWhileInterimFree(
  sellablePlans: readonly PlanId[] = SELLABLE_PLAN_IDS,
): void {
  const paid = sellablePlans.filter((plan) => plan !== 'free');
  if (paid.length > 0) {
    throw new Error(
      `ENG-2489 AC4 swap-point guard: paid plan(s) [${paid.join(', ')}] are ` +
        'marked sellable while the interim hardcode-Free fallback ' +
        '(INTERIM_FREE_ENTITLEMENT) is still the active billing-absent code ' +
        'path. Wire the billing SoR read (and remove the interim constant) ' +
        'before selling a paid plan.',
    );
  }
}

/** Maps a QuotaResource to its cap field on EntitlementCaps (AC6/AC8). */
export function capValueForResource(
  caps: EntitlementCaps,
  resource: QuotaResource,
): number {
  switch (resource) {
    case 'pages':
      return caps.wiki_max_pages;
    case 'storage':
      return caps.wiki_storage_bytes_aggregate;
    case 'members':
      return caps.wiki_max_members;
    case 'files':
      return caps.wiki_max_files;
    case 'file_bytes':
      return caps.wiki_max_file_bytes;
  }
}
