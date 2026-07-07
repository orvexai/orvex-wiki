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

import { rewriteSlugInProsemirrorJson } from '../slug-rewrite.task';
import type { DB } from '@docmost/db/types/db';
import type { KyselyDB } from '@docmost/db/types/kysely.types';

/**
 * ENG-1398 — the named binary DoD gate:
 *
 * `slug-rewrite.task.spec.ts › "rewrites page-mention slugIds and internal
 * link hrefs across a workspace, bumps updatedAt on changed pages, and skips
 * pages whose serialized content does not contain the old slug"`
 *
 * Behaviour-through-interface on `rewriteSlugInProsemirrorJson` against a
 * real testcontainers PostgreSQL (real page rows, real Kysely) — no mocking
 * of `KyselyDB` (CS §5 / ❌#4).
 */
describe('rewriteSlugInProsemirrorJson', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;

  let workspaceId: string;
  let spaceId: string;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(
      __dirname,
      '../../../../database/migrations',
    );
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    }) as unknown as KyselyDB;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end();
    await pgContainer?.stop();
  });

  beforeEach(async () => {
    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1398 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const space = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1398 Space', slug: `space-${ws.id}`, workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;
  });

  const mentionDoc = (slugId: string) => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'mention',
            attrs: {
              id: 'mention-1',
              entityType: 'page',
              entityId: 'entity-1',
              slugId,
              creatorId: 'creator-1',
            },
          },
        ],
      },
    ],
  });

  const linkDoc = (slugId: string) => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'link',
            marks: [
              {
                type: 'link',
                attrs: {
                  internal: true,
                  href: `/s/space/p/${slugId}`,
                },
              },
            ],
          },
        ],
      },
    ],
  });

  it('rewrites page-mention slugIds and internal link hrefs across a workspace, bumps updatedAt on changed pages, and skips pages whose serialized content does not contain the old slug', async () => {
    const oldSlugId = 'old-slug-1398';
    const newSlugId = 'new-slug-1398';

    const mentionPage = await db
      .insertInto('pages')
      .values({
        slugId: 'page-mention',
        spaceId,
        workspaceId,
        content: mentionDoc(oldSlugId),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      })
      .returning(['id', 'updatedAt'])
      .executeTakeFirstOrThrow();

    const linkPage = await db
      .insertInto('pages')
      .values({
        slugId: 'page-link',
        spaceId,
        workspaceId,
        content: linkDoc(oldSlugId),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      })
      .returning(['id', 'updatedAt'])
      .executeTakeFirstOrThrow();

    const untouchedPage = await db
      .insertInto('pages')
      .values({
        slugId: 'page-untouched',
        spaceId,
        workspaceId,
        content: mentionDoc('some-other-slug'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      })
      .returning(['id', 'updatedAt'])
      .executeTakeFirstOrThrow();

    const deletedPage = await db
      .insertInto('pages')
      .values({
        slugId: 'page-deleted',
        spaceId,
        workspaceId,
        content: mentionDoc(oldSlugId),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        deletedAt: new Date('2026-01-02T00:00:00Z'),
      })
      .returning(['id', 'updatedAt'])
      .executeTakeFirstOrThrow();

    await rewriteSlugInProsemirrorJson(db, {
      workspaceId,
      oldSlugId,
      newSlugId,
    });

    const rewrittenMentionPage = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', mentionPage.id)
      .executeTakeFirstOrThrow();
    expect(
      (rewrittenMentionPage.content as any).content[0].content[0].attrs
        .slugId,
    ).toBe(newSlugId);
    expect(rewrittenMentionPage.updatedAt.getTime()).toBeGreaterThan(
      mentionPage.updatedAt.getTime(),
    );

    const rewrittenLinkPage = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', linkPage.id)
      .executeTakeFirstOrThrow();
    const rewrittenHref = (rewrittenLinkPage.content as any).content[0]
      .content[0].marks[0].attrs.href;
    expect(rewrittenHref).toBe(`/s/space/p/${newSlugId}`);
    expect(rewrittenHref.includes(oldSlugId)).toBe(false);
    expect(rewrittenLinkPage.updatedAt.getTime()).toBeGreaterThan(
      linkPage.updatedAt.getTime(),
    );

    const stillUntouchedPage = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', untouchedPage.id)
      .executeTakeFirstOrThrow();
    expect(
      (stillUntouchedPage.content as any).content[0].content[0].attrs.slugId,
    ).toBe('some-other-slug');
    expect(stillUntouchedPage.updatedAt.getTime()).toBe(
      untouchedPage.updatedAt.getTime(),
    );

    const stillDeletedPage = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', deletedPage.id)
      .executeTakeFirstOrThrow();
    expect(
      (stillDeletedPage.content as any).content[0].content[0].attrs.slugId,
    ).toBe(oldSlugId);
    expect(stillDeletedPage.updatedAt.getTime()).toBe(
      deletedPage.updatedAt.getTime(),
    );
  });

  it('is idempotent: re-running with the same slugs finds nothing left to change', async () => {
    const oldSlugId = 'idem-old';
    const newSlugId = 'idem-new';

    const page = await db
      .insertInto('pages')
      .values({
        slugId: 'page-idem',
        spaceId,
        workspaceId,
        content: mentionDoc(oldSlugId),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      })
      .returning(['id', 'updatedAt'])
      .executeTakeFirstOrThrow();

    await rewriteSlugInProsemirrorJson(db, {
      workspaceId,
      oldSlugId,
      newSlugId,
    });

    const afterFirstRun = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();

    await rewriteSlugInProsemirrorJson(db, {
      workspaceId,
      oldSlugId,
      newSlugId,
    });

    const afterSecondRun = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();

    expect(afterSecondRun.updatedAt.getTime()).toBe(
      afterFirstRun.updatedAt.getTime(),
    );
  });
});
