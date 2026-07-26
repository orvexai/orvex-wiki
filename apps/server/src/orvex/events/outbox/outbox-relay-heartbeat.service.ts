// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { OrvexMetricsService } from '@orvexai/metrics';
import { Gauge } from 'prom-client';
import { KyselyDB } from '../../../database/types/kysely.types';

/**
 * ENG-2496 AC4 — the default relay staleness bound. The relay polls every
 * 2s (`@Interval('orvex-outbox-relay', 2_000)`); a row still unrelayed
 * after this many seconds means the relay is dead or badly behind — the
 * exact condition a monitor that only checks pod liveness can never see.
 */
export const DEFAULT_RELAY_STALENESS_SECONDS = 30;

export interface RelayHeartbeatSample {
  /** Rows with `relayed_at IS NULL` — the relay's backlog. */
  unrelayedCount: number;
  /** Age (seconds) of the OLDEST unrelayed row; null when backlog is empty. */
  oldestUnrelayedAgeSeconds: number | null;
}

export interface RelayHeartbeatStatus extends RelayHeartbeatSample {
  status: 'pass' | 'fail';
  thresholdSeconds: number;
}

/**
 * ENG-2496 AC4 — the relay liveness + lag heartbeat, derived from the ONE
 * observable truth about relay health: the `orvex_event_outbox` backlog. A
 * dead relay (poll loop stopped, process wedged, broker permanently
 * unreachable) leaves rows unrelayed past the staleness bound, flipping
 * this heartbeat red — it can never read green off a relay that is not
 * actually draining.
 *
 * Exposed BOTH ways (A-OBSERVE):
 *  - as Prometheus gauges registered on the ONE shared `@orvexai/metrics`
 *    registry (po-ruling 10 — never a second `Registry`), scraped over the
 *    existing `GET /metrics` surface; values are read live at scrape time
 *    via each gauge's own `collect()` (never a cached/fabricated figure);
 *  - as the `/health/orvex/relay` HTTP probe (`orvex-health` module, which
 *    reads the same table through its own DB-free raw-pg probe pattern).
 *
 * `status(nowMs)` takes the clock as a parameter (defaulting to the real
 * one) so tests assert threshold-crossing behaviour against fixed fixture
 * timestamps — never a live wall-clock race (❌#9 discipline in tests; the
 * probe's own runtime legitimately reads the current time to compute age).
 */
@Injectable()
export class OutboxRelayHeartbeat implements OnModuleInit {
  private readonly logger = new Logger(OutboxRelayHeartbeat.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @Optional() private readonly metrics: OrvexMetricsService | null = null,
  ) {}

  onModuleInit(): void {
    this.registerGauges();
  }

  /**
   * Register the heartbeat gauges on the shared registry. Split from
   * `onModuleInit` so tests can drive it with a locally-constructed
   * `OrvexMetricsService`. Loud (never a silent green) when the shared
   * registry is not mounted.
   */
  registerGauges(): void {
    if (!this.metrics) {
      this.logger.error(
        'OrvexMetricsService is not mounted — the outbox relay heartbeat gauges are NOT exported; /metrics will not show relay lag (fix the module wiring, do not trust a green dashboard)',
      );
      return;
    }
    const readSample = () => this.sample();
    new Gauge({
      name: 'orvex_outbox_unrelayed_rows',
      help: 'ENG-2496 AC4 — count of orvex_event_outbox rows not yet relayed to Kafka (relayed_at IS NULL). A growing value with a running engine means the relay is dead or behind.',
      registers: [this.metrics.registry],
      async collect() {
        const sample = await readSample();
        this.set(sample.unrelayedCount);
      },
    });
    new Gauge({
      name: 'orvex_outbox_oldest_unrelayed_age_seconds',
      help: 'ENG-2496 AC4 — age in seconds of the oldest unrelayed orvex_event_outbox row (0 when the backlog is empty). Alert when this exceeds the relay staleness bound.',
      registers: [this.metrics.registry],
      async collect() {
        const sample = await readSample();
        this.set(sample.oldestUnrelayedAgeSeconds ?? 0);
      },
    });
  }

  async sample(nowMs = Date.now()): Promise<RelayHeartbeatSample> {
    const row = await this.db
      .selectFrom('orvexEventOutbox')
      .select((eb) => [
        eb.fn.countAll().as('unrelayedCount'),
        eb.fn.min('createdAt').as('oldestCreatedAt'),
      ])
      .where('relayedAt', 'is', null)
      .executeTakeFirstOrThrow();

    const unrelayedCount = Number(row.unrelayedCount);
    const oldestUnrelayedAgeSeconds =
      row.oldestCreatedAt === null
        ? null
        : Math.max(0, (nowMs - new Date(row.oldestCreatedAt).getTime()) / 1000);
    return { unrelayedCount, oldestUnrelayedAgeSeconds };
  }

  async status(
    nowMs = Date.now(),
    thresholdSeconds = DEFAULT_RELAY_STALENESS_SECONDS,
  ): Promise<RelayHeartbeatStatus> {
    const sample = await this.sample(nowMs);
    const stale =
      sample.oldestUnrelayedAgeSeconds !== null &&
      sample.oldestUnrelayedAgeSeconds > thresholdSeconds;
    return {
      ...sample,
      status: stale ? 'fail' : 'pass',
      thresholdSeconds,
    };
  }
}
