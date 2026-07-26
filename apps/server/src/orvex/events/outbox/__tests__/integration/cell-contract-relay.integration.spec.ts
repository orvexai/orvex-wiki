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
import { context, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import { OutboxWriter } from '../../outbox-writer.service';
import {
  OutboxRelayService,
  OutboxCellResolver,
} from '../../outbox-relay.service';
import { resolveWikiEventsTopic, CELL_SOLO } from '../../outbox-topic.resolver';
import { InMemoryKafkaPublisher } from '../in-memory-kafka-publisher';
import { EVT_PAGE_CREATED } from '../../../constants/orvex-event-types';
import type { DbInterface } from '../../../../../database/types/db.interface';
import type { KyselyDB } from '../../../../../database/types/kysely.types';
import { executeTx } from '../../../../../database/utils';
import { generateSlugId } from '../../../../../common/helpers/nanoid.utils';
import { ORVEX_CORRELATION_CONTEXT_KEY } from '../../../../obs/orvex-correlation.hook';

/**
 * ENG-2496 — cell-contract producer duties (E5-S3): per-cell single-
 * partition topics (`wiki-events.{cell}` / `wiki-events.solo`), the
 * `orvexcell` REQUIRED extension attribute, and end-to-end correlation-id
 * threading. Drives the REAL `OutboxRelayService.run()` against real
 * testcontainers Postgres with the existing `InMemoryKafkaPublisher` at the
 * `KafkaPublisherPort` seam (CS §5 remote-but-owned; never a mock of the
 * relay's own logic, ❌#4). Assertions are on the published CloudEvent's
 * WIRE fields and the publish call's topic — never internal symbol names.
 */
describe('CellContractRelaySpec (ENG-2496)', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let outboxWriter: OutboxWriter;
  let workspaceId: string;
  let spaceId: string;
  let provider: NodeTracerProvider;
  let contextManager: AsyncHooksContextManager;
  let exporter: InMemorySpanExporter;

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
    outboxWriter = new OutboxWriter(db);

    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    contextManager = new AsyncHooksContextManager();
    contextManager.enable();
    provider.register({
      propagator: new W3CTraceContextPropagator(),
      contextManager,
    });
  });

  afterAll(async () => {
    contextManager.disable();
    await provider.shutdown();
    await db?.destroy();
    await sqlClient?.end();
    await pgContainer?.stop();
  });

  beforeEach(async () => {
    const ws = await db
      .insertInto('workspaces')
      .values({
        name: 'ENG-2496 WS',
        hostname: `eng2496-${Date.now()}-${Math.random()}`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const space = await db
      .insertInto('spaces')
      .values({
        name: 'ENG-2496 Space',
        slug: `eng2496-space-${Date.now()}-${Math.random()}`,
        workspaceId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;
  });

  afterEach(async () => {
    await db
      .deleteFrom('orvexEventOutbox')
      .where('workspaceId', '=', workspaceId)
      .execute();
    await db.deleteFrom('pages').where('workspaceId', '=', workspaceId).execute();
    await db.deleteFrom('spaces').where('id', '=', spaceId).execute();
    await db.deleteFrom('workspaces').where('id', '=', workspaceId).execute();
  });

  /** Ingress-shaped fixture: a mutation + outbox enqueue inside an active
   * trace + correlation context (the REAL capture path — the correlation id
   * is captured by `OutboxWriter.enqueue`, never hand-inserted). */
  async function writeRowFromIngress(correlationId: string): Promise<string> {
    const tracer = provider.getTracer('eng2496');
    const requestSpan = tracer.startSpan('inbound-request');
    const requestCtx = trace.setSpan(context.active(), requestSpan);
    let pageId!: string;
    await context.with(
      requestCtx.setValue(ORVEX_CORRELATION_CONTEXT_KEY, correlationId),
      async () => {
        await executeTx(db, async (trx) => {
          const page = await trx
            .insertInto('pages')
            .values({
              // Unique per call — the fixture runs twice inside the gate
              // test (cell + solo legs) against one space, and the schema
              // enforces pages_unique_title_per_parent.
              title: `ENG-2496 page ${correlationId}`,
              slugId: generateSlugId(),
              spaceId,
              workspaceId,
            })
            .returning(['id'])
            .executeTakeFirstOrThrow();
          pageId = page.id;
          await outboxWriter.enqueue(trx, {
            type: EVT_PAGE_CREATED,
            aggregateId: page.id,
            workspaceId,
            payload: { id: page.id, workspaceId },
          });
        });
      },
    );
    requestSpan.end();
    return pageId;
  }

  it('TestProducedEventCarriesOrvexcellAndCorrelation — every published CloudEvent carries orvexcell (= CELL_ID or solo), targets the per-cell single-partition wiki-events.{cell} topic, and threads the ingress correlation id end-to-end into data.correlation_id', async () => {
    // ── Cell leg: CELL_ID configured ────────────────────────────────────
    const cellPageId = await writeRowFromIngress('corr-eng2496-gate');
    const cellPublisher = new InMemoryKafkaPublisher();
    const cellResolver: OutboxCellResolver = {
      cellId: 'eu-central-1a',
      kafkaBrokersConfigured: true,
    };
    const cellRelay = new OutboxRelayService(db, cellPublisher, cellResolver);

    // Boot-time shape assertion (AC2): the per-cell topic reports exactly
    // one partition through the SAME port the relay publishes over.
    const shape = await cellRelay.assertPerCellTopicShape();
    expect(shape).toEqual({ ok: true });
    expect(cellPublisher.metadataFetchCount).toBe(1);

    const cellRun = await cellRelay.run();
    expect(cellRun.failed).toBe(0);

    // The publish call targeted the per-cell topic — never the retired
    // flat global topic.
    const cellMessages = cellPublisher.getDistinctMessages(
      'wiki-events.eu-central-1a',
    );
    const cellMessage = cellMessages.find(
      (m) =>
        (JSON.parse(m.value) as { subject: string }).subject === cellPageId,
    );
    expect(cellMessage).toBeDefined();
    expect(
      cellPublisher.getDistinctMessages('orvex.studio-spine.events'),
    ).toHaveLength(0);

    const cellEnvelope = JSON.parse(cellMessage!.value) as {
      orvexcell: string;
      orvextenant: string;
      data: { correlation_id: string };
    };
    // AC1 — orvexcell = CELL_ID on every published event.
    expect(cellEnvelope.orvexcell).toBe('eu-central-1a');
    expect(cellEnvelope.orvextenant).toBe(workspaceId);
    // AC3 — the correlation id captured at ingress reaches the consumer.
    expect(cellEnvelope.data.correlation_id).toBe('corr-eng2496-gate');

    // ── Solo leg (AC5): no CELL_ID configured ───────────────────────────
    const soloPageId = await writeRowFromIngress('corr-eng2496-solo');
    const soloPublisher = new InMemoryKafkaPublisher();
    const soloResolver: OutboxCellResolver = {
      cellId: null,
      kafkaBrokersConfigured: false,
    };
    const soloRelay = new OutboxRelayService(db, soloPublisher, soloResolver);
    const soloRun = await soloRelay.run();
    expect(soloRun.failed).toBe(0);

    const soloMessage = soloPublisher
      .getDistinctMessages('wiki-events.solo')
      .find(
        (m) =>
          (JSON.parse(m.value) as { subject: string }).subject === soloPageId,
      );
    expect(soloMessage).toBeDefined();
    const soloEnvelope = JSON.parse(soloMessage!.value) as {
      orvexcell: string;
      data: { correlation_id: string };
    };
    expect(soloEnvelope.orvexcell).toBe('solo');
    expect(soloEnvelope.data.correlation_id).toBe('corr-eng2496-solo');
  });

  it('TestRelayPublishesToPerCellSingePartitionTopic — the boot-time shape assertion passes on a 1-partition topic and fails LOUDLY (without throwing) on a mis-partitioned or missing topic or a metadata error', async () => {
    const resolver: OutboxCellResolver = {
      cellId: 'eu-central-1a',
      kafkaBrokersConfigured: true,
    };
    const topic = resolveWikiEventsTopic(resolver.cellId);
    expect(topic).toBe('wiki-events.eu-central-1a');

    // Correct shape: exactly 1 partition.
    const okPublisher = new InMemoryKafkaPublisher();
    okPublisher.partitionCountByTopic.set(topic, 1);
    const okRelay = new OutboxRelayService(db, okPublisher, resolver);
    expect(await okRelay.assertPerCellTopicShape()).toEqual({ ok: true });

    // Mis-partitioned: 3 partitions — red, named reason, no throw.
    const badPublisher = new InMemoryKafkaPublisher();
    badPublisher.partitionCountByTopic.set(topic, 3);
    const badRelay = new OutboxRelayService(db, badPublisher, resolver);
    expect(await badRelay.assertPerCellTopicShape()).toEqual({
      ok: false,
      reason: 'partitions=3',
    });

    // Missing topic — red, named reason, no throw.
    const missingPublisher = new InMemoryKafkaPublisher();
    missingPublisher.partitionCountByTopic.set(topic, null);
    const missingRelay = new OutboxRelayService(db, missingPublisher, resolver);
    expect(await missingRelay.assertPerCellTopicShape()).toEqual({
      ok: false,
      reason: 'topic-missing',
    });

    // Metadata fetch failure — red with the error carried, never a throw
    // that would block startup.
    const failingPublisher = new InMemoryKafkaPublisher();
    failingPublisher.fetchTopicPartitionCount = async () => {
      throw new Error('broker metadata unavailable');
    };
    const failingRelay = new OutboxRelayService(db, failingPublisher, resolver);
    await expect(
      failingRelay.assertPerCellTopicShape(),
    ).resolves.toEqual({ ok: false, reason: 'broker metadata unavailable' });
  });

  it('TestSoloSentinelSkipsCellRegistryTopicRequirement — with no CELL_ID and no brokers configured, cell enforcement no-ops to wiki-events.solo and the boot-time assertion skips without requiring an external registry', async () => {
    expect(resolveWikiEventsTopic(null)).toBe(`wiki-events.${CELL_SOLO}`);

    const publisher = new InMemoryKafkaPublisher();
    const relay = new OutboxRelayService(db, publisher, {
      cellId: null,
      kafkaBrokersConfigured: false,
    });
    // The no-op path: OK, explicitly skipped, and the metadata call was
    // never made (nothing external is required for a standalone boot).
    expect(await relay.assertPerCellTopicShape()).toEqual({
      ok: true,
      skipped: true,
    });
    expect(publisher.metadataFetchCount).toBe(0);
    // onModuleInit (the production boot hook) also completes without
    // throwing in this mode.
    await expect(relay.onModuleInit()).resolves.toBeUndefined();
  });
});
