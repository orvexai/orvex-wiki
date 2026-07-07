import { Kysely } from 'kysely';

/**
 * ENG-1454 — scope-carry-at-auth + CASL intersection enforcement.
 *
 * Adds the `scopes` jsonb column the space-allowlist intersection guard
 * (`intersectWithTokenScope`, `core/casl/scope-intersection.ts`) reads at
 * request time. Nullable: null/absent means "no space restriction" (AC7 —
 * unscoped/legacy keys keep the full creator ability); an empty array `[]`
 * means an explicit empty scope (AC7 — the intersection of nothing is
 * nothing). Written as a NATIVE jsonb array — never `JSON.stringify`'d
 * first (AC6, the postgres.js double-encode gotcha: stringifying before
 * the jsonb write double-encodes it into a jsonb STRING, which reads back
 * as a string and breaks `scopes.some(...)` with a 500 on every scoped
 * request. See `ApiKeyRepo.insert`).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('api_keys')
    .addColumn('scopes', 'jsonb', (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .alterTable('api_keys')
    .addColumn('read_only', 'boolean', (col) => col.defaultTo(false).notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('api_keys').dropColumn('read_only').execute();
  await db.schema.alterTable('api_keys').dropColumn('scopes').execute();
}
