import * as path from 'path';
import { promises as fs } from 'fs';
import { Test } from '@nestjs/testing';
import { ForbiddenException, Global, Module } from '@nestjs/common';
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
import { ApiKeyService } from '../api-key/api-key.service';
import { ApiKeyRepo } from '../api-key/api-key.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { UserRole } from '../../common/helpers/types/permission';
import type { DB } from '@docmost/db/types/db';
import type { User } from '@docmost/db/types/entity.types';

/**
 * ENG-1454 — `ScopeIntersectionEnforcementSpec` (Postgres half).
 *
 * Covers (b) the escalation guard against a REAL Kysely/api-key module
 * (no mocking of the repo, CS §5 ❌#4), and (d) the `scopes` jsonb
 * double-encode fix — against a REAL Postgres, because the double-encode
 * bug only reproduces against a real driver (a mock would hide it).
 */
describe('ScopeIntersectionEnforcementSpec (integration)', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let seedDb: Kysely<DB>;
  let apiKeyService: ApiKeyService;
  let apiKeyRepo: ApiKeyRepo;
  let workspaceId: string;
  let admin: User;

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
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () =>
              'eng-1454-test-secret-at-least-32-characters-long',
            getJwtTokenExpiresIn: () => '30d',
          },
        },
      ],
      exports: [EnvironmentService],
    })
    class TestSupportModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        KyselyModule.forRoot({
          dialect: new PostgresJSDialect({ postgres: sqlClient }),
          plugins: [new CamelCasePlugin()],
        }),
        TestSupportModule,
        ApiKeyModule,
      ],
    }).compile();

    apiKeyService = moduleRef.get(ApiKeyService);
    apiKeyRepo = moduleRef.get(ApiKeyRepo);

    const ws = await seedDb
      .insertInto('workspaces')
      .values({ name: 'ENG-1454 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    admin = (await seedDb
      .insertInto('users')
      .values({
        email: 'eng1454-admin@example.com',
        workspaceId,
        role: UserRole.ADMIN,
      })
      .returning(['id', 'role'])
      .executeTakeFirstOrThrow()) as User;
  });

  afterAll(async () => {
    await seedDb?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  // AC3(b) — a restricted token cannot manage/mint/revoke API keys.
  it('(b) a restricted token cannot create, update, or revoke an API key', async () => {
    await expect(
      apiKeyService.create(
        { name: 'should-be-blocked' },
        { creator: admin, workspaceId, tokenScope: 'restricted' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // An unscoped/session (full) token succeeds — proves the guard is
    // scope-specific, not a blanket failure.
    const created = await apiKeyService.create(
      { name: 'full-scope-ok' },
      { creator: admin, workspaceId, tokenScope: 'full' },
    );
    expect(created.apiKey.id).toEqual(expect.any(String));

    await expect(
      apiKeyService.update(
        { apiKeyId: created.apiKey.id, name: 'renamed' },
        { actor: admin, workspaceId, tokenScope: 'restricted' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      apiKeyService.revoke(
        { apiKeyId: created.apiKey.id },
        { actor: admin, workspaceId, tokenScope: 'restricted' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // AC6(d) — scopes jsonb round-trips as a native array; no double-encode.
  it('(d) a scopes jsonb value round-trips as a native array — no double-encode 500', async () => {
    const spaceAllowlist = ['space-alpha', 'space-beta'];

    const created = await apiKeyRepo.insert({
      name: 'scoped-key',
      creatorId: admin.id,
      workspaceId,
      scopes: spaceAllowlist,
      readOnly: true,
    });

    // Reads back through the domain-facing repo method as a real array —
    // NOT a JSON string. `.some` must exist and behave like a real array
    // method (the exact crash the double-encode bug produces: "scopes.some
    // is not a function").
    expect(Array.isArray(created.scopes)).toBe(true);
    expect(created.scopes.some((s) => s === 'space-alpha')).toBe(true);
    expect(created.readOnly).toBe(true);

    // Also verify the RAW column, bypassing the repo mapper entirely —
    // proves the column itself is a native jsonb array, not a jsonb
    // STRING (the actual postgres.js double-encode gotcha this AC fixes).
    const rawRow = await seedDb
      .selectFrom('apiKeys')
      .select(['scopes'])
      .where('id', '=', created.id)
      .executeTakeFirstOrThrow();
    expect(Array.isArray(rawRow.scopes)).toBe(true);
    expect(rawRow.scopes).toEqual(spaceAllowlist);

    // Re-fetched through findPublicById too (the path a scoped request
    // actually exercises at runtime).
    const refetched = await apiKeyRepo.findPublicById(created.id, workspaceId);
    expect(Array.isArray(refetched.scopes)).toBe(true);
    expect(() => refetched.scopes.some((s) => s.length > 0)).not.toThrow();
  });
});
