import * as path from 'path';
import * as os from 'os';
import * as fsExtra from 'fs-extra';
import { promises as fs } from 'fs';
import { Readable } from 'stream';
import { v4 as uuid4 } from 'uuid';
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

import { MultipartFile } from '@fastify/multipart';
import { AttachmentRepo } from '../../database/repos/attachment/attachment.repo';
import { UserRepo } from '../../database/repos/user/user.repo';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { SpaceRepo } from '../../database/repos/space/space.repo';
import { AttachmentService } from '../../core/attachment/services/attachment.service';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import { StorageService } from '../../integrations/storage/storage.service';
import { LocalDriver } from '../../integrations/storage/drivers/local.driver';
import { Queue } from 'bullmq';
import { QueueJob } from '../../integrations/queue/constants';
import { KyselyDB } from '../../database/types/kysely.types';
import { EntitlementService } from './entitlement.service';
import { InMemoryEntitlementCache } from './entitlement-cache';
import { BillingEntitlementPort } from './entitlement-billing.port';
import {
  EntitlementCaps,
  EntitlementCheckResponse,
  Principal,
} from './entitlement.types';
import { QuotaExceededException } from './quota.exception';
import type { DB } from '../../database/types/db';

/**
 * ENG-1382 fix pass 1 — F3: AC4 (storage cap) had zero test coverage, and
 * the pre-write `currentAggregate >= cap` check had a semantic gap — an
 * under-cap workspace could upload an oversized file (AC4's literal is
 * "an upload would exceed it", not "the workspace is already over").
 *
 * Storage is real (`LocalDriver` against a scratch tmp dir — CS §5
 * local-substitutable, not a mocked true-external); Postgres is real
 * (testcontainers). The billing HTTP seam is the stubbed replay, same
 * fixture shape as the sibling specs.
 */
describe('EntitlementStorageChokepointSpec (integration)', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;
  let attachmentRepo: AttachmentRepo;
  let attachmentService: AttachmentService;
  let entitlementService: EntitlementService;
  let cache: InMemoryEntitlementCache;
  let storageRoot: string;

  function replayedCatalog(overrides: Partial<EntitlementCaps>): EntitlementCheckResponse {
    const caps: EntitlementCaps = {
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 20,
      wiki_max_pages: 1_000,
      wiki_storage_bytes_aggregate: 1_000,
      wiki_max_file_bytes: 500,
      wiki_max_files: 3,
      wiki_max_members: 25,
      wiki_history_retention_versions: 10,
      wiki_history_retention_days: 180,
      ...overrides,
    };
    return {
      plan: 'free',
      plan_version: 'v1',
      features: ['ask_wiki'],
      caps,
      trial: { state: 'none' },
      throttle: { state: 'none' },
      version: 'entitlement-v1',
      evaluatedAt: new Date().toISOString(),
    };
  }

  class StubBillingEntitlementPort implements BillingEntitlementPort {
    catalogByWorkspace = new Map<string, EntitlementCheckResponse>();
    async checkEntitlement(
      principal: Principal,
    ): Promise<EntitlementCheckResponse> {
      const catalog = this.catalogByWorkspace.get(principal.principal_id);
      if (!catalog) {
        throw new Error('no committed catalog replay for principal');
      }
      return catalog;
    }
  }

  let stubPort: StubBillingEntitlementPort;

  function fakeMultipartFile(
    fileName: string,
    content: Buffer,
  ): Promise<MultipartFile> {
    return Promise.resolve({
      type: 'file',
      toBuffer: async () => content,
      file: Readable.from(content),
      fieldname: 'file',
      filename: fileName,
      encoding: '7bit',
      mimetype: 'application/octet-stream',
      fields: {},
    } as unknown as MultipartFile);
  }

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<Record<string, unknown>>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../../database/migrations');
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    // ENG-1382 fix pass 1 (F1) — deliberately NOT destroying `rawDb`:
    // it shares the underlying `sqlClient` with `db` below (both wrap the
    // same postgres-js client, just with/without CamelCasePlugin for the
    // migration files' snake_case schema calls). `Kysely.destroy()` on the
    // postgres-js dialect calls through to `sqlClient.end()`, which was
    // silently serializing every later concurrent transaction on `db`
    // (masked until this pass added real concurrency/race tests — the
    // narrow no-op check above genuinely exercises the race precisely
    // because this is fixed). `sqlClient.end()` in `afterAll` below is
    // the real, single teardown.

    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    const kyselyDb = db as unknown as KyselyDB;
    attachmentRepo = new AttachmentRepo(kyselyDb);

    storageRoot = await fsExtra.mkdtemp(
      path.join(os.tmpdir(), 'eng-1382-storage-'),
    );
    const storageService = new StorageService(
      new LocalDriver({ storagePath: storageRoot }),
    );

    stubPort = new StubBillingEntitlementPort();
    cache = new InMemoryEntitlementCache();
    entitlementService = new EntitlementService(stubPort, cache);

    attachmentService = new AttachmentService(
      storageService,
      attachmentRepo,
      undefined as unknown as UserRepo, // unused by uploadFile()
      undefined as unknown as WorkspaceRepo, // unused by uploadFile()
      undefined as unknown as SpaceRepo, // unused by uploadFile()
      kyselyDb,
      { add: async () => undefined } as unknown as Queue<QueueJob>, // attachmentQueue
      entitlementService,
    );
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
    await fsExtra.remove(storageRoot).catch(() => undefined);
  });

  async function seedWorkspace() {
    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1382 Storage Workspace' })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto('users')
      .values({ email: `${ws.id}@example.com`, workspaceId: ws.id })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    return { workspaceId: ws.id, userId: user.id };
  }

  it('AC4 — a workspace AT its storage-aggregate cap gets 402, no attachment row inserted', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    stubPort.catalogByWorkspace.set(
      workspaceId,
      replayedCatalog({ wiki_storage_bytes_aggregate: 100, wiki_max_file_bytes: 500, wiki_max_files: 10 }),
    );
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    // Bring the workspace's aggregate to exactly its cap.
    await db
      .insertInto('attachments')
      .values({
        type: AttachmentType.File,
        filePath: 'preexisting/path',
        fileName: 'preexisting.bin',
        fileSize: 100,
        fileExt: '.bin',
        mimeType: 'application/octet-stream',
        creatorId: userId,
        workspaceId,
      })
      .execute();

    const beforeCount = await attachmentRepo.countByWorkspaceId(workspaceId);
    expect(beforeCount).toBe(1);

    let caught: unknown;
    try {
      await attachmentService.uploadFile({
        filePromise: fakeMultipartFile('over-cap.bin', Buffer.from('x')),
        userId,
        spaceId: uuid4(),
        workspaceId,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(QuotaExceededException);
    expect((caught as QuotaExceededException).getResponse()).toMatchObject({
      error: 'QUOTA_EXCEEDED',
      resource: 'storage',
    });

    const afterCount = await attachmentRepo.countByWorkspaceId(workspaceId);
    expect(afterCount).toBe(beforeCount); // no new row
  });

  it('AC4 (F3 semantic gap) — an UNDER-aggregate-cap workspace uploading an oversized file is rejected, not allowed', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    // Plenty of aggregate headroom (cap 1000, currently 0 used) — the old
    // `currentUsage >= limit` pre-write check would have let this through.
    stubPort.catalogByWorkspace.set(
      workspaceId,
      replayedCatalog({
        wiki_storage_bytes_aggregate: 1_000,
        wiki_max_file_bytes: 50,
        wiki_max_files: 10,
      }),
    );
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    const oversizedContent = Buffer.alloc(51, 'a'); // 1 byte over the 50-byte per-file cap

    let caught: unknown;
    try {
      await attachmentService.uploadFile({
        filePromise: fakeMultipartFile('too-big.bin', oversizedContent),
        userId,
        spaceId: uuid4(),
        workspaceId,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(QuotaExceededException);
    expect((caught as QuotaExceededException).getResponse()).toMatchObject({
      error: 'QUOTA_EXCEEDED',
      resource: 'file_bytes',
      limit: 50,
    });

    const afterCount = await attachmentRepo.countByWorkspaceId(workspaceId);
    expect(afterCount).toBe(0); // no row for the rejected oversized file
  });

  it('AC4 — wiki_max_files count cap is enforced even with storage headroom', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    stubPort.catalogByWorkspace.set(
      workspaceId,
      replayedCatalog({
        wiki_storage_bytes_aggregate: 1_000_000,
        wiki_max_file_bytes: 1_000_000,
        wiki_max_files: 1,
      }),
    );
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    const first = await attachmentService.uploadFile({
      filePromise: fakeMultipartFile('first.bin', Buffer.from('hello')),
      userId,
      spaceId: uuid4(),
      workspaceId,
    });
    expect(first.id).toEqual(expect.any(String));

    let caught: unknown;
    try {
      await attachmentService.uploadFile({
        filePromise: fakeMultipartFile('second.bin', Buffer.from('world')),
        userId,
        spaceId: uuid4(),
        workspaceId,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(QuotaExceededException);
    expect((caught as QuotaExceededException).getResponse()).toMatchObject({
      resource: 'files',
      limit: 1,
    });

    const afterCount = await attachmentRepo.countByWorkspaceId(workspaceId);
    expect(afterCount).toBe(1); // the rejected second upload never landed a row
  });

  it('a workspace UNDER all caps succeeds and the row is persisted', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    stubPort.catalogByWorkspace.set(workspaceId, replayedCatalog({}));
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    const attachment = await attachmentService.uploadFile({
      filePromise: fakeMultipartFile('ok.bin', Buffer.from('small file')),
      userId,
      spaceId: uuid4(),
      workspaceId,
    });

    expect(attachment.id).toEqual(expect.any(String));
    const afterCount = await attachmentRepo.countByWorkspaceId(workspaceId);
    expect(afterCount).toBe(1);
  });
});
