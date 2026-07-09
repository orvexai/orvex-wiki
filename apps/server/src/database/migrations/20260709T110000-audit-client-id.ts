import { Kysely, sql } from 'kysely';

/**
 * ENG-1396 (AC7) — add `client_id` to the `audit` table so a resolved
 * `external_agent` actor (an API-key-authenticated caller) can be
 * attributed to the specific API key/client that made the call, distinct
 * from `actor_id` (the underlying user the key belongs to).
 *
 * Nullable: human (`actor_type='user'`) and `system` rows never populate
 * it; only `external_agent` rows do (`OrvexAuditActorResolver`).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('audit')
    .addColumn('client_id', 'uuid')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('audit').dropColumn('client_id').execute();
}
