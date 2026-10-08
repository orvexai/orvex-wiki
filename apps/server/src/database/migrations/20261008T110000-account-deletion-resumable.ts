import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('account_deletion_step_results')
    .addColumn('resumable_at', 'timestamptz')
    .execute();

  await db.schema
    .createTable('account_deletion_paused_workspaces')
    .addColumn('deletion_id', 'uuid', (column) => column.notNull())
    .addColumn('workspace_id', 'uuid', (column) => column.notNull())
    .addColumn('orvex_tenant', 'uuid', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('account_deletion_paused_workspaces_pkey', [
      'deletion_id',
      'workspace_id',
    ])
    .execute();
  await db.schema
    .createIndex('idx_account_deletion_paused_workspaces_workspace')
    .on('account_deletion_paused_workspaces')
    .column('workspace_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('account_deletion_paused_workspaces').execute();
  await db.schema
    .alterTable('account_deletion_step_results')
    .dropColumn('resumable_at')
    .execute();
}
