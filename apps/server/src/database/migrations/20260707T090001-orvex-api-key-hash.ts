import { Kysely } from 'kysely';

/**
 * ENG-1380 — clean-room AGPL api-key primitive.
 *
 * Adds the `key_hash` column the clean-room `orvex/api-key` module hashes
 * the raw bearer token into (sha256), plus an index used by the auth-seam
 * lookup (`workspace_id` + `id`, already covered by the PK, so only the
 * hash lookup needs its own index).
 *
 * `key_hash` is nullable to model the AC2 legacy-row fail-closed case
 * (a pre-existing row minted before this column existed must be rejected
 * at auth time, never silently accepted).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('api_keys')
    .addColumn('key_hash', 'varchar')
    .execute();

  await db.schema
    .createIndex('idx_api_keys_key_hash')
    .ifNotExists()
    .on('api_keys')
    .column('key_hash')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_api_keys_key_hash').ifExists().execute();
  await db.schema.alterTable('api_keys').dropColumn('key_hash').execute();
}
