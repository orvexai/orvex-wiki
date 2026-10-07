import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('auth_accounts')
    .addColumn('subject_ref', 'varchar(256)')
    .execute();

  await db.schema
    .createIndex('auth_accounts_workspace_subject_ref_unique')
    .on('auth_accounts')
    .columns(['workspace_id', 'subject_ref'])
    .unique()
    .where(sql`subject_ref IS NOT NULL`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('auth_accounts_workspace_subject_ref_unique').execute();
  await db.schema.alterTable('auth_accounts').dropColumn('subject_ref').execute();
}
