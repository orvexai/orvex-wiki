import { type Kysely, sql } from 'kysely';

/** Durable terminal acknowledgements for the account-deletion saga. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('account_deletion_step_results')
    .addColumn('deletion_id', 'uuid', (col) => col.notNull())
    .addColumn('step', 'varchar', (col) => col.notNull())
    .addColumn('ack', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint(
      'account_deletion_step_results_pkey',
      ['deletion_id', 'step'],
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('account_deletion_step_results').execute();
}
