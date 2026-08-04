// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import * as path from 'path';
import { promises as fs } from 'fs';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { Gauge } from 'prom-client';

import { OrvexMetricsService } from '../../../../metrics/metrics-service';

import {
  DEFAULT_RELAY_STALENESS_SECONDS,
  OutboxRelayHeartbeat,
} from '../../outbox-relay-heartbeat.service';
import { OutboxRelayService } from '../../outbox-relay.service';
import { InMemoryKafkaPublisher } from '../in-memory-kafka-publisher';
import { OrvexConfigService } from '../../../../config/orvex-config.service';
import { defaultRelayOutboxProbe } from '../../../../health/orvex-health.probes';
import { OrvexHealthService } from '../../../../health/orvex-health.service';
import type { DbInterface } from '../../../../../database/types/db.interface';
import type { KyselyDB } from '../../../../../database/types/kysely.types';
import type { Json } from '../../../../../database/types/db';

/**
 * ENG-2496 AC4 — the relay liveness + lag heartbeat: probe AND Prometheus
 * metric. Real testcontainers Postgres; real `OutboxRelayHeartbeat` and
 * real `defaultRelayOutboxProbe` (never a mock of own code, ❌#4).
 * Determinism (❌#9): staleness assertions use FIXED fixture timestamps and
 * a FIXED injected `now` — never a live wall-clock comparison in an
 * assertion body.
 */
describe('OutboxRelayHeartbeatSpec (ENG-2496 AC4)', () => {
  jest.setTimeout(120_000);

  // Fixed clock anchor for all staleness assertions (❌#9 — no live
  // wall-clock race; the fixture rows are inserted RELATIVE to this).
  const ANCHOR_MS = Date.parse('2026-07-01T12:00:00.000Z');

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let workspaceId: string;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(
      __dirname,
      '../../../../../database/migrations',
    );
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    db = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end();
    await pgContainer?.stop();
  });

  beforeEach(async () => {
    const ws = await db
      .insertInto('workspaces')
      .values({
        name: 'ENG-2496 heartbeat WS',
        hostname: `hb-${Date.now()}-${Math.random()}`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;
  });

  afterEach(async () => {
    await db
      .deleteFrom('orvexEventOutbox')
      .where('workspaceId', '=', workspaceId)
      .execute();
    await db.deleteFrom('workspaces').where('id', '=', workspaceId).execute();
  });

  /** Insert unrelayed fixture rows with an EXPLICIT createdAt (fixture
   * timestamp, ❌#9) — the heartbeat's staleness input. */
  async function insertUnrelayedRows(
    count: number,
    createdAt: Date,
  ): Promise<void> {
    for (let i = 0; i < count; i++) {
      await db
        .insertInto('orvexEventOutbox')
        .values({
          type: 'page.created',
          aggregateId: `00000000-0000-7000-8000-00000000000${i}`,
          workspaceId,
          payload: { fixture: true } as unknown as Json,
          createdAt,
        })
        .execute();
    }
  }

  it('TestRelayHeartbeatFlipsRedOnStaleUnrelayedRows — N rows stuck unrelayed past the staleness threshold flip the heartbeat from pass to fail (fixed clock, fixed fixtures)', async () => {
    const heartbeat = new OutboxRelayHeartbeat(db, null);

    // Empty backlog — pass.
    const empty = await heartbeat.status(ANCHOR_MS);
    expect(empty.status).toBe('pass');
    expect(empty.unrelayedCount).toBe(0);
    expect(empty.oldestUnrelayedAgeSeconds).toBeNull();

    // Fresh backlog (5s old, threshold 30s) — still pass.
    await insertUnrelayedRows(1, new Date(ANCHOR_MS - 5_000));
    const fresh = await heartbeat.status(ANCHOR_MS);
    expect(fresh.status).toBe('pass');
    expect(fresh.unrelayedCount).toBe(1);

    // Stale backlog (120s old > 30s threshold) — fail, with the real
    // count/age carried (never a fabricated figure).
    await insertUnrelayedRows(3, new Date(ANCHOR_MS - 120_000));
    const stale = await heartbeat.status(ANCHOR_MS);
    expect(stale.status).toBe('fail');
    expect(stale.unrelayedCount).toBe(4);
    expect(stale.oldestUnrelayedAgeSeconds).toBe(120);
    expect(stale.thresholdSeconds).toBe(DEFAULT_RELAY_STALENESS_SECONDS);
  });

  it('TestRelayHeartbeatFlipsRedWhenPollLoopStopped — a genuinely dead relay (poll loop never running) reads red, and only ACTUAL draining by the real relay turns it green again', async () => {
    const heartbeat = new OutboxRelayHeartbeat(db, null);

    // Rows accumulate while the @Interval poll loop is NOT running (this
    // harness never starts the scheduler — the exact dead-relay condition a
    // pod-liveness-only monitor can never see).
    await insertUnrelayedRows(2, new Date(ANCHOR_MS - 300_000));
    const dead = await heartbeat.status(ANCHOR_MS);
    expect(dead.status).toBe('fail');

    // The REAL relay drains the backlog — the heartbeat goes green only
    // because rows were actually relayed, not because time passed.
    const publisher = new InMemoryKafkaPublisher();
    const relay = new OutboxRelayService(db, publisher, {
      cellId: null,
      kafkaBrokersConfigured: false,
    });
    const run = await relay.run();
    expect(run.failed).toBe(0);
    expect(run.published).toBeGreaterThanOrEqual(2);

    const drained = await heartbeat.status(ANCHOR_MS);
    expect(drained.status).toBe('pass');
    expect(drained.unrelayedCount).toBe(0);
  });

  it('TestRelayHeartbeatMetricReflectsUnrelayedCountAndAge — the gauges on the shared engine-resident metrics registry (ENG-3149 inline) report the live unrelayed count and oldest-row age at scrape time', async () => {
    const metrics = new OrvexMetricsService();
    const heartbeat = new OutboxRelayHeartbeat(db, metrics);
    heartbeat.registerGauges();

    await insertUnrelayedRows(3, new Date(ANCHOR_MS - 120_000));

    const countGauge = metrics.registry.getSingleMetric(
      'orvex_outbox_unrelayed_rows',
    ) as Gauge;
    const ageGauge = metrics.registry.getSingleMetric(
      'orvex_outbox_oldest_unrelayed_age_seconds',
    ) as Gauge;
    expect(countGauge).toBeDefined();
    expect(ageGauge).toBeDefined();

    // `get()` runs each gauge's own `collect()` — the scrape-time read.
    const countValue = (await countGauge.get()).values[0].value;
    expect(countValue).toBe(3);
    // The fixture rows are anchored in the past relative to any real
    // scrape moment, so the age is at least the fixture offset (monotonic
    // — no equality race on a live clock).
    const ageValue = (await ageGauge.get()).values[0].value;
    expect(ageValue).toBeGreaterThanOrEqual(120);

    // The metric names appear on the ONE shared registry's exposition
    // surface (the same `GET /metrics` scrape body).
    const exposition = await metrics.getMetrics();
    expect(exposition).toContain('orvex_outbox_unrelayed_rows');
    expect(exposition).toContain('orvex_outbox_oldest_unrelayed_age_seconds');
  });

  it('ENG-2496 AC4 (probe leg) — /health/orvex/relay: defaultRelayOutboxProbe reads the same backlog over the DB-free raw-pg pattern; stale ⇒ fail, drained ⇒ pass, unreachable DB ⇒ typed fail (never a hang or an unhandled rejection)', async () => {
    const config = new OrvexConfigService({
      DATABASE_URL: pgContainer.getConnectionUri(),
    } as NodeJS.ProcessEnv);
    const healthService = new OrvexHealthService(
      config,
      undefined,
      undefined,
      undefined,
      undefined,
      defaultRelayOutboxProbe,
    );

    // Stale rows (fixture far in the past; the probe ages by the
    // DATABASE's own clock) — red.
    await insertUnrelayedRows(2, new Date(ANCHOR_MS - 120_000));
    const staleBody = await healthService.relayHeartbeat();
    expect(staleBody.status).toBe('fail');
    expect(staleBody.relay.ok).toBe(false);
    expect(staleBody.relay.unrelayedCount).toBe(2);
    expect(staleBody.relay.thresholdSeconds).toBe(
      DEFAULT_RELAY_STALENESS_SECONDS,
    );

    // Drained — green.
    const publisher = new InMemoryKafkaPublisher();
    const relay = new OutboxRelayService(db, publisher, {
      cellId: null,
      kafkaBrokersConfigured: false,
    });
    await relay.run();
    const drainedBody = await healthService.relayHeartbeat();
    expect(drainedBody.status).toBe('pass');
    expect(drainedBody.relay.ok).toBe(true);
    expect(drainedBody.relay.unrelayedCount).toBe(0);
    expect(drainedBody.relay.oldestUnrelayedAgeSeconds).toBeNull();

    // Unconfigured DB — a typed, loud fail (never a silently-green
    // default, never an unhandled rejection).
    const unconfigured = new OrvexConfigService({} as NodeJS.ProcessEnv);
    const unconfiguredService = new OrvexHealthService(
      unconfigured,
      undefined,
      undefined,
      undefined,
      undefined,
      defaultRelayOutboxProbe,
    );
    const failBody = await unconfiguredService.relayHeartbeat();
    expect(failBody.status).toBe('fail');
    expect(failBody.relay.ok).toBe(false);
    expect(typeof failBody.relay.error).toBe('string');
  });
});
