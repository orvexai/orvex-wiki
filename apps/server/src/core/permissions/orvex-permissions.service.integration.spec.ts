import { OrvexPermissionsService } from './orvex-permissions.service';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { SpaceRole } from '../../common/helpers/types/permission';
import {
  bootstrapIntegrationDb,
  DbSeedHelper,
  IntegrationDbContext,
  truncateAll,
} from '@docmost/db/test-support/testcontainers-db';

/**
 * Named DoD test (ENG-1373 §5a) + the FR-13 filter + fail-closed unknown-role
 * assertions, all against a REAL Postgres (testcontainers) — never mocking
 * `PagePermissionRepo`/`OrvexPermissionsService`/`SpaceAbilityFactory`
 * themselves (CS §5, ❌#4). Timeouts are generous: first run pulls the
 * postgres:17-trixie image.
 */
describe('OrvexPermissionsService — evalPage honours page restriction (integration)', () => {
  jest.setTimeout(120_000);

  let ctx: IntegrationDbContext;
  let seed: DbSeedHelper;
  let service: OrvexPermissionsService;
  let pagePermissionRepo: PagePermissionRepo;

  beforeAll(async () => {
    ctx = await bootstrapIntegrationDb();
    seed = new DbSeedHelper(ctx.db);

    pagePermissionRepo = ctx.moduleRef.get(PagePermissionRepo);
    const pageRepo = ctx.moduleRef.get(PageRepo);
    const spaceAbility = ctx.moduleRef.get(SpaceAbilityFactory);
    service = new OrvexPermissionsService(
      pagePermissionRepo,
      pageRepo,
      spaceAbility,
    );
    // silence the unused-repo lint concern for repos only needed for typing
    void ctx.moduleRef.get(SpaceRepo);
    void ctx.moduleRef.get(SpaceMemberRepo);
    void ctx.moduleRef.get(GroupRepo);
  });

  afterAll(async () => {
    await ctx.teardown();
  });

  afterEach(async () => {
    await truncateAll(ctx.db);
  });

  async function seedRestrictedFixture() {
    const workspace = await seed.workspace();
    const spaceUser = await seed.user(workspace.id, { name: 'Space Reader U' });
    const otherUser = await seed.user(workspace.id, { name: 'Grantee W' });
    const space = await seed.space(workspace.id);
    await seed.spaceMember(space.id, {
      userId: spaceUser.id,
      role: SpaceRole.READER,
    });
    await seed.spaceMember(space.id, {
      userId: otherUser.id,
      role: SpaceRole.READER,
    });

    const restrictedPage = await seed.page(workspace.id, space.id, {
      title: 'Restricted Page',
    });
    const siblingPage = await seed.page(workspace.id, space.id, {
      title: 'Unrestricted Sibling',
    });

    const excludedGroup = await seed.group(workspace.id, {
      name: 'Group U is NOT in',
    });
    // otherUser (not spaceUser) is a member of the granted group.
    await seed.groupUser(excludedGroup.id, otherUser.id);

    const pageAccess = await pagePermissionRepo.insertPageAccess({
      pageId: restrictedPage.id,
      workspaceId: workspace.id,
      spaceId: space.id,
      accessLevel: 'restricted',
      creatorId: otherUser.id,
    });
    await pagePermissionRepo.insertPagePermissions([
      {
        pageAccessId: pageAccess.id,
        groupId: excludedGroup.id,
        role: 'reader',
        addedById: otherUser.id,
      },
    ]);

    return { workspace, space, spaceUser, otherUser, restrictedPage, siblingPage };
  }

  it('TestEvalPage_HonoursPageRestriction: excludes read/edit for a user outside the restricted group, but keeps space actions on an unrestricted sibling', async () => {
    const { spaceUser, restrictedPage, siblingPage } =
      await seedRestrictedFixture();

    const restricted = await service.evaluateOne(spaceUser, {
      subject: 'Page',
      id: restrictedPage.id,
    });
    expect(restricted.actions).not.toContain('read');
    expect(restricted.actions).not.toContain('edit');

    const sibling = await service.evaluateOne(spaceUser, {
      subject: 'Page',
      id: siblingPage.id,
    });
    expect(sibling.actions).toContain('read');
  });

  it('AC2/FR-13: filterAccessiblePageIds drops the restricted-inaccessible id and keeps the accessible one', async () => {
    const { spaceUser, restrictedPage, siblingPage } =
      await seedRestrictedFixture();

    const result = await service.filterAccessiblePageIds({
      pageIds: [restrictedPage.id, siblingPage.id],
      userId: spaceUser.id,
    });

    expect(result).not.toContain(restrictedPage.id);
    expect(result).toContain(siblingPage.id);
  });

  it('AC9 fail-closed: an unrecognised ACL role on the grantee yields no read/edit, never full access', async () => {
    const workspace = await seed.workspace();
    const admin = await seed.user(workspace.id);
    const grantee = await seed.user(workspace.id);
    const space = await seed.space(workspace.id);
    await seed.spaceMember(space.id, {
      userId: grantee.id,
      role: SpaceRole.WRITER,
    });
    const page = await seed.page(workspace.id, space.id);

    const pageAccess = await pagePermissionRepo.insertPageAccess({
      pageId: page.id,
      workspaceId: workspace.id,
      spaceId: space.id,
      accessLevel: 'restricted',
      creatorId: admin.id,
    });
    // A role value this build has never heard of (added by a future migration).
    await pagePermissionRepo.insertPagePermissions([
      {
        pageAccessId: pageAccess.id,
        userId: grantee.id,
        role: 'future-super-role',
        addedById: admin.id,
      },
    ]);

    const result = await service.evaluateOne(grantee, {
      subject: 'Page',
      id: page.id,
    });

    expect(result.actions).not.toContain('read');
    expect(result.actions).not.toContain('edit');
  });

  it('no restriction anywhere in the ancestor chain: space actions returned verbatim', async () => {
    const workspace = await seed.workspace();
    const writer = await seed.user(workspace.id);
    const space = await seed.space(workspace.id);
    await seed.spaceMember(space.id, {
      userId: writer.id,
      role: SpaceRole.WRITER,
    });
    const page = await seed.page(workspace.id, space.id);

    const result = await service.evaluateOne(writer, {
      subject: 'Page',
      id: page.id,
    });

    expect(result.actions).toEqual(expect.arrayContaining(['read', 'edit']));
  });
});
