import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PagePermissionController } from './page-permission.controller';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { NoopAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent } from '../../common/events/audit-events';
import { SpaceRole } from '../../common/helpers/types/permission';
import {
  bootstrapIntegrationDb,
  DbSeedHelper,
  IntegrationDbContext,
  truncateAll,
} from '@docmost/db/test-support/testcontainers-db';

/**
 * Controller-level integration coverage for AC3–AC8 (grant/revoke/role-change
 * + audit, restrict/unrestrict, last-writer guard, IDOR) — real Postgres
 * (testcontainers), real repo, real `SpaceAbilityFactory`. The audit port
 * (`IAuditService`) is the one genuinely swappable external-facing adapter
 * (CS §5 "one-adapter rule") — asserting the controller's call-contract to it
 * via `NoopAuditService` + `jest.spyOn` is NOT mocking our own permission
 * logic/repo (❌#4); it is the seam every satellite audit-sink implementation
 * plugs into.
 */
describe('PagePermissionController (integration)', () => {
  jest.setTimeout(120_000);

  let ctx: IntegrationDbContext;
  let seed: DbSeedHelper;
  let pagePermissionRepo: PagePermissionRepo;
  let controller: PagePermissionController;
  let auditService: NoopAuditService;

  beforeAll(async () => {
    ctx = await bootstrapIntegrationDb();
    seed = new DbSeedHelper(ctx.db);

    pagePermissionRepo = ctx.moduleRef.get(PagePermissionRepo);
    const pageRepo = ctx.moduleRef.get(PageRepo);
    const spaceAbility = ctx.moduleRef.get(SpaceAbilityFactory);
    auditService = new NoopAuditService();
    controller = new PagePermissionController(
      pageRepo,
      pagePermissionRepo,
      spaceAbility,
      auditService,
    );
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await truncateAll(ctx.db);
  });

  async function seedSpace() {
    const workspace = await seed.workspace();
    const admin = await seed.user(workspace.id, { name: 'Admin' });
    const writer = await seed.user(workspace.id, { name: 'Writer' });
    const reader = await seed.user(workspace.id, { name: 'Reader' });
    const space = await seed.space(workspace.id);
    await seed.spaceMember(space.id, { userId: admin.id, role: SpaceRole.ADMIN });
    await seed.spaceMember(space.id, { userId: writer.id, role: SpaceRole.WRITER });
    await seed.spaceMember(space.id, { userId: reader.id, role: SpaceRole.READER });
    const page = await seed.page(workspace.id, space.id);
    return { workspace, space, admin, writer, reader, page };
  }

  it('AC3: restrict then add-permission inserts the ACL row and emits page.permission_added with actor+target+role', async () => {
    const { admin, writer, page } = await seedSpace();
    const logSpy = jest.spyOn(auditService, 'log');

    await controller.restrict({ pageId: page.id }, admin);
    await controller.addPermission(
      { pageId: page.id, userId: writer.id, role: 'reader' },
      admin,
    );

    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(page.id);
    const grant = await pagePermissionRepo.findPagePermissionByUserId(
      pageAccess.id,
      writer.id,
    );
    expect(grant?.role).toBe('reader');

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEvent.PAGE_PERMISSION_ADDED,
        resourceId: page.id,
        metadata: expect.objectContaining({
          actorId: admin.id,
          targetUserId: writer.id,
          role: 'reader',
        }),
      }),
    );
  });

  it('AC4: remove-permission deletes the row and emits page.permission_removed', async () => {
    const { admin, writer, page } = await seedSpace();
    await controller.restrict({ pageId: page.id }, admin);
    await controller.addPermission(
      { pageId: page.id, userId: writer.id, role: 'reader' },
      admin,
    );
    const logSpy = jest.spyOn(auditService, 'log');

    await controller.removePermission(
      { pageId: page.id, userId: writer.id },
      admin,
    );

    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(page.id);
    const grant = await pagePermissionRepo.findPagePermissionByUserId(
      pageAccess.id,
      writer.id,
    );
    expect(grant).toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.PAGE_PERMISSION_REMOVED }),
    );
  });

  it('AC5: update-permission changes the role and emits page.permission_role_updated', async () => {
    const { admin, writer, page } = await seedSpace();
    await controller.restrict({ pageId: page.id }, admin);
    await controller.addPermission(
      { pageId: page.id, userId: writer.id, role: 'reader' },
      admin,
    );
    const logSpy = jest.spyOn(auditService, 'log');

    await controller.updatePermission(
      { pageId: page.id, userId: writer.id, role: 'writer' },
      admin,
    );

    const pageAccess = await pagePermissionRepo.findPageAccessByPageId(page.id);
    const grant = await pagePermissionRepo.findPagePermissionByUserId(
      pageAccess.id,
      writer.id,
    );
    expect(grant?.role).toBe('writer');
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEvent.PAGE_PERMISSION_ROLE_UPDATED,
      }),
    );
  });

  it('AC6: restrict excludes a non-granted space member; remove-restriction restores full space-inherited access', async () => {
    const { admin, reader, page } = await seedSpace();

    await controller.restrict({ pageId: page.id }, admin);
    let filtered = await pagePermissionRepo.filterAccessiblePageIds({
      pageIds: [page.id],
      userId: reader.id,
    });
    expect(filtered).not.toContain(page.id);

    await controller.removeRestriction({ pageId: page.id }, admin);
    filtered = await pagePermissionRepo.filterAccessiblePageIds({
      pageIds: [page.id],
      userId: reader.id,
    });
    expect(filtered).toContain(page.id);
  });

  it('AC7: last-writer guard rejects removing the sole writer of a restricted page', async () => {
    const { admin, page } = await seedSpace();
    // restrict() seeds the actor (admin) as the sole writer.
    await controller.restrict({ pageId: page.id }, admin);

    await expect(
      controller.removePermission({ pageId: page.id, userId: admin.id }, admin),
    ).rejects.toBeInstanceOf(ConflictException);

    // and the same guard applies to a role-change demotion away from writer
    await expect(
      controller.updatePermission(
        { pageId: page.id, userId: admin.id, role: 'reader' },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('AC8 (IDOR): a caller without manage-permission on the space is rejected 403 and mutates nothing', async () => {
    const { admin, writer, page } = await seedSpace();
    await controller.restrict({ pageId: page.id }, admin);
    const before = await pagePermissionRepo.getPagePermissionsPaginated(
      (await pagePermissionRepo.findPageAccessByPageId(page.id)).id,
      { limit: 50, adminView: false } as never,
    );
    const logSpy = jest.spyOn(auditService, 'log');

    await expect(
      controller.addPermission(
        { pageId: page.id, userId: writer.id, role: 'writer' },
        writer, // writer is space-Writer, NOT space-Admin — must be rejected
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const after = await pagePermissionRepo.getPagePermissionsPaginated(
      (await pagePermissionRepo.findPageAccessByPageId(page.id)).id,
      { limit: 50, adminView: false } as never,
    );
    expect(after.items.length).toBe(before.items.length);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
