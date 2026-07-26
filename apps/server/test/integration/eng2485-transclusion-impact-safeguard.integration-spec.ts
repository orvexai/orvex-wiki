// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2485 — named DoD gate: `TestTransclusionImpactAndSafeguardInterceptor`.
 *
 * VERIFY + harden: the `orvex/transclusion-safeguard` module (ported from
 * the fork under ENG-1470 — the source files' own "AC1"/"AC2-AC5"/"AC7"
 * comment labels are THAT ticket's lettering, not this story's) already
 * ships with unit specs; this file is the integration-tier proof the SDD
 * records as owed: real Postgres (testcontainers, `db-test-harness.ts`),
 * real HTTP (fastify `app.inject`) through the REAL
 * `TransclusionSafeguardInterceptor` registered globally — exactly as
 * `orvex-transclusion-safeguard.module.ts` registers it via
 * `APP_INTERCEPTOR` — in front of the REAL `PageController` and
 * `OrvexPageSupersedeController`.
 *
 * Zero mock of own packages (CS §5, ❌#4): `OrvexTransclusionSafeguardService`,
 * `TransclusionSafeguardInterceptor`, `PageTransclusionReferencesRepo`,
 * `PageRepo`, `PageService`, `TransclusionService`,
 * `OrvexPageMetadataService`, `SpaceAbilityFactory`, `PageAccessService` are
 * all real production classes. The AUDIT_SERVICE token resolves to a
 * capturing IAuditService implementation (the injected-port + in-memory
 * fake CS §5 explicitly sanctions — same convention as
 * `orvex-page-supersede.integration.spec.ts`); JWT signature verification is
 * substituted by a guard that stamps `request.user` (Nest's own testing
 * guidance), never the authorization decisions themselves.
 *
 * AC4 (G2) — resolved EMPIRICALLY per the ticket's own instruction: the
 * reference-CREATION path (`TransclusionService.syncPageReferences`) does
 * NOT refuse a cross-workspace row (it trusts `sourcePageId` out of page
 * content; this spec proves the row lands). The enforcing invariant
 * therefore lives at the READ: `computeImpact` now scopes the join to the
 * source page's own workspace (this ticket's one production change), so a
 * cross-tenant dependent page is never returned nor counted. This finding
 * (a pre-existing G2 leak: cross-tenant title/slug exposure + cross-tenant
 * delete-blocking) is escalated in the ticket record, not silently patched.
 *
 * Assertions run through the service's public surface and real HTTP
 * outcomes only — an internal rename of `resolveGuard`/
 * `FORCE_DELETE_AUDIT_SLUG_LIMIT` cannot break this spec (CS §4.2). Fixed
 * seeded fixtures; no `Date.now()`-keyed assertion on any decision.
 */
import { execSync } from 'node:child_process';
import { Test } from '@nestjs/testing';
import {
  ValidationPipe,
  ExecutionContext,
  CanActivate,
  BadRequestException,
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
import {
  AUDIT_SERVICE,
  AuditLogContext,
  IAuditService,
} from 'src/integrations/audit/audit.service';
import {
  ActorType,
  AuditEvent,
  AuditLogPayload,
} from 'src/common/events/audit-events';
import { PageTransclusionReferencesRepo } from '@docmost/db/repos/page-transclusions/page-transclusion-references.repo';
import { OrvexTransclusionSafeguardService } from 'src/orvex/transclusion-safeguard/orvex-transclusion-safeguard.service';
import { TransclusionSafeguardInterceptor } from 'src/orvex/transclusion-safeguard/interceptors/transclusion-safeguard.interceptor';
import { TransclusionService } from 'src/core/page/transclusion/transclusion.service';
import { OrvexPageMetadataService } from 'src/orvex/page-metadata/orvex-page-metadata.service';
import { OrvexPageSupersedeController } from 'src/orvex/page-metadata/orvex-page-supersede.controller';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
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

jest.setTimeout(240_000);

class CapturingAuditService implements IAuditService {
  public readonly logs: Array<{
    payload: AuditLogPayload;
    context?: AuditLogContext;
  }> = [];

  log(payload: AuditLogPayload): void {
    this.logs.push({ payload });
  }

  async logWithContext(
    payload: AuditLogPayload,
    context: AuditLogContext,
  ): Promise<void> {
    this.logs.push({ payload, context });
  }

  async logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
  ): Promise<void> {
    for (const payload of payloads) this.logs.push({ payload, context });
  }

  setActorId(_actorId: string): void {}
  setActorType(_actorType: ActorType): void {}
  async updateRetention(): Promise<void> {}
}

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

describe('TestTransclusionImpactAndSafeguardInterceptor (ENG-2485)', () => {
  let testDb: TestDb;
  let db: any;
  let app: NestFastifyApplication;
  let pageRepo: PageRepo;
  let referencesRepo: PageTransclusionReferencesRepo;
  let safeguardService: OrvexTransclusionSafeguardService;
  let transclusionService: TransclusionService;
  let audit: CapturingAuditService;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let spaceId: string;
  let otherSpaceId: string;
  let adminUser: any;
  let currentAuth: { user: any; workspace: any } | null = null;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db as any;

    audit = new CapturingAuditService();
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

    referencesRepo = new PageTransclusionReferencesRepo(db);
    safeguardService = new OrvexTransclusionSafeguardService(
      db,
      referencesRepo,
      audit,
    );

    // Real creation path for the AC4 probe — only the members
    // syncPageReferences actually touches are live (referencesRepo);
    // unrelated collaborators are inert stand-ins per the established
    // harness convention.
    transclusionService = new TransclusionService(
      db,
      {} as any, // pageTransclusionsRepo — syncPageTransclusions not under test
      referencesRepo,
      pageRepo,
      pagePermissionRepo,
      spaceMemberRepo,
      {} as any, // attachmentRepo
      {} as any, // storageService
      pageAccessService,
    );

    const pageService = new PageService(
      pageRepo,
      pagePermissionRepo,
      {} as any, // attachmentRepo
      db,
      {} as any, // storageService
      { add: async () => {} } as any, // attachmentQueue
      { add: async () => {} } as any, // aiQueue
      { add: async () => {} } as any, // generalQueue
      eventEmitter,
      {} as any, // collaborationGateway — never reached by /pages/delete
      { addPageWatchers: async () => {} } as any,
      transclusionService,
      { record: async () => {} } as any, // idempotencyStore
      {
        assertWithinQuota: async () => undefined,
        hasFeature: async () => true,
      } as any,
    );

    const metadataService = new OrvexPageMetadataService(
      db,
      new WorkspaceRepo(db),
      // Governance providers deliberately un-wired: every HTTP call in this
      // spec is a HUMAN caller (authMethod undefined), which the gates
      // never apply to — the safeguard interceptor is the unit under test.
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
        { provide: AUDIT_SERVICE, useValue: audit },
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
    // The REAL interceptor, globally — mirroring the module's
    // APP_INTERCEPTOR registration (every request passes through it).
    app.useGlobalInterceptors(
      new TransclusionSafeguardInterceptor(safeguardService),
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
    const otherUser = await seedUser(testDb.db, otherWorkspaceId);
    const otherSpace = await seedSpace(
      testDb.db,
      otherWorkspaceId,
      otherUser.id,
    );
    otherSpaceId = otherSpace.id;
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

  async function seedReference(
    sourcePageId: string,
    referencePageId: string,
    transclusionId: string,
    ws = workspaceId,
  ) {
    await referencesRepo.insertMany([
      {
        workspaceId: ws,
        sourcePageId,
        referencePageId,
        transclusionId,
      } as any,
    ]);
  }

  // -------------------------------------------------------------------
  // AC1 — the impact set exactly equals the live transcluding pages
  // -------------------------------------------------------------------
  it('AC1 — computeImpact returns exactly the live transcluding pages; a soft-deleted referencing page is excluded', async () => {
    const source = await newPage('AC1 source');
    const refA = await newPage('AC1 ref A');
    const refB = await newPage('AC1 ref B');
    const refDeleted = await newPage('AC1 ref deleted');
    await seedReference(source.id, refA.id, 'tr-a');
    await seedReference(source.id, refB.id, 'tr-b');
    await seedReference(source.id, refDeleted.id, 'tr-del');
    await db
      .updateTable('pages')
      .set({ deletedAt: new Date() })
      .where('id', '=', refDeleted.id)
      .execute();

    const impact = await safeguardService.computeImpact(source.id, 'delete');

    expect(impact.pageId).toBe(source.id);
    expect(impact.operation).toBe('delete');
    expect(impact.activeReferenceCount).toBe(2);
    expect(impact.canForce).toBe(false);
    expect(
      impact.references.map((r) => r.referencePageId).sort(),
    ).toEqual([refA.id, refB.id].sort());
    // Metadata only — never a rendered/expanded content body (AC5 adjacent).
    for (const ref of impact.references) {
      expect(Object.keys(ref).sort()).toEqual(
        [
          'referencePageId',
          'referencePageTitle',
          'referencePageSlugId',
          'transclusionId',
        ].sort(),
      );
    }
  });

  // -------------------------------------------------------------------
  // AC2 — destructive mutation of a transcluded source is intercepted
  // -------------------------------------------------------------------
  it('AC2 — POST /pages/delete on a transcluded source is 409-blocked BEFORE the handler; the page is not deleted; the impact set is surfaced', async () => {
    const source = await newPage('AC2 delete source');
    const ref = await newPage('AC2 delete ref');
    await seedReference(source.id, ref.id, 'tr-ac2-del');

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/pages/delete',
      payload: { pageId: source.id },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.errorCode).toBe('TRANSCLUSION_REFERENCES_ACTIVE');
    expect(body.impact.pageId).toBe(source.id);
    expect(body.impact.activeReferenceCount).toBe(1);
    expect(body.impact.references[0].referencePageId).toBe(ref.id);

    // The mutation never landed.
    const row = await db
      .selectFrom('pages')
      .select(['deletedAt'])
      .where('id', '=', source.id)
      .executeTakeFirst();
    expect(row.deletedAt).toBeNull();
  });

  it('AC2 — POST /orvex/pages/status {archived} and POST /orvex/pages/supersede on a transcluded source are 409-blocked with no mutation', async () => {
    const source = await newPage('AC2 lifecycle source');
    const successor = await newPage('AC2 lifecycle successor');
    const ref = await newPage('AC2 lifecycle ref');
    await seedReference(source.id, ref.id, 'tr-ac2-life');

    asAdmin();
    const archiveRes = await app.inject({
      method: 'POST',
      url: '/orvex/pages/status',
      payload: {
        pageId: source.id,
        status: 'archived',
        archiveReason: 'blocked attempt',
      },
    });
    expect(archiveRes.statusCode).toBe(409);
    expect(JSON.parse(archiveRes.payload).errorCode).toBe(
      'TRANSCLUSION_REFERENCES_ACTIVE',
    );

    const supersedeRes = await app.inject({
      method: 'POST',
      url: '/orvex/pages/supersede',
      payload: { pageId: source.id, supersededBy: successor.slugId },
    });
    expect(supersedeRes.statusCode).toBe(409);
    expect(JSON.parse(supersedeRes.payload).errorCode).toBe(
      'TRANSCLUSION_REFERENCES_ACTIVE',
    );

    // Neither lifecycle write landed in orvex_page_meta.
    const meta = await db
      .selectFrom('orvexPageMeta')
      .select(['status', 'supersededBy'])
      .where('pageId', '=', source.id)
      .executeTakeFirst();
    expect(meta?.status ?? null).toBeNull();
    expect(meta?.supersededBy ?? null).toBeNull();
  });

  // -------------------------------------------------------------------
  // AC3 — an untranscluded source is never obstructed
  // -------------------------------------------------------------------
  it('AC3 — the same destructive routes pass through untouched for a source nothing transcludes', async () => {
    const lonely = await newPage('AC3 untranscluded');

    asAdmin();
    const statusRes = await app.inject({
      method: 'POST',
      url: '/orvex/pages/status',
      payload: {
        pageId: lonely.id,
        status: 'archived',
        archiveReason: 'clean archive',
      },
    });
    expect(statusRes.statusCode).toBe(200);

    const meta = await db
      .selectFrom('orvexPageMeta')
      .select(['status', 'archiveReason'])
      .where('pageId', '=', lonely.id)
      .executeTakeFirst();
    expect(meta.status).toBe('archived');

    const deleteRes = await app.inject({
      method: 'POST',
      url: '/pages/delete',
      payload: { pageId: lonely.id },
    });
    expect(deleteRes.statusCode).toBe(200);

    const row = await db
      .selectFrom('pages')
      .select(['deletedAt'])
      .where('id', '=', lonely.id)
      .executeTakeFirst();
    expect(row.deletedAt).not.toBeNull();
  });

  it('AC3 (route scoping) — a non-archived status write on a TRANSCLUDED source is not guarded and passes through', async () => {
    const source = await newPage('AC3 transcluded published');
    const ref = await newPage('AC3 ref');
    await seedReference(source.id, ref.id, 'tr-ac3-pub');

    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/orvex/pages/status',
      payload: { pageId: source.id, status: 'published' },
    });
    expect(res.statusCode).toBe(200);

    const meta = await db
      .selectFrom('orvexPageMeta')
      .select(['status'])
      .where('pageId', '=', source.id)
      .executeTakeFirst();
    expect(meta.status).toBe('published');
  });

  // -------------------------------------------------------------------
  // AC4 — cross-tenant exclusion, empirically resolved
  // -------------------------------------------------------------------
  it('AC4 (G2) — the creation path DOES accept a cross-workspace reference row (empirical record), and computeImpact excludes it at the read', async () => {
    const source = await newPage('AC4 tenant-A source');
    const foreignRef = await newPage(
      'AC4 tenant-B referencing page',
      otherWorkspaceId,
      otherSpaceId,
    );

    // The REAL creation path: tenant B's page content embeds tenant A's
    // pageId. Empirical finding (recorded, not assumed): syncPageReferences
    // creates the cross-workspace row — creation-time refusal is NOT the
    // enforcing invariant today.
    await transclusionService.syncPageReferences(
      foreignRef.id,
      otherWorkspaceId,
      {
        type: 'doc',
        content: [
          {
            type: 'transclusionReference',
            attrs: {
              sourcePageId: source.id,
              transclusionId: 'tr-cross-tenant',
            },
          },
        ],
      },
    );

    const crossRow = await db
      .selectFrom('pageTransclusionReferences')
      .selectAll()
      .where('sourcePageId', '=', source.id)
      .where('referencePageId', '=', foreignRef.id)
      .executeTakeFirst();
    expect(crossRow).toBeDefined(); // the honest, escalated G2 finding

    // The enforcing invariant: computeImpact never returns nor counts the
    // cross-tenant dependent page.
    const impact = await safeguardService.computeImpact(source.id, 'delete');
    expect(impact.activeReferenceCount).toBe(0);
    expect(impact.references).toEqual([]);

    // And the interceptor therefore never blocks tenant A's own delete on
    // the strength of tenant B's row (no cross-tenant denial-of-delete).
    asAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/pages/delete',
      payload: { pageId: source.id },
    });
    expect(res.statusCode).toBe(200);
  });

  it('AC4 — a same-workspace reference is still fully visible after the tenant scoping', async () => {
    const source = await newPage('AC4 same-tenant source');
    const ref = await newPage('AC4 same-tenant ref');
    await seedReference(source.id, ref.id, 'tr-same-tenant');

    const impact = await safeguardService.computeImpact(source.id, 'delete');
    expect(impact.activeReferenceCount).toBe(1);
    expect(impact.references[0].referencePageId).toBe(ref.id);
  });

  // -------------------------------------------------------------------
  // NFR operability — force mode: fail-closed + loud critical audit
  // -------------------------------------------------------------------
  it('NFR — force mode is rejected (400) on any non-permanent-delete operation, with no audit row', async () => {
    const source = await newPage('NFR force wrong-op source');
    const ref = await newPage('NFR force wrong-op ref');
    await seedReference(source.id, ref.id, 'tr-force-wrong');

    const before = audit.logs.length;
    await expect(
      safeguardService.enforceOrUnsync(source.id, 'delete', 'force', {
        workspaceId,
        actorId: adminUser.id,
        actorType: 'user',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(audit.logs.length).toBe(before);
  });

  it('NFR — force mode on permanent-delete logs exactly ONE critical TRANSCLUSION_FORCE_DELETE audit event with the impacted slugIds', async () => {
    const source = await newPage('NFR force source');
    const refs = [
      await newPage('NFR force ref 1'),
      await newPage('NFR force ref 2'),
      await newPage('NFR force ref 3'),
    ];
    for (const [i, ref] of refs.entries()) {
      await seedReference(source.id, ref.id, `tr-force-${i}`);
    }

    const before = audit.logs.length;
    const impact = await safeguardService.enforceOrUnsync(
      source.id,
      'permanent-delete',
      'force',
      { workspaceId, actorId: adminUser.id, actorType: 'user' },
    );

    expect(impact.activeReferenceCount).toBe(3);
    const newLogs = audit.logs.slice(before);
    const forceLogs = newLogs.filter(
      (l) => l.payload.event === AuditEvent.TRANSCLUSION_FORCE_DELETE,
    );
    expect(forceLogs).toHaveLength(1);
    const meta = forceLogs[0].payload.metadata as any;
    expect(meta.critical).toBe(true);
    expect((meta.impactedSlugIds as string[]).sort()).toEqual(
      refs.map((r) => r.slugId).sort(),
    );
    expect(meta.impactedSlugIds.length).toBeLessThanOrEqual(100);

    // Force never deletes the reference rows themselves.
    const remaining = await db
      .selectFrom('pageTransclusionReferences')
      .select(['id'])
      .where('sourcePageId', '=', source.id)
      .execute();
    expect(remaining).toHaveLength(3);
  });

  // -------------------------------------------------------------------
  // AC5 + NFR honesty — grep gates
  // -------------------------------------------------------------------
  it('AC5 (negative) — no embed-rendering/materialisation code lives in the safeguard module', () => {
    const out = execSync(
      `grep -rn "renderEmbed\\|materializeTransclusion\\|resolveEmbedBody" apps/server/src/orvex/transclusion-safeguard/ || true`,
      { cwd: `${__dirname}/../../../..`, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });

  it('NFR honesty — no TODO/FIXME/placeholder in the transclusion-safeguard sources', () => {
    const out = execSync(
      `grep -rn "TODO\\|FIXME\\|placeholder" apps/server/src/orvex/transclusion-safeguard/*.ts apps/server/src/orvex/transclusion-safeguard/interceptors/*.ts || true`,
      { cwd: `${__dirname}/../../../..`, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });
});
