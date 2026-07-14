import * as path from 'path';
import { promises as fs } from 'fs';
import * as jwt from 'jsonwebtoken';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Global, Module, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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

import { PermissionsModule } from './permissions.module';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import { WsService } from '../../ws/ws.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { SessionActivityService } from '../session/session-activity.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { ApiKeyService } from '../api-key/api-key.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { UserRole, SpaceRole } from '../../common/helpers/types/permission';
import { TransformHttpResponseInterceptor } from '../../common/interceptors/http-response.interceptor';
import type { DB } from '@docmost/db/types/db';

/**
 * ENG-1596 — `TestPagePermissionsController_ListAndRestrictionInfoReads`,
 * the named binary DoD gate. Full black-box HTTP contract for the two new
 * page-permissions reads, driven through the real Nest module + a real
 * Kysely on a testcontainers Postgres (no mocking of the service, the
 * repo, or the guard — CS §5, ❌#4). Only `UserSessionRepo`/
 * `SessionActivityService`/`ApiKeyService` are no-op doubles (unreached:
 * no test JWT below carries a `sessionId` or is an api-key token).
 */
describe('TestPagePermissionsController_ListAndRestrictionInfoReads', () => {
  jest.setTimeout(120_000);

  const TEST_APP_SECRET = 'eng-1596-test-secret-at-least-32-characters-long';

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let seedDb: Kysely<DB>;
  let app: NestFastifyApplication;

  let workspaceId: string;
  let adminId: string;
  let writerId: string;
  let outsiderId: string;
  let spaceId: string;

  const signAccess = (sub: string, ws: string): string =>
    jwt.sign(
      { sub, email: 'user@example.com', workspaceId: ws, type: 'access' },
      TEST_APP_SECRET,
    );

  const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

  /**
   * AC9 — unwraps the global `TransformHttpResponseInterceptor` envelope
   * (`{ data, success, status }`, prod-registered in main.ts on every
   * response neither read opts out of via `@SkipTransform`) and asserts
   * its shape, so every assertion below exercises the actual wrapped
   * contract the ENG-1375 client consumes, not a bare body.
   */
  function unwrap(res: { statusCode: number; body: string }): any {
    const envelope = JSON.parse(res.body);
    expect(envelope).toEqual(
      expect.objectContaining({ success: true, status: res.statusCode }),
    );
    expect(envelope.data).toBeDefined();
    return envelope.data;
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

    const stubCache = {
      get: async () => undefined,
      set: async () => {},
      del: async () => {},
    };

    @Global()
    @Module({
      providers: [
        UserRepo,
        WorkspaceRepo,
        GroupRepo,
        SpaceRepo,
        SpaceMemberRepo,
        PageRepo,
        PagePermissionRepo,
        OutboxWriter,
        WsService,
        SpaceAbilityFactory,
        JwtStrategy,
        { provide: CACHE_MANAGER, useValue: stubCache },
        {
          provide: EnvironmentService,
          useValue: {
            getAppSecret: () => TEST_APP_SECRET,
            getJwtTokenExpiresIn: () => '30d',
            isCloud: () => false,
            isHttps: () => false,
            getSubdomainHost: () => 'example.com',
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
        GroupRepo,
        SpaceRepo,
        SpaceMemberRepo,
        PageRepo,
        PagePermissionRepo,
        OutboxWriter,
        WsService,
        SpaceAbilityFactory,
        JwtStrategy,
        CACHE_MANAGER,
        EnvironmentService,
        UserSessionRepo,
        SessionActivityService,
        ApiKeyService,
      ],
      imports: [PermissionsModule],
    })
    class TestSupportModule {}

    const built = await Test.createTestingModule({
      imports: [
        KyselyModule.forRoot({
          dialect: new PostgresJSDialect({ postgres: sqlClient }),
          plugins: [new CamelCasePlugin()],
        }),
        EventEmitterModule.forRoot(),
        TestSupportModule,
        PermissionsModule,
      ],
    }).compile();

    app = built.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, stopAtFirstError: true, transform: true }),
    );
    // AC9 — register the SAME global response envelope prod uses
    // (main.ts registers this on every request; neither read sets
    // @SkipTransform), so this DoD test exercises the actual wrapped
    // {data, success, status} shape the ENG-1375 client consumes.
    app.useGlobalInterceptors(
      new TransformHttpResponseInterceptor(app.get(Reflector)),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const ws = await seedDb
      .insertInto('workspaces')
      .values({ name: 'ENG-1596 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const admin = await seedDb
      .insertInto('users')
      .values({
        email: 'admin@example.com',
        workspaceId,
        role: UserRole.MEMBER,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    adminId = admin.id;

    const writer = await seedDb
      .insertInto('users')
      .values({
        email: 'writer@example.com',
        workspaceId,
        role: UserRole.MEMBER,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    writerId = writer.id;

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

    await seedDb
      .insertInto('spaceMembers')
      .values([
        { userId: adminId, spaceId, role: SpaceRole.ADMIN },
        { userId: writerId, spaceId, role: SpaceRole.WRITER },
      ])
      .execute();
  });

  afterAll(async () => {
    await app?.close();
    await seedDb?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  async function seedPage(opts: { parentPageId?: string; title: string }) {
    const page = await seedDb
      .insertInto('pages')
      .values({
        slugId: Math.random().toString(36).slice(2),
        title: opts.title,
        spaceId,
        workspaceId,
        creatorId: adminId,
        parentPageId: opts.parentPageId ?? null,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return page.id;
  }

  async function restrictPage(pageId: string) {
    const pageAccess = await seedDb
      .insertInto('pageAccess')
      .values({
        pageId,
        workspaceId,
        spaceId,
        accessLevel: 'restricted',
        creatorId: adminId,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return pageAccess.id;
  }

  async function grant(
    pageAccessId: string,
    principal: { userId?: string; groupId?: string },
    role: 'reader' | 'writer',
  ) {
    await seedDb
      .insertInto('pagePermissions')
      .values({
        pageAccessId,
        userId: principal.userId ?? null,
        groupId: principal.groupId ?? null,
        role,
        addedById: adminId,
      })
      .execute();
  }

  describe('list-permissions read', () => {
    it('AC1 — returns exactly the N seeded grants with principal + role', async () => {
      const pageId = await seedPage({ title: 'AC1 page' });
      const pageAccessId = await restrictPage(pageId);
      await grant(pageAccessId, { userId: adminId }, 'writer');
      await grant(pageAccessId, { userId: writerId }, 'reader');

      const res = await app.inject({
        method: 'POST',
        url: '/api/page-permissions/list',
        headers: authHeader(signAccess(adminId, workspaceId)),
        payload: { pageId },
      });

      expect(res.statusCode).toBe(200);
      const body = unwrap(res);
      expect(body.items).toHaveLength(2);
      expect(body.meta).toBeDefined();
      const ids = body.items.map((i: any) => i.id).sort();
      expect(ids).toEqual([adminId, writerId].sort());
      for (const item of body.items) {
        expect(item.role).toEqual(expect.any(String));
        expect(['reader', 'writer']).toContain(item.role);
      }
    });

    it('AC8 — an unrestricted page returns an empty list (200), not an error', async () => {
      const pageId = await seedPage({ title: 'AC8 unrestricted page' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/page-permissions/list',
        headers: authHeader(signAccess(adminId, workspaceId)),
        payload: { pageId },
      });

      expect(res.statusCode).toBe(200);
      const body = unwrap(res);
      expect(body.items).toEqual([]);
    });

    it('AC7 — a caller without manage access is rejected (fail-closed), never returns the ACL', async () => {
      const pageId = await seedPage({ title: 'AC7 list page' });
      const pageAccessId = await restrictPage(pageId);
      await grant(pageAccessId, { userId: adminId }, 'writer');

      const res = await app.inject({
        method: 'POST',
        url: '/api/page-permissions/list',
        headers: authHeader(signAccess(outsiderId, workspaceId)),
        payload: { pageId },
      });

      expect([403, 404]).toContain(res.statusCode);
      expect(res.body).not.toContain(adminId);
    });
  });

  describe('restriction-info read', () => {
    it('AC2 — hasDirectRestriction=true for a directly restricted page', async () => {
      const pageId = await seedPage({ title: 'AC2 direct page' });
      const pageAccessId = await restrictPage(pageId);
      await grant(pageAccessId, { userId: adminId }, 'writer');

      const res = await app.inject({
        method: 'POST',
        url: '/api/page-permissions/restriction-info',
        headers: authHeader(signAccess(adminId, workspaceId)),
        payload: { pageId },
      });

      expect(res.statusCode).toBe(200);
      const body = unwrap(res);
      expect(body.hasDirectRestriction).toBe(true);
      expect(body.hasInheritedRestriction).toBe(false);
      expect(body.inheritedFrom).toBeNull();
    });

    it('AC3 — hasInheritedRestriction=true and inheritedFrom is the restricted ancestor id', async () => {
      const ancestorId = await seedPage({ title: 'AC3 ancestor' });
      const ancestorAccessId = await restrictPage(ancestorId);
      await grant(ancestorAccessId, { userId: adminId }, 'writer');
      const childId = await seedPage({
        title: 'AC3 child',
        parentPageId: ancestorId,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/page-permissions/restriction-info',
        headers: authHeader(signAccess(adminId, workspaceId)),
        payload: { pageId: childId },
      });

      expect(res.statusCode).toBe(200);
      const body = unwrap(res);
      expect(body.hasDirectRestriction).toBe(false);
      expect(body.hasInheritedRestriction).toBe(true);
      expect(body.inheritedFrom).toEqual(ancestorId);
    });

    it('AC4 — userAccess reflects the seeded grant effective level for the caller', async () => {
      // Two independent restricted pages, same caller (adminId, the only
      // principal allowed through the read guard), different seeded role —
      // isolates userAccess to the grant, not the caller's identity.
      const writerPageId = await seedPage({ title: 'AC4 writer page' });
      const writerPageAccessId = await restrictPage(writerPageId);
      await grant(writerPageAccessId, { userId: adminId }, 'writer');

      const readerPageId = await seedPage({ title: 'AC4 reader page' });
      const readerPageAccessId = await restrictPage(readerPageId);
      await grant(readerPageAccessId, { userId: adminId }, 'reader');

      const writerRes = await app.inject({
        method: 'POST',
        url: '/api/page-permissions/restriction-info',
        headers: authHeader(signAccess(adminId, workspaceId)),
        payload: { pageId: writerPageId },
      });
      expect(unwrap(writerRes).userAccess).toEqual({
        canAccess: true,
        canEdit: true,
      });

      const readerRes = await app.inject({
        method: 'POST',
        url: '/api/page-permissions/restriction-info',
        headers: authHeader(signAccess(adminId, workspaceId)),
        payload: { pageId: readerPageId },
      });
      expect(unwrap(readerRes).userAccess).toEqual({
        canAccess: true,
        canEdit: false,
      });
    });

    it('AC8 — an unrestricted page returns all-false with inheritedFrom=null', async () => {
      const pageId = await seedPage({ title: 'AC8 restriction-info page' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/page-permissions/restriction-info',
        headers: authHeader(signAccess(adminId, workspaceId)),
        payload: { pageId },
      });

      expect(res.statusCode).toBe(200);
      const body = unwrap(res);
      expect(body.hasDirectRestriction).toBe(false);
      expect(body.hasInheritedRestriction).toBe(false);
      expect(body.inheritedFrom).toBeNull();
      expect(body.userAccess).toEqual({ canAccess: true, canEdit: true });
    });

    it('AC7 — a caller without manage access is rejected (fail-closed), never returns ACL shape', async () => {
      const pageId = await seedPage({ title: 'AC7 restriction-info page' });
      const pageAccessId = await restrictPage(pageId);
      await grant(pageAccessId, { userId: adminId }, 'writer');

      const res = await app.inject({
        method: 'POST',
        url: '/api/page-permissions/restriction-info',
        headers: authHeader(signAccess(outsiderId, workspaceId)),
        payload: { pageId },
      });

      expect([403, 404]).toContain(res.statusCode);
    });
  });
});
