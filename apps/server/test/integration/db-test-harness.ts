/**
 * ENG-1372 — real Postgres integration harness (testcontainers).
 *
 * CS §5 mocking strategy: Postgres is local-substitutable infra, so
 * integration tests here run against a REAL Postgres container (never a
 * mock/in-memory fake). Only true externals get mocked, and Postgres is not
 * one of them.
 *
 * This harness starts one Postgres container per test file, runs the real
 * migration set against it (the exact migrations that ship to production),
 * and exposes a Kysely handle plus small fixture helpers for seeding a
 * workspace/space/user/pages tree.
 */
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { CamelCasePlugin, Kysely, Migrator, FileMigrationProvider } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import * as path from 'path';
import { promises as fs } from 'fs';
import { DB } from '@docmost/db/types/db';

export interface TestDb {
  db: Kysely<DB>;
  container: StartedTestContainer;
  teardown: () => Promise<void>;
}

export async function startTestDatabase(): Promise<TestDb> {
  const container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_USER: 'orvex',
      POSTGRES_PASSWORD: 'orvex',
      POSTGRES_DB: 'orvex_test',
    })
    .withExposedPorts(5432)
    .start();

  const connectionString = `postgres://orvex:orvex@${container.getHost()}:${container.getMappedPort(
    5432,
  )}/orvex_test`;

  const db = new Kysely<DB>({
    dialect: new PostgresJSDialect({
      postgres: postgres(connectionString, { onnotice: () => {} }),
    }),
    plugins: [new CamelCasePlugin()],
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, '..', '..', 'src', 'database', 'migrations'),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    console.error('Migration failure', results, error);
    throw error;
  }

  return {
    db,
    container,
    teardown: async () => {
      await db.destroy();
      await container.stop();
    },
  };
}

let seq = 0;
function uniqueSlug(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

export async function seedWorkspace(db: Kysely<DB>) {
  return db
    .insertInto('workspaces')
    .values({ name: uniqueSlug('workspace'), hostname: uniqueSlug('host') })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function seedUser(db: Kysely<DB>, workspaceId: string) {
  return db
    .insertInto('users')
    .values({
      name: 'Test User',
      email: `${uniqueSlug('user')}@example.com`,
      workspaceId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function seedSpace(
  db: Kysely<DB>,
  workspaceId: string,
  creatorId: string,
) {
  return db
    .insertInto('spaces')
    .values({
      name: uniqueSlug('space'),
      slug: uniqueSlug('space-slug'),
      workspaceId,
      creatorId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function seedSpaceMember(
  db: Kysely<DB>,
  opts: { spaceId: string; userId?: string; groupId?: string; role: string },
) {
  return db
    .insertInto('spaceMembers')
    .values({
      spaceId: opts.spaceId,
      userId: opts.userId ?? null,
      groupId: opts.groupId ?? null,
      role: opts.role,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function seedGroup(db: Kysely<DB>, workspaceId: string) {
  return db
    .insertInto('groups')
    .values({
      name: uniqueSlug('group'),
      isDefault: false,
      workspaceId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function seedGroupUser(
  db: Kysely<DB>,
  opts: { groupId: string; userId: string },
) {
  return db
    .insertInto('groupUsers')
    .values({ groupId: opts.groupId, userId: opts.userId })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function seedPage(
  db: Kysely<DB>,
  opts: {
    spaceId: string;
    workspaceId: string;
    creatorId: string;
    parentPageId?: string | null;
    position: string | null;
    title?: string;
    content?: object | null;
  },
) {
  return db
    .insertInto('pages')
    .values({
      slugId: uniqueSlug('slug'),
      title: opts.title ?? 'Untitled',
      spaceId: opts.spaceId,
      workspaceId: opts.workspaceId,
      creatorId: opts.creatorId,
      parentPageId: opts.parentPageId ?? null,
      position: opts.position,
      content: (opts.content ?? null) as any,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
