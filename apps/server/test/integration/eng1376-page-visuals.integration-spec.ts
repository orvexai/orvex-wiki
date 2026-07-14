/**
 * ENG-1376 — P7 subpage-cards + page-visuals server projections.
 *
 * Integration test against a REAL Postgres (testcontainers, ENG-1372
 * convention). Never mocks `SpaceAbilityFactory`/`OrvexPageVisualsService`
 * (CS §5 ❌#4) — every repo/service below is the real production class.
 *
 * Named DoD test: TestSubpageCards_StatusFilteredWithBlurbs (AC1-AC3).
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { sql } from 'kysely';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from 'src/core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from 'src/core/casl/interfaces/space-ability.type';
import { PageStatus } from '@orvex/extensions';
import { OrvexPageVisualsController } from 'src/orvex/page-visuals/orvex-page-visuals.controller';
import { OrvexPageVisualsService } from 'src/orvex/page-visuals/orvex-page-visuals.service';
import { extractTldrText } from 'src/orvex/page-blocks/page-blocks-utils';
import { SpaceRole } from 'src/common/helpers/types/permission';
import {
  seedPage,
  seedSpace,
  seedSpaceMember,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

function fakeCache(): Cache {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      store.delete(key);
    },
  } as unknown as Cache;
}

function tldrDoc(text: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'callout',
        attrs: { role: 'tldr' },
        content: [
          { type: 'paragraph', content: [{ type: 'text', text }] },
        ],
      },
    ],
  };
}

async function setMeta(
  testDb: TestDb,
  pageId: string,
  workspaceId: string,
  patch: Partial<{
    status: PageStatus;
    verifiedAgainst: string | null;
    verifiedAt: Date | null;
    lastReviewedAt: Date | null;
  }>,
) {
  await testDb.db
    .insertInto('orvexPageMeta')
    .values({ pageId, workspaceId, ...patch } as any)
    .onConflict((oc) => oc.column('pageId').doUpdateSet(patch as any))
    .execute();
}

describe('ENG-1376: page-visuals server projections', () => {
  let testDb: TestDb;
  let service: OrvexPageVisualsService;
  let abilityFactory: SpaceAbilityFactory;
  let controller: OrvexPageVisualsController;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let otherSpaceId: string;
  let spaceId: string;
  let userId: string;
  let readerId: string;
  let outsiderId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new OrvexPageVisualsService(testDb.db as any);
    const db = testDb.db as any;
    const groupRepo = new GroupRepo(db);
    const spaceRepo = new SpaceRepo(db, new EventEmitter2());
    const spaceMemberRepo = new SpaceMemberRepo(
      db,
      groupRepo,
      spaceRepo,
      fakeCache(),
    );
    abilityFactory = new SpaceAbilityFactory(spaceMemberRepo);
    controller = new OrvexPageVisualsController(
      service,
      abilityFactory,
      testDb.db as any,
    );

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const otherWorkspace = await seedWorkspace(testDb.db);
    otherWorkspaceId = otherWorkspace.id;

    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
    await seedSpaceMember(testDb.db, {
      spaceId,
      userId,
      role: SpaceRole.ADMIN,
    });

    const reader = await seedUser(testDb.db, workspaceId);
    readerId = reader.id;
    await seedSpaceMember(testDb.db, {
      spaceId,
      userId: readerId,
      role: SpaceRole.READER,
    });

    // AC6 — a real user with NO membership in `spaceId` at all.
    const outsider = await seedUser(testDb.db, workspaceId);
    outsiderId = outsider.id;

    // F1 fixtures — a page that genuinely lives in a different workspace,
    // owned by its own user/space, so the cross-workspace 404 path is a
    // real cross-tenant scenario rather than a synthetic id swap.
    const otherWorkspaceUser = await seedUser(testDb.db, otherWorkspaceId);
    const otherSpace = await seedSpace(
      testDb.db,
      otherWorkspaceId,
      otherWorkspaceUser.id,
    );
    otherSpaceId = otherSpace.id;
    await seedSpaceMember(testDb.db, {
      spaceId: otherSpaceId,
      userId: otherWorkspaceUser.id,
      role: SpaceRole.ADMIN,
    });
  }, 120000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it('TestSubpageCards_StatusFilteredWithBlurbs (AC1/AC2/AC3) — only canonical+draft children returned, blurbs from tldr, correct rollup', async () => {
    const parent = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a0',
      title: 'Parent',
    });

    const canonicalChild = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      parentPageId: parent.id,
      position: 'a1',
      title: 'Canonical child',
      content: tldrDoc('This is the canonical blurb.'),
    });
    await setMeta(testDb, canonicalChild.id, workspaceId, {
      status: PageStatus.CANONICAL,
    });

    const draftChild = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      parentPageId: parent.id,
      position: 'a2',
      title: 'Draft child (no tldr)',
      content: { type: 'doc', content: [] },
    });
    await setMeta(testDb, draftChild.id, workspaceId, {
      status: PageStatus.DRAFT,
    });

    const supersededChild = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      parentPageId: parent.id,
      position: 'a3',
      title: 'Superseded child',
    });
    await setMeta(testDb, supersededChild.id, workspaceId, {
      status: PageStatus.SUPERSEDED,
    });

    const archivedChild = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      parentPageId: parent.id,
      position: 'a4',
      title: 'Archived child',
    });
    await setMeta(testDb, archivedChild.id, workspaceId, {
      status: PageStatus.ARCHIVED,
    });

    const result = await service.subpageCards(parent.id);

    expect(result.cards.map((c) => c.id)).toEqual([
      canonicalChild.id,
      draftChild.id,
    ]);
    expect(result.cards[0].blurb).toBe('This is the canonical blurb.');
    expect(result.cards[1].blurb).toBeNull();
    expect(result.rollup).toEqual({ canonical: 1, draft: 1 });
    const rollupSum = Object.values(result.rollup).reduce((a, b) => a + b, 0);
    expect(rollupSum).toBe(result.cards.length);
  });

  it('AC7/AC8 — a child with no orvex_page_meta row defaults to draft (visible), and a parent with no children returns empty cards/rollup', async () => {
    const parent = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'b0',
      title: 'Lonely parent',
    });
    const empty = await service.subpageCards(parent.id);
    expect(empty.cards).toEqual([]);
    expect(empty.rollup).toEqual({});

    const noMetaChild = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      parentPageId: parent.id,
      position: 'b1',
      title: 'No meta row child',
    });
    const withDefault = await service.subpageCards(parent.id);
    expect(withDefault.cards.map((c) => c.id)).toEqual([noMetaChild.id]);
    expect(withDefault.cards[0].status).toBe(PageStatus.DRAFT);
  });

  it('AC4 — freshness tone matrix', async () => {
    const fresh = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'c0',
      title: 'Fresh page',
    });
    await setMeta(testDb, fresh.id, workspaceId, {
      status: PageStatus.CANONICAL,
      verifiedAgainst: 'abc123',
      verifiedAt: new Date(),
      lastReviewedAt: new Date(),
    });
    expect((await service.freshness(fresh.id)).tone).toBe('fresh');

    const stale = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'c1',
      title: 'Stale page',
    });
    await setMeta(testDb, stale.id, workspaceId, {
      status: PageStatus.CANONICAL,
    });
    expect((await service.freshness(stale.id)).tone).toBe('stale');

    const draft = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'c2',
      title: 'Draft page',
    });
    await setMeta(testDb, draft.id, workspaceId, { status: PageStatus.DRAFT });
    expect((await service.freshness(draft.id)).tone).toBe('draft');

    const superseded = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'c3',
      title: 'Superseded page',
    });
    await setMeta(testDb, superseded.id, workspaceId, {
      status: PageStatus.SUPERSEDED,
    });
    expect((await service.freshness(superseded.id)).tone).toBe('archived');
  });

  it('AC5 — changelog projection clamps the limit and carries verify stamps, no content field', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'd0',
      title: 'Changelog page',
    });
    await setMeta(testDb, page.id, workspaceId, {
      verifiedAgainst: 'rev-9',
      verifiedAt: new Date(),
    });

    // F3 fixture — explicit, strictly-increasing `createdAt` stamps
    // (rather than relying on wall-clock timing between statements) so
    // the newest-first ordering assertion below is deterministic, not a
    // race against timestamp resolution.
    const baseTime = Date.parse('2026-01-01T00:00:00.000Z');
    for (let i = 0; i < 3; i++) {
      await testDb.db
        .insertInto('pageHistory')
        .values({
          pageId: page.id,
          slugId: `slug-${i}`,
          title: `v${i}`,
          version: i,
          spaceId,
          workspaceId,
          lastUpdatedById: userId,
          content: { type: 'doc', content: [] } as any,
          createdAt: new Date(baseTime + i * 1000),
        } as any)
        .execute();
    }

    const clamped = await service.changelog(page.id, 999);
    expect(clamped.entries.length).toBeLessThanOrEqual(100);

    const result = await service.changelog(page.id, 2);
    expect(result.entries.length).toBe(2);
    expect(result.verifiedAgainst).toBe('rev-9');
    for (const entry of result.entries) {
      expect((entry as any).content).toBeUndefined();
    }
    // F3 — newest-first ordering (createdAt desc). The three seeded
    // versions are inserted in order 0,1,2 with strictly increasing
    // `createdAt` (default now()); a limit=2 changelog must return the two
    // NEWEST versions (2 then 1), not an arbitrary or ascending slice. A
    // regression to `.orderBy('createdAt', 'asc')` would return [0, 1]
    // instead and this assertion would catch it.
    expect(result.entries.map((e) => e.version)).toEqual([2, 1]);
    for (let i = 1; i < result.entries.length; i++) {
      expect(result.entries[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
        result.entries[i].createdAt.getTime(),
      );
    }

    const noHistory = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'd1',
      title: 'No history page',
    });
    const empty = await service.changelog(noHistory.id);
    expect(empty.entries).toEqual([]);
  });

  it('extractTldrText — pure unit behavior: no tldr node => null, tldr with text => extracted, trimmed', () => {
    expect(extractTldrText(null)).toBeNull();
    expect(extractTldrText({ type: 'doc', content: [] })).toBeNull();
    expect(extractTldrText(tldrDoc('  hello world  '))).toBe('hello world');
  });

  it('AC6 — CASL read guard: a space member gets Read; an outsider (no space role) does not', async () => {
    const memberAbility = await abilityFactory.createForUser(
      { id: readerId } as any,
      spaceId,
    );
    expect(
      memberAbility.can(SpaceCaslAction.Read, SpaceCaslSubject.Page),
    ).toBe(true);

    await expect(
      abilityFactory.createForUser({ id: outsiderId } as any, spaceId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // F1 — the AC6 test above exercises `SpaceAbilityFactory` directly and
  // never touches `OrvexPageVisualsController.authorizePageRead`, which is
  // where the AC6-asserted HTTP behavior (cross-workspace 404, non-member
  // 403) actually lives. These three cases drive the real controller
  // method end to end so a scoping regression (e.g. dropping the
  // `page.workspaceId !== workspace.id` check) fails a test.
  describe('AC6 — controller.authorizePageRead (via subpageCards/freshness/changelog)', () => {
    it('a page belonging to a DIFFERENT workspace yields 404 PAGE_NOT_FOUND (no cross-tenant existence leak)', async () => {
      const otherWorkspacePage = await seedPage(testDb.db, {
        spaceId: otherSpaceId,
        workspaceId: otherWorkspaceId,
        creatorId: userId,
        position: 'e0',
        title: 'Lives in the other workspace',
      });

      const dto = { pageId: otherWorkspacePage.id };
      const caller = { id: userId } as any;
      const callerWorkspace = { id: workspaceId } as any;

      await expect(
        controller.subpageCards(dto, caller, callerWorkspace),
      ).rejects.toMatchObject({
        status: 404,
        response: { error: 'PAGE_NOT_FOUND' },
      });
      await expect(
        controller.freshness(dto, caller, callerWorkspace),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        controller.changelog(dto, caller, callerWorkspace),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a missing/soft-deleted pageId yields 404 PAGE_NOT_FOUND', async () => {
      const deletedPage = await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: userId,
        position: 'e1',
        title: 'Will be soft-deleted',
      });
      await testDb.db
        .updateTable('pages')
        .set({ deletedAt: new Date() } as any)
        .where('id', '=', deletedPage.id)
        .execute();

      await expect(
        controller.subpageCards(
          { pageId: deletedPage.id },
          { id: userId } as any,
          { id: workspaceId } as any,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        controller.subpageCards(
          { pageId: '00000000-0000-0000-0000-000000000000' },
          { id: userId } as any,
          { id: workspaceId } as any,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('an in-workspace page but a caller with NO role in its space yields 403 Forbidden', async () => {
      const inWorkspacePage = await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: userId,
        position: 'e2',
        title: 'In workspace, outsider has no role here',
      });

      await expect(
        controller.subpageCards(
          { pageId: inWorkspacePage.id },
          { id: outsiderId } as any,
          { id: workspaceId } as any,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a caller WITH a space role (reader) successfully reads through the controller', async () => {
      const inWorkspacePage = await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: userId,
        position: 'e3',
        title: 'Reader can read this',
      });

      const result = await controller.subpageCards(
        { pageId: inWorkspacePage.id },
        { id: readerId } as any,
        { id: workspaceId } as any,
      );
      expect(result).toEqual({ cards: [], rollup: {} });
    });
  });

  // F2 — AC9 asserts the two hot queries this ported code runs are backed
  // by the intended index. On a fresh testcontainer DB the tables hold a
  // handful of rows, so the planner's row-count-based cost model will
  // happily pick a Seq Scan on a tiny table even with a matching index
  // present — asserting "no Seq Scan" directly would be a flaky/misleading
  // test of the *planner's row-count heuristic*, not of the index's
  // existence/fit. Instead we force `enable_seqscan = off` (LOCAL to a
  // throwaway transaction) so the planner is compelled to route the query
  // through the index if-and-only-if it actually matches the predicate.
  // If the index existed but didn't cover the predicate/columns (e.g. a
  // ruling-10 typo'd index), the plan would fall back to a Bitmap Heap
  // Scan on an *unrelated* index or still fail to name our index — this
  // is a real, deterministic proof the index fits the query.
  describe('AC9 — the intended index actually matches the query predicate', () => {
    it('subpage-cards query (pages.parent_page_id) can be served by idx_pages_parent_page_id', async () => {
      const parent = await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: userId,
        position: 'f0',
        title: 'EXPLAIN parent',
      });
      await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: userId,
        parentPageId: parent.id,
        position: 'f1',
        title: 'EXPLAIN child',
      });

      const plan = await testDb.db.transaction().execute(async (trx) => {
        await sql`SET LOCAL enable_seqscan = off`.execute(trx);
        const rows = await sql<{ 'QUERY PLAN': string }>`
          EXPLAIN SELECT id, title, position
          FROM pages
          WHERE parent_page_id = ${parent.id} AND deleted_at IS NULL
          ORDER BY position ASC
        `.execute(trx);
        return rows.rows.map((r) => r['QUERY PLAN']).join('\n');
      });

      // The planner may route this through either the single-column
      // `idx_pages_parent_page_id` or the covering composite
      // `idx_pages_space_parent_position` (space_id, parent_page_id,
      // position) — both are real, both satisfy the predicate, and the
      // composite additionally serves the `ORDER BY position` for free.
      // Either is a pass; a plan naming neither means no eligible index
      // matches the predicate.
      expect(plan).toMatch(
        /idx_pages_parent_page_id|idx_pages_space_parent_position/i,
      );
    });

    it('changelog query (page_history.page_id, created_at desc) can be served by idx_page_history_page_created', async () => {
      const page = await seedPage(testDb.db, {
        spaceId,
        workspaceId,
        creatorId: userId,
        position: 'f2',
        title: 'EXPLAIN changelog page',
      });
      await testDb.db
        .insertInto('pageHistory')
        .values({
          pageId: page.id,
          slugId: 'slug-explain',
          title: 'v0',
          version: 0,
          spaceId,
          workspaceId,
          lastUpdatedById: userId,
          content: { type: 'doc', content: [] } as any,
        })
        .execute();

      const plan = await testDb.db.transaction().execute(async (trx) => {
        await sql`SET LOCAL enable_seqscan = off`.execute(trx);
        const rows = await sql<{ 'QUERY PLAN': string }>`
          EXPLAIN SELECT version, title, created_at, last_updated_by_id
          FROM page_history
          WHERE page_id = ${page.id}
          ORDER BY created_at DESC
          LIMIT 2
        `.execute(trx);
        return rows.rows.map((r) => r['QUERY PLAN']).join('\n');
      });

      expect(plan).toMatch(/idx_page_history_page_created/i);
    });
  });
});
