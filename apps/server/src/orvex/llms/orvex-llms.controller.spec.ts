// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import * as crypto from 'crypto';
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
import { ApiKeyModule } from '../../core/api-key/api-key.module';
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

  /**
   * F1 fix (review 1) — mints a REAL, DB-backed scoped API-key bearer: an
   * `apiKeys` row (with `scopes`/`readOnly`, ENG-1454) plus a matching
   * `type: 'api_key'` JWT whose sha256 equals the row's `keyHash` — the
   * exact shape `TokenService.generateApiToken` / `ApiKeyRepo.insert`
   * produce. This is the ONLY route through which `JwtStrategy` ever
   * stamps a `TokenScopeGrant` (`stampTokenScope`, `scope-intersection.ts`)
   * onto the request user, so it is the only way a test can prove the
   * LISTING path (`listAccessiblePages`) is floored by token scope and not
   * merely by space membership.
   */
  async function mintScopedApiKeyToken(opts: {
    creatorId: string;
    wsId: string;
    scopes: string[] | null;
    readOnly: boolean;
  }): Promise<string> {
    const row = await seedDb
      .insertInto('apiKeys')
      .values({
        name: 'eng-1492 F1 scoped test key',
        creatorId: opts.creatorId,
        workspaceId: opts.wsId,
        scopes: opts.scopes as unknown as Json,
        readOnly: opts.readOnly,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const rawToken = jwt.sign(
      {
        sub: opts.creatorId,
        apiKeyId: row.id,
        workspaceId: opts.wsId,
        type: 'api_key',
      },
      TEST_APP_SECRET,
    );
    const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await seedDb
      .updateTable('apiKeys')
      .set({ keyHash })
      .where('id', '=', row.id)
      .execute();

    return rawToken;
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
      ],
      // F1 fix (review 1) — the REAL `ApiKeyModule` (ApiKeyService +
      // ApiKeyRepo + its TokenModule/OrvexAuditModule deps), not a stub.
      // `JwtStrategy.validateApiKey` is the ONLY path that stamps a
      // `TokenScopeGrant` (ENG-1454) onto the resolved user; a stubbed
      // `ApiKeyService` made that path structurally unreachable from this
      // suite, so no test could ever exercise the token-scope-aware layer
      // `OrvexLlmsService` documents itself as composing.
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

    it('F1 — a TOKEN-SCOPED bearer whose grant excludes a space the caller IS a member of leaks zero bytes on the LISTING path (llms.txt/llms-full.txt/page.md), proving scope != membership', async () => {
      // The caller (userId) is made a full WRITER member of Space F1 below —
      // membership alone would make this page visible. Only the token's
      // own `scopes` allowlist (ENG-1454 TokenScopeGrant), stamped by the
      // REAL `JwtStrategy.validateApiKey` -> `ApiKeyService.validate` path,
      // must be what excludes it. This is the mutation the review (F1)
      // pointed at: neutering `SpaceAbilityFactory`'s `intersectWithTokenScope`
      // call would still pass every other AC2 assertion (they're satisfied
      // by membership), but MUST fail this one.
      const spaceF1 = await seedDb
        .insertInto('spaces')
        .values({
          name: 'Space F1 (member, scope-excluded)',
          slug: `eng-1492-space-f1-${Date.now()}`,
          workspaceId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await seedDb
        .insertInto('spaceMembers')
        .values({ userId, spaceId: spaceF1.id, role: SpaceRole.WRITER })
        .execute();

      const memberButScopedOut = await createPage({
        title: 'F1 member-but-scoped-out — must never leak',
        spaceId: spaceF1.id,
      });
      const inScope = await createPage({
        title: 'F1 in-scope page',
        spaceId: spaceIdA,
      });

      // spaceIdA only — spaceF1 is deliberately excluded from the grant.
      const scopedToken = await mintScopedApiKeyToken({
        creatorId: userId,
        wsId: workspaceId,
        scopes: [spaceIdA],
        readOnly: false,
      });

      const sitemap = await app.inject({
        method: 'GET',
        url: '/api/orvex/llms.txt',
        headers: { authorization: `Bearer ${scopedToken}` },
      });
      expect(sitemap.statusCode).toBe(200);
      // Positive control: the token still sees what its scope DOES cover —
      // rules out "everything 403s" masking the real assertion below.
      expect(sitemap.body).toContain(inScope.id);
      expect(sitemap.body).not.toContain(memberButScopedOut.id);
      expect(
        (sitemap.body.match(new RegExp(memberButScopedOut.title!, 'g')) ?? [])
          .length,
      ).toBe(0);

      const full = await app.inject({
        method: 'GET',
        url: '/api/orvex/llms-full.txt',
        headers: { authorization: `Bearer ${scopedToken}` },
      });
      expect(full.body).not.toContain(memberButScopedOut.title);

      const pageMd = await app.inject({
        method: 'GET',
        url: `/api/orvex/pages/${memberButScopedOut.id}/page.md`,
        headers: { authorization: `Bearer ${scopedToken}` },
      });
      expect([403, 404]).toContain(pageMd.statusCode);
    });
  });

  describe('AC1 — llms.txt sitemap cap', () => {
    it('F2 — caps the sitemap at 500 entries even when more pages are accessible', async () => {
      // A dedicated space so the count is exact and order-independent —
      // does not ride on how many pages earlier tests in this file left
      // behind in spaceIdA.
      const spaceCap = await seedDb
        .insertInto('spaces')
        .values({
          name: 'Space F2 (sitemap cap)',
          slug: `eng-1492-space-f2-${Date.now()}`,
          workspaceId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await seedDb
        .insertInto('spaceMembers')
        .values({ userId, spaceId: spaceCap.id, role: SpaceRole.WRITER })
        .execute();

      const rows = Array.from({ length: 501 }, (_v, i) => ({
        title: `F2 cap page ${i}`,
        spaceId: spaceCap.id,
        workspaceId,
        slugId: `eng-1492-f2cap-${i}-${Date.now()}`,
        creatorId: userId,
        lastUpdatedById: userId,
        content: DEFAULT_PAGE_DOC,
      }));
      await seedDb.insertInto('pages').values(rows).execute();

      const token = mintAccessToken(userId, workspaceId);
      const res = await app.inject({
        method: 'GET',
        url: '/api/orvex/llms.txt',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const entryCount = (res.body.match(/^- \[/gm) ?? []).length;
      // Exactly 500, not merely <=500 — proves the cap actually bit (501
      // were accessible) rather than the assertion being vacuously true.
      expect(entryCount).toBe(500);
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
      // F3 — a real page id so the third route's 404 is proven to come
      // from the flag guard, not from the (also-404) unknown-id branch.
      const page = await createPage({
        title: 'AC6 route-loop page',
        spaceId: spaceIdA,
      });
      delete process.env.ORVEX_MODULES_ENABLED;
      const token = mintAccessToken(userId, workspaceId);

      const routes = [
        '/api/orvex/llms.txt',
        '/api/orvex/llms-full.txt',
        `/api/orvex/pages/${page.id}/page.md`,
      ];
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
