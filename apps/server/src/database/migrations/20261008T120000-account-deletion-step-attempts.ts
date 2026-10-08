import { type Kysely, sql } from 'kysely';

/** Terminal acknowledgements keyed by the workflow-generated request id. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('account_deletion_step_attempts')
    .addColumn('request_id', 'uuid', (column) => column.primaryKey())
    .addColumn('deletion_id', 'uuid', (column) => column.notNull())
    .addColumn('step', 'varchar', (column) => column.notNull())
    .addColumn('orvex_tenant', 'uuid', (column) => column.notNull())
    .addColumn('ack', 'jsonb', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await db.schema
    .createIndex('idx_account_deletion_step_attempts_saga')
    .on('account_deletion_step_attempts')
    .columns(['deletion_id', 'step'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('account_deletion_step_attempts').execute();
}
