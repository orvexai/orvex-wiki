/**
 * ENG-1373 — Per-page ACL + filterAccessiblePageIds (FR-13) + audit.
 *
 * Integration test against a REAL Postgres (testcontainers, ENG-1372
 * convention). Never mocks `OrvexPermissionsService`/`PagePermissionRepo`/
 * `SpaceAbilityFactory` (CS §5 ❌#4) — every repo/service below is the real
 * production class, wired by hand (no HTTP layer needed to exercise the
 * authorization + audit contract).
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import SpaceAbilityFactory from 'src/core/casl/abilities/space-ability.factory';
import { OrvexPermissionsService } from 'src/core/permissions/orvex-permissions.service';
import { PagePermissionController } from 'src/core/permissions/page-permission.controller';
import { PagePermissionService } from 'src/core/permissions/page-permission.service';
import { OrvexAuditService } from 'src/core/audit/orvex-audit.service';
import { AuditEvent } from 'src/common/events/audit-events';
import { SpaceRole, PagePermissionRole } from 'src/common/helpers/types/permission';
import {
  seedGroup,
  seedGroupUser,
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

async function countAuditRows(
  testDb: TestDb,
  event: string,
  resourceId: string,
): Promise<number> {
  const result = await testDb.db
    .selectFrom('audit' as any)
    .select((eb) => eb.fn.count('id').as('count'))
    .where('event', '=', event)
    .where('resourceId', '=', resourceId)
    .executeTakeFirst();
  return Number((result as any)?.count ?? 0);
}

describe('ENG-1373: per-page ACL + filterAccessiblePageIds + audit', () => {
  let testDb: TestDb;
  let workspaceId: string;
  let spaceId: string;
  let admin: { id: string };
  let permissionsService: OrvexPermissionsService;
  let controller: PagePermissionController;
  let pagePermissionRepo: PagePermissionRepo;
  let pageRepo: PageRepo;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const workspace = await seedWorkspace(testDb.db);
    workspaceId = workspace.id;
    admin = await seedUser(testDb.db, workspaceId);
    const space = await seedSpace(testDb.db, workspaceId, admin.id);
    spaceId = space.id;
    await seedSpaceMember(testDb.db, {
      spaceId,
      userId: admin.id,
      role: SpaceRole.ADMIN,
    });

    const db = testDb.db as unknown as import('@docmost/db/types/kysely.types').KyselyDB;
    const groupRepo = new GroupRepo(db);
    const spaceRepo = new SpaceRepo(db, new EventEmitter2());
    const spaceMemberRepo = new SpaceMemberRepo(
      db,
      groupRepo,
      spaceRepo,
      fakeCache(),
    );
    const wsServiceStub = { emitInvalidate: () => {} } as any;
    pageRepo = new PageRepo(
      db,
      spaceMemberRepo,
      new EventEmitter2(),
      new OutboxWriter(db),
      wsServiceStub,
    );
    pagePermissionRepo = new PagePermissionRepo(db, groupRepo, fakeCache());
    const spaceAbility = new SpaceAbilityFactory(spaceMemberRepo);
    permissionsService = new OrvexPermissionsService(
      pageRepo,
      pagePermissionRepo,
      spaceAbility,
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

  async function memberWithRole(role: string) {
    const user = await seedUser(testDb.db, workspaceId);
    await seedSpaceMember(testDb.db, { spaceId, userId: user.id, role });
    return user;
  }

  it('TestEvalPage_HonoursPageRestriction — restricted page excludes read/edit for a user with space-Read but no ACL grant; filterAccessiblePageIds drops it too', async () => {
    const reader = await memberWithRole(SpaceRole.READER);
    const outsider = await memberWithRole(SpaceRole.READER);

    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a0',
      title: 'eng1373-a0',
    });

    const group = await seedGroup(testDb.db, workspaceId);
    await seedGroupUser(testDb.db, { groupId: group.id, userId: reader.id });

    // Restrict the page to `group` only — `outsider` (space-Read) is NOT a
    // member of that group.
    await controller.restrict({ pageId: page.id }, admin as any, {
      id: workspaceId,
    } as any);
    await controller.addPermission(
      { pageId: page.id, groupId: group.id, role: PagePermissionRole.READER },
      admin as any,
      { id: workspaceId } as any,
    );

    const evaluated = await permissionsService.evaluateOne(outsider as any, {
      subject: 'Page',
      id: page.id,
    });
    expect(evaluated.actions).not.toContain('read');
    expect(evaluated.actions).not.toContain('edit');

    const filtered = await pagePermissionRepo.filterAccessiblePageIds({
      pageIds: [page.id],
      userId: outsider.id,
    });
    expect(filtered).not.toContain(page.id);

    // The group member (reader role) DOES get read, but not edit.
    const memberEval = await permissionsService.evaluateOne(reader as any, {
      subject: 'Page',
      id: page.id,
    });
    expect(memberEval.actions).toContain('read');
    expect(memberEval.actions).not.toContain('edit');
  });

  it('AC1 — an unrestricted sibling page returns the space actions verbatim', async () => {
    const writer = await memberWithRole(SpaceRole.WRITER);
    const sibling = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a1',
      title: 'eng1373-a1',
    });

    const evaluated = await permissionsService.evaluateOne(writer as any, {
      subject: 'Page',
      id: sibling.id,
    });
    expect(evaluated.actions).toEqual(expect.arrayContaining(['read', 'edit']));
  });

  it('AC2/AC10 — filterAccessiblePageIds mixes accessible and restricted-inaccessible ids via a single query', async () => {
    const reader = await memberWithRole(SpaceRole.READER);
    const accessiblePage = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a2',
      title: 'eng1373-a2',
    });
    const restrictedPage = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a3',
      title: 'eng1373-a3',
    });
    await controller.restrict({ pageId: restrictedPage.id }, admin as any, {
      id: workspaceId,
    } as any);

    const filtered = await pagePermissionRepo.filterAccessiblePageIds({
      pageIds: [accessiblePage.id, restrictedPage.id],
      userId: reader.id,
    });
    expect(filtered).toContain(accessiblePage.id);
    expect(filtered).not.toContain(restrictedPage.id);
  });

  it('AC3 — grant + audit: add-permission inserts an ACL row and exactly one page.permission_added audit row', async () => {
    const user = await memberWithRole(SpaceRole.READER);
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a4',
      title: 'eng1373-a4',
    });
    await controller.restrict({ pageId: page.id }, admin as any, {
      id: workspaceId,
    } as any);

    await controller.addPermission(
      { pageId: page.id, userId: user.id, role: PagePermissionRole.READER },
      admin as any,
      { id: workspaceId } as any,
    );

    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    const row = await pagePermissionRepo.findPagePermissionByUserId(
      pageAccess!.id,
      user.id,
    );
    expect(row).toBeDefined();

    const auditCount = await countAuditRows(
      testDb,
      AuditEvent.PAGE_PERMISSION_ADDED,
      page.id,
    );
    expect(auditCount).toBe(1);
  });

  it('AC4 — revoke + audit: remove-permission deletes the row and emits exactly one page.permission_removed audit row', async () => {
    const user = await memberWithRole(SpaceRole.READER);
    const writer = await memberWithRole(SpaceRole.WRITER);
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a5',
      title: 'eng1373-a5',
    });
    await controller.restrict({ pageId: page.id }, admin as any, {
      id: workspaceId,
    } as any);
    // second writer so removing `user`'s reader grant never touches the
    // last-writer guard
    await controller.addPermission(
      { pageId: page.id, userId: writer.id, role: PagePermissionRole.WRITER },
      admin as any,
      { id: workspaceId } as any,
    );
    await controller.addPermission(
      { pageId: page.id, userId: user.id, role: PagePermissionRole.READER },
      admin as any,
      { id: workspaceId } as any,
    );

    await controller.removePermission(
      { pageId: page.id, userId: user.id },
      admin as any,
      { id: workspaceId } as any,
    );

    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    const row = await pagePermissionRepo.findPagePermissionByUserId(
      pageAccess!.id,
      user.id,
    );
    expect(row).toBeUndefined();

    const auditCount = await countAuditRows(
      testDb,
      AuditEvent.PAGE_PERMISSION_REMOVED,
      page.id,
    );
    expect(auditCount).toBe(1);
  });

  it('AC5 — role-change + audit: update-permission changes the role and emits exactly one page.permission_role_updated audit row', async () => {
    const user = await memberWithRole(SpaceRole.READER);
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a6',
      title: 'eng1373-a6',
    });
    await controller.restrict({ pageId: page.id }, admin as any, {
      id: workspaceId,
    } as any);
    await controller.addPermission(
      { pageId: page.id, userId: user.id, role: PagePermissionRole.READER },
      admin as any,
      { id: workspaceId } as any,
    );

    await controller.updatePermission(
      { pageId: page.id, userId: user.id, role: PagePermissionRole.WRITER },
      admin as any,
      { id: workspaceId } as any,
    );

    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    const row = await pagePermissionRepo.findPagePermissionByUserId(
      pageAccess!.id,
      user.id,
    );
    expect(row?.role).toBe(PagePermissionRole.WRITER);

    const auditCount = await countAuditRows(
      testDb,
      AuditEvent.PAGE_PERMISSION_ROLE_UPDATED,
      page.id,
    );
    expect(auditCount).toBe(1);
  });

  it('AC6 — restrict then remove-restriction: non-granted member excluded then included again', async () => {
    const member = await memberWithRole(SpaceRole.READER);
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a7',
      title: 'eng1373-a7',
    });

    await controller.restrict({ pageId: page.id }, admin as any, {
      id: workspaceId,
    } as any);
    let filtered = await pagePermissionRepo.filterAccessiblePageIds({
      pageIds: [page.id],
      userId: member.id,
    });
    expect(filtered).not.toContain(page.id);

    await controller.removeRestriction({ pageId: page.id }, admin as any, {
      id: workspaceId,
    } as any);
    filtered = await pagePermissionRepo.filterAccessiblePageIds({
      pageIds: [page.id],
      userId: member.id,
    });
    expect(filtered).toContain(page.id);
  });

  it('AC7 — last-writer guard rejects removing or demoting the sole remaining writer', async () => {
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a8',
      title: 'eng1373-a8',
    });
    // restrict() makes `admin` the sole writer.
    await controller.restrict({ pageId: page.id }, admin as any, {
      id: workspaceId,
    } as any);

    await expect(
      controller.removePermission(
        { pageId: page.id, userId: admin.id },
        admin as any,
        { id: workspaceId } as any,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.updatePermission(
        { pageId: page.id, userId: admin.id, role: PagePermissionRole.READER },
        admin as any,
        { id: workspaceId } as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('ENG-1596 AC6 — reject path: both userId+groupId or neither is a 400 on every mutating endpoint, no ACL row / audit row written', async () => {
    const user = await memberWithRole(SpaceRole.READER);
    const group = await seedGroup(testDb.db, workspaceId);
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a7b',
      title: 'eng1596-ac6',
    });
    await controller.restrict({ pageId: page.id }, admin as any, {
      id: workspaceId,
    } as any);

    // both principals provided
    await expect(
      controller.addPermission(
        {
          pageId: page.id,
          userId: user.id,
          groupId: group.id,
          role: PagePermissionRole.READER,
        } as any,
        admin as any,
        { id: workspaceId } as any,
      ),
    ).rejects.toThrow(BadRequestException);

    // neither principal provided
    await expect(
      controller.addPermission(
        { pageId: page.id, role: PagePermissionRole.READER } as any,
        admin as any,
        { id: workspaceId } as any,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.removePermission(
        { pageId: page.id, userId: user.id, groupId: group.id } as any,
        admin as any,
        { id: workspaceId } as any,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.updatePermission(
        { pageId: page.id, role: PagePermissionRole.WRITER } as any,
        admin as any,
        { id: workspaceId } as any,
      ),
    ).rejects.toThrow(BadRequestException);

    // No permission row was ever inserted for either principal, and no
    // audit row was emitted — the reject happens before any ACL write.
    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    expect(
      await pagePermissionRepo.findPagePermissionByUserId(
        pageAccess!.id,
        user.id,
      ),
    ).toBeUndefined();
    expect(
      await pagePermissionRepo.findPagePermissionByGroupId(
        pageAccess!.id,
        group.id,
      ),
    ).toBeUndefined();
    expect(
      await countAuditRows(testDb, AuditEvent.PAGE_PERMISSION_ADDED, page.id),
    ).toBe(0);
  });

  it('AC8 — IDOR: a non-admin caller is rejected 403 on every mutating endpoint and mutates nothing / emits no audit rows', async () => {
    const writer = await memberWithRole(SpaceRole.WRITER);
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a9',
      title: 'eng1373-a9',
    });

    await expect(
      controller.restrict({ pageId: page.id }, writer as any, {
        id: workspaceId,
      } as any),
    ).rejects.toThrow(ForbiddenException);

    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    expect(pageAccess).toBeUndefined();

    const auditCount = await countAuditRows(
      testDb,
      AuditEvent.PAGE_RESTRICTED,
      page.id,
    );
    expect(auditCount).toBe(0);
  });

  it('AC9 — forward-compat: an unrecognised ACL role fails closed (no read, no edit), never full access', async () => {
    const member = await memberWithRole(SpaceRole.READER);
    const page = await seedPage(testDb.db, {
      spaceId,
      workspaceId,
      creatorId: admin.id,
      position: 'a10',
      title: 'eng1373-a10',
    });
    await controller.restrict({ pageId: page.id }, admin as any, {
      id: workspaceId,
    } as any);

    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    // Insert a permission row with a role value the service does not
    // recognise (bypassing the DTO's IsEnum validation on purpose, to
    // simulate a future/foreign role value already present in the DB).
    await pagePermissionRepo.insertPagePermissions([
      {
        pageAccessId: pageAccess!.id,
        userId: member.id,
        role: 'super-future-role',
        addedById: admin.id,
      },
    ]);

    const evaluated = await permissionsService.evaluateOne(member as any, {
      subject: 'Page',
      id: page.id,
    });
    expect(evaluated.actions).not.toContain('read');
    expect(evaluated.actions).not.toContain('edit');
    expect(evaluated.actions).toEqual([]);
  });
});
