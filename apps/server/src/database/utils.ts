import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from './types/kysely.types';

/*
 * Executes a transaction or a callback using the provided database instance.
 * If an existing transaction is provided, it directly executes the callback with it.
 * Otherwise, it starts a new transaction using the provided database instance and executes the callback within that transaction.
 */
export async function executeTx<T>(
  db: KyselyDB,
  callback: (trx: KyselyTransaction) => Promise<T>,
  existingTrx?: KyselyTransaction,
): Promise<T> {
  if (existingTrx) {
    return await callback(existingTrx); // Execute callback with existing transaction
  } else {
    return await db.transaction().execute((trx) => callback(trx)); // Start new transaction and execute callback
  }
}

/*
 * This function returns either an existing transaction if provided,
 * or the normal database instance.
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
