// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import { promises as fs } from 'fs';
import { readFileSync } from 'fs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
  sql,
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import { Cache } from 'cache-manager';
import { PageRepo } from '../../database/repos/page/page.repo';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { PagePermissionRepo } from '../../database/repos/page/page-permission.repo';
import { GroupRepo } from '../../database/repos/group/group.repo';
import { SpaceRepo } from '../../database/repos/space/space.repo';
import { ShareRepo } from '../../database/repos/share/share.repo';
import { SearchService } from './search.service';
import { SearchSuggestionDTO } from './dto/search.dto';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import { PageStatus } from '@orvex/extensions';
import type { WsService } from '../../ws/ws.service';
import type { DbInterface } from '../../database/types/db.interface';
import type { KyselyDB } from '../../database/types/kysely.types';

/**
 * ENG-1451 DoD — `SearchSuggestOnlySpec`.
 *
 * Real Postgres (testcontainers) + the real `SearchService`/`PageRepo`
 * production classes exercised through their exported interfaces
 * (CS §5/❌#4 — no own-package mocks). Asserts, behaviour-through-interface
 * (survives internal rename):
 *  (a) `/search/suggest` still returns ILIKE-matched users/groups/pages,
 *      scoped so a caller never sees a page from a space they are not a
 *      member of (AC1, AC2);
 *  (b) superseded pages stay excluded by default, opt-in via
 *      `includeSuperseded` (AC3, ENG-1434 AC11);
 *  (c) the page-hero FTS ranking (`ts_rank`/`ts_headline`/`to_tsquery`
 *      over `tsv`) is gone from `search.service.ts` — a static grep gate,
 *      not a runtime assertion (AC4);
 *  (d) `pages.tsv` (+ its GIN index + trigger) and `attachments.tsv`
 *      (+ its GIN index) are dropped by the migration (AC5, AC6).
 */
describe('ENG-1451 — SearchSuggestOnlySpec (/search/suggest retained, tsv dropped)', () => {
  jest.setTimeout(180_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let searchService: SearchService;

  let workspaceId: string;
  let spaceA: string;
  let spaceB: string;
  let userA: string;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../../database/migrations');
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    db = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    const eventEmitter = new EventEmitter2();
    const groupRepoStub = {} as unknown as GroupRepo;
    const cacheManagerStub = {
      get: async () => undefined,
      set: async () => {},
      del: async () => {},
    } as unknown as Cache;
    const spaceRepoStub = {} as unknown as SpaceRepo;

    const spaceMemberRepo = new SpaceMemberRepo(
      db,
      groupRepoStub,
      spaceRepoStub,
      cacheManagerStub,
    );
    const pagePermissionRepo = new PagePermissionRepo(
      db,
      groupRepoStub,
      cacheManagerStub,
    );
    const wsServiceStub = {
      emitInvalidate: () => {},
    } as unknown as WsService;
    const pageRepo = new PageRepo(
      db,
      spaceMemberRepo,
      eventEmitter,
      new OutboxWriter(db),
      wsServiceStub,
    );

    searchService = new SearchService(
      db,
      pageRepo,
      {} as unknown as ShareRepo, // unused by searchSuggestions
      spaceMemberRepo,
      pagePermissionRepo,
    );

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1451 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const sA = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1451 Space A', slug: 'eng-1451-space-a', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceA = sA.id;

    const sB = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1451 Space B', slug: 'eng-1451-space-b', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceB = sB.id;

    const uA = await db
      .insertInto('users')
      .values({ email: 'eng-1451-a@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userA = uA.id;

    // userA is a member of space A only — never space B.
    await db
      .insertInto('spaceMembers')
      .values({ spaceId: spaceA, userId: userA, role: 'writer' })
      .execute();
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  let pageCounter = 0;
  async function createPage(spaceId: string, title: string) {
    pageCounter += 1;
    return db
      .insertInto('pages')
      .values({
        title,
        spaceId,
        workspaceId,
        slugId: `eng-1451-${pageCounter}-${Date.now()}`,
        creatorId: userA,
        lastUpdatedById: userA,
      })
      .returning(['id', 'slugId'])
      .executeTakeFirstOrThrow();
  }

  it('AC1/AC2 — suggest returns ILIKE matches, scoped to the caller\'s spaces (never a non-member space page)', async () => {
    const marker = `eng1451marker${Date.now()}`;
    const inA = await createPage(spaceA, `Suggest ${marker} in A`);
    const inB = await createPage(spaceB, `Suggest ${marker} in B`);

    const dto: SearchSuggestionDTO = { query: marker, includePages: true };
    const result = await searchService.searchSuggestions(
      dto,
      userA,
      workspaceId,
    );

    const ids = result.pages.map((p: { id: string }) => p.id);
    expect(ids).toContain(inA.id);
    expect(ids).not.toContain(inB.id);
  });

  it('AC3 — superseded pages excluded from suggest by default, included opt-in (ENG-1434 AC11)', async () => {
    const marker = `eng1451superseded${Date.now()}`;
    const visible = await createPage(spaceA, `Suggest ${marker} visible`);
    const superseded = await createPage(spaceA, `Suggest ${marker} superseded`);
    await db
      .insertInto('orvexPageMeta')
      .values({
        pageId: superseded.id,
        workspaceId,
        status: PageStatus.SUPERSEDED,
      })
      .execute();

    const defaultDto: SearchSuggestionDTO = { query: marker, includePages: true };
    const defaultResult = await searchService.searchSuggestions(
      defaultDto,
      userA,
      workspaceId,
    );
    const defaultIds = defaultResult.pages.map((p: { id: string }) => p.id);
    expect(defaultIds).toContain(visible.id);
    expect(defaultIds).not.toContain(superseded.id);

    const revealedDto: SearchSuggestionDTO = {
      query: marker,
      includePages: true,
      includeSuperseded: true,
    };
    const revealedResult = await searchService.searchSuggestions(
      revealedDto,
      userA,
      workspaceId,
    );
    const revealedIds = revealedResult.pages.map((p: { id: string }) => p.id);
    expect(revealedIds).toContain(superseded.id);
  });

  it('AC4 — no page-hero FTS ranking left in search.service.ts (static grep gate)', () => {
    const source = readFileSync(
      path.join(__dirname, 'search.service.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/ts_rank\(tsv/);
    expect(source).not.toMatch(/ts_headline/);
    expect(source).not.toMatch(/to_tsquery/);
  });

  it('AC5 — pages.tsv column, pages_tsv_idx index, and pages_tsvector_update trigger are dropped', async () => {
    const columns = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pages' AND column_name = 'tsv'
    `.execute(db);
    expect(columns.rows.length).toBe(0);

    const indexes = await sql<{ indexname: string }>`
      SELECT indexname FROM pg_indexes WHERE indexname = 'pages_tsv_idx'
    `.execute(db);
    expect(indexes.rows.length).toBe(0);

    const triggers = await sql<{ trigger_name: string }>`
      SELECT trigger_name FROM information_schema.triggers
      WHERE trigger_name = 'pages_tsvector_update'
    `.execute(db);
    expect(triggers.rows.length).toBe(0);
  });

  it('AC6 — attachments.tsv column + attachments_tsv_idx index are dropped (no silent orphan)', async () => {
    const columns = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'attachments' AND column_name = 'tsv'
    `.execute(db);
    expect(columns.rows.length).toBe(0);

    const indexes = await sql<{ indexname: string }>`
      SELECT indexname FROM pg_indexes WHERE indexname = 'attachments_tsv_idx'
    `.execute(db);
    expect(indexes.rows.length).toBe(0);
  });
});
