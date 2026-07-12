// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import { promises as fs } from 'fs';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Global, Module, ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TransformHttpResponseInterceptor } from '../../common/interceptors/http-response.interceptor';
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
import { UserRepo } from '@docmost/db/repos/user/user.repo';
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
 * TestInternalACLExportResolveAISearchSurface (ENG-1957 AC6; ENG-1559
 * principal-resolution) — the named binary DoD gate. Full black-box HTTP
 * contract for all four `/internal/*` routes, driven through the real Nest
 * module + a real Kysely on a testcontainers Postgres, exercising the REAL
 * `PageAccessService`/`SpaceAbilityFactory`/`PagePermissionRepo` authorization
 * primitives AND the REAL `auth_accounts` subject->user resolution (CS §11
 * ALL-REAL, §5 mock-only-true-externals — nothing here is mocked;
 * `StorageService` is a no-op double because no test exercises
 * `includeAttachments`, the one leg that would reach it).
 *
 * RULED CONTRACT (ENG-1559, fork (a)): the wire surface is the IdP-agnostic
 * principal — `{subject, tenant, page_ids}` on `acl/filter`, `?tenant=` on the
 * workspace-scoped reads — resolved server-side. `subject` -> user via
 * `auth_accounts`; `tenant` IS the workspace UUID. `export`/`resolve` are the
 * workspace-scoped indexer plane (no per-user ACL; tenant isolation preserved).
 */
describe('TestInternalACLExportResolveAISearchSurface', () => {
  jest.setTimeout(120_000);

  const BEARER_TOKEN = 'eng-1957-test-internal-bearer-token';

  // IdP subjects (opaque provider `sub`), linked to users via auth_accounts.
  const SUBJECT_MEMBER = 'idp-subject-member';
  const SUBJECT_READER = 'idp-subject-reader';
  const SUBJECT_OUTSIDER = 'idp-subject-outsider';
  const SUBJECT_UNLINKED = 'idp-subject-unlinked'; // no auth_accounts row

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
        UserRepo,
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
        // ExportModule's ExportController (unused by this test, but pulled in
        // transitively via InternalApiModule's `imports: [ExportModule]`)
        // needs AUDIT_SERVICE — a no-op double is correct here since no test
        // exercises that controller.
        { provide: AUDIT_SERVICE, useValue: { log: () => {} } },
      ],
      exports: [
        PageRepo,
        SpaceRepo,
        SpaceMemberRepo,
        GroupRepo,
        WorkspaceRepo,
        UserRepo,
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
    // Mirror production's global pipe (main.ts) so the DTO contract — tenant
    // IsUUID, subject a plain string, page_ids each UUID — is enforced here
    // exactly as it is live (a non-UUID tenant -> 400, never a raw 500).
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        stopAtFirstError: true,
        transform: true,
      }),
    );
    // Mirror production's global response interceptor (main.ts) so the harness
    // proves the ACTUAL wire body the consumer decodes. Every /internal/*
    // handler must opt out of the {data,success,status} envelope via
    // @SkipTransform — without it the consumer decodes {allowed}/{text_repr}/…
    // off {data:{…}} and gets empty (fail-closed for the whole seam). With the
    // interceptor live here, that regression would fail these bare-shape asserts.
    app.useGlobalInterceptors(
      new TransformHttpResponseInterceptor(app.get(Reflector)),
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

    // Subject->user SSO linkage (the ruled engine-side resolution seam). A real
    // Clerk/OIDC login writes exactly these rows at provisioning time; the gate
    // seeds them so the engine can resolve the IdP subject internally.
    await seedDb
      .insertInto('authAccounts')
      .values([
        { userId: memberId, providerUserId: SUBJECT_MEMBER, workspaceId },
        { userId: readerId, providerUserId: SUBJECT_READER, workspaceId },
        { userId: outsiderId, providerUserId: SUBJECT_OUTSIDER, workspaceId },
      ])
      .execute();

    const space = await seedDb
      .insertInto('spaces')
      .values({ name: 'Space', slug: 'space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;

    // outsiderId is deliberately NOT added as a space member (AC1's
    // "not-a-space-member" leg); readerId IS a space member but holds no
    // page-level grant on restricted pages (AC1's "authenticated space member,
    // still forbidden by page ACL" leg).
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

  describe('AC1 — POST /internal/acl/filter ({subject,tenant,page_ids} -> {allowed})', () => {
    it('denies (401) with no/invalid bearer', async () => {
      const pageId = await seedPage({ title: 'AC1 page' });
      const res = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        payload: {
          subject: SUBJECT_MEMBER,
          tenant: workspaceId,
          page_ids: [pageId],
        },
      });
      expect(res.statusCode).toBe(401);

      const resBadToken = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        headers: authHeaders('wrong-token'),
        payload: {
          subject: SUBJECT_MEMBER,
          tenant: workspaceId,
          page_ids: [pageId],
        },
      });
      expect(resBadToken.statusCode).toBe(401);
    });

    it('resolves the subject and returns exactly the readable subset — unrestricted readable, restricted excluded for a non-permitted user', async () => {
      const openPageId = await seedPage({ title: 'AC1 open page' });
      const restrictedPageId = await seedPage({ title: 'AC1 restricted page' });
      await restrictPage(restrictedPageId);
      // memberId has NO explicit grant on the restricted page's pageAccess row,
      // so it is excluded even though they are a space writer.

      const res = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        headers: authHeaders(),
        payload: {
          subject: SUBJECT_MEMBER,
          tenant: workspaceId,
          page_ids: [openPageId, restrictedPageId],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.allowed).toEqual([openPageId]);
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
          subject: SUBJECT_MEMBER,
          tenant: workspaceId,
          page_ids: [otherWsPage.id],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).allowed).toEqual([]);
    });

    it('excludes every page for a resolved user who is not a space member', async () => {
      const pageId = await seedPage({ title: 'AC1 non-member page' });
      const res = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        headers: authHeaders(),
        payload: {
          subject: SUBJECT_OUTSIDER,
          tenant: workspaceId,
          page_ids: [pageId],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).allowed).toEqual([]);
    });

    it('fails closed (empty allow-set) for a subject with no auth_accounts linkage in the tenant', async () => {
      const pageId = await seedPage({ title: 'AC1 unlinked-subject page' });
      const res = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        headers: authHeaders(),
        payload: {
          subject: SUBJECT_UNLINKED,
          tenant: workspaceId,
          page_ids: [pageId],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).allowed).toEqual([]);
    });

    it('rejects a non-UUID tenant (400) — tenant IS the workspace UUID', async () => {
      const pageId = await seedPage({ title: 'AC1 bad-tenant page' });
      const res = await app.inject({
        method: 'POST',
        url: '/internal/acl/filter',
        headers: authHeaders(),
        payload: {
          subject: SUBJECT_MEMBER,
          tenant: 'not-a-uuid',
          page_ids: [pageId],
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('AC2 — GET /internal/pages/{id}/export?tenant= -> {text_repr}', () => {
    it('denies (401) with no bearer', async () => {
      const pageId = await seedPage({ title: 'AC2 page', content: 'hello' });
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${pageId}/export?tenant=${workspaceId}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns {text_repr} (non-text/html) with the page content for the indexer plane', async () => {
      const pageId = await seedPage({
        title: 'AC2 exported page',
        content: 'exported body text',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${pageId}/export?tenant=${workspaceId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).not.toMatch(/text\/html/);
      const body = JSON.parse(res.body);
      expect(typeof body.text_repr).toBe('string');
      expect(body.text_repr).toContain('AC2 exported page');
      expect(body.text_repr).toContain('exported body text');
    });

    it('is workspace-scoped: a restricted page still exports (per-user ACL is at query egress, not the indexer plane)', async () => {
      const pageId = await seedPage({
        title: 'AC2 restricted page',
        content: 'restricted body indexed for permitted users',
      });
      await restrictPage(pageId);

      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${pageId}/export?tenant=${workspaceId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).text_repr).toContain(
        'restricted body indexed for permitted users',
      );
    });

    it('returns a typed 404 for an absent page id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/00000000-0000-4000-8000-000000000000/export?tenant=${workspaceId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns a typed 404 for a page in a foreign tenant (tenant isolation)', async () => {
      const foreign = await seedDb
        .insertInto('pages')
        .values({
          slugId: 'ac2-foreign-page',
          title: 'AC2 foreign page',
          spaceId,
          workspaceId: otherWorkspaceId,
          creatorId: memberId,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${foreign.id}/export?tenant=${workspaceId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('AC3 — GET /internal/pages/{id}/resolve?tenant= -> {title, content}', () => {
    it('returns the page title + raw ProseMirror document', async () => {
      const pageId = await seedPage({
        title: 'AC3 page',
        content: 'resolve body text',
      });
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${pageId}/resolve?tenant=${workspaceId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.title).toBe('AC3 page');
      expect(body.content).toMatchObject({ type: 'doc' });
      expect(JSON.stringify(body.content)).toContain('resolve body text');
    });

    it('returns a typed 404 for a page in a foreign tenant (tenant isolation)', async () => {
      const foreign = await seedDb
        .insertInto('pages')
        .values({
          slugId: 'ac3-foreign-page',
          title: 'AC3 foreign page',
          spaceId,
          workspaceId: otherWorkspaceId,
          creatorId: memberId,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      const res = await app.inject({
        method: 'GET',
        url: `/internal/pages/${foreign.id}/resolve?tenant=${workspaceId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('AC4 — GET /internal/settings/ai-search?tenant= -> {enabled}', () => {
    it('returns the workspace AI-search opt-in flag', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/internal/settings/ai-search?tenant=${workspaceId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ enabled: true });
    });

    it('returns false for a workspace with no ai settings configured', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/internal/settings/ai-search?tenant=${otherWorkspaceId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ enabled: false });
    });
  });

  describe('AC5 — internal-only, not reachable from the public /api surface', () => {
    it('the route is registered outside /api (no /api prefix applied in this harness reflects prod exclude config)', async () => {
      // Prod-parity is asserted structurally by
      // orvex-global-prefix-exclude.spec.ts's UPSTREAM_GLOBAL_PREFIX_EXCLUDE
      // coverage of 'internal/(.*)' — this harness (no global prefix applied)
      // confirms the routes exist at the bare `/internal/*` path this exclude
      // pattern targets.
      const res = await app.inject({
        method: 'GET',
        url: `/internal/settings/ai-search?tenant=${workspaceId}`,
        headers: authHeaders(),
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
