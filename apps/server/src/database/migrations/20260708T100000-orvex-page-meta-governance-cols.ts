import { Kysely, sql } from 'kysely';

/**
 * ENG-1371 — orvex_page_meta governance/lifecycle/provenance columns.
 *
 * Ports the fork's page-metadata governance columns (originally 18 columns
 * bolted directly onto `pages` across four migrations upstream) straight
 * onto the `orvex_page_meta` SIDE table that already exists on this repo's
 * `dev` (ENG-1471, `20260707T090000-pages-upsert-dedup.ts`) — `version` and
 * `content_hash` already live there per ruling 4, so this migration only
 * ADDS the remaining governance columns. It never touches `pages`
 * (AC1/AC11 — `pages` must carry ZERO NEW fork metadata columns beyond the
 * already-merged ENG-1447 provenance trio; that invariant holds by
 * construction since this is a fresh port, not a column move).
 *
 * PD-4d carve-out (2026-07-08): the ENG-1447 provenance trio
 * (`provenance_status`/`provenance_changed_at`/`provenance_changed_by_id`)
 * is deliberately NOT added here even though it was part of the original
 * fork's governance columns. ENG-1447 (merged) already put a trio of the
 * same names directly on `pages` for an unrelated AI-authorship concept;
 * adding another copy here would silently duplicate the names across two
 * tables with two different semantics. Per the PO ruling the trio stays
 * solely on `pages` for now — follow-up ENG-1603 (blocked-by this ticket)
 * migrates it into `orvex_page_meta` once its consumers repoint. This
 * ticket does not touch it.
 *
 * AC2 (backfill fidelity) — scope note (fix pass 2, review2 finding, not a
 * blocker): this migration is a pure `ALTER TABLE ... ADD COLUMN` with
 * static defaults, not an `INSERT ... SELECT` backfill, because these
 * governance columns never previously existed anywhere in THIS repo's
 * `pages` table to backfill FROM — there is no prior fork-column data on
 * this fork's `dev` to preserve. AC2's literal "backfill existing rows"
 * assertion is therefore vacuous here and reduces to AC3 (a meta-less row
 * reads back `DEFAULT_PAGE_META`, exercised by the RoundTrip DoD test).
 * There is deliberately NO test asserting "AC2 backfill" as such — do not
 * treat AC3's default-read coverage as proof of a data-migrating backfill;
 * if a real backfill is ever needed (e.g. porting from another
 * environment's `pages` columns), it is separate follow-up work with its
 * own INSERT...SELECT migration and its own snapshot-compare test.
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
