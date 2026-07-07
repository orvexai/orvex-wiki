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

import { createHash } from 'node:crypto';
import { up as backfillBlockIdsUp } from '../20260707T120000-backfill-block-ids';
import { countMissingBlockIds } from '../../../collaboration/backfill-block-ids.util';
import { canonicalJsonStringify } from '../../../common/helpers/canonical-json';

/**
 * ENG-1397 AC4 — `backfill-block-ids.migration.spec.ts`.
 *
 * Real testcontainers Postgres, full migration set applied (so the schema
 * matches production), then a "legacy" page is inserted directly (content
 * missing block ids, simulating a page last written before this leg
 * landed). Asserts the migration mints ids for every targeted page and
 * that re-running it is a true no-op (`nodesAdded === 0` on the second
 * pass — no already-present id is ever regenerated).
 */
describe('BackfillBlockIdsMigrationSpec', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<any>;
  let pageId: string;
  let spaceId: string;
  let userId: string;
  let workspaceIdVal: string;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../');
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1397 Migration Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-1397-migration@example.com', workspaceId: ws.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    const space = await db
      .insertInto('spaces')
      .values({
        name: 'ENG-1397 Migration Space',
        slug: 'eng-1397-migration-space',
        workspaceId: ws.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // A "legacy" page: content written before block-ID coverage was
    // widened — missing ids on a callout and a column (newly-widened
    // types), and no id at all on the paragraph.
    const legacyContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Legacy body' }] },
        { type: 'callout', content: [{ type: 'paragraph' }] },
        {
          type: 'columns',
          content: [
            { type: 'column', content: [{ type: 'paragraph' }] },
            { type: 'column', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    };

    const page = await db
      .insertInto('pages')
      .values({
        slugId: 'legacy-slug-eng-1397',
        title: 'Legacy Page',
        position: 'a0',
        spaceId: space.id,
        creatorId: user.id,
        lastUpdatedById: user.id,
        workspaceId: ws.id,
        content: legacyContent,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    pageId = page.id;
    spaceId = space.id;
    userId = user.id;
    workspaceIdVal = ws.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('mints ids for every targeted legacy page, and a second run is a true no-op', async () => {
    const beforeRow = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', pageId)
      .executeTakeFirstOrThrow();
    expect(countMissingBlockIds(beforeRow.content)).toBeGreaterThan(0);

    await backfillBlockIdsUp(db);

    const afterFirstRow = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', pageId)
      .executeTakeFirstOrThrow();
    expect(countMissingBlockIds(afterFirstRow.content)).toBe(0);

    // Re-run: idempotent — no ids regenerated, content unchanged.
    await backfillBlockIdsUp(db);

    const afterSecondRow = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', pageId)
      .executeTakeFirstOrThrow();

    expect(afterSecondRow.content).toEqual(afterFirstRow.content);
  });

  it('F2 — recomputes and persists the stale orvex_page_meta.content_hash for pages the backfill rewrites', async () => {
    // Fixture created HERE (not in the shared beforeAll) so an earlier
    // test's `backfillBlockIdsUp(db)` run — which scans the WHOLE `pages`
    // table — cannot have already touched this page before this test's
    // own "before" snapshot is taken.
    const legacyContentWithMeta = {
      type: 'doc',
      content: [{ type: 'callout', content: [{ type: 'paragraph' }] }],
    };
    const staleHash = createHash('sha256')
      .update(canonicalJsonStringify(legacyContentWithMeta))
      .digest('hex');

    const pageWithMeta = await db
      .insertInto('pages')
      .values({
        slugId: 'legacy-slug-eng-1397-meta',
        title: 'Legacy Page With Meta',
        position: 'a1',
        spaceId,
        creatorId: userId,
        lastUpdatedById: userId,
        workspaceId: workspaceIdVal,
        content: legacyContentWithMeta,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const pageWithMetaId = pageWithMeta.id;

    await db
      .insertInto('orvexPageMeta')
      .values({
        pageId: pageWithMetaId,
        contentHash: staleHash,
        version: 1,
        workspaceId: workspaceIdVal,
      })
      .execute();

    const metaBefore = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', pageWithMetaId)
      .executeTakeFirstOrThrow();
    expect(metaBefore.contentHash).toBe(staleHash);

    await backfillBlockIdsUp(db);

    const afterRow = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', pageWithMetaId)
      .executeTakeFirstOrThrow();
    expect(countMissingBlockIds(afterRow.content)).toBe(0);

    const recomputedHash = createHash('sha256')
      .update(canonicalJsonStringify(afterRow.content))
      .digest('hex');

    const metaAfter = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', pageWithMetaId)
      .executeTakeFirstOrThrow();

    expect(metaAfter.contentHash).toBe(recomputedHash);
    expect(metaAfter.contentHash).not.toBe(staleHash);

    // Re-run: the row is now already stamped (nodesAdded === 0), so the
    // meta hash must NOT be touched again (still matches the recomputed
    // hash, and no needless write occurs).
    await backfillBlockIdsUp(db);
    const metaAfterSecondRun = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', pageWithMetaId)
      .executeTakeFirstOrThrow();
    expect(metaAfterSecondRun.contentHash).toBe(recomputedHash);
  });
});
