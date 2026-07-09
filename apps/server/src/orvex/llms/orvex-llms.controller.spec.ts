// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import { promises as fs } from 'fs';
import * as jwt from 'jsonwebtoken';
import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
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

import { dfmToJson } from '@orvex/dfm';

import { OrvexLlmsController } from './orvex-llms.controller';
import { OrvexLlmsService } from './orvex-llms.service';
import { OrvexModulesEnabledGuard } from './orvex-modules-enabled.guard';
import { OrvexBearerAuthGuard } from '../../core/api-key/orvex-bearer-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtStrategy } from '../../core/auth/strategies/jwt.strategy';
import { UserRepo } from '../../database/repos/user/user.repo';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { UserSessionRepo } from '../../database/repos/session/user-session.repo';
import { SessionActivityService } from '../../core/session/session-activity.service';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { GroupRepo } from '../../database/repos/group/group.repo';
import { SpaceRepo } from '../../database/repos/space/space.repo';
import { PageRepo } from '../../database/repos/page/page.repo';
import { PagePermissionRepo } from '../../database/repos/page/page-permission.repo';
import { OutboxWriter } from '../events/outbox/outbox-writer.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { ApiKeyService } from '../../core/api-key/api-key.service';
import { SpaceRole } from '../../common/helpers/types/permission';
import { WsService } from '../../ws/ws.service';
import type { DB, Json } from '../../database/types/db';

/**
 * ENG-1492 — `TestOrvexLlmsDiscoveryScopeFiltered` (the DoD binary gate,
 * AC1+AC2+AC5) plus the AC3/AC4/AC6 matrix, driven through the REAL
 * production seams:
 *
 *  - real Postgres (testcontainers) + real `PageRepo`/`PagePermissionRepo`
 *    (ENG-1373) + real `SpaceAbilityFactory` (ENG-1454's choke point);
 *  - the REAL `JwtStrategy.validate()` entry point mints the request
 *    principal from a real, signed access-token (no bearer mocking);
 *  - the REAL `OrvexLlmsController` + its actual `@UseGuards` chain
 *    (`OrvexModulesEnabledGuard` -> `OrvexBearerAuthGuard`), via
 *    `app.inject` — never a controller method called directly.
 *
 * Nothing here is a `jest.mock` of an own package (CS §5 ❌#4); the DfM
 * converter (`@orvex/dfm`) is exercised in-process, unmocked, both ways
 * (`pmToDfm` inside the service, `dfmToJson` here to assert the round-trip).
 */
describe('OrvexLlmsController (ENG-1492) — integration', () => {
  jest.setTimeout(180_000);

  const TEST_APP_SECRET =
    'eng-1492-llms-test-secret-at-least-32-characters-long-ok';

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let seedDb: Kysely<DB>;
  let app: NestFastifyApplication;

  let workspaceId: string;
  let spaceIdA: string; // the caller is a member here
  let spaceIdB: string; // the caller is NOT a member here
  let userId: string;

  function mintAccessToken(sub: string, wsId: string): string {
    return jwt.sign(
      { sub, email: 'eng1492@example.com', workspaceId: wsId, type: 'access' },
      TEST_APP_SECRET,
    );
  }

  const DEFAULT_PAGE_DOC: Json = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
    ],
  };

  let pageCounter = 0;
  async function createPage(opts: {
    title: string;
    spaceId: string;
    content?: Json;
  }) {
    pageCounter += 1;
    return seedDb
      .insertInto('pages')
      .values({
        title: opts.title,
        spaceId: opts.spaceId,
        workspaceId,
        slugId: `eng-1492-${pageCounter}-${Date.now()}`,
        creatorId: userId,
        lastUpdatedById: userId,
        content: opts.content ?? DEFAULT_PAGE_DOC,
      })
      .returning(['id', 'slugId', 'title'])
      .executeTakeFirstOrThrow();
  }

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<DB>({
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

    const wsServiceStub = { emitInvalidate: () => {} } as unknown as WsService;

    @Global()
    @Module({
      providers: [
        UserRepo,
        WorkspaceRepo,
        JwtStrategy,
        JwtAuthGuard,
        OrvexBearerAuthGuard,
        SpaceMemberRepo,
        GroupRepo,
        SpaceRepo,
        SpaceAbilityFactory,
        PageRepo,
        PagePermissionRepo,
        OutboxWriter,
        { provide: WsService, useValue: wsServiceStub },
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => TEST_APP_SECRET,
            getJwtTokenExpiresIn: () => '30d',
            isCloud: () => false,
          },
        },
        { provide: UserSessionRepo, useValue: {} },
        {
          provide: SessionActivityService,
          useValue: { trackActivity: () => {} },
        },
        { provide: ApiKeyService, useValue: {} },
      ],
      exports: [
        UserRepo,
        WorkspaceRepo,
        JwtStrategy,
        JwtAuthGuard,
        OrvexBearerAuthGuard,
        SpaceMemberRepo,
        GroupRepo,
        SpaceRepo,
        SpaceAbilityFactory,
        PageRepo,
        PagePermissionRepo,
        EnvironmentService,
        UserSessionRepo,
        SessionActivityService,
        ApiKeyService,
      ],
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
      ],
      controllers: [OrvexLlmsController],
      providers: [OrvexLlmsService, OrvexModulesEnabledGuard, Reflector],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const ws = await seedDb
      .insertInto('workspaces')
      .values({ name: 'ENG-1492 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const user = await seedDb
      .insertInto('users')
      .values({ email: 'eng1492@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = user.id;

    const spaceA = await seedDb
      .insertInto('spaces')
      .values({ name: 'Space A', slug: 'eng-1492-space-a', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceIdA = spaceA.id;

    const spaceB = await seedDb
      .insertInto('spaces')
      .values({ name: 'Space B', slug: 'eng-1492-space-b', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceIdB = spaceB.id;

    // Caller is a member ONLY of space A — space B proves the space-level
    // (token-scope-aware) ACL layer, independent of the per-page layer.
    await seedDb
      .insertInto('spaceMembers')
      .values({ userId, spaceId: spaceIdA, role: SpaceRole.WRITER })
      .execute();
  });

  afterAll(async () => {
    await app?.close();
    await seedDb?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  const savedFlag = { value: undefined as string | undefined, saved: false };
  beforeEach(() => {
    savedFlag.value = process.env.ORVEX_MODULES_ENABLED;
    savedFlag.saved = true;
    process.env.ORVEX_MODULES_ENABLED = 'true';
  });
  afterEach(() => {
    if (savedFlag.saved) {
      if (savedFlag.value === undefined) {
        delete process.env.ORVEX_MODULES_ENABLED;
      } else {
        process.env.ORVEX_MODULES_ENABLED = savedFlag.value;
      }
    }
  });

  describe('TestOrvexLlmsDiscoveryScopeFiltered (DoD binary gate)', () => {
    it('AC1 — a scoped bearer lists only token-accessible pages on llms.txt', async () => {
      const visible = await createPage({ title: 'AC1 visible', spaceId: spaceIdA });
      const token = mintAccessToken(userId, workspaceId);

      const res = await app.inject({
        method: 'GET',
        url: '/api/orvex/llms.txt',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.body).toContain(visible.id);
    });

    it('AC2 — a page in a space the token cannot reach leaks zero bytes and page.md is rejected (IDOR-reject)', async () => {
      const forbidden = await createPage({
        title: 'AC2 forbidden — should never leak',
        spaceId: spaceIdB, // caller is NOT a member of space B
      });
      const token = mintAccessToken(userId, workspaceId);

      const sitemap = await app.inject({
        method: 'GET',
        url: '/api/orvex/llms.txt',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(sitemap.statusCode).toBe(200);
      expect(sitemap.body).not.toContain(forbidden.id);
      expect(
        (sitemap.body.match(new RegExp(forbidden.title!, 'g')) ?? []).length,
      ).toBe(0);

      const full = await app.inject({
        method: 'GET',
        url: '/api/orvex/llms-full.txt',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(full.body).not.toContain(forbidden.title);

      const pageMd = await app.inject({
        method: 'GET',
        url: `/api/orvex/pages/${forbidden.id}/page.md`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect([403, 404]).toContain(pageMd.statusCode);
    });

    it('AC5 — no/invalid bearer is rejected fail-closed (401), zero page content emitted', async () => {
      const noAuth = await app.inject({
        method: 'GET',
        url: '/api/orvex/llms.txt',
      });
      expect(noAuth.statusCode).toBe(401);

      const badAuth = await app.inject({
        method: 'GET',
        url: '/api/orvex/llms.txt',
        headers: { authorization: 'Bearer not-a-real-token' },
      });
      expect(badAuth.statusCode).toBe(401);
    });
  });

  describe('AC3 — llms-full.txt hydration cap', () => {
    it('hydrates at most 100 page bodies even when more are accessible', async () => {
      const rows = Array.from({ length: 105 }, (_v, i) => ({
        title: `AC3 bulk page ${i}`,
        spaceId: spaceIdA,
        workspaceId,
        slugId: `eng-1492-ac3-${i}-${Date.now()}`,
        creatorId: userId,
        lastUpdatedById: userId,
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'bulk' }] },
          ],
        } as Json,
      }));
      await seedDb.insertInto('pages').values(rows).execute();

      const token = mintAccessToken(userId, workspaceId);
      const res = await app.inject({
        method: 'GET',
        url: '/api/orvex/llms-full.txt',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const sectionCount = (res.body.match(/^## /gm) ?? []).length;
      expect(sectionCount).toBeLessThanOrEqual(100);
      expect(sectionCount).toBeGreaterThan(0);
    });
  });

  describe('AC4 — page.md per-page DfM export', () => {
    it('returns the page as DfM, round-tripping back to the same ProseMirror doc', async () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'The quick brown fox.' }],
          },
        ],
      };
      const page = await createPage({
        title: 'AC4 round-trip',
        spaceId: spaceIdA,
        content: doc,
      });
      const token = mintAccessToken(userId, workspaceId);

      const res = await app.inject({
        method: 'GET',
        url: `/api/orvex/pages/${page.id}/page.md`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(dfmToJson(res.body)).toEqual(doc);
    });

    it('404s for a page id that does not exist', async () => {
      const token = mintAccessToken(userId, workspaceId);
      const res = await app.inject({
        method: 'GET',
        url: '/api/orvex/pages/9b2e4f6a-1c3d-4e5f-8a7b-0c1d2e3f4a5b/page.md',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('AC6 — vanilla byte-parity', () => {
    it('404s every discovery route when ORVEX_MODULES_ENABLED is not exactly "true"', async () => {
      delete process.env.ORVEX_MODULES_ENABLED;
      const token = mintAccessToken(userId, workspaceId);

      const routes = ['/api/orvex/llms.txt', '/api/orvex/llms-full.txt'];
      for (const url of routes) {
        const res = await app.inject({
          method: 'GET',
          url,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(404);
      }
    });
  });
});
