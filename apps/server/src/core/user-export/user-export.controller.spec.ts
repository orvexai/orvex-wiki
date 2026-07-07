import * as path from 'path';
import { promises as fs } from 'fs';
import * as jwt from 'jsonwebtoken';
import { Global, Module } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
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

import { UserExportModule } from './user-export.module';
import { JwtStrategy } from '../../core/auth/strategies/jwt.strategy';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { SessionActivityService } from '../../core/session/session-activity.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { USER_EXPORT_THROTTLER } from '../../integrations/throttle/throttler-names';
import type { DB } from '@docmost/db/types/db';

/**
 * ENG-1473 — `UserDataExportScopeSpec`, the named binary DoD gate.
 *
 * Real Kysely against a testcontainers Postgres (RED->GREEN, no mocking of
 * the store under test), seeded with two users in two workspaces. Only
 * `SessionActivityService` (a Redis-backed side channel unrelated to every AC
 * here — the JWTs below never carry a `sessionId`, so its `trackActivity`
 * branch in {@link JwtStrategy} is provably never taken) and
 * `UserSessionRepo` (same unreached branch) are given no-op doubles; every
 * other collaborator on the request path — `JwtStrategy`, `JwtAuthGuard`,
 * `UserRepo`, `WorkspaceRepo`, the real `@nestjs/throttler` guard, and the
 * controller's own scoped Kysely reads — is the real production class.
 */
describe('UserDataExportScopeSpec — POST /users/me/export', () => {
  jest.setTimeout(120_000);

  const TEST_APP_SECRET = 'eng-1473-test-secret-at-least-32-characters';

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let seedDb: Kysely<DB>;
  let app: NestFastifyApplication;

  let workspaceA: string;
  let workspaceB: string;
  let userA: string;
  let userB: string;

  const signAccessToken = (sub: string, workspaceId: string): string =>
    jwt.sign(
      { sub, email: 'user@example.com', workspaceId, type: 'access' },
      TEST_APP_SECRET,
    );

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    // Run the REAL migration chain (raw/snake_case) against the fresh DB —
    // the same FileMigrationProvider wiring as `database/migrate.ts`.
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

    // @Global() test-support module: UserExportModule (like every real
    // module here) resolves its own guard/strategy dependencies from its OWN
    // import graph, not from the root testing module's local `providers`
    // array — so these must be visible process-wide, exactly like the real
    // EnvironmentModule/DatabaseModule are in production (both @Global()).
    @Global()
    @Module({
      providers: [
        UserRepo,
        WorkspaceRepo,
        JwtStrategy,
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => TEST_APP_SECRET,
            isCloud: () => false,
          },
        },
        // Unreached branches (see class doc) — no sessionId in any test JWT.
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
        EnvironmentService,
        UserSessionRepo,
        SessionActivityService,
      ],
    })
    class TestSupportModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        KyselyModule.forRoot({
          dialect: new PostgresJSDialect({ postgres: sqlClient }),
          plugins: [new CamelCasePlugin()],
        }),
        // In-memory storage is a legitimate infra substitution for Redis here
        // (DoD names testcontainers *Postgres* only) — the real
        // `@nestjs/throttler` guard/decorator logic under test is identical
        // regardless of storage backend.
        ThrottlerModule.forRoot([
          { name: USER_EXPORT_THROTTLER, ttl: 3_600_000, limit: 5 },
        ]),
        TestSupportModule,
        UserExportModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Seed: two workspaces, two users, each owning aiChats/apiKeys, plus a
    // soft-deleted row per table (must never appear in any export).
    const wsA = await seedDb
      .insertInto('workspaces')
      .values({ name: 'Workspace A' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const wsB = await seedDb
      .insertInto('workspaces')
      .values({ name: 'Workspace B' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceA = wsA.id;
    workspaceB = wsB.id;

    const uA = await seedDb
      .insertInto('users')
      .values({ email: 'a@example.com', workspaceId: workspaceA })
      .returning('id')
      .executeTakeFirstOrThrow();
    const uB = await seedDb
      .insertInto('users')
      .values({ email: 'b@example.com', workspaceId: workspaceB })
      .returning('id')
      .executeTakeFirstOrThrow();
    userA = uA.id;
    userB = uB.id;

    // A's own chat (in A's workspace) — the only chat that should ever come
    // back for A, and its message.
    const chatA = await seedDb
      .insertInto('aiChats')
      .values({ workspaceId: workspaceA, creatorId: userA, title: 'A chat' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await seedDb
      .insertInto('aiChatMessages')
      .values({
        chatId: chatA.id,
        workspaceId: workspaceA,
        userId: userA,
        role: 'user',
        content: 'hello from A',
      })
      .execute();
    await seedDb
      .insertInto('apiKeys')
      .values({ creatorId: userA, workspaceId: workspaceA, name: 'A key' })
      .execute();

    // A's own row, soft-deleted — must be excluded from A's export.
    await seedDb
      .insertInto('aiChats')
      .values({
        workspaceId: workspaceA,
        creatorId: userA,
        title: 'A deleted chat',
        deletedAt: new Date(),
      })
      .execute();

    // A-owned rows recorded under workspace B (data-integrity edge case,
    // e.g. a stale/forged workspace_id on the row) — creatorId alone would
    // NOT exclude these from A's export; only the workspaceId filter does.
    // This is what makes the AC2 workspaceId scoping assertion discriminating
    // (mutation check: dropping the `.where('workspaceId', ...)` clauses
    // must fail these assertions).
    const chatAInWorkspaceB = await seedDb
      .insertInto('aiChats')
      .values({
        workspaceId: workspaceB,
        creatorId: userA,
        title: 'A chat mis-scoped to workspace B',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await seedDb
      .insertInto('aiChatMessages')
      .values({
        chatId: chatAInWorkspaceB.id,
        workspaceId: workspaceB,
        userId: userA,
        role: 'user',
        content: 'A message mis-scoped to workspace B',
      })
      .execute();
    await seedDb
      .insertInto('apiKeys')
      .values({
        creatorId: userA,
        workspaceId: workspaceB,
        name: 'A key mis-scoped to workspace B',
      })
      .execute();

    // A's own message, soft-deleted, inside A's LIVE chat — must be excluded
    // from A's export (the aiChatMessages select must filter deletedAt too).
    await seedDb
      .insertInto('aiChatMessages')
      .values({
        chatId: chatA.id,
        workspaceId: workspaceA,
        userId: userA,
        role: 'user',
        content: 'A deleted message',
        deletedAt: new Date(),
      })
      .execute();

    // B's chat/message/key, in B's own workspace — must never leak into A's
    // export (cross-user AND cross-workspace).
    const chatB = await seedDb
      .insertInto('aiChats')
      .values({ workspaceId: workspaceB, creatorId: userB, title: 'B chat' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await seedDb
      .insertInto('aiChatMessages')
      .values({
        chatId: chatB.id,
        workspaceId: workspaceB,
        userId: userB,
        role: 'user',
        content: 'hello from B',
      })
      .execute();
    await seedDb
      .insertInto('apiKeys')
      .values({ creatorId: userB, workspaceId: workspaceB, name: 'B key' })
      .execute();
  });

  afterAll(async () => {
    await app?.close();
    await seedDb?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('AC1/AC2/AC3/AC6 — export is caller- and workspace-scoped, no linearIntegration key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/me/export',
      headers: { authorization: `Bearer ${signAccessToken(userA, workspaceA)}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // AC6 — Linear-scrubbed: exactly these three keys, no linearIntegration.
    expect(Object.keys(body).sort()).toEqual(
      ['aiChatMessages', 'aiChats', 'apiKeys'].sort(),
    );

    // AC1 — caller-scoped, non-deleted only: exactly A's one live chat/key.
    expect(body.aiChats).toHaveLength(1);
    expect(body.aiChats[0].title).toBe('A chat');
    expect(body.apiKeys).toHaveLength(1);
    expect(body.apiKeys[0].name).toBe('A key');

    // AC2 — cross-workspace isolation: nothing belonging to B or workspace B,
    // INCLUDING rows creatorId-owned by A but recorded under workspace B
    // (the case creatorId-only filtering cannot catch — see seed comment).
    const chatTitles = body.aiChats.map((c: { title: string }) => c.title);
    expect(chatTitles).not.toContain('B chat');
    expect(chatTitles).not.toContain('A deleted chat');
    expect(chatTitles).not.toContain('A chat mis-scoped to workspace B');

    const apiKeyNames = body.apiKeys.map((k: { name: string }) => k.name);
    expect(apiKeyNames).not.toContain('B key');
    expect(apiKeyNames).not.toContain('A key mis-scoped to workspace B');

    const messageContents = body.aiChatMessages.map(
      (m: { content: string }) => m.content,
    );
    expect(messageContents).not.toContain('A message mis-scoped to workspace B');
    expect(messageContents).not.toContain('A deleted message');

    // AC3 — messages joined only to A's own (non-deleted) chat ids, from A's
    // own (non-deleted) messages.
    expect(body.aiChatMessages).toHaveLength(1);
    expect(body.aiChatMessages[0].content).toBe('hello from A');
  });

  it('AC3 — zero-chat user gets an empty-safe export, no DB error', async () => {
    const uC = await seedDb
      .insertInto('users')
      .values({ email: 'c@example.com', workspaceId: workspaceA })
      .returning('id')
      .executeTakeFirstOrThrow();

    const res = await app.inject({
      method: 'POST',
      url: '/api/users/me/export',
      headers: {
        authorization: `Bearer ${signAccessToken(uC.id, workspaceA)}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ aiChats: [], aiChatMessages: [], apiKeys: [] });
  });

  it('AC4 — attachment download headers (M-17)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/me/export',
      headers: { authorization: `Bearer ${signAccessToken(userA, workspaceA)}` },
    });

    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="export.json"',
    );
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('AC5 — unauthenticated call is rejected with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/me/export',
    });

    expect(res.statusCode).toBe(401);
  });

  it('AC5 — a 6th export call within the hour is throttled with 429 (ratified 5/hour ceiling)', async () => {
    const uD = await seedDb
      .insertInto('users')
      .values({ email: 'd@example.com', workspaceId: workspaceA })
      .returning('id')
      .executeTakeFirstOrThrow();
    const token = signAccessToken(uD.id, workspaceA);

    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/users/me/export',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    }

    const sixth = await app.inject({
      method: 'POST',
      url: '/api/users/me/export',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(sixth.statusCode).toBe(429);
  });

  it('AC6 — no linear_integrations reference in the ported module CODE (grep-zero)', async () => {
    const controllerSrc = await fs.readFile(
      path.join(__dirname, 'user-export.controller.ts'),
      'utf-8',
    );
    // Strip comments first — the module's own doc comments legitimately
    // NAME the removed identifiers to explain the D-S11 scrub; the AC is
    // about the CODE (imports/selects/branches), not prose mentioning them.
    const codeOnly = controllerSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/linearIntegration|linear_integrations/);
  });
});
