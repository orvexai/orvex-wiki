/**
 * ENG-2482 — FR-13 ACL evaluation primitive + `evalPage` page-level fix +
 * delta-pull-through-ACL. VERIFY + harden story: `OrvexPermissionsService`
 * and `InternalApiService` already implement the full contract at HEAD
 * (evidence in the class header comments); the delta this Issue closes is
 * proof, not production code. No diff is expected in either service.
 *
 * Integration test against a REAL Postgres (testcontainers, ENG-1372
 * convention — the exact `db-test-harness.ts` shape `eng1373-page-permissions
 * .integration-spec.ts` already establishes). Every repo/service below is the
 * real production class, hand-wired (no HTTP layer, no NestJS TestingModule
 * needed to exercise the two exported services this Issue's DoD targets).
 * CS §5 ❌#4: never `jest.mock` an owned class — `OrvexPermissionsService`,
 * `InternalApiService`, `PagePermissionRepo`, and `SpaceAbilityFactory` are
 * all driven for real against the real container.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import SpaceAbilityFactory from 'src/core/casl/abilities/space-ability.factory';
import { OrvexPermissionsService } from 'src/core/permissions/orvex-permissions.service';
import { PagePermissionController } from 'src/core/permissions/page-permission.controller';
import { PagePermissionService } from 'src/core/permissions/page-permission.service';
import { OrvexAuditService } from 'src/core/audit/orvex-audit.service';
import { InternalApiService } from 'src/core/internal-api/internal-api.service';
import type { ExportService } from 'src/integrations/export/export.service';
import {
  SpaceRole,
  PagePermissionRole,
} from 'src/common/helpers/types/permission';
import {
  seedAuthAccount,
  seedPage,
  seedSpace,
  seedSpaceMember,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';
import * as fs from 'fs';
import * as path from 'path';

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

describe('ENG-2482: ACL delta-pull chokepoint (evalPage narrowing + filterAccessiblePages batch)', () => {
  let testDb: TestDb;

  // tenant A — the principal's own workspace
  let workspaceAId: string;
  let adminId: string;
  let spaceA1Id: string; // the principal's member space
  let spaceA2Id: string; // a space in the SAME tenant the principal never joins

  // tenant B — a wholly foreign workspace (AC4 cross-tenant probe)
  let workspaceBId: string;
  let spaceBId: string;
  let creatorBId: string;

  let permissionsService: OrvexPermissionsService;
  let internalApiService: InternalApiService;
  let pagePermissionRepo: PagePermissionRepo;
  let controller: PagePermissionController;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const db = testDb.db as unknown as import('@docmost/db/types/kysely.types').KyselyDB;

    const workspaceA = await seedWorkspace(testDb.db);
    workspaceAId = workspaceA.id;
    const admin = await seedUser(testDb.db, workspaceAId);
    adminId = admin.id;
    const spaceA1 = await seedSpace(testDb.db, workspaceAId, adminId);
    spaceA1Id = spaceA1.id;
    await seedSpaceMember(testDb.db, {
      spaceId: spaceA1Id,
      userId: adminId,
      role: SpaceRole.ADMIN,
    });
    const spaceA2 = await seedSpace(testDb.db, workspaceAId, adminId);
    spaceA2Id = spaceA2.id;
    await seedSpaceMember(testDb.db, {
      spaceId: spaceA2Id,
      userId: adminId,
      role: SpaceRole.ADMIN,
    });

    const workspaceB = await seedWorkspace(testDb.db);
    workspaceBId = workspaceB.id;
    const creatorB = await seedUser(testDb.db, workspaceBId);
    creatorBId = creatorB.id;
    const spaceB = await seedSpace(testDb.db, workspaceBId, creatorBId);
    spaceBId = spaceB.id;
    await seedSpaceMember(testDb.db, {
      spaceId: spaceBId,
      userId: creatorBId,
      role: SpaceRole.ADMIN,
    });

    const groupRepo = new GroupRepo(db);
    const spaceRepo = new SpaceRepo(db, new EventEmitter2());
    const spaceMemberRepo = new SpaceMemberRepo(
      db,
      groupRepo,
      spaceRepo,
      fakeCache(),
    );
    const wsServiceStub = { emitInvalidate: () => {} } as any;
    const pageRepo = new PageRepo(
      db,
      spaceMemberRepo,
      new EventEmitter2(),
      new OutboxWriter(db),
      wsServiceStub,
    );
    pagePermissionRepo = new PagePermissionRepo(db, groupRepo, fakeCache());
    const spaceAbility = new SpaceAbilityFactory(spaceMemberRepo);
    const userRepo = new UserRepo(db);
    const workspaceRepo = new WorkspaceRepo(db);

    permissionsService = new OrvexPermissionsService(
      pageRepo,
      pagePermissionRepo,
      spaceAbility,
    );

    // `exportService` is an UNUSED constructor collaborator on this ACL path:
    // `filterAccessiblePages` (the only method this spec drives) never calls
    // `exportPage`. This is a construction convenience for an unreached
    // dependency, not a mocked-own-package behaviour substitution (CS §5
    // ❌#4 forbids mocking a class this Issue is asserting ON — ExportService
    // is neither driven nor asserted on here).
    const exportServiceStub = {} as unknown as ExportService;
    internalApiService = new InternalApiService(
      pageRepo,
      pagePermissionRepo,
      spaceAbility,
      spaceRepo,
      workspaceRepo,
      userRepo,
      exportServiceStub,
    );

    const orvexAudit = new OrvexAuditService(db);
    const pagePermissionService = new PagePermissionService(pagePermissionRepo);
    controller = new PagePermissionController(
      db,
      pageRepo,
      pagePermissionRepo,
      spaceAbility,
      orvexAudit,
      pagePermissionService,
    );
  }, 120_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  /** Seed a fresh user in `workspaceId` + a live SSO linkage row, so
   * `InternalApiService.filterAccessiblePages`'s subject->userId resolution
   * (`UserRepo.findUserIdByProviderUserId`) can find it. */
  async function newLinkedPrincipal(workspaceId: string, tag: string) {
    const user = await seedUser(testDb.db, workspaceId);
    const providerUserId = `idp-sub-${tag}-${user.id}`;
    await seedAuthAccount(testDb.db, {
      userId: user.id,
      workspaceId,
      providerUserId,
    });
    return { user, providerUserId };
  }

  it('TestAclDeltaPullNarrowsPageLevel — the DoD binary gate: page-level narrowing, batch chokepoint exclusion, cross-tenant exclusion, fail-closed empty set', async () => {
    const { user: principal, providerUserId: subject } =
      await newLinkedPrincipal(workspaceAId, 'dod');
    await seedSpaceMember(testDb.db, {
      spaceId: spaceA1Id,
      userId: principal.id,
      role: SpaceRole.WRITER,
    });

    // Page-level restriction NARROWING a space-WRITER down to READER-only
    // actions (AC2) — the principal DOES hold a page-level grant, just a
    // lower one than the space ability would otherwise confer.
    const narrowedPage = await seedPage(testDb.db, {
      spaceId: spaceA1Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'dod-a0',
      title: 'dod-narrowed',
    });
    await controller.restrict({ pageId: narrowedPage.id }, adminUser(adminId), {
      id: workspaceAId,
    } as any);
    await controller.addPermission(
      {
        pageId: narrowedPage.id,
        userId: principal.id,
        role: PagePermissionRole.READER,
      },
      adminUser(adminId),
      { id: workspaceAId } as any,
    );

    // A second restricted page where the principal holds NO grant at all —
    // full denial, standing in for the delta pull's own REM-2 leak (AC3).
    const deniedPage = await seedPage(testDb.db, {
      spaceId: spaceA1Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'dod-a1',
      title: 'dod-denied',
    });
    await controller.restrict({ pageId: deniedPage.id }, adminUser(adminId), {
      id: workspaceAId,
    } as any);

    // An unrestricted sibling in the SAME member space — must survive.
    const openPage = await seedPage(testDb.db, {
      spaceId: spaceA1Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'dod-a2',
      title: 'dod-open',
    });

    // A page in a DIFFERENT space of the SAME tenant the principal never
    // joined (AC1's "non-member space" half).
    const nonMemberSpacePage = await seedPage(testDb.db, {
      spaceId: spaceA2Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'dod-b0',
      title: 'dod-nonmember-space',
    });

    // A page that belongs to a wholly different workspace (AC4).
    const foreignPage = await seedPage(testDb.db, {
      spaceId: spaceBId,
      workspaceId: workspaceBId,
      creatorId: creatorBId,
      position: 'dod-c0',
      title: 'dod-foreign',
    });

    // --- (2) evalPage narrows the space-WRITER grant to the page ACL ---
    const evaluated = await permissionsService.evaluateOne(
      principal as any,
      { subject: 'Page', id: narrowedPage.id },
    );
    expect(evaluated.actions).toEqual(['read']);
    expect(evaluated.actions).not.toContain('edit');

    // --- (1) + (3) + (4) the batch chokepoint, one call ---
    const filtered = await internalApiService.filterAccessiblePages(
      workspaceAId,
      subject,
      [
        openPage.id,
        narrowedPage.id,
        deniedPage.id,
        nonMemberSpacePage.id,
        foreignPage.id,
      ],
    );
    // Readable member-space pages survive (the narrowed page IS viewable —
    // the principal holds a real READER grant on it, just not WRITER).
    expect(filtered.slice().sort()).toEqual(
      [openPage.id, narrowedPage.id].sort(),
    );
    // The fully-denied restricted page is excluded from the batch —
    expect(filtered).not.toContain(deniedPage.id);
    // — exactly as calling the store-seam primitive directly would exclude it.
    const directFilter = await pagePermissionRepo.filterAccessiblePageIds({
      pageIds: [deniedPage.id],
      userId: principal.id,
      spaceId: spaceA1Id,
    });
    expect(directFilter).not.toContain(deniedPage.id);
    // The non-member-space page never appears.
    expect(filtered).not.toContain(nonMemberSpacePage.id);
    // Cross-tenant probe: bytes = 0.
    expect(filtered.filter((id) => id === foreignPage.id)).toHaveLength(0);

    // --- (5) zero-membership principal gets [], never the unfiltered list ---
    const { providerUserId: emptySubject } = await newLinkedPrincipal(
      workspaceAId,
      'dod-empty',
    );
    const emptyResult = await internalApiService.filterAccessiblePages(
      workspaceAId,
      emptySubject,
      [openPage.id, narrowedPage.id],
    );
    expect(emptyResult).toEqual([]);
  });

  it('TestEvalPageIntersectsSpaceAndPageAcl — AC2 isolated: a space-WRITER capped by a page-level READER grant evaluates to exactly [\'read\']', async () => {
    const { user: principal } = await newLinkedPrincipal(
      workspaceAId,
      'ac2',
    );
    await seedSpaceMember(testDb.db, {
      spaceId: spaceA1Id,
      userId: principal.id,
      role: SpaceRole.WRITER,
    });

    const page = await seedPage(testDb.db, {
      spaceId: spaceA1Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'ac2-a0',
      title: 'ac2-narrowed',
    });
    await controller.restrict({ pageId: page.id }, adminUser(adminId), {
      id: workspaceAId,
    } as any);
    await controller.addPermission(
      { pageId: page.id, userId: principal.id, role: PagePermissionRole.READER },
      adminUser(adminId),
      { id: workspaceAId } as any,
    );

    const evaluated = await permissionsService.evaluateOne(
      principal as any,
      { subject: 'Page', id: page.id },
    );
    // Strict equality — the "ceiling only narrows, never widens" invariant:
    // the space grants ['read','edit'], the page ACL grants only 'read', the
    // intersection MUST be exactly ['read'].
    expect(evaluated.actions).toEqual(['read']);
  });

  it('TestFilterAccessiblePagesExcludesCrossTenant — AC4: a pageIds batch spanning two tenants never returns the foreign-tenant id', async () => {
    const { user: principal, providerUserId: subject } =
      await newLinkedPrincipal(workspaceAId, 'ac4');
    await seedSpaceMember(testDb.db, {
      spaceId: spaceA1Id,
      userId: principal.id,
      role: SpaceRole.READER,
    });

    const ownPage = await seedPage(testDb.db, {
      spaceId: spaceA1Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'ac4-a0',
      title: 'ac4-own',
    });
    const foreignPage = await seedPage(testDb.db, {
      spaceId: spaceBId,
      workspaceId: workspaceBId,
      creatorId: creatorBId,
      position: 'ac4-c0',
      title: 'ac4-foreign',
    });

    const result = await internalApiService.filterAccessiblePages(
      workspaceAId,
      subject,
      [ownPage.id, foreignPage.id],
    );
    expect(result).toEqual([ownPage.id]);
    // Standing regression probe (pack T6): bytes = 0 of the foreign id.
    expect(result.filter((id) => id === foreignPage.id)).toHaveLength(0);
  });

  it('TestFilterAccessiblePagesEmptyOnNoMembership — AC5: a resolvable principal with zero space memberships yields [], never the unfiltered list', async () => {
    const { providerUserId: subject } = await newLinkedPrincipal(
      workspaceAId,
      'ac5',
    );
    // Deliberately no seedSpaceMember call — this principal is resolvable
    // (a live auth_accounts row exists) but belongs to no space in the
    // tenant.
    const page = await seedPage(testDb.db, {
      spaceId: spaceA1Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'ac5-a0',
      title: 'ac5-page',
    });

    const result = await internalApiService.filterAccessiblePages(
      workspaceAId,
      subject,
      [page.id],
    );
    expect(result).toEqual([]);
  });

  it('TestFilterAccessiblePagesEmptyOnUnresolvableSubject — operability NFR: an unresolvable subject (no auth_accounts linkage) fails closed, never throws or falls back to unfiltered', async () => {
    const page = await seedPage(testDb.db, {
      spaceId: spaceA1Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'ac5-b0',
      title: 'ac5-unresolvable',
    });

    const result = await internalApiService.filterAccessiblePages(
      workspaceAId,
      'idp-sub-never-linked',
      [page.id],
    );
    expect(result).toEqual([]);
  });

  it('TestNoTodoOrPlaceholderInAclPath — honesty NFR: no TODO/FIXME/placeholder in the ACL chokepoint; fail-closed defaults re-proven through the public interface', async () => {
    const serviceFiles = [
      path.join(
        __dirname,
        '..',
        '..',
        'src',
        'core',
        'permissions',
        'orvex-permissions.service.ts',
      ),
      path.join(
        __dirname,
        '..',
        '..',
        'src',
        'core',
        'internal-api',
        'internal-api.service.ts',
      ),
    ];
    for (const file of serviceFiles) {
      const contents = fs.readFileSync(file, 'utf8');
      expect(contents).not.toMatch(/TODO|FIXME|placeholder/i);
    }

    // Re-prove `actionsForRole(undefined) === []` (no grant at all on a
    // restricted page) THROUGH the public interface — `actionsForRole` is a
    // private implementation detail; asserting on it directly would break on
    // an internal rename (CS §4.2 behaviour-through-interface).
    const { user: noGrantUser } = await newLinkedPrincipal(
      workspaceAId,
      'honesty-nogrant',
    );
    await seedSpaceMember(testDb.db, {
      spaceId: spaceA1Id,
      userId: noGrantUser.id,
      role: SpaceRole.WRITER,
    });
    const noGrantPage = await seedPage(testDb.db, {
      spaceId: spaceA1Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'honesty-a0',
      title: 'honesty-no-grant',
    });
    await controller.restrict(
      { pageId: noGrantPage.id },
      adminUser(adminId),
      { id: workspaceAId } as any,
    );
    const noGrantResult = await permissionsService.evaluateOne(
      noGrantUser as any,
      { subject: 'Page', id: noGrantPage.id },
    );
    expect(noGrantResult.actions).toEqual([]);

    // Re-prove `actionsForRole('some-future-role-value') === []` (an
    // unrecognised role value denies everything, never falls back to
    // read-only) via the store seam's own insert (never raw SQL).
    const { user: futureRoleUser } = await newLinkedPrincipal(
      workspaceAId,
      'honesty-futurerole',
    );
    await seedSpaceMember(testDb.db, {
      spaceId: spaceA1Id,
      userId: futureRoleUser.id,
      role: SpaceRole.WRITER,
    });
    const futureRolePage = await seedPage(testDb.db, {
      spaceId: spaceA1Id,
      workspaceId: workspaceAId,
      creatorId: adminId,
      position: 'honesty-a1',
      title: 'honesty-future-role',
    });
    await controller.restrict(
      { pageId: futureRolePage.id },
      adminUser(adminId),
      { id: workspaceAId } as any,
    );
    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(
      futureRolePage.id,
    );
    await pagePermissionRepo.insertPagePermissions([
      {
        pageAccessId: pageAccess!.id,
        userId: futureRoleUser.id,
        role: 'super-future-role',
        addedById: adminId,
      },
    ]);
    const futureRoleResult = await permissionsService.evaluateOne(
      futureRoleUser as any,
      { subject: 'Page', id: futureRolePage.id },
    );
    expect(futureRoleResult.actions).toEqual([]);
  });
});

/** A minimal typed stand-in for the admin caller `PagePermissionController`'s
 * mutating endpoints need — only `.id` is read along this path
 * (`assertCanManage` keys off `user.id`), matching `InternalApiService`'s
 * own `principal()` helper precedent (its header comment justifies the same
 * shape). */
function adminUser(id: string): any {
  return { id };
}
