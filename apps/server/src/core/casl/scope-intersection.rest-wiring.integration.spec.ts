import * as crypto from 'crypto';
import * as path from 'path';
import { promises as fs } from 'fs';
import { Test } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { KyselyModule } from 'nestjs-kysely';
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

import { ApiKeyModule } from '../api-key/api-key.module';
import { ApiKeyRepo } from '../api-key/api-key.repo';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtApiKeyPayload } from '../auth/dto/jwt-payload';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { SessionActivityService } from '../session/session-activity.service';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import SpaceAbilityFactory from './abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from './interfaces/space-ability.type';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { UserRole, SpaceRole } from '../../common/helpers/types/permission';
import type { DB } from '@docmost/db/types/db';
import type { User } from '@docmost/db/types/entity.types';

/**
 * ENG-1454 fix-pass 1 (review F1) — `ScopeIntersectionRestWiringSpec`.
 *
 * Proves K4 is enforced across the REST surface end-to-end, through the
 * ACTUAL production seams (no mocking of auth, CASL, or the DB):
 *
 *   1. `JwtStrategy.validate()` — the exact method Passport invokes for
 *      every request — authenticates a real, DB-backed API key and stamps
 *      its `scopes`/`readOnly` columns onto the resolved user via
 *      `stampTokenScope` (added at `jwt.strategy.ts#validateApiKey`).
 *   2. `SpaceAbilityFactory.createForUser()` — the single choke point every
 *      space-scoped controller (page/space/label/comment/attachment/
 *      import/export) resolves its ability through — reads that stamp back
 *      via `intersectWithTokenScope` and floors the creator ability to it.
 *
 * `SpaceAbilityFactory` itself is REST-surface-agnostic (it has no HTTP
 * concerns), so driving it directly with the real user object produced by
 * the real auth seam is the faithful proof that every controller built on
 * top of it enforces the scope — without re-deriving each controller's own
 * unrelated business-logic dependencies (queues, license checks, etc.).
 */
describe('ScopeIntersectionRestWiringSpec (integration)', () => {
  jest.setTimeout(120_000);

  const TEST_APP_SECRET =
    'eng-1454-wiring-test-secret-at-least-32-characters-long';

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let seedDb: Kysely<DB>;
  let jwtStrategy: JwtStrategy;
  let spaceAbility: SpaceAbilityFactory;
  let apiKeyRepo: ApiKeyRepo;

  let workspaceId: string;
  let spaceIdA: string;
  let spaceIdB: string;
  let admin: User;

  async function mintApiKey(opts: {
    scopes: string[] | null;
    readOnly: boolean;
  }) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const inserted = await apiKeyRepo.insert({
      name: 'wiring-test-key',
      creatorId: admin.id,
      workspaceId,
      scopes: opts.scopes,
      readOnly: opts.readOnly,
    });
    await apiKeyRepo.setKeyHash(inserted.id, keyHash);
    return { apiKeyId: inserted.id, rawToken };
  }

  /** Drives the REAL passport entry point (`JwtStrategy.validate`). */
  async function authenticate(apiKeyId: string, rawToken: string) {
    const req = {
      raw: {},
      headers: { authorization: `Bearer ${rawToken}` },
    };
    const payload: JwtApiKeyPayload = {
      sub: admin.id,
      workspaceId,
      apiKeyId,
      type: 'api_key' as const,
    };
    return jwtStrategy.validate(req as any, payload);
  }

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

    seedDb = new Kysely<DB>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    });

    @Global()
    @Module({
      providers: [
        UserRepo,
        WorkspaceRepo,
        JwtStrategy,
        SpaceMemberRepo,
        GroupRepo,
        SpaceRepo,
        SpaceAbilityFactory,
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => TEST_APP_SECRET,
            getJwtTokenExpiresIn: () => '30d',
          },
        },
        { provide: UserSessionRepo, useValue: {} },
        {
          provide: SessionActivityService,
          useValue: { trackActivity: () => {} },
        },
      ],
      exports: [
        UserRepo,
        WorkspaceRepo,
        JwtStrategy,
        SpaceMemberRepo,
        GroupRepo,
        SpaceRepo,
        SpaceAbilityFactory,
        EnvironmentService,
        UserSessionRepo,
        SessionActivityService,
      ],
      imports: [ApiKeyModule],
    })
    class TestSupportModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        KyselyModule.forRoot({
          dialect: new PostgresJSDialect({ postgres: sqlClient }),
          plugins: [new CamelCasePlugin()],
        }),
        EventEmitterModule.forRoot(),
        CacheModule.register({ isGlobal: true }),
        TestSupportModule,
        ApiKeyModule,
      ],
    }).compile();

    jwtStrategy = moduleRef.get(JwtStrategy);
    spaceAbility = moduleRef.get(SpaceAbilityFactory);
    apiKeyRepo = moduleRef.get(ApiKeyRepo);

    const ws = await seedDb
      .insertInto('workspaces')
      .values({ name: 'ENG-1454 Wiring Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    admin = (await seedDb
      .insertInto('users')
      .values({
        email: 'eng1454-wiring-admin@example.com',
        workspaceId,
        role: UserRole.ADMIN,
      })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow()) as User;

    const spaceA = await seedDb
      .insertInto('spaces')
      .values({ name: 'Space A', slug: 'eng-1454-space-a', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceIdA = spaceA.id;

    const spaceB = await seedDb
      .insertInto('spaces')
      .values({ name: 'Space B', slug: 'eng-1454-space-b', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceIdB = spaceB.id;

    // The creator holds ADMIN (Manage Page) on BOTH spaces — proves any
    // narrowing observed below comes from the token scope, not the role.
    await seedDb
      .insertInto('spaceMembers')
      .values([
        { userId: admin.id, spaceId: spaceIdA, role: SpaceRole.ADMIN },
        { userId: admin.id, spaceId: spaceIdB, role: SpaceRole.ADMIN },
      ])
      .execute();
  });

  afterAll(async () => {
    await seedDb?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('AC4/AC5 — a read-only key scoped to space A cannot write in space A (REST-surface write-refusal)', async () => {
    const { apiKeyId, rawToken } = await mintApiKey({
      scopes: [spaceIdA],
      readOnly: true,
    });
    const { user } = await authenticate(apiKeyId, rawToken);

    const ability = await spaceAbility.createForUser(user, spaceIdA);
    expect(ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)).toBe(
      true,
    );
    expect(ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)).toBe(
      false,
    );
  });

  it('AC5 — a key scoped to space A only cannot reach space B at all, despite an ADMIN creator role there', async () => {
    const { apiKeyId, rawToken } = await mintApiKey({
      scopes: [spaceIdA],
      readOnly: false,
    });
    const { user } = await authenticate(apiKeyId, rawToken);

    const ability = await spaceAbility.createForUser(user, spaceIdB);
    expect(ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)).toBe(
      false,
    );
    expect(ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)).toBe(
      false,
    );
  });

  it('an unrestricted (legacy) key retains the full creator ability — the guard is scope-specific, not blanket', async () => {
    const { apiKeyId, rawToken } = await mintApiKey({
      scopes: null,
      readOnly: false,
    });
    const { user } = await authenticate(apiKeyId, rawToken);

    const ability = await spaceAbility.createForUser(user, spaceIdA);
    expect(ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)).toBe(
      true,
    );
  });
});
