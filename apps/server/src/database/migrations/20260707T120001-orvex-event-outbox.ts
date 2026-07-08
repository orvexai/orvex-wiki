import { type Kysely, sql } from 'kysely';

/**
 * ENG-1383 — transactional outbox table.
 *
 * `orvex_event_outbox` carries a minimal typed row per domain event
 * (AC9 — no CloudEvent envelope columns, that's the separate catalog leg).
 * `OutboxWriter.enqueue(trx, event)` inserts into this table INSIDE the
 * caller's mutation transaction (AC1/AC2 atomicity). `OutboxRelayService`
 * polls rows where `relayed_at IS NULL`, publishes each to the Kafka
 * studio-spine exactly once, and stamps `relayed_at` (AC3/AC4).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('orvex_event_outbox')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('type', 'varchar', (col) => col.notNull())
    .addColumn('aggregate_id', 'varchar', (col) => col.notNull())
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('relayed_at', 'timestamptz', (col) => col.defaultTo(null))
    .execute();

  // The relay's hot-path query: unrelayed rows, oldest first.
  await db.schema
    .createIndex('idx_orvex_event_outbox_unrelayed')
    .on('orvex_event_outbox')
    .columns(['created_at'])
    .where(sql.ref('relayed_at'), 'is', null)
    .execute();

  await db.schema
    .createIndex('idx_orvex_event_outbox_workspace')
    .on('orvex_event_outbox')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_orvex_event_outbox_aggregate')
    .on('orvex_event_outbox')
    .columns(['type', 'aggregate_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('orvex_event_outbox').execute();
}
