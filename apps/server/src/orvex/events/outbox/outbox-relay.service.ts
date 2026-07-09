// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { KyselyDB } from '../../../database/types/kysely.types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  KAFKA_PUBLISHER_PORT,
  KafkaPublisherPort,
} from './kafka-publisher.port';
import { getOrvexTracer } from '../../obs/orvex-tracing.bootstrap';
import { buildSpanAttributes } from '../../obs/orvex-span-attributes.util';
import {
  injectOutboxTraceContext,
  restoreOutboxTraceContext,
} from './orvex-outbox-trace-context.util';

/**
 * Narrow seam the relay actually needs from `EnvironmentService` (dependency
 * inversion — the relay depends on this small interface, not the whole
 * environment surface; `EnvironmentService` satisfies it structurally, so no
 * extra wiring is needed at the DI site). Tests substitute a plain object.
 */
export interface OutboxTopicResolver {
  getKafkaOutboxTopic(): string;
}

/**
 * ENG-1383 T2/AC3/AC4 — the relay: ships unrelayed outbox rows straight to
 * the Kafka studio-spine (NO Redis→Kafka bridge stage — D-S13). Liveness /
 * event-tier plumbing, no business logic (4c). Ordering is by `created_at`
 * (row data), never `Date.now()` in decision logic (❌#9).
 *
 * Delivery semantics: at-least-once from the relay's own crash-retry window
 * (a crash between a successful broker publish and the `relayed_at` stamp
 * leaves the row unrelayed and it is retried), made effectively exactly-once
 * by publishing with the outbox row id as the Kafka message key — consumers
 * (and the embedded-broker test double) dedupe by that key, per the
 * "idempotent by outbox id / dedupe key" wording in AC3 and the 4f mocking
 * strategy. This relay never mutates already-relayed rows and never
 * double-marks a row.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(KAFKA_PUBLISHER_PORT)
    private readonly publisher: KafkaPublisherPort,
    // Injected by the concrete EnvironmentService token (interfaces have no
    // runtime token), typed narrowly to what this relay actually needs.
    @Inject(EnvironmentService)
    private readonly environmentService: OutboxTopicResolver,
  ) {}

  /**
   * Runs off the hot path (4i Operational — a Kafka outage never blocks a
   * mutation; the outbox buffers, this poller catches up).
   */
  @Interval('orvex-outbox-relay', 2_000)
  async poll(): Promise<void> {
    try {
      await this.run();
    } catch (err) {
      this.logger.error(`Outbox relay poll failed: ${err}`);
    }
  }

  /**
   * Publish every currently-unrelayed row, oldest first, marking each
   * `relayed_at` immediately after a successful publish. One row's publish
   * failure does not block the rest of the batch; it is logged and left
   * unrelayed for the next run.
   */
  async run(batchSize = 100): Promise<{ published: number; failed: number }> {
    const topic = this.environmentService.getKafkaOutboxTopic();

    const rows = await this.db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('relayedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .limit(batchSize)
      .execute();

    let published = 0;
    let failed = 0;

    for (const row of rows) {
      // ENG-1600 AC2 — restore the ORIGINAL request's trace context
      // (persisted on the row at write time, AC1) so this relay's producer
      // span is a child of that trace, not an unrelated new root — closing
      // the api->worker gap (the row waited in Postgres, drained by a
      // different process than the one that wrote it).
      const restoredCtx = restoreOutboxTraceContext({
        traceparent: row.traceparent,
        tracestate: row.tracestate,
      });
      const tracer = getOrvexTracer();
      const producerSpan = tracer.startSpan(
        'orvex.outbox.relay.publish',
        {
          kind: SpanKind.PRODUCER,
          attributes: buildSpanAttributes({
            workspaceId: row.workspaceId,
            correlationId: row.correlationId,
          }),
        },
        restoredCtx,
      );
      // AC4 — the traceparent/tracestate exposed to the outgoing CloudEvent
      // is THIS producer span's own context (not the original request's),
      // so a consumer links to the producer specifically.
      const producerTraceContext = injectOutboxTraceContext(
        trace.setSpan(restoredCtx, producerSpan),
      );

      try {
        await this.publisher.publish({
          topic,
          key: row.id,
          value: JSON.stringify({
            type: row.type,
            aggregateId: row.aggregateId,
            workspaceId: row.workspaceId,
            payload: row.payload,
            // ENG-1600 AC2/AC3 — the CloudEvents Distributed-Tracing
            // extension attributes (names verbatim per the spec) plus the
            // FR-C18 correlation id, carried on the message envelope the
            // relay emits. Full CloudEvent envelope shaping (specversion/
            // source/id and the `wiki.*` catalog declaration, ENG-1365) is
            // the separate cross-repo `orvex-studio-contracts` leg (T4) —
            // out of this repo's scope; this only adds the tracing
            // extension fields to what the relay already publishes.
            traceparent: producerTraceContext.traceparent,
            tracestate: producerTraceContext.tracestate,
            correlation_id: row.correlationId,
          }),
        });

        // Conditional on relayedAt IS NULL: an idempotent no-op if this row
        // was already claimed/marked by a concurrent relay run.
        await this.db
          .updateTable('orvexEventOutbox')
          .set({ relayedAt: sql<Date>`now()` })
          .where('id', '=', row.id)
          .where('relayedAt', 'is', null)
          .execute();

        published++;
      } catch (err) {
        failed++;
        producerSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        this.logger.warn(
          `Outbox relay failed to publish row ${row.id} (${row.type}): ${err}`,
        );
      } finally {
        producerSpan.end();
      }
    }

    return { published, failed };
  }
}
