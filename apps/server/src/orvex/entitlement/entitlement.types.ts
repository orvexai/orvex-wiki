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
