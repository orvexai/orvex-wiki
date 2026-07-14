/**
 * ENG-1372 (AC4, AC5) — restore-from-history correctness.
 *
 * Integration test against a REAL Postgres (testcontainers). Proves restore
 * is never a silent no-op (content-assertion, AC4) and accepts any valid
 * history-row UUID for the page, not just the latest/first (AC5).
 */
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { PageHistoryService } from 'src/core/page/services/page-history.service';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';
import { EventEmitter2 } from '@nestjs/event-emitter';

async function insertHistory(
  db: TestDb['db'],
  page: { id: string; slugId: string; spaceId: string; workspaceId: string },
  content: object,
) {
  return db
    .insertInto('pageHistory')
    .values({
      pageId: page.id,
      slugId: page.slugId,
      content: content as any,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

describe('PageHistoryService.restore (ENG-1372)', () => {
  let testDb: TestDb;
  let pageRepo: PageRepo;
  let pageHistoryRepo: PageHistoryRepo;
  let service: PageHistoryService;
  let spaceId: string;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const eventEmitter = new EventEmitter2();
    pageRepo = new PageRepo(
      testDb.db as any,
      {} as any,
      eventEmitter,
      new OutboxWriter(testDb.db as any),
      { emitInvalidate: () => {} } as any,
    );
    pageHistoryRepo = new PageHistoryRepo(testDb.db as any);
    // ENG-1369 widened the constructor (pageService/orvexAudit/db) to
    // support the NEW restoreFromHistory() method below. This suite only
    // exercises the ENG-1372 restore() primitive, which never touches
    // those deps, so unused-but-required stubs are enough here.
    const pageServiceStub = {} as any;
    const orvexAuditStub = {} as any;
    service = new PageHistoryService(
      pageHistoryRepo,
      pageRepo,
      pageServiceStub,
      orvexAuditStub,
      testDb.db as any,
    );

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
  }, 120000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it('AC4 — restore actually replaces the live content (never a silent no-op)', async () => {
    const liveContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'live' }] }],
    };
    const historicalContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'historical' }] },
      ],
    };

    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a0',
      content: liveContent,
    });
    const history = await insertHistory(testDb.db, page, historicalContent);

    const restored = await service.restore(history.id, userId);

    expect(restored.content).toEqual(historicalContent);
    expect(restored.content).not.toEqual(liveContent);

    const rePersisted = await pageRepo.findById(page.id, {
      includeContent: true,
    });
    expect(rePersisted.content).toEqual(historicalContent);
  });

  it('AC5 — restore accepts any valid history UUID for the page, including the 3rd-oldest version', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a1',
      content: { type: 'doc', content: [] },
    });

    const versions = [];
    for (let i = 0; i < 5; i++) {
      const content = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `v${i}` }] },
        ],
      };
      const h = await insertHistory(testDb.db, page, content);
      versions.push({ h, content });
    }

    const thirdOldest = versions[2];
    const restored = await service.restore(thirdOldest.h.id, userId);

    expect(restored.content).toEqual(thirdOldest.content);
  });

  it('restore rejects an unknown history id', async () => {
    await expect(
      service.restore('00000000-0000-7000-8000-000000000000', userId),
    ).rejects.toThrow();
  });
});
