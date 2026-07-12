// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * AclFilterDto (ENG-1559 / ENG-1957 AC1) — the batch ACL-intersection request
 * body, in the IdP-agnostic PRINCIPAL shape the sole consumer
 * (`orvex-studio-knowledge`'s `internal/clients.Engine.FilterAccessiblePageIDs`)
 * actually sends over the wire: `{subject, tenant, page_ids}`.
 *
 * RULED CONTRACT (ENG-1559, 2026-07-12, fork (a)): the engine — the sole owner
 * of the workspace/user mapping — resolves the principal server-side. No
 * consumer re-derives orvex-wiki UUIDs.
 *
 *  - `subject`  — the stable IdP subject id (opaque; NOT a UUID, NOT an email).
 *                 The engine links it to its internal user via the
 *                 `auth_accounts` SSO-linkage table, scoped to the tenant.
 *  - `tenant`   — the platform tenant key, which IS the orvex-wiki workspace
 *                 UUID (convention `Principal.Tenant == workspaceId`, pinned by
 *                 knowledge's `internal/auth/workspace_verifier.go`). Scopes
 *                 tenant isolation: a page from a foreign workspace is silently
 *                 excluded from the result (this route intersects — it does not
 *                 validate a single target's existence).
 *  - `page_ids` — candidate page UUIDs (wire key is snake_case).
 */
export class AclFilterDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsUUID()
  tenant: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  page_ids: string[];
}

/**
 * ProvisionPrincipalDto (ENG-1559 write-path) — the body of the explicit
 * internal provisioning endpoint (`POST /internal/principals/provision`). This
 * is the WRITE seam that unorphans `auth_accounts`: the real caller is
 * orvex-studio-identity's provisioning worker, which — when it provisions /
 * first-authenticates a wiki principal — asks the engine (the data-owner) to
 * establish the subject->user linkage the read seam (`acl/filter`) later
 * resolves. Provisioning is DELIBERATELY separate from resolution: the read
 * path stays fail-closed for any not-yet-provisioned subject (a
 * provision-on-resolve design would auto-grant unknown principals and defeat
 * the intra-tenant restricted-bytes=0 gate).
 *
 * WORKSPACE MATERIALIZATION (ENG-1559 R6 — engine as the ruled data-owner):
 * identity is the SOLE source of the engine workspace UUID (it mints it on the
 * first `/v1/exchange` — `registry_org_workspaces`), but nothing created the
 * engine-side `workspaces` row for that UUID, so provisioning 404'd
 * ("Workspace not found") on every real flow. `provision_workspace` closes that
 * gap: when the registry-authorized caller sets it, the engine get-or-creates
 * the workspace with the identity-issued UUID ATOMICALLY with this principal
 * (one transaction), and the vouching principal becomes its OWNER. It is a
 * deliberate OPT-IN vouch, NOT a default: with it absent, an unknown workspace
 * stays a hard fail-closed 404 (deny-by-default for a UUID the registry does not
 * vouch for) — the read seam never reaches this write path, so there is no
 * create-on-resolve.
 *
 *  - `subject`  — the stable IdP subject id (opaque; NOT a UUID, NOT an email).
 *  - `tenant`   — the orvex-wiki workspace UUID (`Principal.Tenant ==
 *                 workspaceId`). A tenant that is not a live workspace 404s
 *                 (fail-closed) UNLESS `provision_workspace` vouches for it; a
 *                 non-UUID tenant 400s.
 *  - `email`    — the principal's email; the account-linking key. An already
 *                 workspace-invited user with this email is LINKED (not
 *                 duplicated); otherwise a member user is JIT-created.
 *  - `name`     — optional display name for a JIT-created user.
 *  - `provision_workspace` — optional registry vouch. `true` ⇒ the engine
 *                 get-or-creates the workspace at `tenant` (idempotent) and the
 *                 provisioned principal is its OWNER; absent/`false` ⇒ unknown
 *                 `tenant` fails closed (404).
 */
export class ProvisionPrincipalDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsUUID()
  tenant: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsBoolean()
  provision_workspace?: boolean;
}

/**
 * TenantQueryDto (ENG-1559) — the query contract for the workspace-scoped
 * indexer read endpoints (`export`, `resolve`, `settings/ai-search`). The
 * consumer sends only `?tenant=<workspaceId>`; these routes carry NO per-user
 * subject because per-user ACL is enforced at query egress via `acl/filter` ∩
 * token_scope (the A1 model) — the indexer must see all in-tenant content so a
 * permitted user can later find it. Tenant isolation is preserved (a
 * foreign-workspace id 404s).
 */
export class TenantQueryDto {
  @IsUUID()
  tenant: string;
}
