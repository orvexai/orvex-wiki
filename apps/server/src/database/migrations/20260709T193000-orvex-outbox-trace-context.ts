import { type Kysely } from 'kysely';

/**
 * ENG-1600 AC1 — persist W3C trace context + correlation id on the
 * transactional outbox row (`orvex_event_outbox`, created by ENG-1383),
 * captured by `OutboxWriter.enqueue` at write time in the SAME transaction
 * as the domain mutation, and restored by `OutboxRelayService` at drain
 * time so a trace initiated at an engine HTTP request connects across the
 * async outbox->Kafka boundary.
 *
 * Additive-only (new migration, not an edit to ENG-1383's already-merged
 * migration): all three columns are nullable — a row written before this
 * migration, or while tracing is off, simply carries none of them, and the
 * relay treats that as "no context to restore" (see
 * `orvex-outbox-trace-context.util.ts`).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('orvex_event_outbox')
    .addColumn('traceparent', 'varchar', (col) => col.defaultTo(null))
    .addColumn('tracestate', 'varchar', (col) => col.defaultTo(null))
    .addColumn('correlation_id', 'varchar', (col) => col.defaultTo(null))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('orvex_event_outbox')
    .dropColumn('traceparent')
    .dropColumn('tracestate')
    .dropColumn('correlation_id')
    .execute();
}
