import { Kysely, sql } from 'kysely';

/**
 * ENG-1371 — orvex_page_meta governance/lifecycle/provenance columns.
 *
 * Ports the fork's page-metadata governance columns (originally 18 columns
 * bolted directly onto `pages` across four migrations upstream) straight
 * onto the `orvex_page_meta` SIDE table that already exists on this repo's
 * `dev` (ENG-1471, `20260707T090000-pages-upsert-dedup.ts`) — `version` and
 * `content_hash` already live there per ruling 4, so this migration only
 * ADDS the remaining 15 governance columns. It never touches `pages`
 * (AC1/AC11 — `pages` must carry ZERO fork metadata columns; that invariant
 * holds by construction since this is a fresh port, not a column move).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('orvex_page_meta')
    .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('draft'))
    .addColumn('doc_type', 'varchar', (col) => col)
    .addColumn('owner_id', 'uuid', (col) => col)
    .addColumn('last_reviewed_at', 'timestamptz', (col) => col)
    .addColumn('supersedes', 'jsonb', (col) => col)
    .addColumn('superseded_by', 'varchar', (col) => col)
    .addColumn('redirect_from', 'varchar', (col) => col)
    // TEXT (not jsonb) is deliberate: the shared `CamelCasePlugin` recurses
    // into jsonb VALUES and would camelCase arbitrary frontmatter key names
    // on read (e.g. `custom_novel_key` -> `customNovelKey`), breaking AC8's
    // verbatim round-trip. Stored as a JSON string, parsed/serialized by the
    // service, so the plugin never sees it as a plain object to transform.
    .addColumn('unknown_frontmatter', 'text', (col) => col)
    .addColumn('verified_against', 'varchar', (col) => col)
    .addColumn('verified_at', 'timestamptz', (col) => col)
    .addColumn('spec_confirmed', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('provenance_status', 'varchar', (col) => col)
    .addColumn('provenance_changed_at', 'timestamptz', (col) => col)
    .addColumn('provenance_changed_by_id', 'uuid', (col) => col)
    .addColumn('archive_reason', 'varchar', (col) => col)
    .execute();

  // Partial indexes matching the columns that were hot-path filtered on
  // `pages` upstream (status, doc_type, verified_against, spec_confirmed).
  await sql`
    CREATE INDEX "orvex_page_meta_status_idx" ON "orvex_page_meta" ("status")
  `.execute(db);
  await sql`
    CREATE INDEX "orvex_page_meta_doc_type_idx" ON "orvex_page_meta" ("doc_type")
    WHERE "doc_type" IS NOT NULL
  `.execute(db);
  await sql`
    CREATE INDEX "orvex_page_meta_verified_against_idx" ON "orvex_page_meta" ("verified_against")
    WHERE "verified_against" IS NOT NULL
  `.execute(db);
  await sql`
    CREATE INDEX "orvex_page_meta_spec_confirmed_idx" ON "orvex_page_meta" ("spec_confirmed")
    WHERE "spec_confirmed" = true
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('orvex_page_meta_spec_confirmed_idx').execute();
  await db.schema.dropIndex('orvex_page_meta_verified_against_idx').execute();
  await db.schema.dropIndex('orvex_page_meta_doc_type_idx').execute();
  await db.schema.dropIndex('orvex_page_meta_status_idx').execute();

  await db.schema
    .alterTable('orvex_page_meta')
    .dropColumn('archive_reason')
    .dropColumn('provenance_changed_by_id')
    .dropColumn('provenance_changed_at')
    .dropColumn('provenance_status')
    .dropColumn('spec_confirmed')
    .dropColumn('verified_at')
    .dropColumn('verified_against')
    .dropColumn('unknown_frontmatter')
    .dropColumn('redirect_from')
    .dropColumn('superseded_by')
    .dropColumn('supersedes')
    .dropColumn('last_reviewed_at')
    .dropColumn('owner_id')
    .dropColumn('doc_type')
    .dropColumn('status')
    .execute();
}
