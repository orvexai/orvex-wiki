/**
 * ENG-1376 — P7 subpage-cards + page-visuals server projections.
 *
 * Integration test against a REAL Postgres (testcontainers, ENG-1372
 * convention). Never mocks `SpaceAbilityFactory`/`OrvexPageVisualsService`
 * (CS §5 ❌#4) — every repo/service below is the real production class.
 *
 * Named DoD test: TestSubpageCards_StatusFilteredWithBlurbs (AC1-AC3).
 */
import { NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
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
  let workspaceId: string;
  let otherWorkspaceId: string;
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
        })
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
});
