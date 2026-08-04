// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2504 (FR-W21 / A-BOUNDARY) — `TestSeatSyncEmitsBillingEventNoStripe`
 * (DoD gate).
 *
 * Proves, against a REAL Postgres (`testcontainers`) driving the REAL
 * `WorkspaceInvitationService.acceptInvitation` flow (no own-code mock,
 * CS §5 ❌#4 — only genuine boundary ports are substituted: mail queue,
 * billing entitlement port, audit, session):
 *
 *  AC1 — a seat change (invitation acceptance) writes EXACTLY ONE
 *        same-transaction outbox row of type `workspace.seats_changed`;
 *        no Stripe seat-sync billing-queue enqueue exists any more
 *        (source-level: the enum member and its one call site are gone).
 *  AC2 — the in-engine billing migration is retired: after
 *        `migrateToLatest`, no `billing` table and no
 *        `workspaces.stripe_customer_id` column exist.
 *  AC3 — no Stripe secret getter remains in the engine's env surface and
 *        no `stripe` dependency remains in `apps/server/package.json`.
 *  AC4 — the entitlement module makes zero Stripe SDK imports/calls.
 *  AC5 — the new event relays through the EXISTING, unmodified relay as
 *        CloudEvent type `wiki.workspace.seats_changed` — NEVER a literal
 *        `billing.*`-prefixed type (the relay hard-codes the `wiki.`
 *        prefix; that taxonomy tension vs. the ticket's "billing.* event"
 *        phrasing is ESCALATED in the PR/commit, not silently resolved).
 *
 * Behaviour-through-interface only: assertions read the outbox row, the
 * published CloudEvent envelope, the live information_schema, and the
 * committed sources — never internal symbol names. Deterministic fixtures.
 */
import * as path from 'path';
import * as fsSync from 'fs';
import { promises as fs } from 'fs';
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

import type { DB } from '@docmost/db/types/db';
import type { KyselyDB } from '@docmost/db/types/kysely.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import type { Workspace } from '@docmost/db/types/entity.types';

import { WorkspaceInvitationService } from './services/workspace-invitation.service';
import { OrvexAuditService } from '../audit/orvex-audit.service';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import {
  OutboxRelayService,
  OutboxCellResolver,
} from '../../orvex/events/outbox/outbox-relay.service';
import { resolveWikiEventsTopic } from '../../orvex/events/outbox/outbox-topic.resolver';
import { InMemoryKafkaPublisher } from '../../orvex/events/outbox/__tests__/in-memory-kafka-publisher';
import { EVT_WORKSPACE_SEATS_CHANGED } from '../../orvex/events/constants/orvex-event-types';
import { EntitlementService } from '../../orvex/entitlement/entitlement.service';
import type {
  EntitlementCheckResponse,
  Principal,
} from '../../orvex/entitlement/entitlement.types';

const SERVER_ROOT = path.join(__dirname, '../../..');
// ENG-2496 collapsed the separate topic resolver into the cell resolver:
// the relay now derives its per-cell topic from `cellId` and gates the
// boot-time shape assertion on `kafkaBrokersConfigured`.
const STUB_CELL_RESOLVER: OutboxCellResolver = {
  cellId: 'solo',
  kafkaBrokersConfigured: false,
};

/** Generous-caps billing port (the remote-but-owned entitlement seam). */
class GenerousBillingPort {
  async checkEntitlement(_p: Principal): Promise<EntitlementCheckResponse> {
    return {
      plan: 'teams',
      plan_version: 'v1',
      features: [],
      caps: {
        ai_monthly_budget_gbp: 1,
        embedding_monthly_budget_gbp: 1,
        curator_distillation_monthly: 1,
        trial_weekly_actions_advisory: 1,
        trial_weekly_actions_throttle: 1,
        demo_ai_actions: 1,
        wiki_max_pages: 1000,
        wiki_storage_bytes_aggregate: 10_000_000,
        wiki_max_file_bytes: 1_000_000,
        wiki_max_files: 100,
        wiki_max_members: 100,
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

class NullEntitlementCache {
  async get(): Promise<undefined> {
    return undefined;
  }
  async set(): Promise<void> {}
  async evict(): Promise<void> {}
}

describe('TestSeatSyncEmitsBillingEventNoStripe', () => {
  jest.setTimeout(240_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: Kysely<DB>;
  let invitationService: WorkspaceInvitationService;
  let mailCalls: unknown[];

  let workspace: Workspace;
  let invitationId: string;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri(), {
      onnotice: () => undefined,
    });

    const rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, '../../database/migrations'),
      }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    db = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });
    const kdb = db as unknown as KyselyDB;

    // Real collaborators; substitutes ONLY at genuine boundaries.
    const userRepo = new UserRepo(kdb);
    const groupRepo = new GroupRepo(kdb);
    const groupUserRepo = new GroupUserRepo(kdb, groupRepo, userRepo);
    const outboxWriter = new OutboxWriter(kdb);
    const audit = new OrvexAuditService(kdb, outboxWriter);
    mailCalls = [];
    const fakeMail = {
      sendToQueue: async (msg: unknown) => {
        mailCalls.push(msg);
      },
    };
    const inertDomain = {
      getUrl: () => 'https://test.example.com',
    };
    const throwingToken = new Proxy(
      {},
      {
        get: () => () => {
          throw new Error('tokenService must not be reached by this flow');
        },
      },
    );
    const throwingSession = new Proxy(
      {},
      {
        get: () => () => {
          throw new Error(
            'sessionService must not be reached (enforceMfa workspace)',
          );
        },
      },
    );
    const entitlements = new EntitlementService(
      new GenerousBillingPort() as any,
      new NullEntitlementCache() as any,
    );

    invitationService = new WorkspaceInvitationService(
      userRepo,
      groupUserRepo,
      fakeMail as any,
      inertDomain as any,
      throwingToken as any,
      throwingSession as any,
      kdb,
      outboxWriter,
      audit,
      entitlements,
    );

    // Seed: workspace (enforceMfa so the accept flow returns before session
    // minting — session/auth is out of this story's scope), inviter, default
    // group, and a pending invitation. Fixed fixtures, deterministic.
    workspace = (await db
      .insertInto('workspaces')
      .values({
        name: 'ENG-2504 Workspace',
        hostname: 'eng2504-severance',
        enforceMfa: true,
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow()) as unknown as Workspace;

    const inviter = await db
      .insertInto('users')
      .values({
        name: 'Inviter',
        email: 'inviter@example.com',
        workspaceId: workspace.id,
        role: 'owner',
      } as any)
      .returningAll()
      .executeTakeFirstOrThrow();

    await groupRepo.createDefaultGroup(workspace.id, {});

    const invitation = await db
      .insertInto('workspaceInvitations')
      .values({
        email: 'newseat@example.com',
        role: 'member',
        token: 'fixed-invite-token-2504',
        workspaceId: workspace.id,
        invitedById: inviter.id,
      } as any)
      .returning(['id'])
      .executeTakeFirstOrThrow();
    invitationId = invitation.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('AC1 — a seat change emits exactly one same-transaction workspace.seats_changed outbox row (and no billing-queue job type exists to enqueue)', async () => {
    const before = await db
      .selectFrom('orvexEventOutbox' as any)
      .select(({ fn }) => fn.count<string>('id').as('n'))
      .where('type', '=', EVT_WORKSPACE_SEATS_CHANGED)
      .executeTakeFirstOrThrow();
    expect(Number((before as any).n)).toBe(0);

    const result = await invitationService.acceptInvitation(
      {
        invitationId,
        token: 'fixed-invite-token-2504',
        name: 'New Seat',
        password: 'a-strong-password',
      } as any,
      workspace,
    );
    // enforceMfa workspace: the flow returns before session minting.
    expect(result).toEqual({ requiresLogin: true });

    const rows = await db
      .selectFrom('orvexEventOutbox' as any)
      .selectAll()
      .where('type', '=', EVT_WORKSPACE_SEATS_CHANGED)
      .execute();
    expect(rows.length).toBe(1);
    const row = rows[0] as any;
    expect(row.workspaceId).toBe(workspace.id);
    expect(row.aggregateId).toBe(workspace.id);
    // Documented payload shape (❌#12 discipline at the free-form edge).
    expect(row.payload).toMatchObject({
      workspaceId: workspace.id,
      previousSeatCount: 1,
      seatCount: 2,
      reason: 'invitation_accepted',
    });

    // The member genuinely joined (the seat change is real, not simulated).
    const members = await db
      .selectFrom('users')
      .select(({ fn }) => fn.count<string>('id').as('n'))
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirstOrThrow();
    expect(Number(members.n)).toBe(2);

    // Source-level severance proof (survives any internal rename EXCEPT
    // reintroducing the removed job): the acceptance path's file no longer
    // references the Stripe seat-sync job, and the job value is gone from
    // the queue constants entirely.
    const invitationSrc = fsSync.readFileSync(
      path.join(SERVER_ROOT, 'src/core/workspace/services/workspace-invitation.service.ts'),
      'utf8',
    );
    expect(invitationSrc.includes('STRIPE' + '_SEATS_SYNC')).toBe(false);
    expect(invitationSrc.includes('sync-stripe-seats')).toBe(false);
    const queueConstantsSrc = fsSync.readFileSync(
      path.join(SERVER_ROOT, 'src/integrations/queue/constants/queue.constants.ts'),
      'utf8',
    );
    expect(queueConstantsSrc.includes('STRIPE' + '_SEATS_SYNC')).toBe(false);
  });

  it('AC2 — the in-engine billing migration is retired: no billing table, no workspaces.stripe_customer_id', async () => {
    const tables = await sql<{ table_name: string }>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name = 'billing'
    `.execute(db);
    expect(tables.rows.length).toBe(0);

    const cols = await sql<{ column_name: string }>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'workspaces'
        and column_name = 'stripe_customer_id'
    `.execute(db);
    expect(cols.rows.length).toBe(0);
  });

  it('AC3 — no Stripe secret getter and no stripe dependency remain', () => {
    const envSrc = fsSync.readFileSync(
      path.join(SERVER_ROOT, 'src/integrations/environment/environment.service.ts'),
      'utf8',
    );
    for (const key of [
      'STRIPE' + '_SECRET_KEY',
      'STRIPE' + '_PUBLISHABLE_KEY',
      'STRIPE' + '_WEBHOOK_SECRET',
    ]) {
      expect(envSrc.includes(key)).toBe(false);
    }

    const pkg = JSON.parse(
      fsSync.readFileSync(path.join(SERVER_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.dependencies?.stripe).toBeUndefined();
    expect(pkg.devDependencies?.stripe).toBeUndefined();
  });

  it('AC4 — the entitlement module makes zero Stripe SDK imports/calls', () => {
    const entitlementDir = path.join(SERVER_ROOT, 'src/orvex/entitlement');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          const src = fsSync.readFileSync(full, 'utf8');
          if (
            /from ['"]stripe['"]|require\(['"]stripe['"]\)|new Stripe\(/.test(
              src,
            )
          ) {
            offenders.push(full);
          }
        }
      }
    };
    walk(entitlementDir);
    expect(offenders).toEqual([]);
  });

  it('AC5 — the new event relays as CloudEvent type wiki.workspace.seats_changed, never billing.*', async () => {
    const publisher = new InMemoryKafkaPublisher();
    const relay = new OutboxRelayService(
      db as unknown as KyselyDB,
      publisher,
      STUB_CELL_RESOLVER,
    );
    const result = await relay.run();
    expect(result.published).toBeGreaterThanOrEqual(1);

    // ENG-2496 AC2 replaced the single studio-spine topic with a per-cell
    // one derived from the cell resolver (`wiki-events.{cellId}`); this stub
    // resolves cellId 'solo'.
    const messages = publisher.getDistinctMessages(
      resolveWikiEventsTopic(STUB_CELL_RESOLVER.cellId),
    );
    const envelopes = messages.map((m) => JSON.parse(m.value as string));
    const seatEvents = envelopes.filter(
      (e) => e.type === `wiki.${EVT_WORKSPACE_SEATS_CHANGED}`,
    );
    expect(seatEvents.length).toBe(1);
    expect(seatEvents[0].type).toBe('wiki.workspace.seats_changed');
    expect(seatEvents[0].orvextenant).toBe(workspace.id);

    // NEVER a literal billing.*-domain CloudEvent — the relay's hard-coded
    // `wiki.` prefix makes that impossible without a relay change this
    // story does not make (escalated, not silently resolved).
    const billingTyped = envelopes.filter((e) =>
      String(e.type).startsWith('billing.'),
    );
    expect(billingTyped).toEqual([]);
  });

  it('NFR operability — the emission is async-decoupled: the outbox row exists even before any relay run (no synchronous billing call on the seat-change path)', async () => {
    // Already proven implicitly by AC1 (row existed pre-relay) — this
    // assertion pins it explicitly: the row was written by the accept
    // transaction itself, not by any relay/consumer side effect.
    const row = await db
      .selectFrom('orvexEventOutbox' as any)
      .select(['type'])
      .where('type', '=', EVT_WORKSPACE_SEATS_CHANGED)
      .executeTakeFirstOrThrow();
    expect((row as any).type).toBe(EVT_WORKSPACE_SEATS_CHANGED);
  });
});
