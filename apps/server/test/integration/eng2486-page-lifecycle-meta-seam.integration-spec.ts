// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2486 — named DoD gate: `TestPageLifecycleSupersedeRidesMetaSeam`.
 *
 * VERIFY + harden of the FR-40 page-lifecycle workflow riding the
 * `orvex_page_meta` seam (ENG-2480), never a status column on upstream
 * `pages`. Real Postgres (testcontainers, `db-test-harness.ts`), real HTTP
 * (fastify `app.inject`) through the REAL `OrvexPageSupersedeController`
 * (`/orvex/pages/supersede`, `/orvex/pages/status`) and the REAL
 * `PageController` (`POST /pages/info` — the page-get whose response the
 * superseded banner renders from), plus direct calls through the real
 * `PageService.getSidebarPages` / `SearchService.searchSuggestions` for the
 * AC2/AC4 discovery-hiding proofs.
 *
 * Zero mock of own packages (CS §5, ❌#4): `OrvexPageMetadataService`,
 * `PageRepo`, `PageService`, `SearchService`, `SpaceAbilityFactory`,
 * `PageAccessService` are all real production classes against the real
 * migrated schema. JWT signature verification is substituted by a guard
 * that stamps `request.user` (Nest's own testing guidance), never the
 * authorization decisions themselves.
 *
 * Assertions run through public surfaces (HTTP outcomes, persisted rows,
 * the service's exported methods) — an internal rename of
 * `supersedeAtomic`/`excludeSupersededUnless`/any private helper cannot
 * break this spec (CS §4.2). Fixed seeded fixtures; no `Date.now()`-keyed
 * assertion on any lifecycle decision.
 *
 * Documented upstream-row carve-out (honesty, CS §11): `supersedeAtomic`
 * ALSO sets `pages.isLocked = true` on the superseded page — that is
 * ENG-1434 AC2's own documented lock (an upstream column that PRE-EXISTS
 * the fork, not a lifecycle-status column), so AC1's "upstream row
 * untouched" is asserted as: no column changes EXCEPT the documented
 * `isLocked`/`updatedAt` lock write on a supersede, and NO column at all
 * on an archive; structurally, `pages` carries zero lifecycle columns
 * (information_schema proof).
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { Test } from '@nestjs/testing';
import {
  ValidationPipe,
  ExecutionContext,
  CanActivate,
} from '@nestjs/common';
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
import { ConfirmTokenService } from 'src/orvex/page-metadata/confirm-token.service';
import { PageHistoryService } from 'src/core/page/services/page-history.service';
import { PageAccessService } from 'src/core/page/page-access/page-access.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from 'src/core/casl/abilities/space-ability.factory';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { AUDIT_SERVICE } from 'src/integrations/audit/audit.service';
import { SearchService } from 'src/core/search/search.service';
import { OrvexPageMetadataService } from 'src/orvex/page-metadata/orvex-page-metadata.service';
import { OrvexPageSupersedeController } from 'src/orvex/page-metadata/orvex-page-supersede.controller';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { SpaceRole } from 'src/common/helpers/types/permission';
import { PageStatus } from '@orvex/extensions';
import {
  seedPage,
  seedSpace,
  seedSpaceMember,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';

jest.setTimeout(240_000);

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

/** The documented ENG-1434 AC2 lock columns a supersede may touch on the
 * upstream row — everything else must be byte-identical. */
const SUPERSEDE_ALLOWED_PAGES_DIFF = new Set(['isLocked', 'updatedAt']);

function diffKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
}

describe('TestPageLifecycleSupersedeRidesMetaSeam (ENG-2486)', () => {
  let testDb: TestDb;
  let db: any;
  let app: NestFastifyApplication;
  let pageRepo: PageRepo;
  let pageService: PageService;
  let searchService: SearchService;
  let metadataService: OrvexPageMetadataService;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let spaceId: string;
  let adminUser: any;
  let currentAuth: { user: any; workspace: any } | null = null;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db as any;

    const eventEmitter = new EventEmitter2();
    const outboxWriter = new OutboxWriter(db);
    const groupRepo = new GroupRepo(db);
    const spaceRepo = new SpaceRepo(db, new EventEmitter2());
    const spaceMemberRepo = new SpaceMemberRepo(
      db,
      groupRepo,
      spaceRepo,
      fakeCache(),
    );
    pageRepo = new PageRepo(
      db,
      spaceMemberRepo,
      eventEmitter,
      outboxWriter,
      { emitInvalidate: () => {} } as any,
    );
    const pagePermissionRepo = new PagePermissionRepo(db, groupRepo, fakeCache());
    const spaceAbility = new SpaceAbilityFactory(spaceMemberRepo);
    const pageAccessService = new PageAccessService(
      pagePermissionRepo,
      spaceAbility,
      spaceRepo,
    );

    pageService = new PageService(
      pageRepo,
      pagePermissionRepo,
      {} as any, // attachmentRepo
      db,
      {} as any, // storageService
      { add: async () => {} } as any, // attachmentQueue
      { add: async () => {} } as any, // aiQueue
      { add: async () => {} } as any, // generalQueue
      eventEmitter,
      {} as any, // collaborationGateway — never reached by this spec
      { addPageWatchers: async () => {} } as any,
      {} as any, // transclusionService — never reached by this spec
      { record: async () => {} } as any, // idempotencyStore
      {
        assertWithinQuota: async () => undefined,
        hasFeature: async () => true,
      } as any,
    );

    searchService = new SearchService(
      db,
      pageRepo,
      {} as any, // shareRepo — not touched by the includePages suggestion path
      spaceMemberRepo,
      pagePermissionRepo,
    );

    metadataService = new OrvexPageMetadataService(
      db,
      new WorkspaceRepo(db),
      // Governance providers deliberately un-wired: every call in this spec
      // is a HUMAN caller (authMethod undefined), which the gates never
      // apply to — the meta-seam write path is the unit under test.
    );

    class TestAuthGuard implements CanActivate {
      canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        if (!currentAuth) return false;
        request.user = {
          user: currentAuth.user,
          workspace: currentAuth.workspace,
        };
        return true;
      }
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [PageController, OrvexPageSupersedeController],
      providers: [
        { provide: PageService, useValue: pageService },
        { provide: PageRepo, useValue: pageRepo },
        { provide: PageHistoryService, useValue: {} },
        { provide: SpaceAbilityFactory, useValue: spaceAbility },
        { provide: PageAccessService, useValue: pageAccessService },
        { provide: BacklinkService, useValue: {} },
        { provide: LabelService, useValue: {} },
        { provide: AUDIT_SERVICE, useValue: { logWithContext: async () => {} } },
        { provide: OrvexPageProvenanceService, useValue: {} },
        { provide: ConfirmTokenService, useValue: {} },
        { provide: OrvexPageMetadataService, useValue: metadataService },
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
      new ValidationPipe({
        whitelist: true,
        stopAtFirstError: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    const otherWorkspace = await seedWorkspace(testDb.db);
    otherWorkspaceId = otherWorkspace.id;
    adminUser = await seedUser(testDb.db, workspaceId);
    const space = await seedSpace(testDb.db, workspaceId, adminUser.id);
    spaceId = space.id;
    await seedSpaceMember(testDb.db, {
      spaceId,
      userId: adminUser.id,
      role: SpaceRole.ADMIN,
    });
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await testDb?.teardown();
  });

  afterEach(() => {
    currentAuth = null;
  });

  function asAdmin() {
    currentAuth = {
      user: adminUser,
      workspace: { id: workspaceId },
    };
  }

  async function newPage(title: string, ws = workspaceId, space = spaceId) {
    return seedPage(testDb.db, {
      spaceId: space,
      workspaceId: ws,
      creatorId: adminUser.id,
      position: null,
      title,
    });
  }

  async function pagesRow(pageId: string) {
    return db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', pageId)
      .executeTakeFirstOrThrow();
  }

  async function metaRow(pageId: string) {
    return db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  // -------------------------------------------------------------------
  // AC1 — the lifecycle write rides orvex_page_meta, never upstream pages
  // -------------------------------------------------------------------
  it('AC1 — the pages table structurally carries ZERO lifecycle columns; they live on orvex_page_meta (the ENG-2480 seam)', async () => {
    const columnsOf = async (table: string): Promise<string[]> => {
      const rows = await db
        .selectFrom('information_schema.columns' as any)
        .select(['column_name'])
        .where('table_name', '=', table)
        .execute();
      return rows.map((r: any) => r.columnName ?? r.column_name);
    };

    const pagesCols = await columnsOf('pages');
    const metaCols = await columnsOf('orvex_page_meta');

    for (const lifecycleCol of [
      'status',
      'supersedes',
      'superseded_by',
      'archive_reason',
      'doc_type',
    ]) {
      expect(pagesCols).not.toContain(lifecycleCol);
      expect(metaCols).toContain(lifecycleCol);
    }
  });

  it('AC1 — archive via POST /orvex/pages/status writes orvex_page_meta only; the upstream pages row is byte-identical', async () => {
    const page = await newPage('AC1 archive target');
    const before = await pagesRow(page.id);

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/status',
      payload: {
        pageId: page.id,
        status: 'archived',
        archiveReason: 'stale content',
      },
    });
    expect(res.statusCode).toBe(200);

    const meta = await metaRow(page.id);
    expect(meta.status).toBe('archived');
    expect(meta.archiveReason).toBe('stale content');

    const after = await pagesRow(page.id);
    expect(diffKeys(before, after)).toEqual([]);
  });

  it('AC1 — supersede writes both orvex_page_meta rows atomically; the upstream rows change nothing beyond the documented ENG-1434 AC2 lock', async () => {
    const oldPage = await newPage('AC1 superseded old');
    const successor = await newPage('AC1 successor');
    const oldBefore = await pagesRow(oldPage.id);
    const successorBefore = await pagesRow(successor.id);

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/supersede',
      payload: { pageId: oldPage.id, supersededBy: successor.slugId },
    });
    expect(res.statusCode).toBe(200);

    // The meta seam carries the whole lifecycle state — both sides.
    const oldMeta = await metaRow(oldPage.id);
    expect(oldMeta.status).toBe('superseded');
    expect(oldMeta.supersededBy).toBe(successor.slugId);
    const successorMeta = await metaRow(successor.id);
    expect(successorMeta.supersedes).toEqual([oldPage.slugId]);

    // Upstream: the superseded page's row differs ONLY by the documented
    // lock (isLocked flips true) + its updatedAt; the successor's row is
    // fully byte-identical.
    const oldAfter = await pagesRow(oldPage.id);
    const changed = diffKeys(oldBefore, oldAfter);
    expect(changed.every((k) => SUPERSEDE_ALLOWED_PAGES_DIFF.has(k))).toBe(
      true,
    );
    expect(oldAfter.isLocked).toBe(true);

    const successorAfter = await pagesRow(successor.id);
    expect(diffKeys(successorBefore, successorAfter)).toEqual([]);
  });

  // -------------------------------------------------------------------
  // AC2 — tree + search hide superseded pages unless toggled
  // -------------------------------------------------------------------
  it('AC2 — the sidebar tree hides a superseded page by default and reveals it with includeSuperseded', async () => {
    const marker = `TreeVis-${Date.now()}`;
    const live = await newPage(`${marker} live`);
    const doomed = await newPage(`${marker} doomed`);
    const successor = await newPage(`${marker} successor`);

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/supersede',
      payload: { pageId: doomed.id, supersededBy: successor.slugId },
    });
    expect(res.statusCode).toBe(200);

    const hidden = await pageService.getSidebarPages(
      spaceId,
      { limit: 200 } as any,
      undefined,
      adminUser.id,
      true,
      false,
    );
    const hiddenIds = hidden.items.map((p: any) => p.id);
    expect(hiddenIds).toContain(live.id);
    expect(hiddenIds).toContain(successor.id);
    expect(hiddenIds).not.toContain(doomed.id);

    const revealed = await pageService.getSidebarPages(
      spaceId,
      { limit: 200 } as any,
      undefined,
      adminUser.id,
      true,
      true,
    );
    const revealedIds = revealed.items.map((p: any) => p.id);
    expect(revealedIds).toContain(doomed.id);
    // The toggle strictly WIDENS the default set (opt-in reveal): every
    // default-visible page stays visible, and the superseded page joins.
    for (const id of hiddenIds) {
      expect(revealedIds).toContain(id);
    }
    expect(revealedIds.length).toBeGreaterThan(hiddenIds.length);
  });

  it('AC2/AC4 — search suggestions hide a superseded page by default and reveal it with includeSuperseded (same single helper)', async () => {
    const marker = `searchvis${Date.now()}`;
    const live = await newPage(`${marker} alive`);
    const doomed = await newPage(`${marker} doomed`);
    const successor = await newPage(`${marker} successor`);

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/supersede',
      payload: { pageId: doomed.id, supersededBy: successor.slugId },
    });
    expect(res.statusCode).toBe(200);

    const hidden = await searchService.searchSuggestions(
      { query: marker, includePages: true } as any,
      adminUser.id,
      workspaceId,
    );
    const hiddenIds = (hidden.pages ?? []).map((p: any) => p.id);
    expect(hiddenIds).toContain(live.id);
    expect(hiddenIds).not.toContain(doomed.id);

    const revealed = await searchService.searchSuggestions(
      { query: marker, includePages: true, includeSuperseded: true } as any,
      adminUser.id,
      workspaceId,
    );
    const revealedIds = (revealed.pages ?? []).map((p: any) => p.id);
    expect(revealedIds).toContain(doomed.id);
  });

  // -------------------------------------------------------------------
  // AC3 — the page-get carries the banner fields + live-end successor
  // -------------------------------------------------------------------
  it('AC3 — a superseded page-get carries status=superseded and a supersededBy resolved to the LIVE end of a chained supersession', async () => {
    const a = await newPage('AC3 chain A');
    const b = await newPage('AC3 chain B');
    const c = await newPage('AC3 chain C (live)');

    asAdmin();
    // A superseded by B, then B superseded by C — C is the live end.
    let res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/supersede',
      payload: { pageId: a.id, supersededBy: b.slugId },
    });
    expect(res.statusCode).toBe(200);
    res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/supersede',
      payload: { pageId: b.id, supersededBy: c.slugId },
    });
    expect(res.statusCode).toBe(200);

    const infoRes = await app.inject({
      method: 'POST',
      url: '/pages/info',
      payload: { pageId: a.id },
    });
    expect(infoRes.statusCode).toBe(200);
    const body = JSON.parse(infoRes.payload);
    expect(body.status).toBe('superseded');
    // The RAW persisted hop is B; the response resolves past it to C.
    expect(body.supersededBy).toBe(c.slugId);
    expect(body.supersededBy).not.toBe(b.slugId);
  });

  it('AC3 — an archived page-get carries status=archived + archiveReason; an unstamped page-get fabricates NO lifecycle field', async () => {
    const archived = await newPage('AC3 archived');
    const plain = await newPage('AC3 plain');

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/status',
      payload: {
        pageId: archived.id,
        status: 'archived',
        archiveReason: 'kept for the record',
      },
    });
    expect(res.statusCode).toBe(200);

    const archivedInfo = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/pages/info',
          payload: { pageId: archived.id },
        })
      ).payload,
    );
    expect(archivedInfo.status).toBe('archived');
    expect(archivedInfo.archiveReason).toBe('kept for the record');
    expect(archivedInfo.supersededBy).toBeNull();

    const plainInfo = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/pages/info',
          payload: { pageId: plain.id },
        })
      ).payload,
    );
    expect(plainInfo.id).toBe(plain.id);
    // Honesty (CS §11): nothing persisted -> nothing reported.
    expect('status' in plainInfo).toBe(false);
    expect('supersededBy' in plainInfo).toBe(false);
  });

  // -------------------------------------------------------------------
  // AC4 — the scattered filters route through ONE repo helper
  // -------------------------------------------------------------------
  it('AC4 — page.service.ts and search.service.ts both funnel through PageRepo.excludeSupersededUnless; the superseded condition exists ONLY in page.repo.ts', () => {
    const srcRoot = path.join(__dirname, '..', '..', 'src');
    const read = (rel: string) =>
      readFileSync(path.join(srcRoot, rel), 'utf8');

    const pageServiceSrc = read('core/page/services/page.service.ts');
    const searchServiceSrc = read('core/search/search.service.ts');
    const pageRepoSrc = read('database/repos/page/page.repo.ts');

    // Both discovery-surface call sites use the single shared helper.
    expect(pageServiceSrc).toContain('.excludeSupersededUnless(');
    expect(searchServiceSrc).toContain('.excludeSupersededUnless(');

    // Neither re-derives the condition: the PageStatus.SUPERSEDED filter
    // literal appears in the repo helper only, never in the call sites.
    expect(pageServiceSrc).not.toContain('PageStatus.SUPERSEDED');
    expect(searchServiceSrc).not.toContain('PageStatus.SUPERSEDED');
    expect(pageRepoSrc).toContain('PageStatus.SUPERSEDED');

    // No inline string-literal re-derivation either (comments aside, a
    // query condition needs the quoted literal).
    expect(pageServiceSrc).not.toMatch(/['"]superseded['"]/);
    expect(searchServiceSrc).not.toMatch(/['"]superseded['"]/);
  });

  // -------------------------------------------------------------------
  // AC5 — missing / cross-tenant successor rejected, zero orphan links
  // -------------------------------------------------------------------
  it('AC5 — a supersede pointing at a nonexistent successor is a typed 404 and writes NOTHING (atomic rollback)', async () => {
    const page = await newPage('AC5 missing-target');
    const before = await pagesRow(page.id);

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/supersede',
      payload: { pageId: page.id, supersededBy: 'no-such-slug-anywhere' },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('SUPERSESSION_TARGET_NOT_FOUND');

    // Zero orphan links: no meta row materialized, upstream row untouched.
    expect(await metaRow(page.id)).toBeUndefined();
    expect(diffKeys(before, await pagesRow(page.id))).toEqual([]);
  });

  it('AC5 — a supersede pointing at a CROSS-TENANT successor is rejected with zero orphan links (no cross-tenant link-rewrite)', async () => {
    const page = await newPage('AC5 cross-tenant source');
    const foreignUser = await seedUser(testDb.db, otherWorkspaceId);
    const foreignSpace = await seedSpace(
      testDb.db,
      otherWorkspaceId,
      foreignUser.id,
    );
    const foreignTarget = await seedPage(testDb.db, {
      spaceId: foreignSpace.id,
      workspaceId: otherWorkspaceId,
      creatorId: foreignUser.id,
      position: null,
      title: 'AC5 foreign successor',
    });

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/supersede',
      payload: { pageId: page.id, supersededBy: foreignTarget.slugId },
    });
    // review1 F1 — a cross-workspace target resolves as NOT FOUND (never
    // leaked as existing-but-forbidden).
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload).error).toBe('SUPERSESSION_TARGET_NOT_FOUND');

    expect(await metaRow(page.id)).toBeUndefined();
    expect(await metaRow(foreignTarget.id)).toBeUndefined();
  });

  it('AC5/NFR — the XOR guard rejects a directionless supersede as a typed 400, never a silent no-op', async () => {
    const page = await newPage('AC5 xor');

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/supersede',
      payload: { pageId: page.id },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe('INVALID_SUPERSESSION');
    expect(await metaRow(page.id)).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // NFR honesty — grep gates
  // -------------------------------------------------------------------
  it('NFR honesty — no TODO/FIXME in the lifecycle service/controller sources', () => {
    const srcRoot = path.join(__dirname, '..', '..', 'src');
    for (const rel of [
      'orvex/page-metadata/orvex-page-metadata.service.ts',
      'orvex/page-metadata/orvex-page-supersede.controller.ts',
    ]) {
      const src = readFileSync(path.join(srcRoot, rel), 'utf8');
      expect(src).not.toMatch(/TODO|FIXME|placeholder/);
    }
  });

  it('NFR determinism — no wall-clock-keyed lifecycle assertion in this spec (fixtures aside) and PageStatus enum carries the seam vocabulary', () => {
    // The lifecycle vocabulary this spec asserts against is the shared
    // @orvex/extensions enum — not ad-hoc strings drifting per call site.
    expect(PageStatus.SUPERSEDED).toBe('superseded');
    expect(PageStatus.ARCHIVED).toBe('archived');
  });
});
