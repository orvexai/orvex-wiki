import { type Kysely } from 'kysely';

/**
 * ENG-2503 (A-TENANCY / D-S17) — the polymorphic user-or-org tenant marker.
 *
 * Adds the polymorphic principal marker to `workspaces`:
 *  - `principal_kind` — `'user'` (a personal tenant: full workspace +
 *    entitlements, NO Clerk org anywhere) or `'org'` (a Team tenant keyed on
 *    the Clerk-org id identity mints — this engine never mints it).
 *    Defaults `'user'`: every pre-existing workspace is a valid user-keyed
 *    tenant until an upgrade-pass re-keys it.
 *  - `principal_id` — the polymorphic principal identifier billing/identity
 *    key on: the provisioning subject for a user-keyed tenant, the
 *    identity-vouched org id for an org-keyed one. Nullable: legacy rows
 *    have no recorded principal until re-keyed/backfilled.
 *
 * The personal→Teams upgrade-pass (`WorkspaceUpgradeService`) re-keys these
 * two columns IN PLACE on the same `workspaces` row — `workspace_id` (the
 * RLS tenant key, ENG-2502) never changes, so all data and entitlements stay
 * queryable under the same id with no data migration.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspaces')
    .addColumn('principal_kind', 'varchar', (col) =>
      col.notNull().defaultTo('user'),
    )
    .execute();
  await db.schema
    .alterTable('workspaces')
    .addColumn('principal_id', 'varchar')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('workspaces').dropColumn('principal_id').execute();
  await db.schema
    .alterTable('workspaces')
    .dropColumn('principal_kind')
    .execute();
}
