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

import { up as pageTransclusionsUp } from '../20260501T202258-page-transclusions';
import { up as labelsUp } from '../20260509T121236-labels';

/**
 * ENG-2479 T4 — `TestRenamedMigrationsDoNotDuplicateCreateTable` (AC2).
 *
 * Grounding note (recorded per the ticket's own instruction to "verify by
 * inspection... which of 'drop the rename' vs 'already byte-identical/
 * harmless' is true, and record the finding" — CS §11 honesty):
 * `git log --all --follow` (and a full-history `--diff-filter=R` scan) for
 * both `20260501T202258-page-transclusions.ts` and
 * `20260509T121236-labels.ts` shows exactly ONE commit each
 * (`de60aa7e`/`a689cca7`, both single-parent, both matching upstream
 * docmost's own squash-merge "Title (#PRnum)" convention) — this repo's own
 * git history has **no rename event** for either file; they carry the same
 * filename they were introduced under. So the literal premise "the fork
 * renamed these two migrations" could NOT be independently verified here —
 * it is recorded as NOT FOUND under this repo's history, not silently
 * assumed true.
 *
 * That said, the underlying mechanical risk AC2 describes is real and
 * independent of *how* a ledger came to be missing a row for an
 * already-applied object: Kysely tracks "applied" purely by filename in
 * `kysely_migration`. ANY path that leaves these two tables' objects
 * present without a matching ledger row (a genuine historical rename, a
 * restored/rebuilt ledger, a manually-provisioned schema, ...) makes
 * `migrateToLatest()` re-run these files' `up()`, and a plain `createTable`
 * would crash-loop the boot on "relation already exists". This spec drives
 * that exact mechanical trigger directly: real migration files, real
 * Postgres, call `up()` a second time on already-populated tables (mirroring
 * `backfill-block-ids.migration.spec.ts`'s "run full chain, then call one
 * migration's `up` directly" pattern) and asserts it is now a safe no-op
 * (T4's hardening: `.ifNotExists()` added to both files' `createTable`/
 * `createIndex` calls, ENG-2479).
 */
describe('RenamedMigrationDuplicateObjectSpec', () => {
  jest.setTimeout(180_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<any>;
  let workspaceId: string;
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
      .values({ name: 'ENG-2479 Duplicate-Object Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-2479-dup-object@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();

    const space = await db
      .insertInto('spaces')
      .values({
        name: 'ENG-2479 Duplicate-Object Space',
        slug: 'eng-2479-dup-object-space',
        workspaceId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const page = await db
      .insertInto('pages')
      .values({
        slugId: 'eng-2479-dup-object-page',
        title: 'Marker Page',
        position: 'a0',
        spaceId: space.id,
        creatorId: user.id,
        lastUpdatedById: user.id,
        workspaceId,
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

  it('re-running page-transclusions.up() on an already-populated schema is a safe no-op and preserves existing rows', async () => {
    const markerRow = await db
      .insertInto('pageTransclusions')
      .values({
        workspaceId,
        pageId,
        transclusionId: 'marker-transclusion-1',
        content: { type: 'doc', content: [] },
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // The exact mechanical failure this AC guards against: Kysely believes
    // this migration is pending (e.g. because its ledger row is recorded
    // under a different filename) and calls `up()` again on a database that
    // already has these tables. Pre-hardening, this throws
    // '"page_transclusions" already exists'.
    await expect(pageTransclusionsUp(db)).resolves.toBeUndefined();

    const stillThere = await db
      .selectFrom('pageTransclusions')
      .selectAll()
      .where('id', '=', markerRow.id)
      .executeTakeFirst();
    expect(stillThere).toMatchObject({ transclusionId: 'marker-transclusion-1' });
  });

  it('re-running labels.up() on an already-populated schema is a safe no-op and preserves existing rows', async () => {
    const label = await db
      .insertInto('labels')
      .values({ name: 'marker-label', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();

    const pageLabel = await db
      .insertInto('pageLabels')
      .values({ pageId, labelId: label.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    await expect(labelsUp(db)).resolves.toBeUndefined();

    const labelStillThere = await db
      .selectFrom('labels')
      .selectAll()
      .where('id', '=', label.id)
      .executeTakeFirst();
    expect(labelStillThere).toMatchObject({ name: 'marker-label' });

    const pageLabelStillThere = await db
      .selectFrom('pageLabels')
      .selectAll()
      .where('id', '=', pageLabel.id)
      .executeTakeFirst();
    expect(pageLabelStillThere).toBeDefined();
  });
});
