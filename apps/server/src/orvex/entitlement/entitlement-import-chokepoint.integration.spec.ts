import * as path from 'path';
import { promises as fs } from 'fs';
import { MultipartFile } from '@fastify/multipart';
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
import { Queue } from 'bullmq';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PageRepo } from '../../database/repos/page/page.repo';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { ImportService } from '../../integrations/import/services/import.service';
import { StorageService } from '../../integrations/storage/storage.service';
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
 * ENG-1382 fix pass 2 (F1) — the T6 cap-bypass a reviewer found: single-file
 * import (`ImportService.importPage`) inserted pages directly via
 * `pageRepo.insertPage`, bypassing the F-QUOTA chokepoint that
 * `PageService.create` enforces. This spec proves the fix: import now takes
 * the same advisory-locked count -> assert -> insert path.
 */
describe('EntitlementImportChokepointSpec (integration, F1 fix pass 2)', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;
  let pageRepo: PageRepo;
  let importService: ImportService;
  let entitlementService: EntitlementService;
  let cache: InMemoryEntitlementCache;

  const REPLAYED_PAGE_CAP = 2;

  function replayedCatalog(): EntitlementCheckResponse {
    const caps: EntitlementCaps = {
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 20,
      wiki_max_pages: REPLAYED_PAGE_CAP,
      wiki_storage_bytes_aggregate: 1_000_000_000,
      wiki_max_file_bytes: 10_000_000,
      wiki_max_files: 2000,
      wiki_max_members: 25,
      wiki_history_retention_versions: 10,
      wiki_history_retention_days: 180,
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

    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    const kyselyDb = db as unknown as KyselyDB;
    const eventEmitter = new EventEmitter2();
    pageRepo = new PageRepo(
      kyselyDb,
      undefined as unknown as SpaceMemberRepo,
      eventEmitter,
    );

    stubPort = new StubBillingEntitlementPort();
    cache = new InMemoryEntitlementCache();
    entitlementService = new EntitlementService(stubPort, cache);

    const noopQueue = { add: async () => undefined } as unknown as Queue<QueueJob>;
    importService = new ImportService(
      pageRepo,
      undefined as unknown as StorageService, // unused for .md import
      kyselyDb,
      noopQueue,
      undefined as unknown as ModuleRef,
      entitlementService,
    );
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  async function seedWorkspaceWithSpace() {
    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1382 F1 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();

    const user = await db
      .insertInto('users')
      .values({ email: `${ws.id}@example.com`, workspaceId: ws.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    const space = await db
      .insertInto('spaces')
      .values({ name: 'Space', slug: `space-${ws.id}`, workspaceId: ws.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    return { workspaceId: ws.id, userId: user.id, spaceId: space.id };
  }

  function fakeMarkdownFile(name: string) {
    return Promise.resolve({
      filename: name,
      toBuffer: async () => Buffer.from(`# ${name}\n\nSome body text.`),
    } as unknown as MultipartFile);
  }

  it('F1 — a workspace AT its page cap gets 402 QUOTA_EXCEEDED on import, no row inserted', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspaceWithSpace();
    stubPort.catalogByWorkspace.set(workspaceId, replayedCatalog());
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    for (let i = 0; i < REPLAYED_PAGE_CAP; i++) {
      await importService.importPage(
        fakeMarkdownFile(`pre-existing-${i}.md`),
        userId,
        spaceId,
        workspaceId,
      );
    }

    const beforeCount = await pageRepo.countByWorkspaceId(workspaceId);
    expect(beforeCount).toBe(REPLAYED_PAGE_CAP);

    let caught: unknown;
    try {
      await importService.importPage(
        fakeMarkdownFile('over-the-cap.md'),
        userId,
        spaceId,
        workspaceId,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(QuotaExceededException);
    expect((caught as QuotaExceededException).getStatus()).toBe(402);
    expect((caught as QuotaExceededException).getResponse()).toEqual({
      error: 'QUOTA_EXCEEDED',
      resource: 'pages',
      limit: REPLAYED_PAGE_CAP,
    });

    const afterCount = await pageRepo.countByWorkspaceId(workspaceId);
    expect(afterCount).toBe(beforeCount); // no row inserted by the bypass
  });

  it('F1 — a workspace UNDER its page cap can still import successfully', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspaceWithSpace();
    stubPort.catalogByWorkspace.set(workspaceId, replayedCatalog());
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    const beforeCount = await pageRepo.countByWorkspaceId(workspaceId);
    expect(beforeCount).toBe(0);

    const page = await importService.importPage(
      fakeMarkdownFile('under-cap.md'),
      userId,
      spaceId,
      workspaceId,
    );

    expect(page.id).toEqual(expect.any(String));
    const afterCount = await pageRepo.countByWorkspaceId(workspaceId);
    expect(afterCount).toBe(beforeCount + 1);
  });
});
