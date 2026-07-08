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

import { PageService } from './page.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PageTransclusionsRepo } from '@docmost/db/repos/page-transclusions/page-transclusions.repo';
import { PageTransclusionReferencesRepo } from '@docmost/db/repos/page-transclusions/page-transclusion-references.repo';
import { TransclusionService } from '../transclusion/transclusion.service';
import type { DbInterface } from '@docmost/db/types/db.interface';
import type { KyselyDB } from '@docmost/db/types/kysely.types';
import type { Page, User } from '@docmost/db/types/entity.types';

/**
 * ENG-1471 — `PageUpsertDedupSpec`, the named binary DoD gate.
 *
 * Real Kysely against a testcontainers Postgres (RED->GREEN, no mocking of
 * the store under test) with the `pages_unique_title_per_parent` migration
 * applied, exercising `PageService.upsert` / `duplicatePage` / `movePage`
 * through their exported interfaces. Per CS §5 mocking strategy (4f):
 * Postgres is real (testcontainers); object storage (`storageService`),
 * the BullMQ queues, the collaboration gateway, and the watcher service are
 * unrelated side channels for every scenario below (no scenario touches
 * content-with-attachments, real-time collab, or watcher fan-out) and are
 * given no-op doubles — exactly the "unreached branch" pattern used by
 * `UserDataExportScopeSpec`. `PageRepo`, `PagePermissionRepo`,
 * `AttachmentRepo`, and `TransclusionService`'s two DB-only repos are the
 * real production classes against the real database — nothing internal to
 * this package is mocked.
 */
describe('PageUpsertDedupSpec', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let service: PageService;

  let workspaceId: string;
  let spaceId: string;
  let userId: string;
  let authUser: User;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../../../database/migrations');
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

    // True externals / unrelated side channels — no-op doubles (CS §5 4f).
    const spaceMemberRepoStub = {} as any; // unused by the exercised PageRepo methods
    const groupRepoStub = {} as any; // unused by hasRestrictedPagesInSpace (no page_access rows seeded)
    const cacheManagerStub = {
      get: async () => undefined,
      set: async () => {},
      del: async () => {},
    } as any;
    const storageServiceStub = { copy: async () => {} } as any;
    const attachmentQueueStub = { add: async () => ({}) } as any;
    const aiQueueStub = { add: async () => ({}) } as any;
    const generalQueueStub = { add: async () => ({}) } as any;
    const collaborationGatewayStub = { handleYjsEvent: async () => {} } as any;
    const watcherServiceStub = {
      addPageWatchers: async () => {},
      movePageWatchersToSpace: async () => {},
    } as any;
    // Unreached in every scenario here — none supplies casOpts (ENG-1413's
    // idempotency store is exercised by its own dedicated spec).
    const idempotencyStoreStub = {
      claim: async () => ({ claimed: true, degraded: true }),
      record: async () => {},
    } as any;

    const pageRepo = new PageRepo(db, spaceMemberRepoStub, eventEmitter);
    const pagePermissionRepo = new PagePermissionRepo(
      db,
      groupRepoStub,
      cacheManagerStub,
    );
    const attachmentRepo = new AttachmentRepo(db);

    const pageTransclusionsRepo = new PageTransclusionsRepo(db);
    const pageTransclusionReferencesRepo = new PageTransclusionReferencesRepo(
      db,
    );
    // Only `insertTransclusionsForPages`/`insertReferencesForPages` (both
    // DB-only, real repos above) are ever reached by `duplicatePage` — the
    // remaining collaborators (page access/space ability/space member) are
    // unreached branches for these scenarios (no sync-block content).
    const transclusionService = new TransclusionService(
      db,
      pageTransclusionsRepo,
      pageTransclusionReferencesRepo,
      pageRepo,
      pagePermissionRepo,
      undefined,
      attachmentRepo,
      storageServiceStub,
      undefined,
    );

    // ENG-1382 — this spec exercises upsert semantics, not F-QUOTA; a stub
    // that never blocks keeps prior scenarios unaffected.
    const entitlementServiceStub = {
      assertWithinQuota: async () => undefined,
      hasFeature: async () => true,
    } as any;

    service = new PageService(
      pageRepo,
      pagePermissionRepo,
      attachmentRepo,
      db,
      storageServiceStub,
      attachmentQueueStub,
      aiQueueStub,
      generalQueueStub,
      eventEmitter,
      collaborationGatewayStub,
      watcherServiceStub,
      transclusionService,
      idempotencyStoreStub,
      entitlementServiceStub,
    );

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1471 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-1471@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = user.id;
    authUser = { id: userId, workspaceId } as User;

    const space = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1471 Space', slug: 'eng-1471-space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('(a) upsert by slugId twice with identical content is a true no-op — updated, no second row, no version bump', async () => {
    const content = { type: 'doc', content: [{ type: 'paragraph' }] };

    const first = await service.upsert(
      { spaceId, title: 'No-op Page', content, format: 'json' },
      userId,
      workspaceId,
    );
    expect(first.upserted).toBe('created');
    const slugId = first.page.slugId;

    const countBefore = await db
      .selectFrom('pages')
      .select(db.fn.countAll().as('n'))
      .where('spaceId', '=', spaceId)
      .executeTakeFirstOrThrow();

    // ENG-1397 — the write chokepoint now stamps missing block ids, minting
    // a fresh (random) id for any node that doesn't already have one. A
    // true "identical content" retry must resubmit the STORED (already
    // id-stamped) content byte-for-byte — resubmitting the original
    // id-less literal a second time would mint a DIFFERENT set of ids and
    // correctly NOT be treated as a no-op. Fetch the persisted content back
    // (as a real idempotent-retry client would) and resubmit that.
    const storedFirst = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', first.page.id)
      .executeTakeFirstOrThrow();

    const second = await service.upsert(
      { slugId, content: storedFirst.content as any, format: 'json' },
      userId,
      workspaceId,
    );

    expect(second.upserted).toBe('updated');
    expect(second.page.id).toBe(first.page.id);

    const countAfter = await db
      .selectFrom('pages')
      .select(db.fn.countAll().as('n'))
      .where('spaceId', '=', spaceId)
      .executeTakeFirstOrThrow();
    expect(Number(countAfter.n)).toBe(Number(countBefore.n));

    const meta = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', first.page.id)
      .executeTakeFirstOrThrow();
    expect(meta.version).toBe(1);
  });

  it('(b) upsert with no key but a colliding (spaceId,parentPageId,title) resolves the existing page — no duplicate', async () => {
    const created = await service.upsert(
      { spaceId, title: 'Fallback Lookup Page' },
      userId,
      workspaceId,
    );
    expect(created.upserted).toBe('created');

    const countBefore = await db
      .selectFrom('pages')
      .select(db.fn.countAll().as('n'))
      .where('spaceId', '=', spaceId)
      .where('title', '=', 'Fallback Lookup Page')
      .executeTakeFirstOrThrow();
    expect(Number(countBefore.n)).toBe(1);

    // No slugId, no externalId — only the (spaceId, parentPageId, title)
    // dimension-3 lookup can resolve this to the SAME existing page.
    const resolved = await service.upsert(
      { spaceId, title: 'Fallback Lookup Page' },
      userId,
      workspaceId,
    );

    expect(resolved.upserted).toBe('updated');
    expect(resolved.page.id).toBe(created.page.id);

    const countAfter = await db
      .selectFrom('pages')
      .select(db.fn.countAll().as('n'))
      .where('spaceId', '=', spaceId)
      .where('title', '=', 'Fallback Lookup Page')
      .executeTakeFirstOrThrow();
    expect(Number(countAfter.n)).toBe(1);
  });

  it('(c) two concurrent duplicatePage calls on the same source both succeed with DISTINCT titles', async () => {
    const root = await service.create(userId, workspaceId, {
      spaceId,
      title: 'Race Source Page',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      format: 'json',
    } as any);

    const [dup1, dup2] = await Promise.all([
      service.duplicatePage(root, undefined, authUser),
      service.duplicatePage(root, undefined, authUser),
    ]);

    expect(dup1.id).not.toBe(dup2.id);
    expect(dup1.title).not.toBe(dup2.title);
    expect(dup1.title).toMatch(/^Copy of Race Source Page/);
    expect(dup2.title).toMatch(/^Copy of Race Source Page/);

    const siblings = await db
      .selectFrom('pages')
      .select(['id', 'title'])
      .where('spaceId', '=', spaceId)
      .where('title', 'like', 'Copy of Race Source Page%')
      .where('deletedAt', 'is', null)
      .execute();
    expect(siblings).toHaveLength(2);
    expect(new Set(siblings.map((s) => s.title)).size).toBe(2);
  });

  it('(d) movePage rejects placing a page under its own descendant', async () => {
    const parent = await service.create(userId, workspaceId, {
      spaceId,
      title: 'Cycle Parent',
    } as any);
    const child = await service.create(userId, workspaceId, {
      spaceId,
      title: 'Cycle Child',
      parentPageId: parent.id,
    } as any);

    await expect(
      service.movePage(
        { pageId: parent.id, position: 'a1', parentPageId: child.id },
        parent as Page,
      ),
    ).rejects.toThrow(
      'Cannot move a page under one of its own descendants',
    );

    const reloaded = await db
      .selectFrom('pages')
      .select(['parentPageId'])
      .where('id', '=', parent.id)
      .executeTakeFirstOrThrow();
    expect(reloaded.parentPageId).toBeNull();
  });
});
