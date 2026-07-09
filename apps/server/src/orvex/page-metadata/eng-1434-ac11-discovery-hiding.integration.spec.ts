// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import { promises as fs } from 'fs';
import { EventEmitter2 } from '@nestjs/event-emitter';
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

import { Cache } from 'cache-manager';
import { Queue } from 'bullmq';
import { PageRepo } from '../../database/repos/page/page.repo';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { PagePermissionRepo } from '../../database/repos/page/page-permission.repo';
import { GroupRepo } from '../../database/repos/group/group.repo';
import { SpaceRepo } from '../../database/repos/space/space.repo';
import { ShareRepo } from '../../database/repos/share/share.repo';
import { AttachmentRepo } from '../../database/repos/attachment/attachment.repo';
import { PageService } from '../../core/page/services/page.service';
import { SearchService } from '../../core/search/search.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { CollaborationGateway } from '../../collaboration/collaboration.gateway';
import { WatcherService } from '../../core/watcher/watcher.service';
import { TransclusionService } from '../../core/page/transclusion/transclusion.service';
import { IdempotencyStore } from '../../integrations/redis/idempotency-store.service';
import { PaginationOptions } from '../../database/pagination/pagination-options';
import { SearchSuggestionDTO } from '../../core/search/dto/search.dto';
import { PageStatus } from '@orvex/extensions';
import { OutboxWriter } from '../events/outbox/outbox-writer.service';
import type { WsService } from '../../ws/ws.service';
import type { DbInterface } from '../../database/types/db.interface';
import type { KyselyDB } from '../../database/types/kysely.types';

/**
 * ENG-1434 AC11 (review1 F2) — superseded pages are excluded from
 * discovery surfaces (sidebar / suggestions / recent) by default, with an
 * explicit opt-in reveal.
 *
 * Real Postgres (testcontainers), the real `PageRepo`/`PageService`/
 * `SearchService` production classes exercised through their exported
 * interfaces (CS §5/❌#4). The cache manager and BullMQ/collab/watcher/
 * storage side channels `PageService` needs for OTHER methods are unused
 * `{}`/no-op doubles here — `getSidebarPages` (called with no `userId`)
 * never touches them, matching the "unreached branch" pattern used by
 * `PageUpsertDedupSpec`.
 */
describe('ENG-1434 AC11 — discovery-hiding (sidebar/suggestions/recent)', () => {
  jest.setTimeout(180_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let pageRepo: PageRepo;
  let pageService: PageService;
  let searchService: SearchService;

  let workspaceId: string;
  let spaceId: string;
  let userId: string;

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
    // True externals / unrelated side channels for the surfaces under
    // test — no groups/restricted-pages are seeded, so these are never
    // read (CS §5 4f "unreached branch" pattern).
    const groupRepoStub = {} as unknown as GroupRepo;
    const cacheManagerStub = {
      get: async () => undefined,
      set: async () => {},
      del: async () => {},
    } as unknown as Cache;
    const spaceRepoStub = {} as unknown as SpaceRepo; // unused by getUserSpaceIdsQuery (pure db query)

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
    } as unknown as WsService; // inert: no realtime assertions on this path
    pageRepo = new PageRepo(
      db,
      spaceMemberRepo,
      eventEmitter,
      new OutboxWriter(db),
      wsServiceStub,
    );

    pageService = new PageService(
      pageRepo,
      pagePermissionRepo,
      {} as unknown as AttachmentRepo, // unused by getSidebarPages
      db,
      {} as unknown as StorageService,
      {} as unknown as Queue,
      {} as unknown as Queue,
      {} as unknown as Queue,
      eventEmitter,
      {} as unknown as CollaborationGateway,
      {} as unknown as WatcherService,
      {} as unknown as TransclusionService,
      {} as unknown as IdempotencyStore,
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
      .values({ name: 'ENG-1434 AC11 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const space = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1434 AC11 Space', slug: 'eng-1434-ac11-space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-1434-ac11@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = user.id;

    await db
      .insertInto('spaceMembers')
      .values({ spaceId, userId, role: 'writer' })
      .execute();
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  let pageCounter = 0;
  async function createPage(title: string) {
    pageCounter += 1;
    return db
      .insertInto('pages')
      .values({
        title,
        spaceId,
        workspaceId,
        slugId: `eng-1434-ac11-${pageCounter}-${Date.now()}`,
        creatorId: userId,
        lastUpdatedById: userId,
      })
      .returning(['id', 'slugId'])
      .executeTakeFirstOrThrow();
  }

  async function markSuperseded(pageId: string) {
    await db
      .insertInto('orvexPageMeta')
      .values({ pageId, workspaceId, status: PageStatus.SUPERSEDED })
      .onConflict((oc) =>
        oc.column('pageId').doUpdateSet({ status: PageStatus.SUPERSEDED }),
      )
      .execute();
  }

  it('recent (space-scoped): excludes a superseded page by default, includes it opt-in', async () => {
    const visible = await createPage('AC11 recent-space visible');
    const superseded = await createPage('AC11 recent-space superseded');
    await markSuperseded(superseded.id);

    const defaultResult = await pageRepo.getRecentPagesInSpace(spaceId, {
      limit: 50,
    } as PaginationOptions);
    const defaultIds = defaultResult.items.map((p) => p.id);
    expect(defaultIds).toContain(visible.id);
    expect(defaultIds).not.toContain(superseded.id);

    const revealedResult = await pageRepo.getRecentPagesInSpace(
      spaceId,
      { limit: 50 } as PaginationOptions,
      true,
    );
    const revealedIds = revealedResult.items.map((p) => p.id);
    expect(revealedIds).toContain(superseded.id);
  });

  it('recent (user-scoped): excludes a superseded page by default, includes it opt-in', async () => {
    const visible = await createPage('AC11 recent-user visible');
    const superseded = await createPage('AC11 recent-user superseded');
    await markSuperseded(superseded.id);

    const defaultResult = await pageRepo.getRecentPages(userId, {
      limit: 50,
    } as PaginationOptions);
    const defaultIds = defaultResult.items.map((p) => p.id);
    expect(defaultIds).toContain(visible.id);
    expect(defaultIds).not.toContain(superseded.id);

    const revealedResult = await pageRepo.getRecentPages(
      userId,
      { limit: 50 } as PaginationOptions,
      true,
    );
    const revealedIds = revealedResult.items.map((p) => p.id);
    expect(revealedIds).toContain(superseded.id);
  });

  it('sidebar: excludes a superseded root page by default, includes it opt-in', async () => {
    const visible = await createPage('AC11 sidebar visible');
    const superseded = await createPage('AC11 sidebar superseded');
    await markSuperseded(superseded.id);

    const defaultResult = await pageService.getSidebarPages(spaceId, {
      limit: 50,
    } as PaginationOptions);
    const defaultIds = defaultResult.items.map((p) => p.id);
    expect(defaultIds).toContain(visible.id);
    expect(defaultIds).not.toContain(superseded.id);

    const revealedResult = await pageService.getSidebarPages(
      spaceId,
      { limit: 50 } as PaginationOptions,
      undefined,
      undefined,
      undefined,
      true,
    );
    const revealedIds = revealedResult.items.map((p) => p.id);
    expect(revealedIds).toContain(superseded.id);
  });

  it('suggestions: excludes a superseded page by default, includes it opt-in', async () => {
    const marker = `ac11uniquetoken${Date.now()}`;
    const visible = await createPage(`AC11 suggest visible ${marker}`);
    const superseded = await createPage(`AC11 suggest superseded ${marker}`);
    await markSuperseded(superseded.id);

    const defaultDto: SearchSuggestionDTO = {
      query: marker,
      includePages: true,
    };
    const defaultResult = await searchService.searchSuggestions(
      defaultDto,
      userId,
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
      userId,
      workspaceId,
    );
    const revealedIds = revealedResult.pages.map((p: { id: string }) => p.id);
    expect(revealedIds).toContain(superseded.id);
  });
});
