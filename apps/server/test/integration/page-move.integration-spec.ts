/**
 * ENG-1372 — named DoD test: TestMovePage_ResolvesKeywordAndEmitsEvent
 *
 * Integration test against a REAL Postgres (testcontainers) — CS §5: Postgres
 * is local-substitutable infra, not mocked. EventEmitter2 is a real instance;
 * we spy at the port (assert the emitted payload) rather than mocking our own
 * PageService/PageRepo (CS §5f, ❌#4).
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageService } from 'src/core/page/services/page.service';
import { EventName } from 'src/common/events/event.contants';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

describe('PageService.movePage (ENG-1372)', () => {
  let testDb: TestDb;
  let pageRepo: PageRepo;
  let pageService: PageService;
  let eventEmitter: EventEmitter2;
  let spaceId: string;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    eventEmitter = new EventEmitter2();
    pageRepo = new PageRepo(testDb.db as any, {} as any, eventEmitter);

    // movePage only exercises pageRepo/db/eventEmitter — the remaining
    // constructor deps are never invoked by the move path, so inert
    // stand-ins are sufficient (CS §5: not mocking PageService itself).
    pageService = new PageService(
      pageRepo,
      {} as any, // pagePermissionRepo
      {} as any, // attachmentRepo
      testDb.db as any,
      {} as any, // storageService
      {} as any, // attachmentQueue
      {} as any, // aiQueue
      {} as any, // generalQueue
      eventEmitter,
      {} as any, // collaborationGateway
      {} as any, // watcherService
      {} as any, // transclusionService
      {} as any, // idempotencyStore
      {} as any, // entitlementService — movePage never enforces quota
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

  it('TestMovePage_ResolvesKeywordAndEmitsEvent — resolves after:<sibling> to a valid fractional key, sorts immediately after the sibling, and emits exactly one PAGE_UPDATED with before/after', async () => {
    const p1 = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: generateJitteredKeyBetween(null, null),
    });
    const p2 = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: generateJitteredKeyBetween(p1.position, null),
    });
    const moved = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: generateJitteredKeyBetween(p2.position, null),
    });

    const events: any[] = [];
    const listener = (payload: any) => events.push(payload);
    eventEmitter.on(EventName.PAGE_UPDATED, listener);

    try {
      await pageService.movePage(
        { pageId: moved.id, position: `after:${p1.id}` } as any,
        moved,
      );
    } finally {
      eventEmitter.off(EventName.PAGE_UPDATED, listener);
    }

    const persisted = await pageRepo.findById(moved.id);

    // (a) the persisted position is a valid fractional-index key
    expect(() =>
      generateJitteredKeyBetween(persisted.position, null),
    ).not.toThrow();

    // (b) the moved page sorts immediately after p1 (and before p2)
    expect(persisted.position > p1.position).toBe(true);
    expect(persisted.position < p2.position).toBe(true);

    // (c) exactly one PAGE_UPDATED fired, carrying before/after position
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      before: moved.position,
      after: persisted.position,
    });
  });

  it('AC2 — an already-a-key position round-trips unchanged; an unparseable key is rejected with a typed error and mutates nothing', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: generateJitteredKeyBetween(null, null),
    });
    const validKey = generateJitteredKeyBetween(null, null);

    await pageService.movePage(
      { pageId: page.id, position: validKey } as any,
      page,
    );
    const persisted = await pageRepo.findById(page.id);
    expect(persisted.position).toBe(validKey);

    await expect(
      pageService.movePage(
        { pageId: page.id, position: '!!!not-a-key!!!' } as any,
        persisted,
      ),
    ).rejects.toThrow();

    const unchanged = await pageRepo.findById(page.id);
    expect(unchanged.position).toBe(validKey);
  });

  it('AC8 — an unknown position keyword is rejected with a typed error, not silently coerced', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: generateJitteredKeyBetween(null, null),
    });
    const before = page.position;

    await expect(
      pageService.movePage(
        { pageId: page.id, position: `sideways:${page.id}` } as any,
        page,
      ),
    ).rejects.toThrow();

    const unchanged = await pageRepo.findById(page.id);
    expect(unchanged.position).toBe(before);
    expect(unchanged.parentPageId).toBe(page.parentPageId);
  });

  it('AC6 — a move whose reference id is not resolvable in the same space/tree rejects and mutates nothing', async () => {
    const otherWorkspace = await seedWorkspace(testDb.db);
    const otherUser = await seedUser(testDb.db, otherWorkspace.id);
    const otherSpace = await seedSpace(
      testDb.db,
      otherWorkspace.id,
      otherUser.id,
    );
    const foreignPage = await seedPage(testDb.db, {
      spaceId: otherSpace.id,
      workspaceId: otherWorkspace.id,
      creatorId: otherUser.id,
      position: generateJitteredKeyBetween(null, null),
    });

    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: generateJitteredKeyBetween(null, null),
    });
    const beforePosition = page.position;
    const beforeParent = page.parentPageId;

    await expect(
      pageService.movePage(
        { pageId: page.id, position: `after:${foreignPage.id}` } as any,
        page,
      ),
    ).rejects.toThrow();

    const unchanged = await pageRepo.findById(page.id);
    expect(unchanged.position).toBe(beforePosition);
    expect(unchanged.parentPageId).toBe(beforeParent);
  });
});
