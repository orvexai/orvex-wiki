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

/**
 * ENG-1603 review1 F1 — backfill-fidelity snapshot compare (AC2 + AC5).
 *
 * The DoD spec and every integration harness for this ticket run
 * `migrator.migrateToLatest()` against an EMPTY database and only insert
 * rows AFTERWARDS, so the new migration's data-MOVING SQL
 * (`INSERT...SELECT...ON CONFLICT` on `up`, `UPDATE...FROM` on `down`) was
 * never exercised against a non-empty table — only its end-state schema
 * was. ENG-1447 shipped the provenance trio live on `pages`, so this
 * migration WILL move real rows on dev/prod; this spec proves that
 * movement is faithful (1:1 snapshot compare), using the same step-wise
 * `migrateTo` pattern as `backfill-block-ids.migration.spec.ts` but driven
 * through the real `Migrator` (not a direct function import) so the exact
 * production up()/down() entrypoints are what's exercised.
 *
 * Real testcontainers Postgres end-to-end (CS §5): no mocking of the
 * database under test.
 */
describe('MigrateProvenanceTrioToPageMetaMigrationSpec', () => {
  jest.setTimeout(120_000);

  const PRE_MIGRATION = '20260708T100000-orvex-page-meta-governance-cols';
  const TARGET_MIGRATION =
    '20260709T090000-migrate-provenance-trio-to-page-meta';

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let rawDb: Kysely<any>;
  let db: Kysely<any>;
  let migrator: Migrator;

  let workspaceId: string;
  let spaceId: string;
  let userId: string;

  // Three pre-migration `pages` rows, each exercising a distinct trio
  // shape the backfill/reverse SQL must preserve 1:1.
  let pageFullTrioId: string;
  let pageNullTrioId: string;
  let pageWithExistingMetaId: string;

  const fullTrio = {
    provenanceStatus: 'ai_edited',
    provenanceChangedAt: new Date('2026-07-01T12:00:00.000Z'),
    provenanceChangedById: null as string | null,
  };

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../');
    migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });

    // Step 1: migrate to just BEFORE the migration under test, so `pages`
    // still carries the ENG-1447 trio and `orvex_page_meta` does not yet.
    const { error: preError } = await migrator.migrateTo(PRE_MIGRATION);
    if (preError) throw preError;

    db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1603 Migration Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-1603-migration@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = user.id;

    const space = await db
      .insertInto('spaces')
      .values({
        name: 'ENG-1603 Migration Space',
        slug: 'eng-1603-migration-space',
        workspaceId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;

    fullTrio.provenanceChangedById = userId;

    // Page 1: full trio populated, human actor — the common real-world row.
    const pageFullTrio = await db
      .insertInto('pages')
      .values({
        slugId: 'eng-1603-full-trio',
        title: 'Full trio page',
        position: 'a0',
        spaceId,
        creatorId: userId,
        lastUpdatedById: userId,
        workspaceId,
        content: { type: 'doc', content: [] },
        provenanceStatus: fullTrio.provenanceStatus,
        provenanceChangedAt: fullTrio.provenanceChangedAt,
        provenanceChangedById: fullTrio.provenanceChangedById,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    pageFullTrioId = pageFullTrio.id;

    // Page 2: trio entirely null (unstamped page) — must NOT be pulled into
    // orvex_page_meta by the backfill's `WHERE ... IS NOT NULL` guard, and
    // must round-trip through down() as still-null.
    const pageNullTrio = await db
      .insertInto('pages')
      .values({
        slugId: 'eng-1603-null-trio',
        title: 'Unstamped page',
        position: 'a1',
        spaceId,
        creatorId: userId,
        lastUpdatedById: userId,
        workspaceId,
        content: { type: 'doc', content: [] },
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    pageNullTrioId = pageNullTrio.id;

    // Page 3: trio populated AND an orvex_page_meta row already exists
    // (from ENG-1371's governance columns) — the backfill's ON CONFLICT
    // path must UPDATE that row's trio columns without disturbing its
    // pre-existing governance columns (version/contentHash).
    const pageWithExistingMeta = await db
      .insertInto('pages')
      .values({
        slugId: 'eng-1603-existing-meta',
        title: 'Page with prior meta row',
        position: 'a2',
        spaceId,
        creatorId: userId,
        lastUpdatedById: userId,
        workspaceId,
        content: { type: 'doc', content: [] },
        provenanceStatus: 'ai_produced',
        provenanceChangedAt: new Date('2026-06-15T08:00:00.000Z'),
        provenanceChangedById: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    pageWithExistingMetaId = pageWithExistingMeta.id;

    await db
      .insertInto('orvexPageMeta')
      .values({
        pageId: pageWithExistingMetaId,
        workspaceId,
        version: 7,
        contentHash: 'pre-existing-hash',
      })
      .execute();
  });

  afterAll(async () => {
    await db?.destroy();
    await rawDb?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('AC2 — up() backfills every pre-migration trio 1:1 into orvex_page_meta and drops it from pages', async () => {
    const { error } = await migrator.migrateTo(TARGET_MIGRATION);
    if (error) throw error;

    // AC1 — pages no longer carries the trio.
    const pagesColumns = await sqlClient`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pages'
        AND column_name IN ('provenance_status', 'provenance_changed_at', 'provenance_changed_by_id')
    `;
    expect(pagesColumns).toHaveLength(0);

    // Snapshot compare — page 1 (full trio, no prior meta row).
    const metaFull = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', pageFullTrioId)
      .executeTakeFirstOrThrow();
    expect(metaFull.provenanceStatus).toBe(fullTrio.provenanceStatus);
    expect(new Date(metaFull.provenanceChangedAt).toISOString()).toBe(
      fullTrio.provenanceChangedAt.toISOString(),
    );
    expect(metaFull.provenanceChangedById).toBe(fullTrio.provenanceChangedById);

    // Page 2 — entirely-null trio must NOT create a meta row.
    const metaNull = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', pageNullTrioId)
      .executeTakeFirst();
    expect(metaNull).toBeUndefined();

    // Page 3 — ON CONFLICT UPDATE path: trio landed, prior governance
    // columns (version/contentHash) untouched.
    const metaExisting = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', pageWithExistingMetaId)
      .executeTakeFirstOrThrow();
    expect(metaExisting.provenanceStatus).toBe('ai_produced');
    expect(new Date(metaExisting.provenanceChangedAt).toISOString()).toBe(
      new Date('2026-06-15T08:00:00.000Z').toISOString(),
    );
    expect(metaExisting.provenanceChangedById).toBeNull();
    expect(metaExisting.version).toBe(7);
    expect(metaExisting.contentHash).toBe('pre-existing-hash');
  });

  it('AC5 — down() reverses the move: recreates the trio on pages 1:1 from orvex_page_meta', async () => {
    const { error } = await migrator.migrateTo(PRE_MIGRATION);
    if (error) throw error;

    // orvex_page_meta no longer carries the trio.
    const metaColumns = await sqlClient`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'orvex_page_meta'
        AND column_name IN ('provenance_status', 'provenance_changed_at', 'provenance_changed_by_id')
    `;
    expect(metaColumns).toHaveLength(0);

    const pageFull = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', pageFullTrioId)
      .executeTakeFirstOrThrow();
    expect(pageFull.provenanceStatus).toBe(fullTrio.provenanceStatus);
    expect(new Date(pageFull.provenanceChangedAt).toISOString()).toBe(
      fullTrio.provenanceChangedAt.toISOString(),
    );
    expect(pageFull.provenanceChangedById).toBe(fullTrio.provenanceChangedById);

    const pageNull = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', pageNullTrioId)
      .executeTakeFirstOrThrow();
    expect(pageNull.provenanceStatus).toBeNull();
    expect(pageNull.provenanceChangedAt).toBeNull();
    expect(pageNull.provenanceChangedById).toBeNull();

    const pageExisting = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', pageWithExistingMetaId)
      .executeTakeFirstOrThrow();
    expect(pageExisting.provenanceStatus).toBe('ai_produced');
    expect(new Date(pageExisting.provenanceChangedAt).toISOString()).toBe(
      new Date('2026-06-15T08:00:00.000Z').toISOString(),
    );
    expect(pageExisting.provenanceChangedById).toBeNull();

    // Re-forward, leaving the DB on latest for good hygiene / in case Jest
    // reuses the container across files in this process.
    const { error: forwardError } = await migrator.migrateToLatest();
    if (forwardError) throw forwardError;
  });
});
