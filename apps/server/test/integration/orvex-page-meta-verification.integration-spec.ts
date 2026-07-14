/**
 * ENG-1379 — named DoD test: OrvexPageMetaVerificationSpec.
 *
 * SCOPE CORRECTION (recorded here per CS §11 honesty — do not silently
 * reinterpret a ticket): three prior non-claiming capacity-fill comments on
 * this issue (2026-07-06/07) flagged that the ticket's "HEAD current-state"
 * premise — `verified_against`/`verified_at` living directly on `pages` via
 * a migration `20260519T120000-orvex-verification-columns.ts`, requiring a
 * drop-and-relocate migration — does not match this repo. Verified again at
 * pick-up (dev @ cdcc09a1, 2026-07-09):
 *   - that migration file has never existed in this repo's history;
 *   - `pages` has never carried `verified_against`/`verified_at` (confirmed
 *     by ENG-1371's own `FORK_META_COLUMNS` pristine-`pages` assertion in
 *     `orvex-page-meta-sidetable.integration-spec.ts`, which already lists
 *     both columns);
 *   - `verified_against`/`verified_at` were added FRESH, directly onto
 *     `orvex_page_meta` (never `pages`), by ENG-1371's
 *     `20260708T100000-orvex-page-meta-governance-cols.ts`;
 *   - `apps/server/src/orvex/drift/**` (`OrvexDriftService`/
 *     `OrvexDriftController`/`ForceNewTokenService`) has never existed in
 *     this repo — there is nothing to delete.
 * So AC2's "drop from pages" and AC3/AC4's "delete the drift module" are
 * vacuously already true (nothing to drop, nothing to delete) — this spec
 * locks that state in with real assertions rather than skipping it. The
 * genuinely new, buildable part of this leg is AC1/AC5/AC7: a dedicated,
 * additive-only, typed stamp+read accessor for the two fields
 * (`PageMetaVerificationService`), which did not exist before this leg.
 */
import { sql } from 'kysely';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { PageMetaVerificationService } from '../../src/orvex/page-metadata/page-meta-verification.service';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

describe('OrvexPageMetaVerificationSpec (ENG-1379)', () => {
  let testDb: TestDb;
  let service: PageMetaVerificationService;
  let workspaceId: string;
  let spaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    service = new PageMetaVerificationService(testDb.db as any);

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

  it('AC1 — stampVerification round-trips verified_against/verified_at through orvex_page_meta (byte-equal)', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a0',
      title: 'eng-1379-stamp-roundtrip',
    });

    const verifiedAt = new Date('2026-07-08T12:00:00.000Z');
    await service.stampVerification({
      pageId: page.id,
      verifiedAgainst: 'sha256:cafef00d',
      verifiedAt,
    });

    const row = await testDb.db
      .selectFrom('orvexPageMeta')
      .select(['verifiedAgainst', 'verifiedAt'])
      .where('pageId', '=', page.id)
      .executeTakeFirstOrThrow();

    expect(row.verifiedAgainst).toBe('sha256:cafef00d');
    expect(new Date(row.verifiedAt as unknown as string).toISOString()).toBe(
      verifiedAt.toISOString(),
    );
  });

  it('AC2/AC7 — getVerification returns a typed, additive-only DTO read via the side table', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a1',
      title: 'eng-1379-get-verification',
    });

    const verifiedAt = new Date('2026-07-08T13:30:00.000Z');
    await service.stampVerification({
      pageId: page.id,
      verifiedAgainst: 'sha256:deadbeef',
      verifiedAt,
    });

    const verification = await service.getVerification(page.id);
    expect(verification).toEqual({
      verifiedAgainst: 'sha256:deadbeef',
      verifiedAt,
    });

    // AC2 — `pages` carries no verified_against/verified_at column; the
    // read is a join on `orvex_page_meta` only (columns already dropped —
    // in this repo they never existed on `pages` to begin with).
    const pagesColumns = await testDb.db
      .selectFrom('information_schema.columns' as any)
      .select('column_name' as any)
      .where('table_name', '=', 'pages')
      .execute();
    const pagesColumnNames = new Set(
      pagesColumns.map((r: any) => r.columnName),
    );
    expect(pagesColumnNames.has('verified_against')).toBe(false);
    expect(pagesColumnNames.has('verified_at')).toBe(false);

    const indexes = await sql<{ indexname: string }>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'pages'
    `.execute(testDb.db);
    expect(
      indexes.rows.some((r) => r.indexname === 'idx_pages_verified_against'),
    ).toBe(false);
  });

  it('AC5 — stampVerification lazily upserts on a page with no prior orvex_page_meta row', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a2',
      title: 'eng-1379-lazy-upsert',
    });

    const preExisting = await testDb.db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .execute();
    expect(preExisting).toHaveLength(0);

    const verifiedAt = new Date('2026-07-08T14:00:00.000Z');
    await service.stampVerification({
      pageId: page.id,
      verifiedAgainst: 'sha256:lazyupsert',
      verifiedAt,
    });

    const rows = await testDb.db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].verifiedAgainst).toBe('sha256:lazyupsert');
  });

  it('AC5 (upsert, not duplicate) — a second stamp on the same page updates in place', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a3',
      title: 'eng-1379-upsert-again',
    });

    await service.stampVerification({
      pageId: page.id,
      verifiedAgainst: 'sha256:first',
      verifiedAt: new Date('2026-07-08T15:00:00.000Z'),
    });
    await service.stampVerification({
      pageId: page.id,
      verifiedAgainst: 'sha256:second',
      verifiedAt: new Date('2026-07-08T16:00:00.000Z'),
    });

    const rows = await testDb.db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].verifiedAgainst).toBe('sha256:second');
  });

  it('AC6 — hard-deleting the page cascades the stamped orvex_page_meta row away (in-DB FK, ENG-1371)', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a4',
      title: 'eng-1379-fk-cascade',
    });

    await service.stampVerification({
      pageId: page.id,
      verifiedAgainst: 'sha256:tobedeleted',
      verifiedAt: new Date('2026-07-08T17:00:00.000Z'),
    });

    await testDb.db.deleteFrom('pages').where('id', '=', page.id).execute();

    const orphan = await testDb.db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .executeTakeFirst();
    expect(orphan).toBeUndefined();
  });

  it('AC2/AC7 — a page with no meta row returns null verification, never a crash', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a5',
      title: 'eng-1379-no-meta-row',
    });

    const verification = await service.getVerification(page.id);
    expect(verification).toBeNull();
  });

  it('AC3/AC4 — the removed drift routes/service/controller/force-new-token do not exist in this engine', () => {
    const driftDir = path.join(__dirname, '..', '..', 'src', 'orvex', 'drift');
    expect(fs.existsSync(driftDir)).toBe(false);
  });
});
