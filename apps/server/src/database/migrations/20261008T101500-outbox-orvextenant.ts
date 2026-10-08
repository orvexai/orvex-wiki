import { type Kysely } from 'kysely';

/** Store the CloudEvent tenant independently from a Wiki workspace FK. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('orvex_event_outbox')
    .alterColumn('workspace_id', (column) => column.dropNotNull())
    .addColumn('orvex_tenant', 'uuid')
    .execute();

  await db
    .updateTable('orvex_event_outbox')
    .set({ orvex_tenant: (eb) => eb.ref('workspace_id') })
    .where('orvex_tenant', 'is', null)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('orvex_event_outbox')
    .dropColumn('orvex_tenant')
    .execute();
  // Existing rows and all established emitters carry a Wiki workspace ID.
  await db.schema
    .alterTable('orvex_event_outbox')
    .alterColumn('workspace_id', (column) => column.setNotNull())
    .execute();
}
