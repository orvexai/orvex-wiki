// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import { promises as fs } from 'fs';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
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

import { InternalApiModule } from './internal-api.module';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { PageAccessService } from '../page/page-access/page-access.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { DomainService } from '../../integrations/environment/domain.service';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import { WsService } from '../../ws/ws.service';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { UserRole, SpaceRole } from '../../common/helpers/types/permission';
import type { DB } from '@docmost/db/types/db';

/**
 * TestInternalACLExportResolveAISearchSurface (ENG-1957 AC6) — the named
 * binary DoD gate. Full black-box HTTP contract for all four
 * `/internal/*` routes, driven through the real Nest module + a real
 * Kysely on a testcontainers Postgres, exercising the REAL
 * `PageAccessService`/`SpaceAbilityFactory`/`PagePermissionRepo`
 * authorization primitives (CS §11 ALL-REAL, §5 mock-only-true-externals —
 * nothing here is mocked; `StorageService` is a no-op double because no
 * test exercises `includeAttachments`, the one leg that would reach it).
 */
describe('TestInternalACLExportResolveAISearchSurface', () => {
  jest.setTimeout(120_000);

  const BEARER_TOKEN = 'eng-1957-test-internal-bearer-token';

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let seedDb: Kysely<DB>;
  let app: NestFastifyApplication;

  let workspaceId: string;
  let otherWorkspaceId: string;
  let memberId: string;
  let readerId: string;
  let outsiderId: string;
  let spaceId: string;

  const authHeaders = (bearer = BEARER_TOKEN) => ({
    authorization: `Bearer ${bearer}`,
  });

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

    const stubCache = {
      get: async () => undefined,
      set: async () => {},
      del: async () => {},
    };

    @Global()
    @Module({
      providers: [
        PageRepo,
        SpaceRepo,
        SpaceMemberRepo,
        GroupRepo,
        WorkspaceRepo,
        PagePermissionRepo,
        SpaceAbilityFactory,
        PageAccessService,
        OutboxWriter,
        WsService,
        { provide: CACHE_MANAGER, useValue: stubCache },
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => 'eng-1957-test-secret-at-least-32-characters',
            getJwtTokenExpiresIn: () => '30d',
            isCloud: () => false,
            isSelfHosted: () => false,
            isHttps: () => false,
            getSubdomainHost: () => 'example.com',
            getAppUrl: () => 'http://localhost:3000',
          },
        },
        DomainService,
        {
          provide: StorageService,
          useValue: { read: async () => Buffer.from('') },
        },
        // ExportModule's ExportController (unused by this test, but
        // pulled in transitively via InternalApiModule's `imports:
        // [ExportModule]`) needs AUDIT_SERVICE — a no-op double is
        // correct here since no test exercises that controller.
        { provide: AUDIT_SERVICE, useValue: { log: () => {} } },
      ],
      exports: [
        PageRepo,
        SpaceRepo,
        SpaceMemberRepo,
        GroupRepo,
        WorkspaceRepo,
        PagePermissionRepo,
        SpaceAbilityFactory,
        PageAccessService,
        OutboxWriter,
        WsService,
        CACHE_MANAGER,
        EnvironmentService,
        DomainService,
        StorageService,
        AUDIT_SERVICE,
      ],
    })
    class TestSupportModule {}

    process.env.INTERNAL_API_BEARER_TOKEN = BEARER_TOKEN;

    const built = await Test.createTestingModule({
      imports: [
        KyselyModule.forRoot({
          dialect: new PostgresJSDialect({ postgres: sqlClient }),
          plugins: [new CamelCasePlugin()],
        }),
        EventEmitterModule.forRoot(),
        TestSupportModule,
        InternalApiModule,
      ],
    }).compile();

    app = built.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const ws = await seedDb
      .insertInto('workspaces')
      .values({ name: 'ENG-1957 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const otherWs = await seedDb
      .insertInto('workspaces')
      .values({ name: 'ENG-1957 Other Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    otherWorkspaceId = otherWs.id;

    const member = await seedDb
      .insertInto('users')
      .values({
        email: 'member@example.com',
        workspaceId,
        role: UserRole.MEMBER,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    memberId = member.id;

    const reader = await seedDb
      .insertInto('users')
      .values({
        email: 'reader@example.com',
        workspaceId,
        role: UserRole.MEMBER,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    readerId = reader.id;

    const outsider = await seedDb
      .insertInto('users')
      .values({
        email: 'outsider@example.com',
        workspaceId,
        role: UserRole.MEMBER,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    outsiderId = outsider.id;

    const space = await seedDb
      .insertInto('spaces')
      .values({ name: 'Space', slug: 'space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;

    // outsiderId is deliberately NOT added as a space member (AC1's
    // "not-a-space-member" leg); readerId IS a space member but holds no
    // page-level grant on restricted pages (AC2/AC3's "authenticated
    // space member, still forbidden by page ACL" leg).
    await seedDb
      .insertInto('spaceMembers')
      .values([
        { userId: memberId, spaceId, role: SpaceRole.WRITER },
        { userId: readerId, spaceId, role: SpaceRole.READER },
      ])
      .execute();

    await seedDb
      .updateTable('workspaces')
      .set({ settings: { ai: { search: true } } as any })
      .where('id', '=', workspaceId)
      .execute();
  });

  afterAll(async () => {
    delete process.env.INTERNAL_API_BEARER_TOKEN;
    await app?.close();
    await seedDb?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  async function seedPage(opts: { title: string; content?: string }) {
    const page = await seedDb
      .insertInto('pages')
      .values({
        slugId: Math.random().toString(36).slice(2),
        title: opts.title,
        spaceId,
        workspaceId,
        creatorId: memberId,
        content: (opts.content
          ? {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: opts.content }],
                },
              ],
            }
          : null) as any,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return page.id as string;
  }

  async function restrictPage(pageId: string) {
    const pageAccess = await seedDb
      .insertInto('pageAccess')
      .values({
        pageId,
        workspaceId,
        spaceId,
        accessLevel: 'restricted',
        creatorId: memberId,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return pageAccess.id as string;
  }

  describe('AC1 — POST /internal/acl/filter', () => {
    it('denies (401) with no/invalid bearer', async () => {
      const pageId = await seedPage({ title: 'AC1 page' });
      const res = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        payload: { workspaceId, userId: memberId, pageIds: [pageId] },
      });
      expect(res.statusCode).toBe(401);

      const resBadToken = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        headers: authHeaders('wrong-token'),
        payload: { workspaceId, userId: memberId, pageIds: [pageId] },
      });
      expect(resBadToken.statusCode).toBe(401);
    });

    it('returns exactly the readable subset — unrestricted page readable, restricted page excluded for a non-permitted user', async () => {
      const openPageId = await seedPage({ title: 'AC1 open page' });
      const restrictedPageId = await seedPage({ title: 'AC1 restricted page' });
      await restrictPage(restrictedPageId);
      // memberId has NO explicit grant on the restricted page's pageAccess
      // row, so it is excluded even though they're a space writer.

      const res = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        headers: authHeaders(),
        payload: {
          workspaceId,
          userId: memberId,
          pageIds: [openPageId, restrictedPageId],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.pageIds).toEqual([openPageId]);
    });

    it('excludes pages from a foreign workspace (tenant isolation)', async () => {
      const otherWsPage = await seedDb
        .insertInto('pages')
        .values({
          slugId: 'foreign-page',
          title: 'Foreign workspace page',
          spaceId,
          workspaceId: otherWorkspaceId,
          creatorId: memberId,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const res = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        headers: authHeaders(),
        payload: {
          workspaceId,
          userId: memberId,
          pageIds: [otherWsPage.id],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).pageIds).toEqual([]);
    });

    it('excludes every page for a user who is not a space member', async () => {
      const pageId = await seedPage({ title: 'AC1 non-member page' });
      const res = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        headers: authHeaders(),
        payload: { workspaceId, userId: outsiderId, pageIds: [pageId] },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).pageIds).toEqual([]);
    });
  });

  describe('AC2 — GET /internal/pages/{id}/export', () => {
    it('denies (401) with no bearer', async () => {
      const pageId = await seedPage({ title: 'AC2 page', content: 'hello' });
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${pageId}/export?workspaceId=${workspaceId}&userId=${memberId}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns canonical content with a non-text/html Content-Type for an authorized caller', async () => {
      const pageId = await seedPage({
        title: 'AC2 exported page',
        content: 'exported body text',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${pageId}/export?workspaceId=${workspaceId}&userId=${memberId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).not.toMatch(/text\/html/);
      expect(res.body).toContain('AC2 exported page');
      expect(res.body).toContain('exported body text');
    });

    it('returns a typed 404 for an absent page id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/00000000-0000-4000-8000-000000000000/export?workspaceId=${workspaceId}&userId=${memberId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns a typed 403 for a space member with no page-level grant on a restricted page', async () => {
      const pageId = await seedPage({ title: 'AC2 forbidden page' });
      await restrictPage(pageId);
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${pageId}/export?workspaceId=${workspaceId}&userId=${readerId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('AC3 — GET /internal/pages/{id}/resolve', () => {
    it('returns page/space/tenant/ACL metadata sufficient for an admission decision', async () => {
      const pageId = await seedPage({ title: 'AC3 page' });
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${pageId}/resolve?workspaceId=${workspaceId}&userId=${memberId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({
        pageId,
        spaceId,
        spaceSlug: 'space',
        workspaceId,
        canEdit: true,
        hasRestriction: false,
      });
    });

    it('denies (403) resolving a restricted page the caller has no page-level grant on', async () => {
      const pageId = await seedPage({ title: 'AC3 forbidden page' });
      await restrictPage(pageId);
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${pageId}/resolve?workspaceId=${workspaceId}&userId=${readerId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('AC4 — GET /internal/settings/ai-search', () => {
    it('returns the workspace AI-search opt-in flag', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/internal/settings/ai-search?workspaceId=${workspaceId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({
        workspaceId,
        aiSearchEnabled: true,
      });
    });

    it('returns false for a workspace with no ai settings configured', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/internal/settings/ai-search?workspaceId=${otherWorkspaceId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({
        workspaceId: otherWorkspaceId,
        aiSearchEnabled: false,
      });
    });
  });

  describe('AC5 — internal-only, not reachable from the public /api surface', () => {
    it('the route is registered outside /api (no /api prefix applied in this harness reflects prod exclude config)', async () => {
      // Prod-parity is asserted structurally by
      // orvex-global-prefix-exclude.spec.ts's UPSTREAM_GLOBAL_PREFIX_EXCLUDE
      // coverage of 'internal/(.*)' — this harness (no global prefix
      // applied) confirms the routes exist at the bare `/internal/*` path
      // this exclude pattern targets.
      const res = await app.inject({
        method: 'GET',
        url: `/internal/settings/ai-search?workspaceId=${workspaceId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
