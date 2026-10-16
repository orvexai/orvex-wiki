import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('account_deletion_step_results')
    .addColumn('result_note', 'varchar(64)')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('account_deletion_step_results')
    .dropColumn('result_note')
    .execute();
}
