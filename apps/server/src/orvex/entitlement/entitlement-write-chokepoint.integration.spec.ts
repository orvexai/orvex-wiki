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

import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageService } from '../../core/page/services/page.service';
import { EntitlementService } from './entitlement.service';
import { InMemoryEntitlementCache } from './entitlement-cache';
import { BillingEntitlementPort } from './entitlement-billing.port';
import {
  EntitlementCaps,
  EntitlementCheckResponse,
  Principal,
} from './entitlement.types';
import { QuotaExceededException } from './quota.exception';
import type { DB } from '@docmost/db/types/db';

/**
 * ENG-1382 — `EntitlementWriteChokepointSpec` (the named DoD test).
 *
 * Integration (real Kysely on testcontainers Postgres). The billing port is
 * a stubbed `BillingEntitlementPort` returning a COMMITTED replay of a real
 * `GET /v1/entitlements/{principal_type}/{principal_id}` catalog response
 * shape (`orvex-studio-billing/internal/entitlement.CheckResponse` — see
 * `entitlement.types.ts` provenance header). Postgres is real (CS §5
 * local-substitutable); the billing HTTP seam is the true-external being
 * replaced by the committed fixture (CS §5 true-external).
 *
 * Asserts (AC1/AC2/AC5/AC6):
 *  - a workspace AT its page cap gets 402 QUOTA_EXCEEDED on PageService.create,
 *    before any row is inserted;
 *  - a workspace UNDER cap succeeds and the page row is actually persisted;
 *  - a gated feature is unlocked iff the entitlement catalog grants it;
 *  - the cap VALUE enforced is the one the stubbed port returned, never a
 *    literal in the enforcement path.
 */
describe('EntitlementWriteChokepointSpec (integration)', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;
  let pageRepo: PageRepo;
  let pageService: PageService;
  let entitlementService: EntitlementService;
  let cache: InMemoryEntitlementCache;
  let checkCalls: Principal[];

  const REPLAYED_PAGE_CAP = 2; // AC6 — this literal lives ONLY in the test
  // fixture standing in for billing's committed catalog response; it is
  // never read by the enforcement path itself (grep-gate: entitlement.ts /
  // page.service.ts / attachment.service.ts / workspace-invitation.service.ts
  // contain no numeric cap literal).

  function replayedCatalog(
    features: EntitlementCheckResponse['features'],
  ): EntitlementCheckResponse {
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
      features,
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
      checkCalls.push(principal);
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

    const rawDb = new Kysely<any>({
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

    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    const eventEmitter = new EventEmitter2();
    // SpaceMemberRepo is a PageRepo constructor dependency but is never
    // called by the create()/countByWorkspaceId() paths this spec exercises.
    pageRepo = new PageRepo(db as any, undefined as any, eventEmitter);

    stubPort = new StubBillingEntitlementPort();
    checkCalls = [];
    cache = new InMemoryEntitlementCache();
    entitlementService = new EntitlementService(stubPort, cache);

    const noopQueue = { add: async () => undefined } as any;
    pageService = new (PageService as any)(
      pageRepo,
      undefined, // pagePermissionRepo — unused by create()
      undefined, // attachmentRepo — unused by create()
      db,
      undefined, // storageService — unused by create() (no content)
      noopQueue, // attachmentQueue
      noopQueue, // aiQueue
      noopQueue, // generalQueue — .add() used for the watcher fire-and-forget
      eventEmitter,
      undefined, // collaborationGateway — unused by create()
      undefined, // watcherService — only used when a trx is passed
      undefined, // transclusionService — unused by create()
      undefined, // idempotencyStore — unused by create()
      entitlementService,
    );
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  beforeEach(() => {
    checkCalls = [];
    cache.evict({ principal_type: 'org', principal_id: '' } as Principal);
  });

  async function seedWorkspaceWithSpace() {
    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1382 Workspace' })
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

  it('AC1 — a workspace AT its page cap gets 402 QUOTA_EXCEEDED, no row inserted', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspaceWithSpace();
    stubPort.catalogByWorkspace.set(workspaceId, replayedCatalog(['ask_wiki']));
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    // Bring the workspace to exactly its cap (REPLAYED_PAGE_CAP pages).
    for (let i = 0; i < REPLAYED_PAGE_CAP; i++) {
      await pageService.create(userId, workspaceId, {
        spaceId,
        title: `pre-existing-${i}`,
      } as any);
    }

    const beforeCount = await pageRepo.countByWorkspaceId(workspaceId);
    expect(beforeCount).toBe(REPLAYED_PAGE_CAP);

    let caught: unknown;
    try {
      await pageService.create(userId, workspaceId, {
        spaceId,
        title: 'over-the-cap',
      } as any);
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
    expect(afterCount).toBe(beforeCount); // DB page count unchanged
  });

  it('AC2 — a workspace UNDER its page cap succeeds and the row is persisted', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspaceWithSpace();
    stubPort.catalogByWorkspace.set(workspaceId, replayedCatalog(['ask_wiki']));
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    const beforeCount = await pageRepo.countByWorkspaceId(workspaceId);
    expect(beforeCount).toBe(0);

    const page = await pageService.create(userId, workspaceId, {
      spaceId,
      title: 'under-cap-page',
    } as any);

    expect(page.id).toEqual(expect.any(String));
    const afterCount = await pageRepo.countByWorkspaceId(workspaceId);
    expect(afterCount).toBe(beforeCount + 1);
  });

  it('AC5 — a feature is unlocked iff the entitlement catalog grants it', async () => {
    const { workspaceId } = await seedWorkspaceWithSpace();
    stubPort.catalogByWorkspace.set(
      workspaceId,
      replayedCatalog(['ask_wiki']), // grants ask_wiki, NOT composer
    );
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    await expect(
      entitlementService.hasFeature(workspaceId, 'ask_wiki'),
    ).resolves.toBe(true);
    await expect(
      entitlementService.hasFeature(workspaceId, 'composer'),
    ).resolves.toBe(false);
  });

  it('AC6 — the cap value enforced is read from the port, not hard-coded', async () => {
    const { workspaceId, userId, spaceId } = await seedWorkspaceWithSpace();
    // A DIFFERENT cap than REPLAYED_PAGE_CAP, to prove the enforcement path
    // tracks whatever the port returns rather than a fixed literal.
    const customCap = 1;
    const catalog = replayedCatalog(['ask_wiki']);
    catalog.caps.wiki_max_pages = customCap;
    stubPort.catalogByWorkspace.set(workspaceId, catalog);
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    await pageService.create(userId, workspaceId, {
      spaceId,
      title: 'first-page',
    } as any);

    let caught: unknown;
    try {
      await pageService.create(userId, workspaceId, {
        spaceId,
        title: 'second-page-should-block',
      } as any);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(QuotaExceededException);
    expect((caught as QuotaExceededException).getResponse()).toMatchObject({
      limit: customCap,
    });
  });
});
