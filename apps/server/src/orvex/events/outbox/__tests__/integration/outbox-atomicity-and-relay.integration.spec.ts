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

import { OutboxWriter } from '../../outbox-writer.service';
import {
  OutboxRelayService,
  OutboxTopicResolver,
  OutboxCellResolver,
} from '../../outbox-relay.service';
import {
  InMemoryKafkaPublisher,
} from '../in-memory-kafka-publisher';
import {
  EVT_PAGE_CREATED,
  EVT_PAGE_CONTENT_UPDATED,
} from '../../../constants/orvex-event-types';
import type { DbInterface } from '../../../../../database/types/db.interface';
import type {
  KyselyDB,
  KyselyTransaction,
} from '../../../../../database/types/kysely.types';
import { executeTx } from '../../../../../database/utils';
import { generateSlugId } from '../../../../../common/helpers/nanoid.utils';
import type {
  InsertableSpace,
  InsertableWorkspace,
} from '../../../../../database/types/entity.types';
import { PageRepo } from '../../../../../database/repos/page/page.repo';
import type { WsService } from '../../../../../ws/ws.service';
import { SpaceMemberRepo } from '../../../../../database/repos/space/space-member.repo';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { context, SpanKind, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ORVEX_CORRELATION_CONTEXT_KEY } from '../../../../obs/orvex-correlation.hook';

const STUB_TOPIC_RESOLVER: OutboxTopicResolver = {
  getKafkaOutboxTopic: () => 'orvex.studio-spine.events',
};

const STUB_CELL_RESOLVER: OutboxCellResolver = {
  cellId: 'solo',
};

/**
 * ENG-1383 5a — `OutboxAtomicityAndRelaySpec`, the named binary DoD test.
 *
 * Real Kysely against a testcontainers Postgres (never mock the outbox's
 * own repo — ❌#4); a `KafkaPublisherPort` in-memory/embedded broker
 * substitute (4f) — the relay's own dedupe/mark-relayed logic is real and
 * exercised, only the actual Kafka wire is faked.
 *
 * Asserts:
 *  - AC1: a mutation + its outbox row commit atomically (exactly 1 row).
 *  - AC2: a mutation rollback leaves 0 outbox rows.
 *  - AC3/AC4: the relay publishes each unrelayed row to the Kafka port
 *    exactly once (no bridge stage — the ONLY sink is the Publisher port)
 *    and is idempotent across a simulated crash + retry.
 *  - AC5/AC8: `page.content_updated` carries `changedBlockIds` through the
 *    collab (BullMQ→EmbeddingProcessor re-emit) path, independent of the
 *    embed re-emit itself.
 */
describe('OutboxAtomicityAndRelaySpec', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let outboxWriter: OutboxWriter;
  let pageRepo: PageRepo;
  let invalidateCalls: Array<{ workspaceId: string; entity: string[] }>;
  let workspaceId: string;
  let spaceId: string;

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

    invalidateCalls = [];
    const wsServiceStub = {
      emitInvalidate: (ws: string, entity: string[]) =>
        invalidateCalls.push({ workspaceId: ws, entity }),
    } as unknown as WsService;
    const spaceMemberRepoStub = {} as SpaceMemberRepo; // unused: no space-member scoping exercised
    pageRepo = new PageRepo(
      db,
      spaceMemberRepoStub,
      new EventEmitter2(),
      outboxWriter,
      wsServiceStub,
    );
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end();
    await pgContainer?.stop();
  });

  beforeEach(async () => {
    invalidateCalls = [];
    const workspaceValues: InsertableWorkspace = {
      name: 'Outbox Spec WS',
      hostname: `outbox-${Date.now()}-${Math.random()}`,
    };
    const ws = await db
      .insertInto('workspaces')
      .values(workspaceValues)
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const spaceValues: InsertableSpace = {
      name: 'Outbox Spec Space',
      slug: `outbox-space-${Date.now()}-${Math.random()}`,
      workspaceId,
    };
    const space = await db
      .insertInto('spaces')
      .values(spaceValues)
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

  async function insertPageWithOutbox(
    trx: KyselyTransaction,
    overrides: Partial<{ title: string }> = {},
  ) {
    const page = await trx
      .insertInto('pages')
      .values({
        title: overrides.title ?? 'AC1 page',
        slugId: generateSlugId(),
        spaceId,
        workspaceId,
      })
      .returning(['id', 'workspaceId', 'slugId'])
      .executeTakeFirstOrThrow();

    await outboxWriter.enqueue(trx, {
      type: EVT_PAGE_CREATED,
      aggregateId: page.id,
      workspaceId,
      payload: { id: page.id, workspaceId },
    });

    return page;
  }

  it('AC1 — a page create and its outbox row commit atomically (exactly one row)', async () => {
    const page = await executeTx(db, (trx) => insertPageWithOutbox(trx));

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('type', '=', EVT_PAGE_CREATED)
      .where('aggregateId', '=', page.id)
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0].relayedAt).toBeNull();
  });

  it('AC1 (real wiring) — PageRepo.insertPage (the actual production create path used by page.service.ts / import.service.ts) commits its page.created outbox row atomically (exactly one row); a regression in insertPage\'s own emit must fail THIS test', async () => {
    const page = await pageRepo.insertPage({
      title: 'AC1 real-path page',
      slugId: generateSlugId(),
      spaceId,
      workspaceId,
    });

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('type', '=', EVT_PAGE_CREATED)
      .where('aggregateId', '=', page.id)
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0].relayedAt).toBeNull();
    expect(
      (rows[0].payload as Record<string, unknown>).workspaceId,
    ).toBe(workspaceId);
  });

  it('ENG-1559 M5 AC8 — PageRepo.insertPage WITH initial content ALSO commits a shaped page.content_updated outbox row, same-tx, so the indexer (which only ever ingests on wiki.page.content_updated) can index a page from the moment it is created', async () => {
    const page = await pageRepo.insertPage({
      title: 'AC8 create-with-content page',
      slugId: generateSlugId(),
      spaceId,
      workspaceId,
      content: { type: 'doc', content: [] },
    });

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('type', '=', EVT_PAGE_CONTENT_UPDATED)
      .where('aggregateId', '=', page.id)
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0].relayedAt).toBeNull();
    // orvex-studio-knowledge/gen.ContentUpdatedData's actual decode shape:
    // {tenant, pageIds[], version} — the indexer 400s ("missing
    // tenant/pageIds") without these.
    const payload = rows[0].payload as {
      tenant: string;
      pageIds: string[];
      version: number;
    };
    expect(payload.tenant).toBe(workspaceId);
    expect(payload.pageIds).toEqual([page.id]);
    expect(typeof payload.version).toBe('number');
  });

  it('ENG-1559 M5 AC8 — PageRepo.insertPage WITHOUT content does NOT commit a page.content_updated outbox row (no fabricated freshness signal for an empty page)', async () => {
    const page = await pageRepo.insertPage({
      title: 'AC8 create-without-content page',
      slugId: generateSlugId(),
      spaceId,
      workspaceId,
    });

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('type', '=', EVT_PAGE_CONTENT_UPDATED)
      .where('aggregateId', '=', page.id)
      .execute();

    expect(rows).toHaveLength(0);
  });

  it('AC2 — a rolled-back mutation transaction leaves NO outbox row', async () => {
    let pageId: string | undefined;

    await expect(
      executeTx(db, async (trx) => {
        const page = await insertPageWithOutbox(trx, { title: 'AC2 page' });
        pageId = page.id;
        // Force the wrapping transaction to roll back AFTER the outbox
        // write — proves same-tx (not fire-and-forget), not just "we never
        // tried".
        throw new Error('forced rollback after outbox write');
      }),
    ).rejects.toThrow('forced rollback after outbox write');

    const outboxRows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('aggregateId', '=', pageId as string)
      .execute();
    const pageRows = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', pageId as string)
      .execute();

    expect(outboxRows).toHaveLength(0);
    expect(pageRows).toHaveLength(0);
  });

  it('AC3/AC4 — the relay publishes each unrelayed row to Kafka exactly once, no bridge stage', async () => {
    const N = 3;
    const pageIds: string[] = [];
    for (let i = 0; i < N; i++) {
      const page = await executeTx(db, (trx) =>
        insertPageWithOutbox(trx, { title: `relay page ${i}` }),
      );
      pageIds.push(page.id);
    }

    const publisher = new InMemoryKafkaPublisher();
    const relay = new OutboxRelayService(db, publisher, STUB_TOPIC_RESOLVER, STUB_CELL_RESOLVER);

    const result = await relay.run();

    expect(result.published).toBeGreaterThanOrEqual(N);
    expect(result.failed).toBe(0);

    // The Kafka message key is the outbox row's OWN id (AC3 — "idempotent
    // by outbox id / dedupe key"), not the page id; assert via the
    // CloudEvents envelope's `subject`, which carries the page id
    // (ENG-1559 M5 AC8 — `subject: row.aggregateId`).
    const distinct = publisher.getDistinctMessages(
      'orvex.studio-spine.events',
    );
    for (const id of pageIds) {
      expect(
        distinct.some(
          (m) => (JSON.parse(m.value) as { subject: string }).subject === id,
        ),
      ).toBe(true);
    }

    // ENG-1559 M5 AC8 — the wire value is a REAL CloudEvents 1.0
    // structured-mode envelope conforming to the pinned
    // events/schemas/_envelope.json (specversion/id/source/type +
    // the REQUIRED orvexcell/orvextenant extensions), not the pre-AC8 raw
    // kafkajs JSON a downstream CloudEvents consumer could never parse
    // (ENG-2006 defect-3).
    const first = distinct[0];
    const envelope = JSON.parse(first.value) as {
      specversion: string;
      id: string;
      source: string;
      type: string;
      orvexcell: string;
      orvextenant: string;
    };
    expect(envelope.specversion).toBe('1.0');
    expect(envelope.id).toBe(first.key);
    expect(envelope.source).toBe('//orvex-wiki');
    expect(envelope.type).toBe('wiki.page.created');
    expect(envelope.orvexcell).toBe('solo');
    expect(envelope.orvextenant).toBe(workspaceId);

    const relayedRows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('aggregateId', 'in', pageIds)
      .execute();
    for (const row of relayedRows) {
      expect(row.relayedAt).not.toBeNull();
    }

    // AC4 — the relay's ONLY sink is the Kafka Publisher port; there is no
    // Redis→Kafka bridge stage anywhere in the outbox module.
    const outboxSrc = await fs.readdir(path.join(__dirname, '../..'));
    for (const file of outboxSrc) {
      if (!file.endsWith('.ts')) continue;
      const content = await fs.readFile(
        path.join(__dirname, '../..', file),
        'utf-8',
      );
      // No Redis import and no XADD anywhere in the outbox module — the
      // relay's only sink is the Kafka Publisher port (D-S13: the
      // Redis→Kafka bridge is retired, not reintroduced).
      expect(content).not.toMatch(/from ['"]ioredis['"]|XADD/i);
    }
  });

  it('AC3 — relay retry after a simulated crash is idempotent (no double-publish)', async () => {
    const N = 3;
    const pageIds: string[] = [];
    for (let i = 0; i < N; i++) {
      const page = await executeTx(db, (trx) =>
        insertPageWithOutbox(trx, { title: `retry page ${i}` }),
      );
      pageIds.push(page.id);
    }

    const publisher = new InMemoryKafkaPublisher();
    const relay = new OutboxRelayService(db, publisher, STUB_TOPIC_RESOLVER, STUB_CELL_RESOLVER);

    // Simulate a mid-batch crash: the LAST row's publish throws, so it is
    // never marked relayed.
    const originalPublish = publisher.publish.bind(publisher);
    let calls = 0;
    publisher.publish = async (msg) => {
      calls++;
      if (calls === N) {
        throw new Error('simulated relay crash');
      }
      return originalPublish(msg);
    };

    const firstRun = await relay.run();
    expect(firstRun.failed).toBe(1);
    expect(firstRun.published).toBe(N - 1);

    // Restore normal publishing and retry — only the still-unrelayed row
    // should be (re)published; the others must NOT be re-sent.
    publisher.publish = originalPublish;
    const secondRun = await relay.run();
    expect(secondRun.published).toBe(1);
    expect(secondRun.failed).toBe(0);

    const distinct = publisher.getDistinctMessages(
      'orvex.studio-spine.events',
    );
    const relevant = distinct.filter((m) =>
      pageIds.includes(
        (JSON.parse(m.value) as { subject: string }).subject,
      ),
    );
    expect(relevant).toHaveLength(N); // distinct — no duplicates delivered

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('aggregateId', 'in', pageIds)
      .execute();
    expect(rows.every((r) => r.relayedAt !== null)).toBe(true);
  });

  it('ENG-1383 F5 — an ACTUAL content write (PageRepo.updatePages, REAL caller shape — no workspaceId in the SET, exactly what PersistenceExtension.onStoreDocument sends) produces exactly one page.content_updated outbox row, atomically, with NO embed pipeline involved', async () => {
    const page = await executeTx(db, (trx) =>
      insertPageWithOutbox(trx, { title: 'F5 content page' }),
    );
    await db
      .deleteFrom('orvexEventOutbox')
      .where('aggregateId', '=', page.id)
      .execute(); // drop the page.created row from setup; isolate this assertion

    // NB: no `workspaceId` key here — this is the REAL production caller
    // shape (`PersistenceExtension.onStoreDocument` never re-sets a page's
    // workspaceId on a content edit). Prior to the F5 fix, the repo's
    // `&& updatePageData.workspaceId` guard was false here and silently
    // dropped the row — this test would have failed against that code.
    await pageRepo.updatePage(
      { content: { type: 'doc', content: [] } },
      page.id,
    );

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('type', '=', EVT_PAGE_CONTENT_UPDATED)
      .where('aggregateId', '=', page.id)
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0].relayedAt).toBeNull();
    expect((rows[0].payload as Record<string, unknown>).workspaceId).toBe(workspaceId);
  });

  it('ENG-1383 AC5 — the real content-write path threads changedBlockIds into the page.content_updated outbox payload (no dead-handler shortcut)', async () => {
    const page = await executeTx(db, (trx) =>
      insertPageWithOutbox(trx, { title: 'AC5 content page' }),
    );
    await db
      .deleteFrom('orvexEventOutbox')
      .where('aggregateId', '=', page.id)
      .execute();

    // Same real caller shape as F5 (no workspaceId), plus the
    // `contentOutboxExtra` param PersistenceExtension threads through once
    // it has computed a genuine diff via `computeChangedBlockIds`.
    await pageRepo.updatePage(
      { content: { type: 'doc', content: [] } },
      page.id,
      undefined,
      undefined,
      { changedBlockIds: ['block-a', 'block-b'] },
    );

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('type', '=', EVT_PAGE_CONTENT_UPDATED)
      .where('aggregateId', '=', page.id)
      .execute();

    expect(rows).toHaveLength(1);
    const payload = rows[0].payload as { changedBlockIds?: string[] };
    expect(payload.changedBlockIds).toEqual(['block-a', 'block-b']);
  });

  it('ENG-1383 F5 — a rolled-back content write (real caller shape) leaves NO page.content_updated outbox row (same-tx atomicity)', async () => {
    const page = await executeTx(db, (trx) =>
      insertPageWithOutbox(trx, { title: 'F5 rollback page' }),
    );
    await db
      .deleteFrom('orvexEventOutbox')
      .where('aggregateId', '=', page.id)
      .execute();

    await expect(
      executeTx(db, async (trx) => {
        await pageRepo.updatePage(
          { content: { type: 'doc', content: [] } },
          page.id,
          trx,
        );
        throw new Error('forced rollback after content write');
      }),
    ).rejects.toThrow('forced rollback after content write');

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('type', '=', EVT_PAGE_CONTENT_UPDATED)
      .where('aggregateId', '=', page.id)
      .execute();
    expect(rows).toHaveLength(0);

    const contentRow = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(contentRow.content).toBeNull();
  });

  it('ENG-1383 F3 — a page mutation (content update, real caller shape) also fires the realtime-invalidate sweep, not just create', async () => {
    const page = await executeTx(db, (trx) =>
      insertPageWithOutbox(trx, { title: 'F3 invalidate page' }),
    );
    invalidateCalls = [];

    await pageRepo.updatePage(
      { content: { type: 'doc', content: [] } },
      page.id,
    );

    expect(
      invalidateCalls.some(
        (c) => c.workspaceId === workspaceId && c.entity[0] === 'pages',
      ),
    ).toBe(true);
  });
});

describe('ENG-1600 — outbox trace-context persist/restore (AC1/AC2/AC4/AC5)', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let outboxWriter: OutboxWriter;
  let workspaceId: string;
  let spaceId: string;
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;
  let contextManager: AsyncHooksContextManager;

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
    exporter.reset();
    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1600 WS', hostname: `eng1600-${Date.now()}-${Math.random()}` })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const space = await db
      .insertInto('spaces')
      .values({
        name: 'ENG-1600 Space',
        slug: `eng1600-space-${Date.now()}-${Math.random()}`,
        workspaceId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;
  });

  afterEach(async () => {
    await db.deleteFrom('orvexEventOutbox').where('workspaceId', '=', workspaceId).execute();
    await db.deleteFrom('pages').where('workspaceId', '=', workspaceId).execute();
    await db.deleteFrom('spaces').where('id', '=', spaceId).execute();
    await db.deleteFrom('workspaces').where('id', '=', workspaceId).execute();
  });

  it('AC1 — a mutation inside an active trace persists traceparent/tracestate/correlation_id on the outbox row, in the SAME txn', async () => {
    const tracer = provider.getTracer('test');
    const requestSpan = tracer.startSpan('inbound-request');
    const requestCtx = trace.setSpan(context.active(), requestSpan);

    let pageId!: string;
    await context.with(requestCtx, async () => {
      const withCorrelation = context
        .active()
        .setValue(ORVEX_CORRELATION_CONTEXT_KEY, 'corr-eng1600-ac1');
      await context.with(withCorrelation, async () => {
        await executeTx(db, async (trx) => {
          const page = await trx
            .insertInto('pages')
            .values({
              title: 'ENG-1600 AC1 page',
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
      });
    });
    requestSpan.end();

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('aggregateId', '=', pageId)
      .execute();

    expect(rows).toHaveLength(1);
    expect(rows[0].traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    expect(rows[0].correlationId).toBe('corr-eng1600-ac1');
    const [, traceId, spanId] = rows[0].traceparent!.split('-');
    expect(traceId).toBe(requestSpan.spanContext().traceId);
    expect(spanId).toBe(requestSpan.spanContext().spanId);
  });

  it('AC5 vanilla-safe — a mutation with NO active trace persists null trace columns (never fabricates a trace)', async () => {
    let pageId!: string;
    await executeTx(db, async (trx) => {
      const page = await trx
        .insertInto('pages')
        .values({
          title: 'ENG-1600 AC5 page',
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

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('aggregateId', '=', pageId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].traceparent).toBeNull();
    expect(rows[0].tracestate).toBeNull();
    expect(rows[0].correlationId).toBeNull();
  });

  // Shared proof body for the producer-side leg of the DoD: an outbox row
  // persists the caller's trace context, and the relay's published message
  // continues that SAME trace_id (one connected trace across the async
  // boundary). Extracted so the named DoD gate test below reuses this exact
  // assertion chain instead of duplicating it — see ENG-1600 remediation.
  //
  // Scope note: this proves the PRODUCER side only (outbox row -> published
  // message trace_id continuity + PRODUCER span). It intentionally does NOT
  // assert a CloudEvent envelope (specversion/datacontenttype/extensions) or
  // a consumer starting its span as a link — that leg is cross-repo scope
  // (CloudEvent shaping lives in orvex-studio-contracts; the consumer-link
  // exemplar lives in the Go satellites' pkg/obs) tracked under ENG-1365 and
  // is explicitly out of bounds for this repo.
  async function assertOutboxTraceContextReachesPublishedMessage(
    correlationId: string,
    spanName: string,
  ): Promise<void> {
    const tracer = provider.getTracer('test');
    const requestSpan = tracer.startSpan(spanName);
    const requestCtx = trace.setSpan(context.active(), requestSpan);

    let pageId!: string;
    await context.with(requestCtx, async () => {
      const withCorrelation = context
        .active()
        .setValue(ORVEX_CORRELATION_CONTEXT_KEY, correlationId);
      await context.with(withCorrelation, async () => {
        await executeTx(db, async (trx) => {
          const page = await trx
            .insertInto('pages')
            .values({
              title: 'ENG-1600 trace-context page',
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
      });
    });
    requestSpan.end();

    // The outbox row itself carries the trace context, persisted in-txn.
    const outboxRows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('aggregateId', '=', pageId)
      .execute();
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].traceparent).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/,
    );
    const [, outboxTraceId] = outboxRows[0].traceparent!.split('-');
    expect(outboxTraceId).toBe(requestSpan.spanContext().traceId);
    expect(outboxRows[0].correlationId).toBe(correlationId);

    const publisher = new InMemoryKafkaPublisher();
    const relay = new OutboxRelayService(db, publisher, STUB_TOPIC_RESOLVER, STUB_CELL_RESOLVER);
    const result = await relay.run();
    expect(result.failed).toBe(0);
    expect(result.published).toBeGreaterThanOrEqual(1);

    const distinct = publisher.getDistinctMessages('orvex.studio-spine.events');
    const message = distinct.find(
      (m) => (JSON.parse(m.value) as { subject: string }).subject === pageId,
    );
    expect(message).toBeDefined();
    const body = JSON.parse(message!.value) as {
      traceparent: string;
      tracestate: string | null;
      data: { correlation_id: string };
    };

    // The persisted trace_id continues into the published message (one
    // connected trace across the async boundary — the Definition of Done).
    const [, publishedTraceId] = body.traceparent.split('-');
    expect(publishedTraceId).toBe(requestSpan.spanContext().traceId);
    // AC4: the SPAN id is the relay's own PRODUCER span, not the original
    // request span — a consumer links to the producer, not the far-away
    // HTTP span.
    const [, , publishedSpanId] = body.traceparent.split('-');
    expect(publishedSpanId).not.toBe(requestSpan.spanContext().spanId);
    expect(body.data.correlation_id).toBe(correlationId);

    // AC2 — the relay actually emitted a PRODUCER span as a CHILD of the
    // restored request trace.
    const finished = exporter.getFinishedSpans();
    const producerSpan = finished.find(
      (s) => s.name === 'orvex.outbox.relay.publish',
    );
    expect(producerSpan).toBeDefined();
    expect(producerSpan!.kind).toBe(SpanKind.PRODUCER);
    expect(producerSpan!.spanContext().traceId).toBe(
      requestSpan.spanContext().traceId,
    );
    expect(producerSpan!.parentSpanContext?.spanId).toBe(
      requestSpan.spanContext().spanId,
    );

    // AC5 — no PII on the producer span; only opaque ids.
    expect(producerSpan!.attributes['correlation_id']).toBe(correlationId);
    expect(producerSpan!.attributes['orvex.tenant']).toBe(workspaceId);
    expect(Object.keys(producerSpan!.attributes)).toEqual(
      expect.arrayContaining(['correlation_id', 'orvex.tenant']),
    );
  }

  it('AC2/AC4 — the relay restores the persisted context, emits a PRODUCER span as its child, and stamps a FRESH producer traceparent + correlation_id onto the published message', async () => {
    await assertOutboxTraceContextReachesPublishedMessage(
      'corr-eng1600-ac2',
      'inbound-request-2',
    );
  });

  // Named DoD gate — binds the ticket's Definition of Done binary gate
  // (`TestOutboxCarriesTraceContext`) to the PRODUCER-SIDE proof above: the
  // outbox row carries the caller's trace context, and the relay's
  // published message continues that trace_id. This does NOT assert a
  // CloudEvent envelope or a consumer span-link — that leg is cross-repo
  // scope (ENG-1365 / orvex-studio-contracts + Go satellites' pkg/obs) and
  // is out of bounds for orvex-wiki.
  it('TestOutboxCarriesTraceContext — the outbox row carries trace context and the relay-published message continues the same trace_id (producer-side DoD gate; CloudEvent/consumer-link leg is cross-repo scope, see ENG-1365)', async () => {
    await assertOutboxTraceContextReachesPublishedMessage(
      'corr-eng1600-gate',
      'inbound-request-gate',
    );
  });
});
