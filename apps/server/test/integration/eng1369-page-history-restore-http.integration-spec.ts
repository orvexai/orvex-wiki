/**
 * ENG-1369 fix pass 1 (F1) — named DoD test:
 * `TestPageHistoryRestoreEndpoint_HttpContractAndAuth`
 *
 * The service-level suite (`eng1369-page-history-restore.integration-spec.ts`)
 * calls `PageHistoryService.restoreFromHistory` directly and never exercises
 * the controller, `JwtAuthGuard`, `PageAccessService.validateCanEdit`, or the
 * `RestorePageFromHistoryDto` — a broken wire-up (wrong service call, dropped
 * auth check, a DTO field typo) would sail through. This suite closes that
 * gap with REAL HTTP requests (fastify `app.inject`, same adapter as
 * `main.ts` — see `eng1384-health-probes.integration-spec.ts` for the
 * precedent) against a Nest app hosting the real `PageController` wired to
 * REAL `PageRepo` / `SpaceAbilityFactory` / `PageAccessService` /
 * `PageHistoryService` / `PageService` (collab-gateway hand-off faked, same
 * as the sibling suite) / `OrvexAuditService`, all against a REAL Postgres
 * (testcontainers, CS §5). Only the JWT SIGNATURE-VERIFICATION step itself is
 * substituted (a test-only guard that stamps `request.user`, exactly like
 * Nest's own testing guidance) — `validateCanEdit`'s authorization decision
 * is never bypassed, faked, or weakened.
 *
 * Contract note (F1b): the DoD's binary-gate text describes `PATCH /pages` +
 * `restoreFromHistoryId`. This codebase's `PageController` never uses PATCH
 * anywhere (every mutation — create/update/delete/restore/move/duplicate —
 * is a POST verb: `/pages/update`, `/pages/delete`, `/pages/restore`, etc.),
 * so `POST /pages/history/restore` matches the file's own established REST
 * convention (grouped under the existing `/pages/history*` sub-resource
 * alongside `/pages/history` and `/pages/history/info`) rather than
 * introducing the only PATCH verb in the controller. The DTO field is named
 * `historyId` to match the sibling `PageHistoryIdDto`/`/pages/history/info`
 * contract it extends. This test suite is what now proves that chosen,
 * shipped contract end-to-end over real HTTP.
 */
import {
  Test,
} from '@nestjs/testing';
import { ValidationPipe, ExecutionContext, CanActivate } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { Cache } from 'cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PageController } from 'src/core/page/page.controller';
import { PageService } from 'src/core/page/services/page.service';
import { BacklinkService } from 'src/core/page/services/backlink.service';
import { LabelService } from 'src/core/label/label.service';
import { OrvexPageProvenanceService } from 'src/core/page-provenance/orvex-page-provenance.service';
import { PageHistoryService } from 'src/core/page/services/page-history.service';
import { PageAccessService } from 'src/core/page/page-access/page-access.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from 'src/core/casl/abilities/space-ability.factory';
import { OrvexAuditService } from 'src/core/audit/orvex-audit.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { AUDIT_SERVICE } from 'src/integrations/audit/audit.service';
import { jsonToText, stampBlockIds } from 'src/collaboration/collaboration.util';
import { SpaceRole } from 'src/common/helpers/types/permission';
import {
  seedPage,
  seedSpace,
  seedSpaceMember,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

function fakeCache(): Cache {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      store.delete(key);
    },
  } as unknown as Cache;
}

describe('TestPageHistoryRestoreEndpoint_HttpContractAndAuth (ENG-1369 fix1 F1)', () => {
  jest.setTimeout(120_000);

  let testDb: TestDb;
  let app: NestFastifyApplication;
  let workspaceId: string;
  let spaceId: string;
  let currentAuth: { user: any; workspace: any } | null;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const db = testDb.db as any;

    const eventEmitter = new EventEmitter2();
    const groupRepo = new GroupRepo(db);
    const spaceRepo = new SpaceRepo(db, new EventEmitter2());
    const spaceMemberRepo = new SpaceMemberRepo(db, groupRepo, spaceRepo, fakeCache());
    const pageRepo = new PageRepo(
      db,
      spaceMemberRepo,
      eventEmitter,
      new OutboxWriter(db),
      { emitInvalidate: () => {} } as any,
    );
    const pagePermissionRepo = new PagePermissionRepo(db, groupRepo, fakeCache());
    const spaceAbility = new SpaceAbilityFactory(spaceMemberRepo);
    const pageAccessService = new PageAccessService(
      pagePermissionRepo,
      spaceAbility,
      spaceRepo,
    );
    const pageHistoryRepo = new PageHistoryRepo(db);
    const orvexAudit = new OrvexAuditService(db);

    // Only the collab-gateway hand-off is faked (real content persistence,
    // same convention as the sibling service-level suite) — everything else
    // in PageService is the real production class.
    const collaborationGatewayFake = {
      handleYjsEvent: async (
        _eventName: string,
        documentName: string,
        payload: { prosemirrorJson: any; operation: string; user: any },
      ) => {
        const pageId = documentName.replace(/^page\./, '');
        await pageRepo.updatePage(
          {
            content: payload.prosemirrorJson,
            textContent: jsonToText(payload.prosemirrorJson),
            lastUpdatedById: payload.user.id,
          },
          pageId,
        );
      },
    } as any;

    const pageService = new PageService(
      pageRepo,
      pagePermissionRepo,
      {} as any, // attachmentRepo — unused by updatePageContent
      db,
      {} as any, // storageService
      {} as any, // attachmentQueue
      {} as any, // aiQueue
      {} as any, // generalQueue
      eventEmitter,
      collaborationGatewayFake,
      {} as any, // watcherService
      {} as any, // transclusionService
      { record: async () => {} } as any, // idempotencyStore
    );

    const pageHistoryService = new PageHistoryService(
      pageHistoryRepo,
      pageRepo,
      pageService,
      orvexAudit,
      db,
    );

    // Test-only substitute for JWT signature verification (never for
    // `validateCanEdit`, which is the real, DB-backed class above). Mirrors
    // the request-shape `AuthUser`/`AuthWorkspace` decorators expect
    // (`request.user = { user, workspace }`), same as production's
    // `JwtStrategy.validate` output.
    class TestAuthGuard implements CanActivate {
      canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        if (!currentAuth) return false;
        request.user = { user: currentAuth.user, workspace: currentAuth.workspace };
        return true;
      }
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [PageController],
      providers: [
        { provide: PageService, useValue: pageService },
        { provide: PageRepo, useValue: pageRepo },
        { provide: PageHistoryService, useValue: pageHistoryService },
        { provide: SpaceAbilityFactory, useValue: spaceAbility },
        { provide: PageAccessService, useValue: pageAccessService },
        { provide: BacklinkService, useValue: {} },
        { provide: LabelService, useValue: {} },
        { provide: AUDIT_SERVICE, useValue: { log: () => {} } },
        { provide: OrvexPageProvenanceService, useValue: {} },
        { provide: 'KyselyModuleConnectionToken', useValue: db },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestAuthGuard())
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, stopAtFirstError: true, transform: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const space = await seedSpace(testDb.db, workspaceId, (await seedUser(testDb.db, workspaceId)).id);
    spaceId = space.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await testDb?.teardown();
  });

  afterEach(() => {
    currentAuth = null;
  });

  async function editorUser() {
    const user = await seedUser(testDb.db, workspaceId);
    await seedSpaceMember(testDb.db, { spaceId, userId: user.id, role: SpaceRole.WRITER });
    return user;
  }

  async function readerUser() {
    const user = await seedUser(testDb.db, workspaceId);
    await seedSpaceMember(testDb.db, { spaceId, userId: user.id, role: SpaceRole.READER });
    return user;
  }

  it('AC1/AC4 — POST /pages/history/restore returns 200 and the restored content, wired through the real controller+service', async () => {
    const user = await editorUser();
    const liveContent = stampBlockIds({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'http-live' }] }],
    }).content;
    const historicalContent = stampBlockIds({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'http-historical' }] }],
    }).content;

    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: user.id,
      position: 'h0',
      title: 'eng1369-http-p0',
      content: liveContent,
    });
    const history = await testDb.db
      .insertInto('pageHistory')
      .values({
        pageId: page.id,
        slugId: page.slugId,
        content: historicalContent as any,
        spaceId,
        workspaceId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    currentAuth = { user, workspace: { id: workspaceId } };

    const res = await app.inject({
      method: 'POST',
      url: '/pages/history/restore',
      payload: { pageId: page.id, historyId: history.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content).toEqual(historicalContent);
  });

  it('AC4 (negative, real HTTP) — a cross-page historyId returns HTTP 400 with body {error: INVALID_PAGE_HISTORY_REF}', async () => {
    const user = await editorUser();
    const pageA = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: user.id,
      position: 'h1',
      title: 'eng1369-http-pA',
      content: { type: 'doc', content: [] },
    });
    const pageB = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: user.id,
      position: 'h2',
      title: 'eng1369-http-pB',
      content: { type: 'doc', content: [] },
    });
    const historyForB = await testDb.db
      .insertInto('pageHistory')
      .values({
        pageId: pageB.id,
        slugId: pageB.slugId,
        content: { type: 'doc', content: [] } as any,
        spaceId,
        workspaceId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    currentAuth = { user, workspace: { id: workspaceId } };

    const res = await app.inject({
      method: 'POST',
      url: '/pages/history/restore',
      payload: { pageId: pageA.id, historyId: historyForB.id },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'INVALID_PAGE_HISTORY_REF' });
  });

  it("AC-auth (negative, real HTTP) — a space READER (no edit permission) is rejected with 403 by validateCanEdit, real restore never runs", async () => {
    const editor = await editorUser();
    const reader = await readerUser();
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: editor.id,
      position: 'h3',
      title: 'eng1369-http-p3',
      content: { type: 'doc', content: [] },
    });
    const history = await testDb.db
      .insertInto('pageHistory')
      .values({
        pageId: page.id,
        slugId: page.slugId,
        content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] } as any,
        spaceId,
        workspaceId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    currentAuth = { user: reader, workspace: { id: workspaceId } };

    const res = await app.inject({
      method: 'POST',
      url: '/pages/history/restore',
      payload: { pageId: page.id, historyId: history.id },
    });

    expect(res.statusCode).toBe(403);
  });

  it('Unauthenticated (real HTTP) — no request.user set by the auth guard is rejected before reaching the controller', async () => {
    currentAuth = null;

    const res = await app.inject({
      method: 'POST',
      url: '/pages/history/restore',
      payload: { pageId: 'does-not-matter', historyId: 'does-not-matter' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('DTO validation (real HTTP) — a missing pageId is rejected 400 by RestorePageFromHistoryDto before the controller runs', async () => {
    const user = await editorUser();
    currentAuth = { user, workspace: { id: workspaceId } };

    const res = await app.inject({
      method: 'POST',
      url: '/pages/history/restore',
      payload: { historyId: 'not-a-real-history-id' },
    });

    expect(res.statusCode).toBe(400);
  });
});
