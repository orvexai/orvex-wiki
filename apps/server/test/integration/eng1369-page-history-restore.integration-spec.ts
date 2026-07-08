/**
 * ENG-1369 — named DoD test:
 * `TestPageHistoryRestore_WritesContentAndAudit` — restore-from-history
 * writes content through the collab-safe write path
 * (`PageService.updatePageContent`, never a raw `pages.content` UPDATE —
 * AC1) and emits exactly one `page.history_restored` audit row (AC2) in
 * the SAME transaction as the metadata bump (AC3), guards cross-page /
 * cross-workspace history refs (AC4), tolerates a null-content history row
 * (AC5), and is unaffected by an unrelated new column on `page_history`
 * (AC7). Real Postgres via testcontainers (CS §5 — Postgres is
 * local-substitutable infra, never mocked).
 *
 * Collab-gateway note (CS §5f): `PageService.updatePageContent` calls
 * through the REAL, non-mocked `parseProsemirrorContent` validation/stamp
 * chokepoint, then hands off to `CollaborationGateway.handleYjsEvent`. The
 * full Hocuspocus/Redis/BullMQ round trip behind that hand-off is
 * infra-heavy (debounced document store, queue workers) and is exercised
 * by the collaboration test suite elsewhere, not re-proven here. What this
 * suite verifies for itself is: (a) `PageHistoryService.restoreFromHistory`
 * calls `PageService.updatePageContent(pageId, content, 'replace', 'json',
 * user)` — never a raw content UPDATE (grep-assertable in
 * page-history.service.ts, and behaviourally exercised end-to-end below
 * through a real `PageService` instance whose ONLY stubbed dependency is
 * the `CollaborationGateway` hand-off itself, replaced with a thin,
 * behaviourally-equivalent fake that performs the real content persistence
 * `onStoreDocument` would perform); and (b) the metadata-bump + audit
 * transaction and all remaining ACs against REAL Postgres.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { PageHistoryService } from 'src/core/page/services/page-history.service';
import { PageService } from 'src/core/page/services/page.service';
import { OrvexAuditService } from 'src/core/audit/orvex-audit.service';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { jsonToText, stampBlockIds } from 'src/collaboration/collaboration.util';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

async function insertHistory(
  db: TestDb['db'],
  page: { id: string; slugId: string; spaceId: string; workspaceId: string },
  content: object | null,
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

describe('PageHistoryService.restoreFromHistory (ENG-1369)', () => {
  jest.setTimeout(120_000);

  let testDb: TestDb;
  let pageRepo: PageRepo;
  let pageHistoryRepo: PageHistoryRepo;
  let pageService: PageService;
  let orvexAudit: OrvexAuditService;
  let service: PageHistoryService;
  let updatePageContentCalls: Array<{
    pageId: string;
    content: any;
    operation: string;
    format: string;
  }>;
  let spaceId: string;
  let workspaceId: string;
  let userId: string;
  let user: any;

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
    orvexAudit = new OrvexAuditService(testDb.db as any);

    updatePageContentCalls = [];
    // The only stubbed dependency (see file-header note): a thin fake of
    // the collab-gateway hand-off that persists content the same way
    // `PersistenceExtension.onStoreDocument` does in production, so
    // restore's downstream DB-content assertion is real, not mocked-call
    // theatre. Everything upstream of this (DTO validation, prosemirror
    // schema validation + block-id stamping in `parseProsemirrorContent`,
    // the transactional metadata bump, and the audit write) is real.
    const collaborationGatewayFake = {
      handleYjsEvent: async (
        _eventName: string,
        documentName: string,
        payload: { prosemirrorJson: any; operation: string; user: any },
      ) => {
        const pageId = documentName.replace(/^page\./, '');
        updatePageContentCalls.push({
          pageId,
          content: payload.prosemirrorJson,
          operation: payload.operation,
          format: 'json',
        });
        await pageRepo.updatePage(
          {
            content: payload.prosemirrorJson,
            textContent: jsonToText(payload.prosemirrorJson),
            lastUpdatedById: payload.user.id,
          },
          pageId,
        );
      },
    } as any;

    pageService = new PageService(
      pageRepo,
      {} as any, // pagePermissionRepo — unused by updatePageContent
      {} as any, // attachmentRepo
      testDb.db as any,
      {} as any, // storageService
      {} as any, // attachmentQueue
      {} as any, // aiQueue
      {} as any, // generalQueue
      eventEmitter,
      collaborationGatewayFake,
      {} as any, // watcherService
      {} as any, // transclusionService
      { record: async () => {} } as any, // idempotencyStore
      {} as any, // entitlementService — restore path never enforces quota
    );

    service = new PageHistoryService(
      pageHistoryRepo,
      pageRepo,
      pageService,
      orvexAudit,
      testDb.db as any,
    );

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const seededUser = await seedUser(testDb.db, workspaceId);
    userId = seededUser.id;
    user = seededUser;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
  }, 120000);

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    updatePageContentCalls.length = 0;
  });

  async function countAuditRows(pageId: string): Promise<number> {
    const rows = await testDb.db
      .selectFrom('audit' as any)
      .select('id')
      .where('event', '=', 'page.history_restored')
      .where('resourceId', '=', pageId)
      .execute();
    return rows.length;
  }

  it('TestPageHistoryRestore_WritesContentAndAudit — content byte-equal + exactly one page.history_restored row (AC1, AC2)', async () => {
    const liveContent = stampBlockIds({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'live' }] }],
    }).content;
    const historicalContent = stampBlockIds({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'historical' }] },
      ],
    }).content;

    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a0',
      title: 'eng1369-p0',
      content: liveContent,
    });
    const history = await insertHistory(testDb.db, page, historicalContent);

    // ENG-1396 fix-1 (review finding 1): the metadata-bump + audit write
    // MUST join the caller tx (fail-hard, ENG-1380 contract) — assert the
    // real (non-mocked) `logAndCommit` is invoked with `critical: true`,
    // not left on the shared sink's non-critical/deferred default.
    const logAndCommitSpy = jest.spyOn(orvexAudit, 'logAndCommit');

    const restored = await service.restoreFromHistory(
      page.id,
      history.id,
      user,
      workspaceId,
    );

    // (a) content byte-for-byte equal, via the collab-safe write path.
    expect(restored.content).toEqual(historicalContent);
    const rePersisted = await pageRepo.findById(page.id, {
      includeContent: true,
    });
    expect(rePersisted.content).toEqual(historicalContent);

    // The write went through PageService.updatePageContent's hand-off
    // (grep-assertable in page-history.service.ts: no raw pages.content
    // UPDATE from that file), never bypassed.
    expect(updatePageContentCalls).toHaveLength(1);
    expect(updatePageContentCalls[0]).toMatchObject({
      pageId: page.id,
      operation: 'replace',
    });

    // (b) exactly one audit row, correct metadata.
    const auditRows = await testDb.db
      .selectFrom('audit' as any)
      .selectAll()
      .where('event', '=', 'page.history_restored')
      .where('resourceId', '=', page.id)
      .execute();
    expect(auditRows).toHaveLength(1);
    const row = auditRows[0] as any;
    expect(row.actorType).toBe('user');
    expect(row.actorId).toBe(userId);
    const metadata =
      typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    expect(metadata.restoredFromHistoryId).toBe(history.id);
    expect(new Date(metadata.restoredFromTimestamp).getTime()).toBe(
      new Date(history.createdAt as any).getTime(),
    );

    expect(logAndCommitSpy).toHaveBeenCalledTimes(1);
    expect(logAndCommitSpy.mock.calls[0][1]).toMatchObject({
      critical: true,
    });
    logAndCommitSpy.mockRestore();
  });

  it('AC3 (atomicity) — a fault-injected audit failure rolls back the page-mutation row', async () => {
    // Null-content history (as in AC5) isolates the ONE thing this AC
    // actually claims transactional atomicity over: the metadata bump +
    // audit insert, both inside `executeTx`. A content-differing history
    // would ALSO exercise the pre-transaction collab-gateway content write
    // (4i: "content-write ordered before audit so a gateway failure aborts
    // pre-audit" — i.e. that write is intentionally NOT part of this
    // transaction and cannot be rolled back by an audit-only fault), which
    // would conflate two different failure domains in one assertion.
    const liveContent = stampBlockIds({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'pre-fault' }] }],
    }).content;

    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a1',
      title: 'eng1369-p1',
      content: liveContent,
    });
    const history = await insertHistory(testDb.db, page, null);

    const before = await pageRepo.findById(page.id, { includeContent: true });

    const faultyAudit = {
      logAndCommit: async () => {
        throw new Error('injected audit failure');
      },
    } as any;
    const faultyService = new PageHistoryService(
      pageHistoryRepo,
      pageRepo,
      pageService,
      faultyAudit,
      testDb.db as any,
    );

    await expect(
      faultyService.restoreFromHistory(page.id, history.id, user, workspaceId),
    ).rejects.toThrow('injected audit failure');

    const after = await pageRepo.findById(page.id, { includeContent: true });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.contributorIds).toEqual(before.contributorIds);
    expect(await countAuditRows(page.id)).toBe(0);
  });

  it('F2 (audit-tx failure AFTER a real content write) — content stays restored and a degraded, non-transactional fallback audit row is written so the mutation is never silently unaccounted for', async () => {
    // Unlike the AC3 test above (which deliberately uses null content to
    // isolate the metadata+audit tx), this test uses a REAL content-differing
    // history row, so the collab-safe content write actually lands BEFORE
    // the metadata+audit tx runs. If the tx's audit insert then fails, the
    // content is already durably committed — F2 requires that this can never
    // be a completely silent, unaudited mutation.
    const liveContent = stampBlockIds({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'f2-pre' }] }],
    }).content;
    const historicalContent = stampBlockIds({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'f2-historical' }] },
      ],
    }).content;

    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a1b',
      title: 'eng1369-f2',
      content: liveContent,
    });
    const history = await insertHistory(testDb.db, page, historicalContent);

    const faultyAudit = {
      logAndCommit: async () => {
        throw new Error('injected audit-tx failure');
      },
      logFireAndForget: (data: any) => orvexAudit.logFireAndForget(data),
    } as any;
    const faultyService = new PageHistoryService(
      pageHistoryRepo,
      pageRepo,
      pageService,
      faultyAudit,
      testDb.db as any,
    );

    await expect(
      faultyService.restoreFromHistory(page.id, history.id, user, workspaceId),
    ).rejects.toThrow('injected audit-tx failure');

    // Content is durably restored (the collab-safe write already committed).
    const after = await pageRepo.findById(page.id, { includeContent: true });
    expect(after.content).toEqual(historicalContent);

    // Even though the transactional audit insert failed, a degraded
    // fire-and-forget fallback row still exists — the mutation is never
    // completely invisible to audit.
    const rows = await testDb.db
      .selectFrom('audit' as any)
      .selectAll()
      .where('event', '=', 'page.history_restored')
      .where('resourceId', '=', page.id)
      .execute();
    expect(rows).toHaveLength(1);
    const metadata =
      typeof (rows[0] as any).metadata === 'string'
        ? JSON.parse((rows[0] as any).metadata)
        : (rows[0] as any).metadata;
    expect(metadata.restoredFromHistoryId).toBe(history.id);
    expect(metadata.degradedNonTransactional).toBe(true);
  });

  it('AC4 (negative) — a historyId belonging to a different page rejects with INVALID_PAGE_HISTORY_REF and mutates nothing', async () => {
    const pageA = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a2',
      title: 'eng1369-p2',
      content: { type: 'doc', content: [] },
    });
    const pageB = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a3',
      title: 'eng1369-p3',
      content: { type: 'doc', content: [] },
    });
    const historyForB = await insertHistory(testDb.db, pageB, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b-content' }] }],
    });

    const before = await pageRepo.findById(pageA.id, { includeContent: true });

    await expect(
      service.restoreFromHistory(pageA.id, historyForB.id, user, workspaceId),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_PAGE_HISTORY_REF' },
      status: 400,
    });

    const after = await pageRepo.findById(pageA.id, { includeContent: true });
    expect(after.content).toEqual(before.content);
    expect(await countAuditRows(pageA.id)).toBe(0);
  });

  it('AC5 (edge — null historical content) — skips the content write, still bumps metadata + audits, HTTP-equivalent success', async () => {
    const liveContent = stampBlockIds({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'still-here' }] }],
    }).content;

    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a4',
      title: 'eng1369-p4',
      content: liveContent,
    });
    const history = await insertHistory(testDb.db, page, null);

    const restored = await service.restoreFromHistory(
      page.id,
      history.id,
      user,
      workspaceId,
    );

    // no crash, content untouched, no updatePageContent call.
    expect(updatePageContentCalls).toHaveLength(0);
    expect(restored.content).toEqual(liveContent);
    expect(await countAuditRows(page.id)).toBe(1);
  });

  it('AC7 (forward-compat) — an unrelated new page_history column does not change restore behaviour', async () => {
    await testDb.db.schema
      .alterTable('pageHistory')
      .addColumn('eng1369ForwardCompatProbe', 'varchar', (col) => col)
      .execute();

    try {
      const historicalContent = stampBlockIds({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'fwd-compat' }] }],
      }).content;

      const page = await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: userId,
        position: 'a5',
        title: 'eng1369-p5',
        content: { type: 'doc', content: [] },
      });
      await testDb.db
        .updateTable('pageHistory' as any)
        .set({ eng1369ForwardCompatProbe: 'unrelated' } as any)
        .where('pageId', '=', page.id)
        .execute();
      const history = await insertHistory(testDb.db, page, historicalContent);

      const restored = await service.restoreFromHistory(
        page.id,
        history.id,
        user,
        workspaceId,
      );

      expect(restored.content).toEqual(historicalContent);
    } finally {
      await testDb.db.schema
        .alterTable('pageHistory')
        .dropColumn('eng1369ForwardCompatProbe')
        .execute();
    }
  });

  it('AC8 (NFR — freshness fan-out) — restore emits PAGE_UPDATED for a listener to observe', async () => {
    const eventEmitter = new EventEmitter2();
    const isolatedPageRepo = new PageRepo(
      testDb.db as any,
      {} as any,
      eventEmitter,
      new OutboxWriter(testDb.db as any),
      { emitInvalidate: () => {} } as any,
    );
    const isolatedService = new PageHistoryService(
      new PageHistoryRepo(testDb.db as any),
      isolatedPageRepo,
      pageService,
      orvexAudit,
      testDb.db as any,
    );

    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a6',
      title: 'eng1369-p6',
      content: { type: 'doc', content: [] },
    });
    const history = await insertHistory(testDb.db, page, null);

    const spy = jest.fn();
    eventEmitter.on('page.updated', spy);

    await isolatedService.restoreFromHistory(page.id, history.id, user, workspaceId);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ pageIds: [page.id] });
  });
});
