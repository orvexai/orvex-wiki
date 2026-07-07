import { Kysely } from 'kysely';

/**
 * ENG-1447 — AI-provenance stamp columns.
 *
 * Provenance is stored INLINE on `pages` (not a separate table/DB), so a
 * page delete/restore naturally carries or clears its provenance row with
 * it — there is no separate-store orphan class to reconcile for this
 * migration's shape. `provenance-orphan-reconcile.listener.ts` is still
 * wired up as the defensive backstop AC7 asks for regardless (it reacts to
 * `page.deleted` and sweeps any provenance-bearing row that should not
 * still exist).
 *
 * `provenance_status`: nullable text — 'ai_produced' | 'ai_edited' |
 * 'human_verified' | null (unstamped). Left as unconstrained text (not a
 * DB enum) to avoid a migration-locked enum for a value the service layer
 * already types and validates (`ProvenanceStatus`).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('provenance_status', 'text', (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .alterTable('pages')
    .addColumn('provenance_changed_at', 'timestamptz', (col) =>
      col.defaultTo(null),
    )
    .execute();

  await db.schema
    .alterTable('pages')
    .addColumn('provenance_changed_by_id', 'uuid', (col) => col.defaultTo(null))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .dropColumn('provenance_changed_by_id')
    .execute();
  await db.schema
    .alterTable('pages')
    .dropColumn('provenance_changed_at')
    .execute();
  await db.schema.alterTable('pages').dropColumn('provenance_status').execute();
}
