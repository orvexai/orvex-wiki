// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2503 (A-TENANCY / D-S17) — `TestPersonalToTeamsUpgradePassReKeysInPlace`
 * (DoD gate).
 *
 * Proves, against a REAL Postgres (`testcontainers`) with an INJECTED fake
 * identity-registry client (the remote-but-owned seam, CS §5 — mirrors
 * `IdentityRegistryClient`'s port pattern; no own-code mock, ❌#4):
 *
 *  AC1 — a personal tenant provisions USER-KEYED (`principalKind: 'user'`),
 *        full workspace + entitlements, with NO org-mint call anywhere.
 *  AC2 — a Team tenant provisions ORG-KEYED on the identity-vouched
 *        Clerk-org id (this engine never mints one; a missing vouch is a
 *        typed 400).
 *  AC3 — the personal→Teams upgrade-pass re-keys IN PLACE: `workspace_id`
 *        byte-for-byte unchanged, `principalKind` flips 'user' → 'org',
 *        data (a seeded page) + entitlements stay queryable under the SAME
 *        `workspace_id` (no copy, no re-provision), and the entitlement/seat
 *        principal key is identical before and after.
 *  AC4 — mint-time uniqueness delegates to the GLOBAL registry (the fake
 *        records the reservation); the engine's own
 *        `workspaces_hostname_unique` constraint still fires independently
 *        as the per-cell BACKSTOP (never the cross-cell source of truth).
 *  AC5 — a cross-cell mint collision (`TENANT_ALREADY_RESERVED`) surfaces
 *        as a typed 409 Conflict carrying the code — never a silent local
 *        accept, never a bare 500 — and nothing is materialized locally.
 *  NFR — a fault-injected registry failure mid-upgrade leaves the tenant's
 *        `principalKind` unchanged ('user'); no half-upgraded tenant.
 *
 * Behaviour-through-interface only: assertions read the workspace/page rows'
 * OBSERVABLE state through the exported service entry points and the fake
 * port's own recorded calls — never private helper names. Deterministic:
 * fixed seeded tenant/subject fixtures, no Date.now()-keyed assertion.
 */
import * as path from 'path';
import { promises as fs } from 'fs';
import { BadRequestException, ConflictException } from '@nestjs/common';
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

import type { DB } from '@docmost/db/types/db';
import type { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { WatcherRepo } from '@docmost/db/repos/watcher/watcher.repo';
import { FavoriteRepo } from '@docmost/db/repos/favorite/favorite.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { SpaceService } from '../space/services/space.service';
import { SpaceMemberService } from '../space/services/space-member.service';
import { OrvexAuditService } from '../audit/orvex-audit.service';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import {
  PrincipalProvisioningService,
} from '../internal-api/principal-provisioning.service';
import { WorkspaceUpgradeService } from './services/workspace-upgrade.service';
import { OrvexConfigService } from '../../orvex/config/orvex-config.service';
import {
  IdentityRegistryClient,
  RegistryClientError,
  RegistryMoveRequest,
  RegistryMoveResult,
  RegistryReserveRequest,
  RegistryReserveResult,
  RegistryTenantCell,
} from '../../orvex/http/identity-registry-client';
import { EntitlementService } from '../../orvex/entitlement/entitlement.service';
import type {
  EntitlementCheckResponse,
  Principal,
} from '../../orvex/entitlement/entitlement.types';

/** Fixed, deterministic tenant fixtures (no rand/time keying). */
const PERSONAL_TENANT = '00000000-0000-4000-8000-0000000000a1';
const TEAM_TENANT = '00000000-0000-4000-8000-0000000000b2';
const COLLIDING_TENANT = '00000000-0000-4000-8000-0000000000c3';
const MINTED_ORG_ID = 'org_2minted_upgrade_42';
const VOUCHED_TEAM_ORG_ID = 'org_2vouched_team_77';

/**
 * The injected fake at the engine ↔ identity-registry seam (remote-but-owned,
 * CS §5). Records every reservation; failure modes are scripted per tenant.
 */
class FakeRegistryClient implements IdentityRegistryClient {
  readonly reserveCalls: RegistryReserveRequest[] = [];
  /** tenantId -> scripted error to throw on reserve. */
  readonly failReserveWith = new Map<string, Error>();
  /** orgId handed back for 'org'-kind reservations. */
  orgIdToMint = MINTED_ORG_ID;

  moveTenantCell(_req: RegistryMoveRequest): Promise<RegistryMoveResult> {
    throw new Error('not exercised by this spec');
  }

  resolveTenantCell(_tenantId: string): Promise<RegistryTenantCell> {
    throw new Error('not exercised by this spec');
  }

  async reserveTenant(
    req: RegistryReserveRequest,
  ): Promise<RegistryReserveResult> {
    const scripted = this.failReserveWith.get(req.tenantId);
    if (scripted) {
      throw scripted;
    }
    this.reserveCalls.push(req);
    return {
      tenantId: req.tenantId,
      reserved: true,
      orgId: req.principalKind === 'org' ? this.orgIdToMint : undefined,
    };
  }
}

/** Records the entitlement principal key billing is asked about (AC3 seat/entitlement carry-over). */
class RecordingBillingPort {
  readonly principals: Principal[] = [];

  async checkEntitlement(principal: Principal): Promise<EntitlementCheckResponse> {
    this.principals.push(principal);
    return {
      plan: 'teams',
      plan_version: 'v1',
      features: ['composer'],
      caps: {
        ai_monthly_budget_gbp: 1,
        embedding_monthly_budget_gbp: 1,
        curator_distillation_monthly: 1,
        trial_weekly_actions_advisory: 1,
        trial_weekly_actions_throttle: 1,
        demo_ai_actions: 1,
        wiki_max_pages: 100,
        wiki_storage_bytes_aggregate: 1000,
        wiki_max_file_bytes: 100,
        wiki_max_files: 10,
        wiki_max_members: 10,
        wiki_history_retention_versions: 5,
        wiki_history_retention_days: 30,
      },
      trial: { state: 'none' },
      throttle: { state: 'none' },
      version: 'v1',
      evaluatedAt: '2026-01-01T00:00:00Z',
    };
  }
}

/** In-memory EntitlementCache (the cache port, not own domain code). */
class InMemoryEntitlementCache {
  private readonly store = new Map<string, EntitlementCheckResponse>();
  private key(p: Principal): string {
    return `${p.principal_type}:${p.principal_id}`;
  }
  async get(p: Principal): Promise<EntitlementCheckResponse | undefined> {
    return this.store.get(this.key(p));
  }
  async set(p: Principal, v: EntitlementCheckResponse): Promise<void> {
    this.store.set(this.key(p), v);
  }
  async evict(p: Principal): Promise<void> {
    this.store.delete(this.key(p));
  }
}

describe('TestPersonalToTeamsUpgradePassReKeysInPlace', () => {
  jest.setTimeout(240_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;

  let registry: FakeRegistryClient;
  let provisioning: PrincipalProvisioningService;
  let upgrade: WorkspaceUpgradeService;
  let workspaceRepo: WorkspaceRepo;
  let billingPort: RecordingBillingPort;
  let entitlements: EntitlementService;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri(), {
      onnotice: () => undefined,
    });

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

    // Real repos/services composed by hand against the real Postgres —
    // the SAME production classes, never a mock of own code (❌#4). Only
    // genuine boundary ports are substituted: the identity registry (fake
    // above), billing (recording port), audit (the repo's own
    // the real OrvexAuditService), the BullMQ attachment queue and cache-manager
    // (unused by the provisioning path; inert stand-ins at their
    // remote-but-owned rows).
    const kdb = db as unknown as KyselyDB;
    const eventEmitter = new EventEmitter2();
    const userRepo = new UserRepo(kdb);
    workspaceRepo = new WorkspaceRepo(kdb);
    const groupRepo = new GroupRepo(kdb);
    const userRepoForGroup = userRepo;
    const groupUserRepo = new GroupUserRepo(kdb, groupRepo, userRepoForGroup);
    const spaceRepo = new SpaceRepo(kdb, eventEmitter);
    const inertCache = {
      get: async () => undefined,
      set: async () => undefined,
      del: async () => undefined,
    };
    const spaceMemberRepo = new SpaceMemberRepo(
      kdb,
      groupRepo,
      spaceRepo,
      inertCache as any,
    );
    const watcherRepo = new WatcherRepo(kdb);
    const favoriteRepo = new FavoriteRepo(kdb);
    const shareRepo = new ShareRepo(kdb, spaceMemberRepo);
    const outboxWriter = new OutboxWriter(kdb);
    const audit = new OrvexAuditService(kdb, outboxWriter);
    const spaceMemberService = new SpaceMemberService(
      spaceMemberRepo,
      groupUserRepo,
      spaceRepo,
      watcherRepo,
      favoriteRepo,
      kdb,
      audit,
      outboxWriter,
    );
    const inertLicense = { hasFeature: () => true, isValidEELicense: () => true };
    const inertQueue = { add: async () => undefined };
    const spaceService = new SpaceService(
      spaceRepo,
      spaceMemberService,
      shareRepo,
      workspaceRepo,
      inertLicense as any,
      kdb,
      inertQueue as any,
      audit,
      outboxWriter,
    );

    billingPort = new RecordingBillingPort();
    entitlements = new EntitlementService(
      billingPort as any,
      new InMemoryEntitlementCache() as any,
    );

    registry = new FakeRegistryClient();
    provisioning = new PrincipalProvisioningService(
      kdb,
      userRepo,
      workspaceRepo,
      groupRepo,
      groupUserRepo,
      spaceService,
      spaceMemberService,
      outboxWriter,
      audit,
      // ENG-2491 AC4 — the REAL member-cap chokepoint (a recording billing
      // port behind it), never a stub: the seat check this spec asserts on
      // (AC3 "seats start counting") must be the one production runs.
      entitlements,
      registry,
      // A-CELL — the real env reader on an explicit empty bag: this spec runs
      // no cell, so `cellId` reads null and workspaces are stamped `solo`.
      new OrvexConfigService({} as NodeJS.ProcessEnv),
    );
    upgrade = new WorkspaceUpgradeService(kdb, workspaceRepo, registry);
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('AC1 — a personal tenant provisions USER-KEYED with no org mint anywhere', async () => {
    const result = await provisioning.provision({
      subject: 'sub_personal_ada',
      tenant: PERSONAL_TENANT,
      email: 'ada@example.com',
      name: 'Ada',
      provisionWorkspace: true,
      // principalKind deliberately omitted — 'user' is the default shape.
    });
    expect(result.workspaceCreated).toBe(true);

    const ws = await db
      .selectFrom('workspaces')
      .select(['id', 'principalKind', 'principalId', 'defaultSpaceId'])
      .where('id', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    expect(ws.principalKind).toBe('user');
    // The personal principal is the provisioning subject, never an org id.
    expect(ws.principalId).toBe('sub_personal_ada');
    // Full workspace parity — a default space exists (entitled, born usable).
    expect(ws.defaultSpaceId).toBeTruthy();

    // NO org-mint call happened for the personal flow: every reservation
    // recorded for this tenant is 'user'-kind (this engine holds no Clerk
    // client at all; the registry seam is the only place an org COULD be
    // requested, and it was not).
    const personalReserves = registry.reserveCalls.filter(
      (c) => c.tenantId === PERSONAL_TENANT,
    );
    expect(personalReserves.length).toBe(1);
    expect(personalReserves[0].principalKind).toBe('user');
  });

  it('AC2 — a Team tenant provisions ORG-KEYED on the identity-vouched org id', async () => {
    await provisioning.provision({
      subject: 'sub_team_founder',
      tenant: TEAM_TENANT,
      email: 'founder@example.com',
      name: 'Founder',
      provisionWorkspace: true,
      principalKind: 'org',
      orgId: VOUCHED_TEAM_ORG_ID,
    });

    const ws = await db
      .selectFrom('workspaces')
      .select(['principalKind', 'principalId'])
      .where('id', '=', TEAM_TENANT)
      .executeTakeFirstOrThrow();
    expect(ws.principalKind).toBe('org');
    // The stored principal IS the org id identity vouched — billing/identity
    // key on the same polymorphic principal value.
    expect(ws.principalId).toBe(VOUCHED_TEAM_ORG_ID);
  });

  it('AC2 error-path — an org-keyed tenant without an identity vouch is a typed 400, never a fabricated org', async () => {
    await expect(
      provisioning.provision({
        subject: 'sub_bad_org',
        tenant: '00000000-0000-4000-8000-0000000000d4',
        email: 'bad@example.com',
        provisionWorkspace: true,
        principalKind: 'org',
        // orgId missing — the engine never mints one itself.
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('AC3 (core) — the upgrade-pass re-keys IN PLACE: workspace_id unchanged, data + entitlements carry, seat key identical', async () => {
    // Seed a page under the personal workspace's default space — the data
    // that must survive the re-key with an IDENTICAL workspace_id FK.
    const ws = await db
      .selectFrom('workspaces')
      .select(['id', 'defaultSpaceId'])
      .where('id', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    const owner = await db
      .selectFrom('users')
      .select(['id'])
      .where('workspaceId', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    const page = await db
      .insertInto('pages')
      .values({
        title: 'Survives the upgrade',
        slugId: 'upg-page-1',
        creatorId: owner.id,
        lastUpdatedById: owner.id,
        spaceId: ws.defaultSpaceId!,
        workspaceId: PERSONAL_TENANT,
      } as any)
      .returning(['id', 'workspaceId'])
      .executeTakeFirstOrThrow();

    // `billingPort` is a SUITE-scoped recorder: AC1 (PERSONAL_TENANT) and AC2
    // (TEAM_TENANT) already resolved their own tenants through it before this
    // test runs. Everything AC3 asserts about the seat key is about the reads
    // it makes ITSELF, so mark the recorder's high-water line here and assert
    // only on the slice from here on. (The pre-fix assertion compared the
    // WHOLE suite-wide recording against a single key — a claim AC3 never
    // makes, and one that could only hold while AC3 happened to run first.)
    const recordedBeforeThisTest = billingPort.principals.length;

    // Entitlement read BEFORE the upgrade (records the principal key). Uses a
    // dedicated cache so the read genuinely reaches the billing port inside
    // this test's window — the suite-shared `entitlements` instance already
    // holds a warm entry for this tenant from AC1, so it would record nothing
    // and the before/after pair this AC is built on would be half-empty.
    const preUpgradeReader = new EntitlementService(
      billingPort as any,
      new InMemoryEntitlementCache() as any,
    );
    await expect(
      preUpgradeReader.hasFeature(PERSONAL_TENANT, 'composer'),
    ).resolves.toBe(true);

    // The upgrade-pass — the exported entry point under test.
    const result = await upgrade.upgradeToTeam({ workspaceId: PERSONAL_TENANT });
    expect(result.upgraded).toBe(true);
    expect(result.orgId).toBe(MINTED_ORG_ID);
    // (b) workspace_id byte-for-byte unchanged.
    expect(result.workspaceId).toBe(PERSONAL_TENANT);

    // Re-key happened IN PLACE on the SAME row.
    const after = await db
      .selectFrom('workspaces')
      .select(['id', 'principalKind', 'principalId'])
      .where('id', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    expect(after.principalKind).toBe('org');
    expect(after.principalId).toBe(MINTED_ORG_ID);

    // Exactly ONE workspaces row for this tenant — no copy, no re-provision.
    const rows = await db
      .selectFrom('workspaces')
      .select(({ fn }) => fn.count<string>('id').as('n'))
      .where('id', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    expect(Number(rows.n)).toBe(1);

    // (c) the seeded page's workspace_id FK is IDENTICAL — data carried.
    const pageAfter = await db
      .selectFrom('pages')
      .select(['id', 'workspaceId'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(pageAfter.workspaceId).toBe(page.workspaceId);
    expect(pageAfter.workspaceId).toBe(PERSONAL_TENANT);

    // (d) entitlement read AFTER the upgrade succeeds unchanged, and the
    // entitlement/seat principal key billing sees is byte-for-byte the same
    // workspace id before and after (seats keep counting on it).
    const cacheBuster = new EntitlementService(
      billingPort as any,
      new InMemoryEntitlementCache() as any,
    );
    await expect(
      cacheBuster.hasFeature(PERSONAL_TENANT, 'composer'),
    ).resolves.toBe(true);
    const keys = billingPort.principals
      .slice(recordedBeforeThisTest)
      .map((p) => p.principal_id);
    // Billing was asked twice inside this test — once before the upgrade,
    // once after it …
    expect(keys.length).toBeGreaterThanOrEqual(2);
    // … and both times about the SAME key …
    expect(new Set(keys).size).toBe(1);
    // … which is the unchanged workspace id, never the minted org id.
    expect(keys[0]).toBe(PERSONAL_TENANT);
    expect(keys).not.toContain(MINTED_ORG_ID);

    // Idempotency: a second upgrade is a no-op, never a re-mint.
    const again = await upgrade.upgradeToTeam({ workspaceId: PERSONAL_TENANT });
    expect(again.upgraded).toBe(false);
    expect(again.orgId).toBe(MINTED_ORG_ID);
  });

  it('AC4 — minting delegated to the GLOBAL registry; the local hostname unique constraint still fires as the per-cell backstop', async () => {
    // The global side: every materialized tenant in this suite went through
    // the registry reservation (recorded by the fake) BEFORE its local row
    // appeared — AC5 below proves the ordering by observable behaviour
    // (a registry rejection leaves NO local row).
    const reservedTenants = registry.reserveCalls.map((c) => c.tenantId);
    expect(reservedTenants).toContain(PERSONAL_TENANT);
    expect(reservedTenants).toContain(TEAM_TENANT);

    // The local side: `workspaces_hostname_unique` is alive and fires
    // independently — the BACKSTOP role (it is NOT what the cross-cell
    // guarantee is asserted against).
    await db
      .insertInto('workspaces')
      .values({ name: 'backstop-a', hostname: 'acme-backstop' } as any)
      .execute();
    await expect(
      db
        .insertInto('workspaces')
        .values({ name: 'backstop-b', hostname: 'acme-backstop' } as any)
        .execute(),
    ).rejects.toThrow(/duplicate key|workspaces_hostname_unique/i);
  });

  it('AC5 — a cross-cell mint collision is a typed 409 conflict, never a silent local accept', async () => {
    registry.failReserveWith.set(
      COLLIDING_TENANT,
      new RegistryClientError(
        'TENANT_ALREADY_RESERVED',
        'registry: tenant/hostname already reserved by another cell',
      ),
    );

    let caught: unknown;
    try {
      await provisioning.provision({
        subject: 'sub_collide',
        tenant: COLLIDING_TENANT,
        email: 'collide@example.com',
        provisionWorkspace: true,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    const body = (caught as ConflictException).getResponse() as {
      code?: string;
    };
    expect(body.code).toBe('TENANT_ALREADY_RESERVED');

    // NOTHING was accepted locally after the global refusal — the registry
    // ran BEFORE the local insert (reserve-before-insert, observable).
    const local = await db
      .selectFrom('workspaces')
      .select(['id'])
      .where('id', '=', COLLIDING_TENANT)
      .executeTakeFirst();
    expect(local).toBeUndefined();
  });

  it('NFR honesty — a registry failure mid-upgrade leaves principalKind unchanged (no half-upgraded tenant)', async () => {
    // A fresh personal tenant that will fail its upgrade.
    const tenant = '00000000-0000-4000-8000-0000000000e5';
    await provisioning.provision({
      subject: 'sub_unlucky',
      tenant,
      email: 'unlucky@example.com',
      provisionWorkspace: true,
    });
    registry.failReserveWith.set(
      tenant,
      new RegistryClientError('DEPENDENCY_ERROR', 'identity is down'),
    );

    await expect(upgrade.upgradeToTeam({ workspaceId: tenant })).rejects.toThrow(
      RegistryClientError,
    );

    const ws = await db
      .selectFrom('workspaces')
      .select(['principalKind', 'principalId'])
      .where('id', '=', tenant)
      .executeTakeFirstOrThrow();
    // Still exactly as it was — the failure aborted BEFORE any local write.
    expect(ws.principalKind).toBe('user');
    expect(ws.principalId).toBe('sub_unlucky');
  });
});
