import { Kysely, sql } from 'kysely';

/**
 * ENG-1471 — pages upsert + duplicate-title prevention + storm hardening.
 *
 * 1. `pages_unique_title_per_parent` — a partial unique index guarding
 *    against duplicate sibling titles under the same (space, parent). NULLs
 *    are treated as NOT DISTINCT (two NULL parent_page_id rows collide, i.e.
 *    two root pages with the same title in the same space collide) but a
 *    NULL *title* is exempt, and a soft-deleted sibling never collides.
 * 2. `orvex_page_meta` — a side table (ruling 4) carrying the idempotent-
 *    upsert bookkeeping (`external_id`, `content_hash`, `version`) WITHOUT
 *    adding columns to the pristine `pages` table.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Kysely's schema builder has no `nullsNotDistinct()` for indexes in the
  // pinned version — raw DDL for the NULLS NOT DISTINCT partial unique index.
  await sql`
    CREATE UNIQUE INDEX "pages_unique_title_per_parent"
    ON "pages" ("space_id", "parent_page_id", "title") NULLS NOT DISTINCT
    WHERE "title" IS NOT NULL AND "deleted_at" IS NULL
  `.execute(db);

  await db.schema
    .createTable('orvex_page_meta')
    .addColumn('page_id', 'uuid', (col) =>
      col.primaryKey().references('pages.id').onDelete('cascade'),
    )
    .addColumn('external_id', 'varchar', (col) => col)
    .addColumn('content_hash', 'varchar', (col) => col)
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // externalId is looked up scoped to a workspace (dimension-2 lookup) — a
  // partial unique index so multiple pages may share a NULL external_id.
  await db.schema
    .createIndex('orvex_page_meta_external_id_workspace_idx')
    .on('orvex_page_meta')
    .columns(['workspace_id', 'external_id'])
    .unique()
    .where('external_id', 'is not', null)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('orvex_page_meta').execute();
  await db.schema.dropIndex('pages_unique_title_per_parent').execute();
}
