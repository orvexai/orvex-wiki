import { Kysely, sql } from 'kysely';
import type { OrvexDb } from '../orvex-migration-provider';

/**
 * First real migration owned by the `orvex-extensions` package (ENG-1411
 * AC4/AC5 seam). Deliberately minimal and dependency-free: upstream's
 * `pg_trgm`/`unaccent`/`vector` extension-enablement migration is NOT ported
 * here because the `vector` (pgvector) extension is not installed on this
 * repo's Postgres image (verified: `CREATE EXTENSION vector` fails with
 * "extension is not available" on postgres:17-trixie) — porting it as-is
 * would make the migrator's own test infra depend on unavailable
 * infrastructure. This marker table proves the real end-to-end migrator path
 * (advisory-lock serialization + ordering + idempotency) against a real
 * database without that dependency; the extension-enablement migration is
 * deferred to whichever leg actually needs pgvector.
 */
export async function up(db: Kysely<OrvexDb>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS orvex_extensions_marker (
      id          varchar     PRIMARY KEY,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
}

export async function down(db: Kysely<OrvexDb>): Promise<void> {
  await sql`DROP TABLE IF EXISTS orvex_extensions_marker`.execute(db);
}
