// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2493 — `TestHistoryPruneCronIsSingleton` (the named DoD gate) plus the
 * AC1/AC4/AC5 prune-correctness suite.
 *
 * Everything here runs against a REAL testcontainers Postgres through the
 * REAL `PageHistoryPruneService`. The only substitution is the entitlement
 * READ (a genuine remote-but-owned seam, CS §5): a per-tenant retention
 * table stands in for the billing port, which is exactly what lets AC4
 * prove the bound is read PER TENANT rather than hardcoded.
 *
 * The singleton claim (AC2) is proven against the real Postgres advisory
 * lock across TWO SEPARATE CONNECTIONS — one per simulated replica — since
 * a session-level lock is re-entrant within one connection and would make a
 * same-connection test vacuously green.
 */
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { CamelCasePlugin } from 'kysely';

import { PageHistoryPruneService } from '../../src/orvex/page-metadata/page-history-prune.service';
import { EntitlementService } from '../../src/orvex/entitlement/entitlement.service';
import { KyselyDB } from '../../src/database/types/kysely.types';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

jest.setTimeout(300_000);

/** Per-tenant retention fixture — the AC4 lever. */
type Retention = { versions: number; days: number };

function entitlementStub(byWorkspace: Map<string, Retention>) {
  return {
    async getHistoryRetention(workspaceId: string): Promise<Retention> {
      const found = byWorkspace.get(workspaceId);
      if (!found) {
        throw new Error(`no retention fixture for workspace ${workspaceId}`);
      }
      return found;
    },
  } as unknown as EntitlementService;
}

describe('TestHistoryPruneCronIsSingleton (ENG-2493)', () => {
  let testDb: TestDb;
  let db: KyselyDB;
  const retentions = new Map<string, Retention>();
  let service: PageHistoryPruneService;

  let workspaceId: string;
  let spaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db as unknown as KyselyDB;
    service = new PageHistoryPruneService(db, entitlementStub(retentions));
  });

  afterAll(async () => {
    await testDb?.teardown();
  });

  beforeEach(async () => {
    await db.deleteFrom('pageHistory').execute();
    retentions.clear();

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const user = await seedUser(testDb.db, workspaceId);
    userId = user.id;
    const space = await seedSpace(testDb.db, workspaceId, userId);
    spaceId = space.id;
  });

  /** Seed `count` history rows for a page, oldest first, `dayStep` days apart. */
  async function seedHistory(
    pageId: string,
    wsId: string,
    count: number,
    dayStep: number,
  ) {
    for (let i = count - 1; i >= 0; i--) {
      await sql`
        INSERT INTO page_history
          (page_id, space_id, workspace_id, title, version, created_at, updated_at)
        VALUES (
          ${pageId}, ${spaceId}, ${wsId}, ${'v' + String(count - i)},
          ${count - i},
          now() - (${sql.lit(i * dayStep)}::int * INTERVAL '1 day'),
          now() - (${sql.lit(i * dayStep)}::int * INTERVAL '1 day')
        )
      `.execute(db);
    }
  }

  async function historyRows(pageId: string) {
    return db
      .selectFrom('pageHistory')
      .select(['id', 'title', 'createdAt'])
      .where('pageId', '=', pageId)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  it('AC1 — a prune pass retains exactly min(N versions, D days): the 10 most recent, none older than 180 days', async () => {
    retentions.set(workspaceId, { versions: 10, days: 180 });
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a0',
    });

    // 15 versions, 20 days apart => spans 280 days, so BOTH bounds bite.
    await seedHistory(page.id, workspaceId, 15, 20);
    expect(await historyRows(page.id)).toHaveLength(15);

    const result = await service.runOnce();
    expect(result.ran).toBe(true);

    const kept = await historyRows(page.id);
    // No more than N.
    expect(kept.length).toBeLessThanOrEqual(10);
    // None older than D days.
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
    for (const row of kept) {
      expect(new Date(row.createdAt).getTime()).toBeGreaterThan(cutoff);
    }
    // And the ones kept are the MOST RECENT (v15 is newest by construction).
    expect(kept[0].title).toBe('v15');
  });

  it('AC2 (the DoD singleton claim) — two concurrent replicas fire the cron, exactly ONE executes the prune body', async () => {
    retentions.set(workspaceId, { versions: 1, days: 3650 });
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a0',
    });
    await seedHistory(page.id, workspaceId, 5, 1);

    // Two SEPARATE connections — a session advisory lock is re-entrant
    // within one connection, so sharing `db` would make this vacuous.
    const url = `postgres://orvex:orvex@${testDb.container.getHost()}:${testDb.container.getMappedPort(
      5432,
    )}/orvex_test`;
    const replicaPools = [new Pool({ connectionString: url }), new Pool({ connectionString: url })];
    const replicas = replicaPools.map(
      (pool) =>
        new PageHistoryPruneService(
          new Kysely({
            dialect: new PostgresDialect({ pool }),
            plugins: [new CamelCasePlugin()],
          }) as unknown as KyselyDB,
          entitlementStub(retentions),
        ),
    );

    try {
      const [a, b] = await Promise.all([
        replicas[0].runOnce(),
        replicas[1].runOnce(),
      ]);

      // Exactly one ran; the other observed the lock held and did nothing.
      const ran = [a, b].filter((r) => r.ran);
      const skipped = [a, b].filter((r) => !r.ran);
      expect(ran).toHaveLength(1);
      expect(skipped).toHaveLength(1);
      expect(skipped[0].rowsDeleted).toBe(0);
      expect(skipped[0].workspacesPruned).toBe(0);

      // The single winner pruned to min(1, ...) — never a double pass.
      expect(await historyRows(page.id)).toHaveLength(1);
    } finally {
      await Promise.all(replicaPools.map((p) => p.end()));
    }
  });

  it('AC4 — the SAME pass applies each tenant’s OWN bound: Free min(10,180d) vs Personal min(100,730d)', async () => {
    // Tenant A: Free-tier bound.
    retentions.set(workspaceId, { versions: 10, days: 180 });
    const pageA = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a0',
    });
    await seedHistory(pageA.id, workspaceId, 15, 5);

    // Tenant B: Personal-tier bound, IDENTICAL history fixture.
    const wsB = await seedWorkspace(testDb.db);
    const userB = await seedUser(testDb.db, wsB.id);
    const spaceB = await seedSpace(testDb.db, wsB.id, userB.id);
    retentions.set(wsB.id, { versions: 100, days: 730 });
    const pageB = await db
      .insertInto('pages')
      .values({
        slugId: `slug-b-${Date.now()}`,
        title: 'tenant B',
        spaceId: spaceB.id,
        workspaceId: wsB.id,
        creatorId: userB.id,
        position: 'a0',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    for (let i = 14; i >= 0; i--) {
      await sql`
        INSERT INTO page_history
          (page_id, space_id, workspace_id, title, version, created_at, updated_at)
        VALUES (
          ${pageB.id}, ${spaceB.id}, ${wsB.id}, ${'v' + String(15 - i)}, ${15 - i},
          now() - (${sql.lit(i * 5)}::int * INTERVAL '1 day'),
          now() - (${sql.lit(i * 5)}::int * INTERVAL '1 day')
        )
      `.execute(db);
    }

    // ONE pass covers both tenants.
    const result = await service.runOnce();
    expect(result.ran).toBe(true);

    // Free tenant capped at 10; Personal tenant keeps all 15 (< 100, < 730d).
    expect(await historyRows(pageA.id)).toHaveLength(10);
    expect(await historyRows(pageB.id)).toHaveLength(15);
  });

  it('AC5 — an aggressive prune never touches the live pages row (store confinement)', async () => {
    retentions.set(workspaceId, { versions: 1, days: 1 });
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a0',
      title: 'LIVE TITLE',
      content: { type: 'doc', content: [] },
    });
    // One ancient history row — both bounds would remove it.
    await seedHistory(page.id, workspaceId, 1, 400);

    const before = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();

    await service.runOnce();

    const after = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();

    // The live row is byte-for-byte untouched and still readable.
    expect(after.title).toBe('LIVE TITLE');
    expect(after.title).toBe(before.title);
    expect(after.content).toEqual(before.content);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });
});
