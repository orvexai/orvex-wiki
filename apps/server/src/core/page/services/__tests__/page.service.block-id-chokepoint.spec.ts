import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { createHash } from 'node:crypto';
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

import { PageService } from '../page.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { PageTransclusionsRepo } from '@docmost/db/repos/page-transclusions/page-transclusions.repo';
import { PageTransclusionReferencesRepo } from '@docmost/db/repos/page-transclusions/page-transclusion-references.repo';
import { TransclusionService } from '../../transclusion/transclusion.service';
import type { DbInterface } from '@docmost/db/types/db.interface';
import type { KyselyDB } from '@docmost/db/types/kysely.types';
import type { Page, User } from '@docmost/db/types/entity.types';
import {
  BLOCK_ID_TYPES,
  countMissingBlockIds,
} from '../../../../collaboration/backfill-block-ids.util';
import { canonicalJsonStringify } from '../../../../common/helpers/canonical-json';

/**
 * ENG-1397 — `page.service.block-id-chokepoint.spec.ts`, the named binary
 * DoD gate test.
 *
 * "on write, every configured block-level node receives a stable id;
 * re-writing identical content is idempotent (ids unchanged, content_hash
 * matches → no-op); a lossy write format is rejected with
 * LOSSY_WRITE_FORMAT_REJECTED"
 *
 * Behaviour-through-interface on `PageService` against a testcontainers
 * PostgreSQL (real page row round-trip, CS §5 mocking strategy). Postgres
 * is real; the BullMQ queues, storage service, collaboration gateway, and
 * watcher service are unrelated side channels (no scenario here touches
 * attachments, real-time collab fan-out, or watcher notification) and are
 * given no-op doubles — same pattern as `page.service.upsert.spec.ts`.
 */
describe('PageServiceBlockIdChokepointSpec', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let service: PageService;

  let workspaceId: string;
  let spaceId: string;
  let userId: string;

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
      provider: new FileMigrationProvider({
        fs: fsPromises,
        path,
        migrationFolder,
      }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    db = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    const eventEmitter = new EventEmitter2();

    const spaceMemberRepoStub = {} as any;
    const groupRepoStub = {} as any;
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
    );

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1397 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-1397@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = user.id;

    const space = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1397 Space', slug: 'eng-1397-space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('AC1 — every configured block-level node receives a stable id on write', async () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
        { type: 'blockquote', content: [{ type: 'paragraph' }] },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
        },
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
          ],
        },
        { type: 'codeBlock', content: [{ type: 'text', text: 'x = 1' }] },
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

    const { page } = await service.upsert(
      { spaceId, title: 'AC1 Coverage Page', content, format: 'json' } as any,
      userId,
      workspaceId,
    );

    const stored = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();

    expect(countMissingBlockIds(stored.content as any, BLOCK_ID_TYPES)).toBe(
      0,
    );
  });

  it('AC2 — existing ids are preserved (byte-identical), only missing ids are minted', async () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'kept-existing-id' },
          content: [{ type: 'text', text: 'Has an id already' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'No id yet' }] },
      ],
    };

    const { page } = await service.upsert(
      { spaceId, title: 'AC2 Preserve Page', content, format: 'json' } as any,
      userId,
      workspaceId,
    );

    const stored = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();

    const storedContent = stored.content as any;
    expect(storedContent.content[0].attrs.id).toBe('kept-existing-id');
    expect(storedContent.content[1].attrs.id).toBeTruthy();
    expect(storedContent.content[1].attrs.id).not.toBe('kept-existing-id');
    expect(countMissingBlockIds(storedContent, BLOCK_ID_TYPES)).toBe(0);
  });

  it('AC3/AC8 — re-writing the stored (already id-stamped) content is idempotent: ids unchanged, content_hash matches, no-op', async () => {
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Idempotent' }] }],
    };

    const created = await service.upsert(
      { spaceId, title: 'AC3 Idempotent Page', content, format: 'json' } as any,
      userId,
      workspaceId,
    );

    const storedFirst = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', created.page.id)
      .executeTakeFirstOrThrow();

    const metaFirst = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', created.page.id)
      .executeTakeFirstOrThrow();

    // AC8 — stored hash equals a re-computed sha256 over the persisted
    // content (canonical/key-sorted stringify — jsonb does not preserve key
    // insertion order on round-trip, see `canonicalJsonStringify`).
    const recomputedHash = createHash('sha256')
      .update(canonicalJsonStringify(storedFirst.content))
      .digest('hex');
    expect(metaFirst.contentHash).toBe(recomputedHash);

    // Re-submit the ALREADY-stamped content verbatim (a real idempotent
    // retry — e.g. a client that GETs then PUTs back unchanged).
    const second = await service.upsert(
      {
        slugId: created.page.slugId,
        content: storedFirst.content as any,
        format: 'json',
      } as any,
      userId,
      workspaceId,
    );

    expect(second.upserted).toBe('updated');

    const storedSecond = await db
      .selectFrom('pages')
      .select(['content'])
      .where('id', '=', created.page.id)
      .executeTakeFirstOrThrow();

    const metaSecond = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', created.page.id)
      .executeTakeFirstOrThrow();

    // ids unchanged, content_hash matches, no version bump (a true no-op).
    expect(storedSecond.content).toEqual(storedFirst.content);
    expect(metaSecond.contentHash).toBe(metaFirst.contentHash);
    expect(metaSecond.version).toBe(metaFirst.version);
  });

  it('AC5 — a lossy write format (markdown/html) is rejected with LOSSY_WRITE_FORMAT_REJECTED', async () => {
    await expect(
      service.upsert(
        {
          spaceId,
          title: 'AC5 Markdown Page',
          content: '# Not allowed',
          format: 'markdown',
        } as any,
        userId,
        workspaceId,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'LOSSY_WRITE_FORMAT_REJECTED',
      }),
    });

    await expect(
      service.upsert(
        {
          spaceId,
          title: 'AC5 Html Page',
          content: '<p>Not allowed</p>',
          format: 'html',
        } as any,
        userId,
        workspaceId,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'LOSSY_WRITE_FORMAT_REJECTED',
      }),
    });
  });

  it('AC6 — un-resolved dfm reaching the chokepoint is rejected with DFM_NOT_PRE_RESOLVED', async () => {
    await expect(
      (service as any).parseProsemirrorContent('dfm content', 'dfm'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DFM_NOT_PRE_RESOLVED' }),
    });
  });

  it('AC7 — malformed ProseMirror json is rejected with INVALID_CONTENT_FORMAT', async () => {
    await expect(
      service.upsert(
        {
          spaceId,
          title: 'AC7 Invalid Page',
          content: { type: 'not-a-real-node-type-xyz' },
          format: 'json',
        } as any,
        userId,
        workspaceId,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_CONTENT_FORMAT' }),
    });
  });
});

describe('ENG-1397 AC1a — shared-file Linear scrub (static)', () => {
  it('collaboration.util.ts has zero Linear references', () => {
    const filePath = path.join(
      __dirname,
      '../../../../collaboration/collaboration.util.ts',
    );
    const src = fs.readFileSync(filePath, 'utf-8');
    expect(/Linear/.test(src)).toBe(false);
  });
});
