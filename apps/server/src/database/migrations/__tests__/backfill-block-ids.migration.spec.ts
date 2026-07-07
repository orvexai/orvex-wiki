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

import { up as backfillBlockIdsUp } from '../20260707T120000-backfill-block-ids';
import { countMissingBlockIds } from '../../../collaboration/backfill-block-ids.util';

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
});
