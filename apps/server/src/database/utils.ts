import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from './types/kysely.types';
import { currentTenantScope } from './rls/tenant-scope.context';
import { withTenantScopedTransaction } from './rls/rls-guc-hook';

/*
 * Executes a transaction or a callback using the provided database instance.
 * If an existing transaction is provided, it directly executes the callback with it.
 * Otherwise, it starts a new transaction using the provided database instance and executes the callback within that transaction.
 *
 * ENG-2502 (FR-W8, AC1) — this is the SHARED TRANSACTION CHOKEPOINT every
 * tenant-scoped service transaction in the engine funnels through (~30 call
 * sites across core/, integrations/, collaboration/ and orvex/). When the
 * ambient request tenant scope is set (established by `DomainMiddleware`
 * from `req.workspaceId`, see `rls/tenant-scope.context.ts`), the newly
 * opened transaction runs
 * `set_config('app.workspace_id', $1, true)` as its FIRST statement, so the
 * fail-closed `orvex_rls_tenant_isolation_*` policies admit exactly that
 * tenant's rows. Wiring it HERE rather than at each call site means a new
 * transaction site is tenant-scoped by construction and cannot forget.
 *
 * With NO ambient scope (a boot task, a queue worker, a background job) the
 * GUC is deliberately left unset: RLS then denies by default (AC5) rather
 * than this helper guessing a tenant. Those paths connect as roles/contexts
 * that are handled by the rollout sequencing described in the RLS
 * migration's header — never by silently widening the boundary here.
 *
 * An `existingTrx` is NOT re-scoped: it was already scoped by whichever
 * `executeTx` opened it, and re-issuing `set_config` inside a caller's
 * transaction it does not own is exactly the ordering hazard the hook
 * exists to prevent.
 *
 * RLS remains a BACKSTOP beneath the FR-13 app-layer ACL, never a
 * replacement for it.
 */
export async function executeTx<T>(
  db: KyselyDB,
  callback: (trx: KyselyTransaction) => Promise<T>,
  existingTrx?: KyselyTransaction,
): Promise<T> {
  if (existingTrx) {
    return await callback(existingTrx); // Execute callback with existing transaction
  }

  const workspaceId = currentTenantScope();

  return await db.transaction().execute((trx) =>
    workspaceId === null
      ? callback(trx) // No ambient tenant: GUC stays unset, RLS denies by default.
      : withTenantScopedTransaction(trx, workspaceId, callback),
  );
}

/*
 * This function returns either an existing transaction if provided,
 * or the normal database instance.
 *
 * ENG-3569 — DEPRECATED for tenant-scoped tables. When no `existingTrx` is
 * passed this hands back the RAW `db` handle, and a statement issued on that
 * handle opens no transaction. `set_config('app.workspace_id', $1, true)` is
 * transaction-local by construction (`rls/rls-guc-hook.ts`), so the GUC is
 * never set and the fail-closed `orvex_rls_tenant_isolation_*` policies deny
 * the row — INCLUDING to its own owner. Reads answer a silent `[]`, writes
 * raise 42501. Use {@link scopedQuery} instead; the count of remaining sites
 * is fenced one-way by `scripts/ci/rls-unscoped-read-ratchet.sh`.
 */
export function dbOrTx(
  db: KyselyDB,
  existingTrx?: KyselyTransaction,
): KyselyDB | KyselyTransaction {
  if (existingTrx) {
    return existingTrx; // Use existing transaction
  } else {
    return db; // Use normal database instance
  }
}

/**
 * ENG-3569 — typed, loud refusal to run a tenant-scoped statement with no
 * authenticated tenant.
 *
 * The alternative is what the engine does today: the statement runs with
 * `app.workspace_id` unset, RLS denies every row, and the caller reports a
 * perfectly ordinary empty result. That is a guard that could not determine
 * its answer answering anyway — the single worst failure mode available here,
 * because it is indistinguishable from "the tenant has no data" at every
 * layer above it. Denying loudly converts it into an actionable error.
 */
export class MissingTenantScopeError extends Error {
  public readonly code = 'MISSING_TENANT_SCOPE';

  constructor() {
    super(
      'scopedQuery: refusing to run a tenant-scoped statement with no ambient ' +
        'tenant scope. Either this call is on a request path and the scope was ' +
        'lost before it (see DomainMiddleware / runInTenantScope), or it is a ' +
        'system-context caller that must pass an already-scoped transaction. ' +
        'Running unscoped would silently return zero rows (ENG-3569).',
    );
    this.name = 'MissingTenantScopeError';
  }
}

/**
 * ENG-3569 — the SHARED READ/SINGLE-STATEMENT CHOKEPOINT, the counterpart to
 * {@link executeTx} for the ~156 call sites that today reach the database
 * through {@link dbOrTx} without opening a transaction at all.
 *
 * ## Why a transaction is the only safe shape
 *
 * The GUC this depends on is transaction-local (`set_config(..., true)`), and
 * that is not an implementation detail that could be relaxed. Under the
 * production pooling posture — `postgres-claim.yaml` sets
 * `pgBouncer: {enabled: true, mode: transaction}` — a statement issued
 * OUTSIDE an explicit transaction is its own transaction as far as the pooler
 * is concerned. So a session-level `set_config(..., false)` paired with a
 * following `SELECT` can be routed to two DIFFERENT backends, losing the GUC
 * entirely; and in the cases where the same backend happens to be reused, the
 * value persists past the statement and becomes a cross-tenant leak — the
 * exact leak `TestRlsTransactionScopedNoLeakUnderPooling` AC2 forbids by
 * name. Session-level scoping is therefore not merely worse, it is unsafe in
 * both directions. An explicit transaction per statement is the only shape
 * that is correct under transaction pooling, which is why this helper opens
 * one rather than trying to scope a bare statement.
 *
 * ## Contract
 *
 * - With an `existingTrx`, the callback runs on it unchanged: it was already
 *   scoped by whichever {@link executeTx} opened it, and re-issuing
 *   `set_config` inside a transaction this helper does not own is precisely
 *   the ordering hazard `rls/rls-guc-hook.ts` exists to prevent.
 * - With an ambient tenant scope, a transaction is opened and scoped to it
 *   before the callback runs.
 * - With NEITHER, this throws {@link MissingTenantScopeError}. It does not
 *   fall back to an unscoped handle, and it does not open an unscoped
 *   transaction: a guard that cannot determine its answer must deny, and it
 *   must deny in a way an operator can see.
 *
 * That last clause is the one real behavioural difference from
 * {@link executeTx}, and it is deliberate. An unscoped WRITE fails loudly on
 * its own (42501), so `executeTx` can afford to let the database do the
 * denying. An unscoped READ does not: it returns `[]`. This helper therefore
 * refuses before the statement is issued rather than after.
 *
 * RLS remains a BACKSTOP beneath the FR-13 app-layer ACL, never a
 * replacement for it.
 */
export async function scopedQuery<T>(
  db: KyselyDB,
  callback: (executor: KyselyTransaction) => Promise<T>,
  existingTrx?: KyselyTransaction,
): Promise<T> {
  if (existingTrx) {
    return await callback(existingTrx);
  }

  const workspaceId = currentTenantScope();
  if (workspaceId === null) {
    throw new MissingTenantScopeError();
  }

  return await db
    .transaction()
    .execute((trx) => withTenantScopedTransaction(trx, workspaceId, callback));
}

/**
 * ENG-1382 fix pass 1 (F1) — serializes concurrent F-QUOTA
 * `count -> assert -> insert` write chokepoints per (resource, workspace).
 *
 * `pg_advisory_xact_lock` blocks until any other transaction holding the
 * same key commits/rolls back, and releases automatically at end-of-
 * transaction — so it MUST be taken as the first statement inside the same
 * transaction that performs the usage count and the write, never in a
 * separate transaction from either. `hashtext` collapses the composite key
 * to the bigint pg_advisory_xact_lock expects; a resource+workspaceId
 * collision would require a hashtext collision AND the same resource
 * namespace, which is acceptable for a serialization primitive (worst case
 * is over-serialization, never a missed lock).
 */
export async function acquireWorkspaceQuotaLock(
  trx: KyselyTransaction,
  resource: string,
  workspaceId: string,
): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`quota:${resource}:${workspaceId}`}))`.execute(
    trx,
  );
}

/**
 * ENG-1559 R6 — serializes concurrent engine-workspace materialization
 * (`get-or-create` at a registry-issued UUID) per workspace id. `findById ...
 * FOR UPDATE` cannot serialize a create because the row does not exist yet, so
 * two concurrent first-exchange provisions would both race the workspace
 * insert and the loser would hit the PK constraint. This transaction-scoped
 * advisory lock, taken as the FIRST statement of the provisioning transaction,
 * makes the loser block until the winner commits, then re-resolve the winner's
 * workspace on the get path. Same idiom as {@link acquireWorkspaceQuotaLock};
 * `hashtext` collapses the key to the bigint the lock expects (a collision only
 * over-serializes, never misses).
 */
export async function acquireWorkspaceProvisionLock(
  trx: KyselyTransaction,
  workspaceId: string,
): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`workspace-provision:${workspaceId}`}))`.execute(
    trx,
  );
}
