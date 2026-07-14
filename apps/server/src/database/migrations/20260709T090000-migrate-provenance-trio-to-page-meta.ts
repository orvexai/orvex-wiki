import { Kysely, sql } from 'kysely';

/**
 * ENG-1603 — migrate the ENG-1447 AI-provenance trio
 * (`provenance_status`/`provenance_changed_at`/`provenance_changed_by_id`)
 * off `pages` and onto the `orvex_page_meta` side table (ruling 4; ENG-1371
 * AC11 side-table-only invariant; PD-4d deferred second half).
 *
 * `orvex_page_meta.page_id` carries an in-DB FK with `ON DELETE CASCADE`
 * (ENG-1471, `20260707T090000-pages-upsert-dedup.ts`), so once the trio
 * lives here a hard page delete removes the meta row (trio included) in the
 * same statement — no separate-store orphan class is introduced by this
 * move (AC1/AC6).
 *
 * AC2 (backfill fidelity): a real `INSERT ... SELECT ... ON CONFLICT`
 * backfill (not a no-op ALTER-only migration like ENG-1371's) — every
 * pre-migration `pages` row with a non-null provenance trio is preserved
 * 1:1 into `orvex_page_meta` before the source columns are dropped.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('orvex_page_meta')
    .addColumn('provenance_status', 'text', (col) => col.defaultTo(null))
    .addColumn('provenance_changed_at', 'timestamptz', (col) =>
      col.defaultTo(null),
    )
    .addColumn('provenance_changed_by_id', 'uuid', (col) =>
      col.defaultTo(null),
    )
    .execute();

  // AC2 — backfill 1:1 from `pages` into `orvex_page_meta`, creating the
  // meta row where one does not yet exist (a page may have a provenance
  // stamp but no other governance/lifecycle meta written yet).
  await sql`
    INSERT INTO "orvex_page_meta"
      ("page_id", "workspace_id", "provenance_status", "provenance_changed_at", "provenance_changed_by_id")
    SELECT "id", "workspace_id", "provenance_status", "provenance_changed_at", "provenance_changed_by_id"
    FROM "pages"
    WHERE "provenance_status" IS NOT NULL
       OR "provenance_changed_at" IS NOT NULL
       OR "provenance_changed_by_id" IS NOT NULL
    ON CONFLICT ("page_id") DO UPDATE SET
      "provenance_status" = EXCLUDED."provenance_status",
      "provenance_changed_at" = EXCLUDED."provenance_changed_at",
      "provenance_changed_by_id" = EXCLUDED."provenance_changed_by_id"
  `.execute(db);

  // AC1 — `pages` no longer carries the trio.
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

/**
 * AC5 — reverses the move: recreates the trio on `pages`, backfills from
 * `orvex_page_meta`, then drops the trio from the side table.
 */
export async function down(db: Kysely<any>): Promise<void> {
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

  await sql`
    UPDATE "pages"
    SET
      "provenance_status" = "m"."provenance_status",
      "provenance_changed_at" = "m"."provenance_changed_at",
      "provenance_changed_by_id" = "m"."provenance_changed_by_id"
    FROM "orvex_page_meta" AS "m"
    WHERE "m"."page_id" = "pages"."id"
      AND (
        "m"."provenance_status" IS NOT NULL
        OR "m"."provenance_changed_at" IS NOT NULL
        OR "m"."provenance_changed_by_id" IS NOT NULL
      )
  `.execute(db);

  await db.schema
    .alterTable('orvex_page_meta')
    .dropColumn('provenance_changed_by_id')
    .execute();
  await db.schema
    .alterTable('orvex_page_meta')
    .dropColumn('provenance_changed_at')
    .execute();
  await db.schema
    .alterTable('orvex_page_meta')
    .dropColumn('provenance_status')
    .execute();
}
