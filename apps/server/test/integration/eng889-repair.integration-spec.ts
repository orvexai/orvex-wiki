/**
 * ENG-1372 (AC7) — eng889-repair-positions.manual.ts dry-run + apply on a
 * seeded-drift fixture. Integration test against a REAL Postgres
 * (testcontainers).
 */
import {
  planRepair,
  groupKey,
} from '../../scripts/eng889-repair-positions.manual';
import { isCorruptPosition } from 'src/orvex/page-position.util';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

describe('eng889-repair-positions (ENG-1372 AC7)', () => {
  let testDb: TestDb;
  let spaceId: string;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
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

  it('unit: isCorruptPosition classifies null/keyword/unparseable as corrupt and valid keys as clean', () => {
    expect(isCorruptPosition(null)).toBe(true);
    expect(isCorruptPosition('child')).toBe(true);
    expect(isCorruptPosition('before:abc')).toBe(true);
    expect(isCorruptPosition('after:abc')).toBe(true);
    expect(isCorruptPosition('not a key')).toBe(true);
    expect(isCorruptPosition(generateJitteredKeyBetween(null, null))).toBe(
      false,
    );
  });

  it('dry-run reports drift without writing; apply rewrites every sibling to a parseable key strictly increasing in prior (created_at) order, without reordering siblings', async () => {
    // Seed a sibling group with: one valid page, one null-position page, one
    // keyword-corrupt page, and two pages sharing a duplicate valid-looking
    // position — created in a known order.
    const valid1 = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: generateJitteredKeyBetween(null, null),
      title: 'valid1',
    });
    const nullPos = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: null as any,
      title: 'nullPos',
    });
    const keywordCorrupt = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'after:deadbeef' as any,
      title: 'keywordCorrupt',
    });
    const dupA = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'zzDUP',
      title: 'dupA',
    });
    const dupB = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'zzDUP',
      title: 'dupB',
    });

    const priorOrder = [valid1, nullPos, keywordCorrupt, dupA, dupB];

    const rowsBefore = await testDb.db
      .selectFrom('pages')
      .select(['id', 'position', 'spaceId', 'parentPageId', 'createdAt'])
      .where('spaceId', '=', spaceId)
      .execute();

    // --- DRY RUN: plan only, no writes ---
    const plan = planRepair(rowsBefore as any);
    expect(plan.groupsWithDrift).toBeGreaterThanOrEqual(1);
    const plannedIds = new Set(plan.drifted.map((d) => d.id));
    for (const p of priorOrder) {
      expect(plannedIds.has(p.id)).toBe(true);
    }

    const stillUnappliedRow = await testDb.db
      .selectFrom('pages')
      .select('position')
      .where('id', '=', nullPos.id)
      .executeTakeFirstOrThrow();
    expect(stillUnappliedRow.position).toBeNull();

    // --- APPLY ---
    for (const item of plan.drifted) {
      await testDb.db
        .updateTable('pages')
        .set({ position: item.to })
        .where('id', '=', item.id)
        .execute();
    }

    const rowsAfter = await testDb.db
      .selectFrom('pages')
      .select(['id', 'position', 'createdAt'])
      .where('spaceId', '=', spaceId)
      .orderBy('createdAt', 'asc')
      .execute();

    // Every position is now parseable.
    for (const r of rowsAfter) {
      expect(() =>
        generateJitteredKeyBetween(r.position as string, null),
      ).not.toThrow();
    }

    // Strictly increasing in prior (created_at) visual order.
    const byId = new Map(rowsAfter.map((r) => [r.id, r.position as string]));
    let prev: string | null = null;
    for (const p of priorOrder) {
      const pos = byId.get(p.id)!;
      if (prev !== null) {
        expect(pos > prev).toBe(true);
      }
      prev = pos;
    }

    // Re-running the planner reports 0 drift now.
    const rowsFinal = await testDb.db
      .selectFrom('pages')
      .select(['id', 'position', 'spaceId', 'parentPageId', 'createdAt'])
      .where('spaceId', '=', spaceId)
      .execute();
    const rePlanned = planRepair(rowsFinal as any);
    expect(rePlanned.groupsWithDrift).toBe(0);
  });

  it('groupKey groups by (spaceId, parentPageId) treating null parent as ROOT', () => {
    expect(groupKey({ spaceId: 's1', parentPageId: null })).toBe('s1::ROOT');
    expect(groupKey({ spaceId: 's1', parentPageId: 'p1' })).toBe('s1::p1');
  });
});
