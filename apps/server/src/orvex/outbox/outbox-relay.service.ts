import { Injectable, Logger } from '@nestjs/common';
import { CellEnvelopeBuilder } from '../cell/cell-envelope';
import { OrvexOutboxRow } from './outbox.types';

/**
 * OutboxRelay — the worker-role loop that DRAINS `orvex_outbox` and publishes
 * each row to the studio-spine Kafka broker as a CloudEvent (A-EVENTS). It is
 * the SOLE producer onto the spine (producer-before-consumer: satellite Triggers
 * stay scale-to-zero until this relay produces).
 *
 * A-OBSERVE F5: the relay must expose a liveness + lag heartbeat (age of the
 * last-drained row / count of unpublished rows), because a dead relay silently
 * stops ALL emission while the api role's `/api/health` stays green.
 *
 * SCAFFOLD: no Kafka client, no drain loop wired. This runs in the WORKER role
 * only (never api/collab) and must not be started from the vanilla boot path.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);

  constructor(private readonly envelope: CellEnvelopeBuilder) {}

  /** Publish one drained row (builds the frozen envelope, sends to Kafka). */
  async publish(row: OrvexOutboxRow): Promise<void> {
    const event = this.envelope.build({
      type: row.eventType,
      source: '/orvex-wiki/engine',
      workspaceId: row.workspaceId,
      data: row.payload,
    });
    // TODO(fold-in WS-5): produce `event` to envelope.topicFor('wiki') and
    // mark the row published; retry with alerting.
    void event;
    this.logger.debug(`publish ${row.eventType} (scaffold no-op)`);
  }

  /** Relay lag heartbeat for the worker liveness probe + OTLP metric. */
  async lag(): Promise<{ unpublished: number; oldestUnpublishedAgeMs: number }> {
    // TODO(fold-in WS-5): SELECT count(*), age(min(created_at)) WHERE published_at IS NULL.
    return { unpublished: 0, oldestUnpublishedAgeMs: 0 };
  }
}
