import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // ENG-2479 AC2 — see the matching comment in
  // `20260501T202258-page-transclusions.ts`: `.ifNotExists()` guards this
  // migration against re-running `CREATE TABLE`/`CREATE INDEX` on a
  // database that already has these objects but lacks a `kysely_migration`
  // ledger row recorded under this exact filename.
  await db.schema
    .createTable('labels')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('type', 'varchar', (col) => col.notNull().defaultTo('page'))
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

  await db.schema
    .createIndex('labels_workspace_id_type_name_unique')
    .ifNotExists()
    .on('labels')
    .columns(['workspace_id', 'type', 'name'])
    .unique()
    .execute();

  await db.schema
    .createTable('page_labels')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('label_id', 'uuid', (col) =>
      col.references('labels.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('page_labels_page_id_label_id_unique', [
      'page_id',
      'label_id',
    ])
    .execute();

  await db.schema
    .createIndex('page_labels_label_id_idx')
    .ifNotExists()
    .on('page_labels')
    .column('label_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('page_labels').execute();
  await db.schema.dropTable('labels').execute();
}
