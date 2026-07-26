// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { sql } from 'kysely';
import { KyselyTransaction } from '../types/kysely.types';

/**
 * ENG-2502 (FR-W8) — the transaction-scoped RLS GUC hook.
 *
 * Runs `set_config('app.workspace_id', $1, true)` — the `true` third
 * argument is `is_local`, scoping the GUC to the CURRENT TRANSACTION only —
 * as the FIRST statement inside the caller's own Kysely transaction, then
 * runs the caller's work. The GUC is popped automatically at commit or
 * rollback, so under pgBouncer transaction pooling
 * (`postgres-claim.yaml` `pgBouncer: {mode: transaction}`) a tenant's
 * workspace id can never leak into another tenant's transaction sharing the
 * same pooled backend connection. A session-level `SET` is deliberately
 * never used anywhere in this module.
 *
 * This hook is the store-layer half of the RLS BACKSTOP beneath the FR-13
 * app-layer ACL (`OrvexPermissionsService`) — it is never a replacement for
 * app-layer permission checks; it only scopes the transaction to the tenant
 * so the `orvex_rls_tenant_isolation_*` policies
 * (migration 20260726T090000) can enforce the workspace boundary.
 *
 * Deletion test (CS §3.1): this hook owns the ordering invariant that the
 * GUC is set BEFORE any query the caller issues — deleting it would push
 * that easy-to-forget ordering onto every caller. It participates in the
 * CALLER's transaction and never opens its own.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Typed, loud failure for a malformed tenant id (CS §10 operability): a
 * non-UUID value would either poison the GUC (making every policy
 * evaluation error on the `::uuid` cast) or silently deny — this hook
 * refuses it explicitly BEFORE any SQL runs, so the failure is a logged,
 * actionable error, never a crash or a masked false-empty.
 */
export class InvalidTenantScopeError extends Error {
  public readonly code = 'INVALID_TENANT_SCOPE';

  constructor(value: string) {
    super(
      `rls-guc-hook: refusing to scope transaction to malformed workspace id ${JSON.stringify(
        value,
      )} — expected a UUID`,
    );
    this.name = 'InvalidTenantScopeError';
  }
}

/**
 * Scope the caller's transaction to `workspaceId` (transaction-local GUC),
 * then run `fn` inside that same transaction. The GUC resets at
 * commit/rollback — nothing survives the transaction boundary.
 */
export async function withTenantScopedTransaction<T>(
  trx: KyselyTransaction,
  workspaceId: string,
  fn: (trx: KyselyTransaction) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(workspaceId)) {
    throw new InvalidTenantScopeError(workspaceId);
  }
  // Parameter-bound via the sql tagged template (❌#12 — never string
  // concatenation on a raw-SQL seam).
  await sql`SELECT set_config('app.workspace_id', ${workspaceId}, true)`.execute(
    trx,
  );
  return fn(trx);
}
