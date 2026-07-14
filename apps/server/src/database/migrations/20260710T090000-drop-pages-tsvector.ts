import { type Kysely, sql } from 'kysely';

/**
 * ENG-1451 — decommission the engine's Postgres full-text-search (FTS)
 * surface. Hero/semantic/hybrid search relocates to `knowledge`
 * (Turbopuffer, ENG-1479 — landed) so the engine no longer needs its own
 * search brain. The engine KEEPS `/search/suggest` (ILIKE), which never
 * queried `tsv` (see `search.service.ts` `searchSuggestions`).
 *
 * Lands coordinated-with (not before) ENG-1479 per ruling 5 — that leg is
 * Done, so hero search is never absent at any point this migration runs.
 *
 * Drops, in dependency order:
 *  - `pages_tsvector_update` trigger + `pages_tsvector_trigger()` function
 *    (created by 20240324T086800-pages-tsvector-trigger.ts, updated by
 *    20250729T213756-add-unaccent-pg_trm-update-tsvector..ts)
 *  - `pages_tsv_idx` GIN index + `pages.tsv` column
 *    (created by 20240324T086300-pages.ts)
 *  - `attachments_tsv_idx` GIN index + `attachments.tsv` column
 *    (created by 20250901T184612-attachments-search.ts) — AC6: this
 *    surface is unqueried anywhere in `search.service.ts` (no attachment
 *    hero-search path ever landed), so it is dropped alongside the page
 *    tsv drop rather than left as a dangling unused column. NOTE:
 *    `attachments.text_content` is retained untouched — it is the raw
 *    extracted text and may still be a future knowledge-indexing input.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS pages_tsvector_update ON pages`.execute(db);
  await sql`DROP FUNCTION IF EXISTS pages_tsvector_trigger`.execute(db);

  await db.schema.dropIndex('pages_tsv_idx').ifExists().execute();
  await db.schema
    .alterTable('pages')
    .dropColumn('tsv')
    .execute();

  await db.schema.dropIndex('attachments_tsv_idx').ifExists().execute();
  await db.schema
    .alterTable('attachments')
    .dropColumn('tsv')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('attachments')
    .addColumn('tsv', sql`tsvector`, (col) => col)
    .execute();
  await db.schema
    .createIndex('attachments_tsv_idx')
    .on('attachments')
    .using('GIN')
    .column('tsv')
    .execute();

  await db.schema
    .alterTable('pages')
    .addColumn('tsv', sql`tsvector`, (col) => col)
    .execute();
  await db.schema
    .createIndex('pages_tsv_idx')
    .on('pages')
    .using('GIN')
    .column('tsv')
    .execute();

  await sql`CREATE OR REPLACE FUNCTION pages_tsvector_trigger() RETURNS trigger AS $$
        begin
            new.tsv :=
                      setweight(to_tsvector('english', f_unaccent(coalesce(new.title, ''))), 'A') ||
                      setweight(to_tsvector('english', f_unaccent(substring(coalesce(new.text_content, ''), 1, 1000000))), 'B');
            return new;
        end;
        $$ LANGUAGE plpgsql;`.execute(db);

  await sql`CREATE OR REPLACE TRIGGER pages_tsvector_update BEFORE INSERT OR UPDATE
                ON pages FOR EACH ROW EXECUTE FUNCTION pages_tsvector_trigger();`.execute(
    db,
  );
}
