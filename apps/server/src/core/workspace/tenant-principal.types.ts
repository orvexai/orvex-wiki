// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2503 (A-TENANCY / D-S17) — the polymorphic user-or-org tenant shape.
 *
 * `'user'`: a PERSONAL tenant — a full workspace + entitlements keyed on the
 * user subject, with NO Clerk org minted anywhere (this engine holds no Clerk
 * client; avoiding a Clerk org per personal user at 10k–100k scale IS the
 * cost-governance deliverable).
 * `'org'`: a TEAM tenant keyed on the Clerk-org id identity mints upstream —
 * this engine never mints one (R-WIKI-7).
 *
 * It lives in its own leaf module rather than beside a service so that the
 * tenancy consumers (`PrincipalProvisioningService`, `WorkspaceService`,
 * `WorkspaceUpgradeService`) can all name the same type without importing each
 * other's service modules.
 */
export type TenantPrincipalKind = 'user' | 'org';
