// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
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
