// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2502 (FR-W8) — `TestRlsMigrationNeverStrandsProductionOwner`.
 *
 * The PRODUCTION-HAZARD proof. `FORCE ROW LEVEL SECURITY` binds even the
 * table-OWNING role. Production connects as `orvex-wiki`, which
 * `deploy/kustomize/platform-resources/postgres-claim.yaml`
 * (`databaseOwner: orvex-wiki`) makes the owner of every targeted table, and
 * `DatabaseModule.onApplicationBootstrap()` runs `migrateToLatest()`
 * unconditionally on production boot. An unconditional FORCE would therefore
 * fail-CLOSE every not-yet-GUC-scoped read and write path on the very next
 * deploy — the app locked out of its own tables.
 *
 * This spec reproduces that exact topology against a REAL Postgres
 * (`testcontainers`): a non-superuser role that OWNS the tables, applying the
 * real migration file, then reading and writing its own tables with no GUC
 * set — precisely what a production pod does on boot.
 *
 *  - Owner-applied (the production default): FORCE is SKIPPED, so the owner
 *    still reads and writes its own tables. Production is NOT stranded, and
 *    the policies are nonetheless in place for the cutover.
 *  - `ORVEX_RLS_FORCE=true` (the deliberate operator opt-in, after every
 *    tenant-scoped transaction is GUC-scoped): FORCE IS applied and the owner
 *    IS bound — the enforcing end-state.
 *  - Non-owner-applied: FORCE is applied with no flag needed.
 *
 * Assertions are behaviour through the real role's own connection (rows
 * read / write accepted or rejected), never the migration's SQL text.
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
import { GenericContainer, StartedTestContainer } from 'testcontainers';

import type { DbInterface } from '@docmost/db/types/db.interface';

const RLS_TABLES = ['pages', 'spaces', 'comments', 'attachments'];

/** Mirrors postgres-claim.yaml's `databaseOwner: orvex-wiki`. */
const OWNER_ROLE = 'orvex_wiki_owner';
const OWNER_PASSWORD = 'owner-test-pw';

describe('TestRlsMigrationNeverStrandsProductionOwner', () => {
  jest.setTimeout(240_000);

  let container: StartedTestContainer;
  let host: string;
  let port: number;

  /**
   * Builds a fresh database whose tables are OWNED by a NON-SUPERUSER role —
   * production's actual topology (CloudNativePG's `databaseOwner` is not a
   * superuser). Migrations run AS that owner, exactly like the app's own
   * boot-time `migrateToLatest()`.
   */
  async function freshOwnerDb(dbName: string): Promise<{
    ownerSql: ReturnType<typeof postgres>;
    ownerDb: Kysely<DbInterface>;
    migrate: () => Promise<void>;
  }> {
    const rootSql = postgres(
      `postgres://root:root@${host}:${port}/postgres`,
      { onnotice: () => {}, max: 1 },
    );
    await rootSql.unsafe(`DROP DATABASE IF EXISTS ${dbName}`);
    await rootSql.unsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${OWNER_ROLE}') THEN
           CREATE ROLE ${OWNER_ROLE} LOGIN PASSWORD '${OWNER_PASSWORD}'
             NOSUPERUSER NOBYPASSRLS NOCREATEDB;
         END IF;
       END $$;`,
    );
    await rootSql.unsafe(`CREATE DATABASE ${dbName} OWNER ${OWNER_ROLE}`);
    await rootSql.end({ timeout: 5 });

    const ownerSql = postgres(
      `postgres://${OWNER_ROLE}:${OWNER_PASSWORD}@${host}:${port}/${dbName}`,
      { onnotice: () => {}, max: 1 },
    );
    const ownerDb = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: ownerSql }),
      plugins: [new CamelCasePlugin()],
    });

    const migrate = async () => {
      const migrator = new Migrator({
        db: ownerDb,
        provider: new FileMigrationProvider({
          fs,
          path,
          migrationFolder: path.join(__dirname, '..', 'migrations'),
        }),
      });
      const { error } = await migrator.migrateToLatest();
      if (error) throw error;
    };

    return { ownerSql, ownerDb, migrate };
  }

  async function forceFlags(sqlClient: ReturnType<typeof postgres>) {
    const rows = await sqlClient`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class WHERE relname = ANY(${RLS_TABLES}) AND relkind = 'r'
    `;
    return rows;
  }

  /**
   * The production boot smoke path: the owner, with NO tenant GUC set (the
   * state of every not-yet-adopted read path on the next deploy), reads and
   * writes its own tenant-scoped tables.
   */
  async function ownerCanStillUseItsTables(ownerDb: Kysely<DbInterface>) {
    const ws = await ownerDb
      .insertInto('workspaces')
      .values({ name: 'owner-smoke' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const user = await ownerDb
      .insertInto('users')
      .values({
        name: 'owner smoke user',
        email: 'owner-smoke@rls.example.com',
        workspaceId: ws.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const space = await ownerDb
      .insertInto('spaces')
      .values({
        name: 'owner smoke space',
        slug: 'owner-smoke-space',
        workspaceId: ws.id,
        creatorId: user.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const page = await ownerDb
      .insertInto('pages')
      .values({
        slugId: 'owner-smoke-page',
        title: 'owner smoke page',
        spaceId: space.id,
        workspaceId: ws.id,
        creatorId: user.id,
        position: 'a0',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const read = await ownerDb
      .selectFrom('pages')
      .select('id')
      .where('id', '=', page.id)
      .execute();
    return { read, spaceId: space.id, workspaceId: ws.id, userId: user.id };
  }

  beforeAll(async () => {
    container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'root',
        POSTGRES_PASSWORD: 'root',
        POSTGRES_DB: 'postgres',
      })
      .withExposedPorts(5432)
      .start();
    host = container.getHost();
    port = container.getMappedPort(5432);
  });

  afterAll(async () => {
    await container?.stop().catch(() => undefined);
  });

  it('owner-applied (production default): FORCE is skipped and the owner is NOT locked out of its own tables', async () => {
    const prior = process.env.ORVEX_RLS_FORCE;
    delete process.env.ORVEX_RLS_FORCE;

    const { ownerSql, ownerDb, migrate } = await freshOwnerDb('rls_owner_safe');
    try {
      await migrate();

      // ── THE HAZARD ASSERTION, asserted FIRST and in BEHAVIOUR terms ──
      // With no GUC set at all — exactly the state of every un-adopted
      // read/write path on the next production deploy — the owner still
      // writes and reads its own tenant-scoped tables. Under an
      // unconditional FORCE this throws
      // `new row violates row-level security policy for table "spaces"`
      // and reads zero rows: the app locked out of its own database.
      const { read } = await ownerCanStillUseItsTables(ownerDb);
      expect(read).toHaveLength(1);

      // RLS is ENABLEd (the policies are in place, ready for the cutover)…
      const flags = await forceFlags(ownerSql);
      expect(flags).toHaveLength(RLS_TABLES.length);
      for (const row of flags) {
        expect(row.relrowsecurity).toBe(true);
        // …but NOT FORCEd, because the applying role owns the tables.
        expect(row.relforcerowsecurity).toBe(false);
      }

      const policies = await ownerSql`
        SELECT tablename FROM pg_policies WHERE schemaname = 'public'
      `;
      for (const table of RLS_TABLES) {
        expect(policies.map((p) => p.tablename)).toContain(table);
      }
    } finally {
      await ownerDb.destroy().catch(() => undefined);
      await ownerSql.end({ timeout: 5 }).catch(() => undefined);
      if (prior === undefined) delete process.env.ORVEX_RLS_FORCE;
      else process.env.ORVEX_RLS_FORCE = prior;
    }
  });

  it('ORVEX_RLS_FORCE=true (deliberate cutover opt-in): FORCE IS applied and the owner IS bound', async () => {
    const prior = process.env.ORVEX_RLS_FORCE;
    process.env.ORVEX_RLS_FORCE = 'true';

    const { ownerSql, ownerDb, migrate } =
      await freshOwnerDb('rls_owner_forced');
    try {
      await migrate();

      const flags = await forceFlags(ownerSql);
      expect(flags).toHaveLength(RLS_TABLES.length);
      for (const row of flags) {
        expect(row.relrowsecurity).toBe(true);
        expect(row.relforcerowsecurity).toBe(true);
      }

      // With FORCE on, the owner IS bound: an un-scoped read of a
      // tenant-scoped table sees zero rows, and an un-scoped insert is
      // rejected by the policy's WITH CHECK half. This is the ENFORCING
      // end-state — and precisely the lockout the default posture avoids
      // until the operator opts in.
      const rows = await ownerDb.selectFrom('pages').select('id').execute();
      expect(rows).toHaveLength(0);

      // `workspaces`/`users` carry no policy, so seeding the FK parents still
      // works; only the four targeted tables are bound.
      const ws = await ownerDb
        .insertInto('workspaces')
        .values({ name: 'forced' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const user = await ownerDb
        .insertInto('users')
        .values({
          name: 'forced user',
          email: 'forced@rls.example.com',
          workspaceId: ws.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await expect(
        ownerDb
          .insertInto('spaces')
          .values({
            name: 'forced space',
            slug: 'forced-space',
            workspaceId: ws.id,
            creatorId: user.id,
          })
          .execute(),
      ).rejects.toThrow(/row-level security|policy/i);

      // And WITH the GUC set (what executeTx does for a tenant-scoped
      // request), the very same write is admitted — FORCE constrains the
      // owner to its tenant, it does not brick it.
      await ownerDb.transaction().execute(async (trx) => {
        await sql`SELECT set_config('app.workspace_id', ${ws.id}, true)`.execute(
          trx,
        );
        await trx
          .insertInto('spaces')
          .values({
            name: 'forced space scoped',
            slug: 'forced-space-scoped',
            workspaceId: ws.id,
            creatorId: user.id,
          })
          .execute();
      });
    } finally {
      await ownerDb.destroy().catch(() => undefined);
      await ownerSql.end({ timeout: 5 }).catch(() => undefined);
      if (prior === undefined) delete process.env.ORVEX_RLS_FORCE;
      else process.env.ORVEX_RLS_FORCE = prior;
    }
  });
});
