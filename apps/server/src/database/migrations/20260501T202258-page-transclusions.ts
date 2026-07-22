import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // ENG-2479 AC2 — `.ifNotExists()` on both tables/indexes below: Kysely
  // tracks "already applied" purely by this file's NAME in `kysely_migration`
  // (never by inspecting the objects a migration creates). If a target
  // database ever has these tables already present without a matching
  // `kysely_migration` row for this exact filename (a v0.95 install whose
  // ledger recorded them under a different name, a restored/rebuilt ledger,
  // etc.), a plain `createTable` re-runs `CREATE TABLE` and crash-loops the
  // boot. `.ifNotExists()` makes re-applying this migration a safe no-op
  // instead, matching the convention already used by
  // `20260501T092214-scim.ts` / `20260529T125146-bases.ts`.
  await db.schema
    .createTable('page_transclusions')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('transclusion_id', 'varchar', (col) => col.notNull())
    .addColumn('content', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('page_transclusions_page_transclusion_unique', [
      'page_id',
      'transclusion_id',
    ])
    .execute();

  await db.schema
    .createIndex('idx_page_transclusions_workspace')
    .ifNotExists()
    .on('page_transclusions')
    .column('workspace_id')
    .execute();

  await db.schema
    .createTable('page_transclusion_references')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('reference_page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('source_page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('transclusion_id', 'varchar', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('page_transclusion_references_unique', [
      'reference_page_id',
      'source_page_id',
      'transclusion_id',
    ])
    .execute();

  await db.schema
    .createIndex('idx_page_transclusion_references_source')
    .ifNotExists()
    .on('page_transclusion_references')
    .columns(['source_page_id', 'transclusion_id'])
    .execute();

  await db.schema
    .createIndex('idx_page_transclusion_references_workspace')
    .ifNotExists()
    .on('page_transclusion_references')
    .column('workspace_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('page_transclusion_references').execute();
  await db.schema.dropTable('page_transclusions').execute();
}
