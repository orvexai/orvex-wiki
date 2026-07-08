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
} from '../../outbox-relay.service';
import {
  InMemoryKafkaPublisher,
} from '../in-memory-kafka-publisher';
import { OrvexEventBusService } from '../../../services/orvex-event-bus.service';
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
import { SpaceMemberRepo } from '../../../../../database/repos/space/space-member.repo';
import { EventEmitter2 } from '@nestjs/event-emitter';

const STUB_TOPIC_RESOLVER: OutboxTopicResolver = {
  getKafkaOutboxTopic: () => 'orvex.studio-spine.events',
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
    } as any;
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
    const relay = new OutboxRelayService(db, publisher, STUB_TOPIC_RESOLVER);

    const result = await relay.run();

    expect(result.published).toBeGreaterThanOrEqual(N);
    expect(result.failed).toBe(0);

    // The Kafka message key is the outbox row's OWN id (AC3 — "idempotent
    // by outbox id / dedupe key"), not the page id; assert via the
    // payload's `aggregateId`, which does carry the page id.
    const distinct = publisher.getDistinctMessages(
      'orvex.studio-spine.events',
    );
    for (const id of pageIds) {
      expect(
        distinct.some(
          (m) => (JSON.parse(m.value) as { aggregateId: string }).aggregateId === id,
        ),
      ).toBe(true);
    }

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
    const relay = new OutboxRelayService(db, publisher, STUB_TOPIC_RESOLVER);

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
        (JSON.parse(m.value) as { aggregateId: string }).aggregateId,
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

  it('AC5/AC8 — page.content_updated carries changedBlockIds through the collab path, independent of the embed re-emit', async () => {
    const bus = new OrvexEventBusService(outboxWriter);
    const pageId = 'collab-page-1';

    // Source 2 (REST path): PAGE_CONTENT_BLOCKS_CHANGED stores the delta.
    bus.onPageContentBlocksChanged({
      pageId,
      workspaceId,
      changedBlockIds: ['block-a', 'block-b'],
    });

    // AC8: fired here directly (as the collab BullMQ→EmbeddingProcessor
    // re-emit would), WITHOUT the embed re-emit pipeline existing at all —
    // proving the outbox row does not depend on it.
    await bus.onPageContentUpdated({ pageId, workspaceId });

    const rows = await db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('aggregateId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();

    expect(rows).toHaveLength(1);
    const payload = rows[0].payload as { changedBlockIds?: string[] };
    expect(payload.changedBlockIds).toEqual(['block-a', 'block-b']);

    await db
      .deleteFrom('orvexEventOutbox')
      .where('aggregateId', '=', pageId)
      .execute();
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
      { content: { type: 'doc', content: [] } as any },
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
    expect((rows[0].payload as any).workspaceId).toBe(workspaceId);
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
      { content: { type: 'doc', content: [] } as any },
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
          { content: { type: 'doc', content: [] } as any },
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
      { content: { type: 'doc', content: [] } as any },
      page.id,
    );

    expect(
      invalidateCalls.some(
        (c) => c.workspaceId === workspaceId && c.entity[0] === 'pages',
      ),
    ).toBe(true);
  });
});
