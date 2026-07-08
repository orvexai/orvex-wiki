/**
 * ENG-1371 — named DoD test: TestPageMetaSideTable_RoundTrip.
 *
 * Integration test against a REAL Postgres (testcontainers), running the
 * exact migration set that ships to production (via db-test-harness).
 *
 * Proves (AC1-AC4, AC7, AC9-AC11):
 *  (a) the migrated `pages` table has ZERO NEW fork metadata columns beyond
 *      the already-merged ENG-1447 provenance trio (PD-4d carve-out;
 *      information_schema assertion);
 *  (b) writes status/doc_type/supersede/version/content_hash via
 *      `OrvexPageMetadataService`;
 *  (c) reads them back through the join and gets identical values.
 */
import { sql } from 'kysely';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { OrvexPageMetadataService } from '../../src/orvex/page-metadata/orvex-page-metadata.service';
import { extractFrontmatter } from '../../src/orvex/page-metadata/markdown/frontmatter.util';
import { PageStatus } from '@orvex/extensions';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

// AC1/AC11 — the governance columns this ticket ports MUST live on
// `orvex_page_meta`.
//
// PD-4d carve-out (2026-07-08): `provenance_status` / `provenance_changed_at`
// / `provenance_changed_by_id` are deliberately EXCLUDED from this list.
// ENG-1447 (merged) already put a trio of the same names directly on
// `pages` for an unrelated AI-authorship concept (ai_produced/ai_edited/
// human_verified); this ticket does not duplicate those names into
// `orvex_page_meta` (that would be a real naming/semantics collision — same
// name, two tables, two owners). Per the PO ruling the trio stays solely on
// `pages` for now; follow-up ENG-1603 (blocked-by this ticket) moves it into
// `orvex_page_meta` once its consumers repoint.
const FORK_META_COLUMNS = [
  'status',
  'doc_type',
  'owner_id',
  'last_reviewed_at',
  'supersedes',
  'superseded_by',
  'redirect_from',
  'unknown_frontmatter',
  'verified_against',
  'verified_at',
  'spec_confirmed',
  'archive_reason',
  // ruling 4 — version/content_hash never re-added to `pages` either.
  'version',
  'content_hash',
];

describe('TestPageMetaSideTable_RoundTrip (ENG-1371)', () => {
  let testDb: TestDb;
  let service: OrvexPageMetadataService;
  let workspaceId: string;
  let spaceId: string;
  let userId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const workspaceRepo = new WorkspaceRepo(testDb.db as any);
    service = new OrvexPageMetadataService(testDb.db as any, workspaceRepo);

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

  it('AC1/AC11 — pages carries ZERO fork metadata columns; orvex_page_meta carries all of them', async () => {
    const pagesColumns = await testDb.db
      .selectFrom('information_schema.columns' as any)
      .select('column_name' as any)
      .where('table_name', '=', 'pages')
      .execute();
    const pagesColumnNames = new Set(pagesColumns.map((r: any) => r.columnName));

    for (const col of FORK_META_COLUMNS) {
      expect(pagesColumnNames.has(col)).toBe(false);
    }

    // PD-4d carve-out — the ENG-1447 provenance trio MAY still be present on
    // `pages` (it is, by design; ENG-1371 does not touch it).
    expect(pagesColumnNames.has('provenance_status')).toBe(true);
    expect(pagesColumnNames.has('provenance_changed_at')).toBe(true);
    expect(pagesColumnNames.has('provenance_changed_by_id')).toBe(true);

    const metaColumns = await testDb.db
      .selectFrom('information_schema.columns' as any)
      .select('column_name' as any)
      .where('table_name', '=', 'orvex_page_meta')
      .execute();
    const metaColumnNames = new Set(metaColumns.map((r: any) => r.columnName));

    for (const col of FORK_META_COLUMNS) {
      expect(metaColumnNames.has(col)).toBe(true);
    }

    // PD-4d carve-out — `orvex_page_meta` must NOT yet duplicate the
    // ENG-1447 provenance trio; that move is follow-up ENG-1603's job.
    expect(metaColumnNames.has('provenance_status')).toBe(false);
    expect(metaColumnNames.has('provenance_changed_at')).toBe(false);
    expect(metaColumnNames.has('provenance_changed_by_id')).toBe(false);
  });

  it('AC3 — a page with no orvex_page_meta row reads back sane defaults, no crash', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a0',
      title: 'eng-1371-no-meta-row',
    });

    const meta = await service.getMetadata(page.id);

    expect(meta.status).toBe(PageStatus.DRAFT);
    expect(meta.docType).toBeNull();
  });

  it('(b)+(c) — write via the service, read back through the join, values are identical', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a1',
      title: 'eng-1371-write-read-roundtrip',
    });

    await service.applyMetadata(page.id, {
      status: PageStatus.CANONICAL,
      docType: 'architecture',
      version: 3,
      contentHash: 'sha256:deadbeef',
    });

    const written = await service.supersedeAtomic(page.id, 'some-other-slug');
    expect(written.status).toBe(PageStatus.SUPERSEDED);
    expect(written.supersededBy).toBe('some-other-slug');

    // Re-apply the canonical fields the supersede call didn't touch, then
    // read back through the join and assert byte-identical values.
    await service.applyMetadata(page.id, {
      docType: 'architecture',
      version: 3,
      contentHash: 'sha256:deadbeef',
    });

    const readBack = await service.getMetadata(page.id);
    expect(readBack.docType).toBe('architecture');
    expect(readBack.version).toBe(3);
    expect(readBack.contentHash).toBe('sha256:deadbeef');
    expect(readBack.supersededBy).toBe('some-other-slug');

    // AC4 — `pages` was never touched for these fields.
    const rawPage = await testDb.db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect((rawPage as any).status).toBeUndefined();
    expect((rawPage as any).docType).toBeUndefined();
  });

  it('AC7 — doc-type allowlist rejects an out-of-list type, accepts an allowed one', async () => {
    const ws = await testDb.db
      .updateTable('workspaces')
      .set({ settings: { allowedDocTypes: ['architecture', 'adr'] } as any })
      .where('id', '=', workspaceId)
      .returningAll()
      .executeTakeFirstOrThrow();
    expect(ws.id).toBe(workspaceId);

    expect(await service.validateDocType(workspaceId, 'not-a-type')).toBe(false);
    expect(await service.validateDocType(workspaceId, 'architecture')).toBe(true);
  });

  it('AC9 — deleting a page removes its meta row (in-DB FK, ENG-1471)', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a2',
      title: 'eng-1371-fk-cascade-delete',
    });
    await service.applyMetadata(page.id, { status: PageStatus.PUBLISHED });

    await testDb.db.deleteFrom('pages').where('id', '=', page.id).execute();

    const orphan = await testDb.db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .executeTakeFirst();
    expect(orphan).toBeUndefined();
  });

  it('AC9 — reconcileOrphanedPageMeta sweeps a seeded orphan row (future cross-DB split)', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a3',
      title: 'eng-1371-orphan-sweep',
    });
    await service.applyMetadata(page.id, { status: PageStatus.PUBLISHED });

    // Simulate the future cross-DB scenario: the FK can't protect us once
    // orvex_page_meta lives in a separate store. Bypass the FK here (test-only)
    // to seed a genuine orphan row, then prove the sweep removes exactly it.
    await testDb.db.transaction().execute(async (trx) => {
      await sql`set local session_replication_role = replica`.execute(trx as any);
      await trx.deleteFrom('pages').where('id', '=', page.id).execute();
    });

    const beforeSweep = await testDb.db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .executeTakeFirst();
    expect(beforeSweep).toBeDefined();

    const { deleted } = await service.reconcileOrphanedPageMeta();
    expect(deleted).toBeGreaterThanOrEqual(1);

    const afterSweep = await testDb.db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .executeTakeFirst();
    expect(afterSweep).toBeUndefined();
  });

  it('AC10 — orvex_page_meta reads are index-backed on the PK (no seq scan)', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a4',
      title: 'eng-1371-explain-index-scan',
    });
    await service.applyMetadata(page.id, { status: PageStatus.PUBLISHED });

    const plan = await sql<{ 'QUERY PLAN': string }>`
      EXPLAIN SELECT * FROM "orvex_page_meta" WHERE "page_id" = ${page.id}
    `.execute(testDb.db);

    const planText = plan.rows.map((r) => (r as any)['QUERY PLAN']).join('\n');
    expect(planText).toMatch(/orvex_page_meta_pkey/);
    expect(planText).not.toMatch(/Seq Scan on orvex_page_meta/i);
  });

  it('AC5/AC6 (F2 fix pass 2) — applyMetadata enforces validateSlugTitle on the real write path: rejects a banned versioning suffix', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a6',
      title: 'auth-design-v2',
    });

    await expect(
      service.applyMetadata(page.id, { docType: 'architecture' }),
    ).rejects.toMatchObject({
      response: { error: 'BANNED_SLUG_SUFFIX' },
    });

    // Rejected — no meta row should have been written.
    const meta = await testDb.db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', page.id)
      .executeTakeFirst();
    expect(meta).toBeUndefined();
  });

  it('AC5/AC6 (F2 fix pass 2) — applyMetadata rejects a date segment for a non-dated doc_type', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a7',
      title: 'incident-report-2024-03',
    });

    await expect(
      service.applyMetadata(page.id, { docType: 'architecture' }),
    ).rejects.toMatchObject({
      response: { error: 'DATE_SLUG_NOT_ALLOWED' },
    });
  });

  it('AC5/AC6 (F2 fix pass 2) — applyMetadata allows a date segment for an allow-listed dated doc_type', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a8',
      title: 'q1-adr-2024-03',
    });

    // 'adr' is both dated-allow-listed (slug-title-validation) and present
    // in the workspace's `allowedDocTypes` set (mutated by the AC7 test
    // above) — avoids a false INVALID_DOC_TYPE failure unrelated to what
    // this test asserts.
    const written = await service.applyMetadata(page.id, { docType: 'adr' });
    expect(written.docType).toBe('adr');
  });

  it('AC8 — frontmatter novel key round-trips through orvex_page_meta.unknown_frontmatter', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: userId,
      position: 'a5',
      title: 'eng-1371-frontmatter-roundtrip',
    });

    const markdown = `---\nstatus: published\ncustom_novel_key: hello-world\n---\nBody.`;
    const { metadata, unknownKeys } = extractFrontmatter(markdown);

    await service.applyMetadata(page.id, {
      ...metadata,
      unknownFrontmatter: unknownKeys,
    });

    const meta = await service.getMetadata(page.id);
    expect(meta.status).toBe(PageStatus.PUBLISHED);
    expect(meta.unknownFrontmatter).toEqual({ custom_novel_key: 'hello-world' });
  });
});
