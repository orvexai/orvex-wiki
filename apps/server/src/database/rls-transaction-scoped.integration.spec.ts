// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2502 (FR-W8) — `TestRlsTransactionScopedNoLeakUnderPooling` (DoD gate).
 *
 * Proves, against a REAL Postgres (`@testcontainers`) fronted by a REAL
 * pgBouncer in `transaction` pool mode (`edoburu/pgbouncer:v1.24.1-p1`,
 * pinned — mirrors `postgres-claim.yaml`'s
 * `pgBouncer: {enabled: true, mode: transaction}`):
 *
 *  AC1 — `set_config('app.workspace_id', $1, true)` is transaction-local:
 *        visible inside the transaction, gone on the SAME physical
 *        connection after commit.
 *  AC2 — no GUC leak across two tenants sharing a pooled backend
 *        connection; an un-scoped follow-up transaction reads 0 rows
 *        (fail-closed), never tenant A's rows.
 *  AC3 — RLS policies exist (deny-by-default, ENABLE + FORCE) on every
 *        targeted table (`pages`, `spaces`, `comments`, `attachments`).
 *  AC4 — a cross-tenant read bypassing the app ACL returns 0 rows;
 *        an intra-tenant read is unaffected (RLS is workspace-scoped,
 *        not page-scoped — finer-grained control stays app-layer).
 *  AC5 — a transaction that never sets the GUC is denied by default
 *        (0 rows / rejected write), never defaults-open.
 *
 * All assertions are behaviour-through-interface (query row counts through
 * a NON-superuser, non-BYPASSRLS role — the enforcement-visible role), never
 * the policy SQL text nor `set_config`'s call trace. No own-code mock
 * (CS §5 ❌#4); fixed seeded tenant fixtures, no wall-clock keying.
 */
import * as path from 'path';
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
  GenericContainer,
  Network,
  StartedNetwork,
  StartedTestContainer,
} from 'testcontainers';

import type { DbInterface } from '@docmost/db/types/db.interface';
import {
  InvalidTenantScopeError,
  withTenantScopedTransaction,
} from './rls/rls-guc-hook';

const PGBOUNCER_IMAGE = 'edoburu/pgbouncer:v1.24.1-p1';
const APP_ROLE = 'app_rls';
const APP_ROLE_PASSWORD = 'app-rls-test-pw';
const RLS_TABLES = ['pages', 'spaces', 'comments', 'attachments'];

describe('TestRlsTransactionScopedNoLeakUnderPooling', () => {
  jest.setTimeout(240_000);

  let network: StartedNetwork;
  let pgContainer: StartedTestContainer;
  let pgbContainer: StartedTestContainer;

  let adminSql: ReturnType<typeof postgres>;
  let adminDb: Kysely<DbInterface>;

  /** Direct (no pooler) single-connection client as the NON-superuser role. */
  let appSql: ReturnType<typeof postgres>;
  let appDb: Kysely<DbInterface>;

  /** pgBouncer-fronted single-connection client (transaction pool mode). */
  let pooledSql: ReturnType<typeof postgres>;

  let wsA: { id: string };
  let wsB: { id: string };
  let pageA: { id: string };
  let pageB: { id: string };
  let spaceA: { id: string };
  let userA: { id: string };

  async function seedTenant(name: string) {
    const ws = await adminDb
      .insertInto('workspaces')
      .values({ name })
      .returning('id')
      .executeTakeFirstOrThrow();
    const user = await adminDb
      .insertInto('users')
      .values({
        name: `${name} user`,
        email: `${name}@rls.example.com`,
        workspaceId: ws.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const space = await adminDb
      .insertInto('spaces')
      .values({
        name: `${name} space`,
        slug: `${name}-space`,
        workspaceId: ws.id,
        creatorId: user.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const page = await adminDb
      .insertInto('pages')
      .values({
        slugId: `${name}-page`,
        title: `${name} page`,
        spaceId: space.id,
        workspaceId: ws.id,
        creatorId: user.id,
        position: 'a0',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { ws, user, space, page };
  }

  beforeAll(async () => {
    network = await new Network().start();

    pgContainer = await new GenericContainer('postgres:16-alpine')
      .withNetwork(network)
      .withNetworkAliases('pg')
      .withEnvironment({
        POSTGRES_USER: 'orvex',
        POSTGRES_PASSWORD: 'orvex',
        POSTGRES_DB: 'orvex_test',
      })
      .withExposedPorts(5432)
      .start();

    const adminUri = `postgres://orvex:orvex@${pgContainer.getHost()}:${pgContainer.getMappedPort(
      5432,
    )}/orvex_test`;
    adminSql = postgres(adminUri, { onnotice: () => {} });
    adminDb = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: adminSql }),
      plugins: [new CamelCasePlugin()],
    });

    const migrator = new Migrator({
      db: adminDb,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, 'migrations'),
      }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;

    // The enforcement-visible role: NOT a superuser, NOT BYPASSRLS, and NOT
    // the table owner — RLS (with FORCE) binds it fully.
    await adminSql.unsafe(`
      CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_ROLE_PASSWORD}'
        NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};
    `);

    const seededA = await seedTenant('rls-tenant-a');
    const seededB = await seedTenant('rls-tenant-b');
    wsA = seededA.ws;
    wsB = seededB.ws;
    pageA = seededA.page;
    pageB = seededB.page;
    spaceA = seededA.space;
    userA = seededA.user;

    // Real pgBouncer in transaction pool mode, on the same Docker network.
    pgbContainer = await new GenericContainer(PGBOUNCER_IMAGE)
      .withNetwork(network)
      .withEnvironment({
        DB_HOST: 'pg',
        DB_PORT: '5432',
        DB_USER: APP_ROLE,
        DB_PASSWORD: APP_ROLE_PASSWORD,
        DB_NAME: 'orvex_test',
        POOL_MODE: 'transaction',
        AUTH_TYPE: 'scram-sha-256',
      })
      .withExposedPorts(5432)
      .start();

    const directUri = `postgres://${APP_ROLE}:${APP_ROLE_PASSWORD}@${pgContainer.getHost()}:${pgContainer.getMappedPort(
      5432,
    )}/orvex_test`;
    // max: 1 — every statement rides the SAME physical connection, which is
    // exactly what the post-commit GUC-reset assertion needs.
    appSql = postgres(directUri, { max: 1, onnotice: () => {} });
    appDb = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: appSql }),
      plugins: [new CamelCasePlugin()],
    });

    const pooledUri = `postgres://${APP_ROLE}:${APP_ROLE_PASSWORD}@${pgbContainer.getHost()}:${pgbContainer.getMappedPort(
      5432,
    )}/orvex_test`;
    // prepare: false — pgBouncer transaction pooling does not support
    // named prepared statements; max: 1 keeps one logical client so both
    // tenants' transactions share ONE pooled backend connection.
    pooledSql = postgres(pooledUri, {
      max: 1,
      prepare: false,
      onnotice: () => {},
    });
  });

  afterAll(async () => {
    await pooledSql?.end({ timeout: 5 }).catch(() => undefined);
    await appDb?.destroy().catch(() => undefined);
    await adminDb?.destroy().catch(() => undefined);
    await pgbContainer?.stop().catch(() => undefined);
    await pgContainer?.stop().catch(() => undefined);
    await network?.stop().catch(() => undefined);
  });

  // ── AC3 ──────────────────────────────────────────────────────────────
  it('TestRlsPoliciesExistOnAllTargetedTables — ENABLE + FORCE + a workspace_id policy per table', async () => {
    const policies = await adminSql`
      SELECT tablename, qual FROM pg_policies WHERE schemaname = 'public'
    `;
    for (const table of RLS_TABLES) {
      const policy = policies.find((p) => p.tablename === table);
      expect(policy).toBeDefined();
      expect(String(policy!.qual)).toContain('workspace_id');
    }

    const classes = await adminSql`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = ANY(${RLS_TABLES}) AND relkind = 'r'
    `;
    expect(classes).toHaveLength(RLS_TABLES.length);
    for (const row of classes) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  // ── AC1 ──────────────────────────────────────────────────────────────
  it('TestSetConfigScopedToTransactionResetsAtCommit — GUC visible in-txn, gone post-commit on the same physical connection', async () => {
    await appDb.transaction().execute((trx) =>
      withTenantScopedTransaction(trx, wsA.id, async (scoped) => {
        const shown = await sql<{
          v: string;
        }>`SELECT current_setting('app.workspace_id', true) AS v`.execute(
          scoped,
        );
        expect(shown.rows[0].v).toBe(wsA.id);

        // The scoped transaction sees exactly its own tenant's rows.
        const rows = await scoped
          .selectFrom('pages')
          .select('id')
          .execute();
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(pageA.id);
      }),
    );

    // Same physical connection (max: 1), AFTER commit — the GUC did not
    // survive the transaction boundary (NULL, or popped-to-empty-string).
    const after =
      await appSql`SELECT NULLIF(current_setting('app.workspace_id', true), '') AS v`;
    expect(after[0].v).toBeNull();
  });

  // ── AC2 ──────────────────────────────────────────────────────────────
  it('TestNoGucLeakAcrossPooledTenants — tenant A GUC never leaks into the next pooled transaction', async () => {
    // Transaction 1 — tenant A, through pgBouncer (transaction mode): sets
    // the GUC transaction-locally, sees its row, commits.
    await pooledSql.begin(async (tx) => {
      await tx.unsafe("SELECT set_config('app.workspace_id', $1, true)", [wsA.id]);
      const rows = await tx.unsafe('SELECT id FROM pages');
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(pageA.id);
    });

    // Transaction 2 — the SAME pooled backend (single logical client, one
    // pooled server connection), WITHOUT setting any GUC. If the
    // transaction-local scoping leaked, tenant A's rows would appear here.
    // Fail-closed instead: zero rows.
    await pooledSql.begin(async (tx) => {
      const rows = await tx.unsafe('SELECT id FROM pages');
      expect(rows).toHaveLength(0);
    });

    // And a bare (non-transactional) statement through the pooler is
    // equally un-scoped: zero rows, never tenant A's.
    const bare = await pooledSql`SELECT id FROM pages`;
    expect(bare).toHaveLength(0);
  });

  // ── AC4 ──────────────────────────────────────────────────────────────
  it('TestCrossTenantReadReturnsZeroRows / TestIntraTenantSameWorkspaceReadUnaffected', async () => {
    await appDb.transaction().execute((trx) =>
      withTenantScopedTransaction(trx, wsA.id, async (scoped) => {
        // Cross-tenant probe: tenant A's GUC, tenant B's page id → 0 rows.
        const cross = await scoped
          .selectFrom('pages')
          .select('id')
          .where('id', '=', pageB.id)
          .execute();
        expect(cross).toHaveLength(0);

        // Intra-tenant probe: RLS is workspace-scoped, not page-scoped —
        // the same tenant's own row reads normally (finer-grained
        // restriction stays with the FR-13 app ACL).
        const intra = await scoped
          .selectFrom('pages')
          .select('id')
          .where('id', '=', pageA.id)
          .execute();
        expect(intra).toHaveLength(1);

        // Same result across the other targeted tables: only tenant A's
        // spaces/comments/attachments are visible.
        const spaces = await scoped
          .selectFrom('spaces')
          .select(['id', 'workspaceId'])
          .execute();
        expect(spaces.every((s) => s.workspaceId === wsA.id)).toBe(true);
        expect(spaces).toHaveLength(1);
      }),
    );
  });

  // ── AC5 ──────────────────────────────────────────────────────────────
  it('TestNoPrincipalQueryDeniedByDefault — an un-scoped transaction reads 0 rows and cannot write', async () => {
    await appDb.transaction().execute(async (trx) => {
      const rows = await trx.selectFrom('pages').select('id').execute();
      expect(rows).toHaveLength(0); // never all rows
    });

    // An un-scoped INSERT into a targeted table is rejected by the
    // WITH CHECK half of the policy — deny-by-default for writes too.
    await expect(
      appDb.transaction().execute((trx) =>
        trx
          .insertInto('pages')
          .values({
            slugId: 'rls-unscoped-insert',
            title: 'should never land',
            spaceId: spaceA.id,
            workspaceId: wsA.id,
            creatorId: userA.id,
            position: 'a1',
          })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  // ── NFR: operability (malformed GUC fails loud, never silent) ────────
  it('TestMalformedGucValueFailsLoudNotSilent', async () => {
    // The hook refuses a malformed tenant id BEFORE any SQL runs.
    await expect(
      appDb
        .transaction()
        .execute((trx) =>
          withTenantScopedTransaction(trx, 'not-a-uuid', async () => 'never'),
        ),
    ).rejects.toBeInstanceOf(InvalidTenantScopeError);

    // A malformed value injected UNDER the hook (simulating a bug that
    // bypasses it) surfaces as an explicit, catchable Postgres error on
    // policy evaluation — never a silent all-rows result and never a
    // process crash.
    await expect(
      appDb.transaction().execute(async (trx) => {
        await sql`SELECT set_config('app.workspace_id', ${'still-not-a-uuid'}, true)`.execute(
          trx,
        );
        return trx.selectFrom('pages').select('id').execute();
      }),
    ).rejects.toThrow(/invalid input syntax|uuid/i);
  });

  // ── Contract gates: no session-level SET; backstop honesty ───────────
  it('TestNoSessionLevelSetAnywhereInRlsCode / TestRlsBackstopDocCommentNeverClaimsReplacesAppAcl', async () => {
    const hookSource = await fs.readFile(
      path.join(__dirname, 'rls', 'rls-guc-hook.ts'),
      'utf8',
    );
    const migrationSource = await fs.readFile(
      path.join(
        __dirname,
        'migrations',
        '20260726T090000-orvex-rls-tenant-isolation.ts',
      ),
      'utf8',
    );

    for (const src of [hookSource, migrationSource]) {
      // Only transaction-local set_config(..., true) — never a session SET.
      expect(src).not.toMatch(/\bSET\s+app\./i);
      expect(src).not.toMatch(/\bSET\s+SESSION\b/i);
      // Backstop-not-replacement stated explicitly (CS §11 honesty).
      // (Whitespace-tolerant: comment line wraps must not defeat the gate.)
      expect(src.toLowerCase()).toContain('backstop');
      expect(src.toLowerCase()).toMatch(/never a[\s*]+replacement/);
      // No hidden placeholder markers.
      expect(src).not.toMatch(/TODO|FIXME|placeholder/);
    }
    expect(hookSource).toContain("set_config('app.workspace_id',");
  });
});
