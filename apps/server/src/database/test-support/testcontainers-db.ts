import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { KyselyDB } from '../types/kysely.types';
import { sql } from 'kysely';

/**
 * Real-Postgres integration harness (testcontainers, CS §5): a fresh
 * container per suite, real migrations, the real `PagePermissionRepo` /
 * `SpaceAbilityFactory` — never mocked (❌#4).
 *
 * `DATABASE_URL` is only known once the container has started, but
 * `EnvironmentModule` validates the full env shape (incl. `DATABASE_URL`)
 * the moment it is imported (`ConfigModule.forRoot(...)` runs at module
 * decoration time). So every module that transitively pulls in
 * `EnvironmentModule` MUST be imported dynamically, AFTER the container is
 * up and `process.env.DATABASE_URL` is set — never as a static top-of-file
 * import. `REDIS_URL`/`APP_SECRET` are dummy values only to satisfy the
 * env-shape validation; nothing in this harness opens a real Redis
 * connection (no CacheModule/RedisModule is imported).
 */
export type IntegrationDbContext = {
  container: StartedPostgreSqlContainer;
  moduleRef: TestingModule;
  db: KyselyDB;
  teardown: () => Promise<void>;
};

export async function bootstrapIntegrationDb(): Promise<IntegrationDbContext> {
  const container = await new PostgreSqlContainer('postgres:17-trixie')
    .withDatabase('orvex_wiki_test')
    .withUsername('orvex_wiki_test')
    .withPassword('orvex_wiki_test')
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.APP_SECRET =
    process.env.APP_SECRET ?? 'test-secret-at-least-32-characters-long-000';
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

  // Dynamic — see module-level doc comment: must load AFTER env is set.
  // NOTE: this intentionally does NOT import the real `DatabaseModule` — that
  // module also wires `PageListener`, which requires live BullMQ/Redis queue
  // providers unrelated to permissions. This harness reconstructs only the
  // Kysely connection + the repos the ACL evaluation path actually touches
  // (all real, still never mocked — CS §5/❌#4), keeping the harness
  // Redis-free.
  const { EnvironmentModule } = await import(
    '../../integrations/environment/environment.module'
  );
  const { EnvironmentService } = await import(
    '../../integrations/environment/environment.service'
  );
  const SpaceAbilityFactory = (
    await import('../../core/casl/abilities/space-ability.factory')
  ).default;
  const WorkspaceAbilityFactory = (
    await import('../../core/casl/abilities/workspace-ability.factory')
  ).default;
  const { MigrationService } = await import('../services/migration.service');
  const { KyselyModule, KYSELY_MODULE_CONNECTION_TOKEN } = await import(
    'nestjs-kysely'
  );
  const { CamelCasePlugin } = await import('kysely');
  const { PostgresJSDialect } = await import('kysely-postgres-js');
  const postgresPkg = await import('postgres');
  const postgres = ((postgresPkg as unknown as { default?: unknown }).default ??
    postgresPkg) as unknown as (
    url: string,
    opts?: Record<string, unknown>,
  ) => unknown;
  const { normalizePostgresUrl } = await import('../../common/helpers');
  const { CacheModule } = await import('@nestjs/cache-manager');
  const { Module } = await import('@nestjs/common');
  const { EventEmitterModule } = await import('@nestjs/event-emitter');
  const { WorkspaceRepo } = await import('../repos/workspace/workspace.repo');
  const { GroupRepo } = await import('../repos/group/group.repo');
  const { SpaceRepo } = await import('../repos/space/space.repo');
  const { SpaceMemberRepo } = await import(
    '../repos/space/space-member.repo'
  );
  const { PageRepo } = await import('../repos/page/page.repo');
  const { PagePermissionRepo } = await import(
    '../repos/page/page-permission.repo'
  );

  @Module({
    imports: [
      EnvironmentModule,
      CacheModule.register({ isGlobal: true }),
      EventEmitterModule.forRoot(),
      KyselyModule.forRootAsync({
        inject: [EnvironmentService],
        useFactory: (environmentService: InstanceType<typeof EnvironmentService>) => ({
          dialect: new PostgresJSDialect({
            postgres: postgres(
              normalizePostgresUrl(environmentService.getDatabaseURL()),
              { onnotice: () => {} },
            ) as never,
          }),
          plugins: [new CamelCasePlugin()],
        }),
      }),
    ],
    providers: [
      MigrationService,
      WorkspaceRepo,
      GroupRepo,
      SpaceRepo,
      SpaceMemberRepo,
      PageRepo,
      PagePermissionRepo,
      SpaceAbilityFactory,
      WorkspaceAbilityFactory,
    ],
    exports: [
      WorkspaceRepo,
      GroupRepo,
      SpaceRepo,
      SpaceMemberRepo,
      PageRepo,
      PagePermissionRepo,
      SpaceAbilityFactory,
      WorkspaceAbilityFactory,
    ],
  })
  class IntegrationTestAppModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [IntegrationTestAppModule],
  }).compile();

  await moduleRef.init();

  const migrationService = moduleRef.get(MigrationService);
  await migrationService.migrateToLatest();

  const db = moduleRef.get<KyselyDB>(KYSELY_MODULE_CONNECTION_TOKEN());

  return {
    container,
    moduleRef,
    db,
    teardown: async () => {
      await moduleRef.close();
      await container.stop();
    },
  };
}

export class DbSeedHelper {
  constructor(private readonly db: KyselyDB) {}

  async workspace(overrides: Partial<{ name: string }> = {}) {
    return this.db
      .insertInto('workspaces')
      .values({ name: overrides.name ?? 'Test Workspace' })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async user(
    workspaceId: string,
    overrides: Partial<{ email: string; name: string }> = {},
  ) {
    const email = overrides.email ?? `user-${crypto.randomUUID()}@example.com`;
    return this.db
      .insertInto('users')
      .values({
        workspaceId,
        email,
        name: overrides.name ?? 'Test User',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async space(
    workspaceId: string,
    overrides: Partial<{ name: string; slug: string }> = {},
  ) {
    const slug = overrides.slug ?? `space-${crypto.randomUUID()}`;
    return this.db
      .insertInto('spaces')
      .values({
        workspaceId,
        name: overrides.name ?? 'Test Space',
        slug,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async spaceMember(
    spaceId: string,
    opts: { userId?: string; groupId?: string; role: string },
  ) {
    return this.db
      .insertInto('spaceMembers')
      .values({
        spaceId,
        userId: opts.userId ?? null,
        groupId: opts.groupId ?? null,
        role: opts.role,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async group(
    workspaceId: string,
    overrides: Partial<{ name: string; isDefault: boolean }> = {},
  ) {
    return this.db
      .insertInto('groups')
      .values({
        workspaceId,
        name: overrides.name ?? 'Test Group',
        isDefault: overrides.isDefault ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async groupUser(groupId: string, userId: string) {
    return this.db
      .insertInto('groupUsers')
      .values({ groupId, userId })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async page(
    workspaceId: string,
    spaceId: string,
    overrides: Partial<{
      title: string;
      parentPageId: string;
      creatorId: string;
    }> = {},
  ) {
    return this.db
      .insertInto('pages')
      .values({
        workspaceId,
        spaceId,
        title: overrides.title ?? 'Test Page',
        slugId: crypto.randomUUID().slice(0, 8),
        parentPageId: overrides.parentPageId ?? null,
        creatorId: overrides.creatorId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}

export async function truncateAll(db: KyselyDB): Promise<void> {
  await sql`TRUNCATE TABLE
    page_permissions, page_access, pages, space_members, group_users, groups,
    spaces, users, workspaces
    RESTART IDENTITY CASCADE`.execute(db);
}
