/**
 * The transactional outbox (FR-W5 / A-EVENTS).
 *
 * One outbox row is committed in the SAME DB transaction as each domain
 * mutation (covering the collab `onStoreDocument` write path). A worker-role
 * relay drains the rows and publishes them straight to the studio-spine Kafka
 * broker as CloudEvents. The transactional outbox + relay IS the mechanism
 * (D-S13) — there is NO Redis→Kafka bridge, and no `EventEmitter2 → Redis XADD`
 * dual-write.
 *
 * A-CELL rule #7: UUIDv7 PK, workspace-keyed, no `cell_id` column.
 */
export interface OrvexOutboxRow {
  /** UUIDv7. */
  id: string;
  /** Per-tenant Kafka ordering key (`partitionkey`). */
  workspaceId: string;
  /** CloudEvent `type`, e.g. `wiki.page.content_updated`. */
  eventType: string;
  /** The domain payload (serialized to the CloudEvent `data`). */
  payload: unknown;
  /** null until the relay publishes it (drives the lag heartbeat, A-OBSERVE). */
  publishedAt: Date | null;
  createdAt: Date;
}

/** Representative engine-produced event types (contracts CloudEvent catalog). */
export type WikiEventType =
  | 'wiki.page.created'
  | 'wiki.page.content_updated'
  | 'wiki.page.deleted'
  | 'wiki.page.moved'
  | 'wiki.page.restored'
  | 'wiki.user.deprovision.requested'
  // billing.* signals emitted after severing the upstream Stripe seat-sync
  // (FR-W21 / A-BOUNDARY) — the engine never talks to Stripe.
  | 'billing.seat.added'
  | 'billing.seat.removed';
