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
import { v4 as uuid4 } from 'uuid';

import { UserRepo } from '../../database/repos/user/user.repo';
import { GroupRepo } from '../../database/repos/group/group.repo';
import { GroupUserRepo } from '../../database/repos/group/group-user.repo';
import { WorkspaceInvitationService } from '../../core/workspace/services/workspace-invitation.service';
import { AcceptInviteDto } from '../../core/workspace/dto/invitation.dto';
import { MailService } from '../../integrations/mail/mail.service';
import { DomainService } from '../../integrations/environment/domain.service';
import { TokenService } from '../../core/auth/services/token.service';
import { SessionService } from '../../core/session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { IAuditService } from '../../integrations/audit/audit.service';
import { Queue } from 'bullmq';
import { QueueJob } from '../../integrations/queue/constants';
import { Workspace } from '../../database/types/entity.types';
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
 * ENG-1382 fix pass 1 — F2: `WorkspaceInvitationService.acceptInvitation`
 * (AC3, member cap) wires `assertWithinQuota` but had ZERO test coverage.
 * This is the named literal-assertion test the DoD checklist requires for
 * AC3, plus (F1) the §5b concurrent-write race test for the member cap.
 *
 * Integration (real Kysely on testcontainers Postgres, same pattern as
 * `entitlement-write-chokepoint.integration.spec.ts`). The billing port is
 * a stubbed replay, same fixture shape.
 */
describe('EntitlementMemberChokepointSpec (integration)', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;
  let userRepo: UserRepo;
  let groupRepo: GroupRepo;
  let groupUserRepo: GroupUserRepo;
  let invitationService: WorkspaceInvitationService;
  let entitlementService: EntitlementService;
  let cache: InMemoryEntitlementCache;

  const REPLAYED_MEMBER_CAP = 2; // AC6 — lives ONLY in this test fixture.

  function replayedCatalog(): EntitlementCheckResponse {
    const caps: EntitlementCaps = {
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 20,
      wiki_max_pages: 1_000,
      wiki_storage_bytes_aggregate: 1_000_000_000,
      wiki_max_file_bytes: 10_000_000,
      wiki_max_files: 2_000,
      wiki_max_members: REPLAYED_MEMBER_CAP,
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
  const noopMail = {
    sendToQueue: async () => undefined,
  } as unknown as MailService;
  const noopAudit = { log: () => undefined } as unknown as IAuditService;
  const noopQueue = { add: async () => undefined } as unknown as Queue<QueueJob>;
  const noCloudEnv = { isCloud: () => false } as unknown as EnvironmentService;
  const stubSession = {
    createSessionAndToken: async () => 'stub-auth-token',
  } as unknown as SessionService;

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
    userRepo = new UserRepo(kyselyDb);
    groupRepo = new GroupRepo(kyselyDb);
    groupUserRepo = new GroupUserRepo(kyselyDb, groupRepo, userRepo);

    stubPort = new StubBillingEntitlementPort();
    cache = new InMemoryEntitlementCache();
    entitlementService = new EntitlementService(stubPort, cache);

    invitationService = new WorkspaceInvitationService(
      userRepo,
      groupUserRepo,
      noopMail, // mailService — only reached past acceptance, unused on 402/race paths' rejected branch
      undefined as unknown as DomainService, // unused by acceptInvitation
      undefined as unknown as TokenService, // unused by acceptInvitation
      stubSession, // sessionService — reached on a successful (non-402) acceptance
      kyselyDb,
      noopQueue, // billingQueue
      noCloudEnv, // environmentService
      noopAudit, // auditService
      entitlementService,
    );
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  async function seedWorkspaceWithDefaultGroup() {
    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1382 Member Workspace' })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    await db
      .insertInto('groups')
      .values({
        name: 'everyone',
        workspaceId: ws.id,
        isDefault: true,
      })
      .execute();

    return ws.id;
  }

  async function seedInvitation(workspaceId: string, email: string) {
    const token = uuid4();
    const invitation = await db
      .insertInto('workspaceInvitations')
      .values({
        email,
        role: 'member',
        token,
        workspaceId,
        invitedById: null,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    return { invitationId: invitation.id, token };
  }

  it('AC3 — a workspace AT its member cap gets 402 QUOTA_EXCEEDED, membership unchanged', async () => {
    const workspaceId = await seedWorkspaceWithDefaultGroup();
    stubPort.catalogByWorkspace.set(workspaceId, replayedCatalog());
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    // Bring the workspace to exactly its member cap.
    for (let i = 0; i < REPLAYED_MEMBER_CAP; i++) {
      await db
        .insertInto('users')
        .values({
          email: `preexisting-${i}-${workspaceId}@example.com`,
          workspaceId,
        })
        .execute();
    }

    const beforeCount = await userRepo.countByWorkspaceId(workspaceId);
    expect(beforeCount).toBe(REPLAYED_MEMBER_CAP);

    const { invitationId, token } = await seedInvitation(
      workspaceId,
      `over-the-cap-${workspaceId}@example.com`,
    );

    const workspace = {
      id: workspaceId,
      enforceSso: false,
      emailDomains: [],
      enforceMfa: false,
      settings: {},
    } as unknown as Workspace;

    let caught: unknown;
    try {
      const dto: AcceptInviteDto = {
        invitationId,
        token,
        name: 'Over Cap',
        password: 'password123',
      };
      await invitationService.acceptInvitation(dto, workspace);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(QuotaExceededException);
    expect((caught as QuotaExceededException).getStatus()).toBe(402);
    expect((caught as QuotaExceededException).getResponse()).toEqual({
      error: 'QUOTA_EXCEEDED',
      resource: 'members',
      limit: REPLAYED_MEMBER_CAP,
    });

    const afterCount = await userRepo.countByWorkspaceId(workspaceId);
    expect(afterCount).toBe(beforeCount); // membership unchanged

    // The invitation itself must survive a rejected acceptance (only a
    // committed acceptance deletes it) — the transaction rolled back.
    const stillPending = await db
      .selectFrom('workspaceInvitations')
      .select('id')
      .where('id', '=', invitationId)
      .executeTakeFirst();
    expect(stillPending).toBeDefined();
  });

  it('F1 (§5b) — two concurrent acceptInvitation() calls at cap-1 never exceed the member cap', async () => {
    const workspaceId = await seedWorkspaceWithDefaultGroup();
    stubPort.catalogByWorkspace.set(workspaceId, replayedCatalog());
    cache.evict({ principal_type: 'org', principal_id: workspaceId });

    // Bring the workspace to cap - 1 (one seat free).
    for (let i = 0; i < REPLAYED_MEMBER_CAP - 1; i++) {
      await db
        .insertInto('users')
        .values({
          email: `race-preexisting-${i}-${workspaceId}@example.com`,
          workspaceId,
        })
        .execute();
    }

    // Fan out to 8 concurrent acceptances (rather than 2) so the race
    // reliably manifests despite real network/scheduler jitter on a local
    // testcontainers Postgres.
    const CONCURRENCY = 8;
    const invites = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        seedInvitation(workspaceId, `race-${i}-${workspaceId}@example.com`),
      ),
    );

    const workspace = {
      id: workspaceId,
      enforceSso: false,
      emailDomains: [],
      enforceMfa: false,
      settings: {},
    } as unknown as Workspace;

    const results = await Promise.allSettled(
      invites.map((invite, i) => {
        const dto: AcceptInviteDto = {
          invitationId: invite.invitationId,
          token: invite.token,
          name: `Racer ${i}`,
          password: 'password123',
        };
        return invitationService.acceptInvitation(dto, workspace);
      }),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    // Exactly ONE of the concurrent acceptances may consume the last seat —
    // the exact T6 attack this fix closes.
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(CONCURRENCY - 1);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(QuotaExceededException);
    }

    const finalCount = await userRepo.countByWorkspaceId(workspaceId);
    expect(finalCount).toBe(REPLAYED_MEMBER_CAP); // never cap + 1
  });
});
