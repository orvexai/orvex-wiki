// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { KyselyDB } from '../../../database/types/kysely.types';
import { CELL_SOLO, OrvexConfigService } from '../../config/orvex-config.service';
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
import { resolveWikiEventsTopic } from './outbox-topic.resolver';

/**
 * Narrow seam the relay needs from `OrvexConfigService` (dependency
 * inversion — the relay depends on this small interface, not the whole
 * config surface; `OrvexConfigService` satisfies it structurally, so no
 * extra wiring is needed at the DI site). Tests substitute a plain object.
 *
 * - `cellId` — ENG-1559 M5 AC8: the CloudEvents `orvexcell` extension
 *   attribute (cell-contract rule #6), REQUIRED on every event over the
 *   real Kafka spine (pinned events/schemas/_envelope.json `required`).
 *   ENG-2496 AC2 additionally names the per-cell topic from it
 *   (`resolveWikiEventsTopic`).
 * - `kafkaBrokersConfigured` — ENG-2496 AC5: gates the boot-time
 *   topic-shape assertion so an unwired solo/dev/crew boot NO-OPs instead
 *   of requiring a broker that does not exist in that mode.
 */
export interface OutboxCellResolver {
  cellId: string | null;
  kafkaBrokersConfigured: boolean;
}

/** Result of the ENG-2496 AC2 boot-time topic-shape assertion. */
export interface TopicShapeResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
}

// The Solo-sentinel cell constant (`CELL_SOLO`) now lives beside
// `OrvexConfigService.cellId` (one declaration, CS §3.1) — imported above.

/**
 * The CloudEvents Kafka Protocol Binding structured-mode marker
 * (matches orvex-studio-lib `pkg/events.BrokerPublisher`'s own
 * `contentTypeStructuredCloudEvent` precedent verbatim) — without it a
 * Knative KafkaSource bridging this topic would re-wrap the record under a
 * generic type and lose the real catalog `type` to every downstream Trigger
 * filter (ENG-2006 defect-3). The direct Kafka consumers this repo's own
 * satellites run (segmentio/kafka-go `ParseEnvelope`) read the JSON body
 * directly and do not require the header, but it costs nothing to carry.
 */
const CONTENT_TYPE_STRUCTURED_CLOUDEVENT = 'application/cloudevents+json';

/**
 * ENG-1383 T2/AC3/AC4 — the relay: ships unrelayed outbox rows straight to
 * the Kafka studio-spine (NO Redis→Kafka bridge stage — D-S13). Liveness /
 * event-tier plumbing, no business logic (4c). Ordering is by `created_at`
 * (row data), never `Date.now()` in decision logic (❌#9).
 *
 * ENG-1559 M5 AC8 — the wire value is a REAL CloudEvents 1.0 structured-mode
 * envelope conforming to the pinned `events/schemas/_envelope.json`
 * (orvex-studio-contracts, commit b70adda2): `specversion`/`id`/`source`/
 * `type` (the outbox row's `type` under the `wiki.` catalog domain prefix —
 * this repo is the sole `wiki.*` publisher, cell-contract.md `domains`) plus
 * the two REQUIRED extension attributes `orvexcell` (rule #6) and
 * `orvextenant` (obligations.tenant_extension — a workspace IS the tenant
 * boundary for wiki.* events). This replaces the pre-AC8 raw kafkajs JSON
 * `{type, aggregateId, workspaceId, payload}` shape a downstream consumer
 * could never parse as a CloudEvent (ENG-2006 defect-3).
 *
 * Delivery semantics: at-least-once from the relay's own crash-retry window
 * (a crash between a successful broker publish and the `relayed_at` stamp
 * leaves the row unrelayed and it is retried), made effectively exactly-once
 * by publishing with the outbox row id as BOTH the Kafka message key AND the
 * CloudEvents `id` — consumers (and the embedded-broker test double) dedupe
 * by that key/id, per the "idempotent by outbox id / dedupe key" wording in
 * AC3 and the 4f mocking strategy. This relay never mutates already-relayed
 * rows and never double-marks a row.
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(KAFKA_PUBLISHER_PORT)
    private readonly publisher: KafkaPublisherPort,
    // Injected by the concrete OrvexConfigService token (interfaces have no
    // runtime token), typed narrowly (OutboxCellResolver) to what this
    // relay actually needs.
    @Inject(OrvexConfigService)
    private readonly configService: OutboxCellResolver,
  ) {}

  /**
   * ENG-2496 AC2/AC5 — assert the per-cell single-partition topic shape
   * once at boot. NEVER throws and NEVER blocks startup: an unwired boot
   * (no `KAFKA_BROKERS` — solo/dev/crew, AC5) no-ops, and any metadata
   * failure logs LOUDLY (an error, not a silent swallow) so a wrongly-
   * partitioned or missing topic is visible from the first boot line.
   */
  async onModuleInit(): Promise<void> {
    await this.assertPerCellTopicShape();
  }

  async assertPerCellTopicShape(): Promise<TopicShapeResult> {
    const topic = resolveWikiEventsTopic(this.configService.cellId);
    if (!this.configService.kafkaBrokersConfigured) {
      // AC5 — the solo/unwired sentinel no-op: standalone/dev/crew boots
      // must not require a cell registry or a live broker.
      this.logger.debug(
        `Kafka not configured — skipping boot-time topic-shape assertion for ${topic}`,
      );
      return { ok: true, skipped: true };
    }
    if (!this.publisher.fetchTopicPartitionCount) {
      this.logger.error(
        `Outbox topic-shape assertion: the Kafka publisher port cannot report topic metadata; cannot verify ${topic} is single-partition (cell-contract rule #5)`,
      );
      return { ok: false, reason: 'port-cannot-report-metadata' };
    }
    try {
      const partitions = await this.publisher.fetchTopicPartitionCount(topic);
      if (partitions === null) {
        this.logger.error(
          `Outbox topic-shape assertion FAILED: topic ${topic} does not exist on the configured brokers (cell-contract rule #5 requires the per-cell topic ahead of publish)`,
        );
        return { ok: false, reason: 'topic-missing' };
      }
      if (partitions !== 1) {
        this.logger.error(
          `Outbox topic-shape assertion FAILED: topic ${topic} has ${partitions} partitions — cell-contract rule #5 requires exactly 1 (single ordered writer)`,
        );
        return { ok: false, reason: `partitions=${partitions}` };
      }
      this.logger.log(
        `Outbox topic-shape assertion OK: ${topic} exists with 1 partition`,
      );
      return { ok: true };
    } catch (err) {
      this.logger.error(
        `Outbox topic-shape assertion could not fetch metadata for ${topic}: ${err}`,
      );
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

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
    // ENG-2496 AC2 — the per-cell single-partition topic
    // (`wiki-events.{cell}` / `wiki-events.solo`), replacing the flat
    // KAFKA_OUTBOX_TOPIC every domain and cell previously shared.
    const topic = resolveWikiEventsTopic(this.configService.cellId);

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
        // ENG-1559 M5 AC8 — the real CloudEvents 1.0 structured-mode
        // envelope (pinned events/schemas/_envelope.json). `id` is the
        // outbox row's OWN id (dedupe key, matching the Kafka message key
        // below); `type` prefixes the catalog `wiki.` domain (this repo is
        // the sole wiki.* publisher); `orvexcell`/`orvextenant` are the two
        // REQUIRED extension attributes (rule #6 / obligations.tenant_
        // extension — a workspace IS the tenant boundary for wiki.*
        // events). `time` is the outbox row's OWN `created_at` (row data,
        // never `Date.now()` at decision time, ❌#9). `data` carries the
        // row's own payload plus the FR-C18 correlation id (a JSON field,
        // not a CloudEvents attribute name — `correlation_id`'s underscore
        // is not a valid CloudEvents attribute name, cell-contract.md).
        const cell = this.configService.cellId || CELL_SOLO;
        await this.publisher.publish({
          topic,
          key: row.id,
          headers: { 'content-type': CONTENT_TYPE_STRUCTURED_CLOUDEVENT },
          value: JSON.stringify({
            specversion: '1.0',
            id: row.id,
            source: '//orvex-wiki',
            type: `wiki.${row.type}`,
            subject: row.aggregateId,
            time: new Date(row.createdAt).toISOString(),
            datacontenttype: 'application/json',
            orvexcell: cell,
            orvextenant: row.workspaceId,
            // ENG-1600 AC2/AC3 — the CloudEvents Distributed-Tracing
            // extension attributes (names verbatim per the spec), carried
            // on the envelope the relay emits.
            traceparent: producerTraceContext.traceparent,
            tracestate: producerTraceContext.tracestate,
            data: {
              ...(row.payload as Record<string, unknown>),
              correlation_id: row.correlationId,
            },
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
