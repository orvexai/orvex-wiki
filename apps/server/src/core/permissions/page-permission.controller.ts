import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import {
  PageAccessLevel,
  PagePermissionRole,
} from '../../common/helpers/types/permission';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { OrvexAuditService } from '../audit/orvex-audit.service';
import {
  AddPagePermissionDto,
  ListPagePermissionsDto,
  RemovePagePermissionDto,
  RemoveRestrictionDto,
  RestrictionInfoDto,
  RestrictPageDto,
  UpdatePagePermissionDto,
} from './dto/page-permission.dto';
import { PagePermissionService } from './page-permission.service';

/**
 * ENG-1373 — permission-mutating endpoints for the per-page ACL primitive.
 *
 * PLACEMENT: see `orvex-permissions.service.ts` header — same A-BOUNDARY
 * deviation as `core/api-key` (ENG-1380/ENG-1473 precedent).
 *
 * AC8 (IDOR): every mutating endpoint requires `Manage,Settings` on the
 * page's space (space-admin only) — checked BEFORE any read/write of ACL
 * state, so a rejected caller mutates nothing and produces zero audit rows.
 * AC7 (last-writer guard): `countWritersByPageAccessId` blocks removing or
 * demoting the sole remaining writer of a restricted page.
 */
@UseGuards(JwtAuthGuard)
@Controller('page-permissions')
export class PagePermissionController {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly orvexAudit: OrvexAuditService,
    private readonly pagePermissionService: PagePermissionService,
  ) {}

  /**
   * ENG-1596 (AC1, AC7, AC8) — list-permissions read. Thin handler: authz
   * (the SAME `assertCanManage` IDOR choke point the mutations use, per the
   * ticket's DoD checklist — fail-closed before any ACL row is read) ->
   * parse DTO -> ONE service call -> return. No business logic here.
   */
  @HttpCode(HttpStatus.OK)
  @Post('list')
  async list(
    @Body() dto: ListPagePermissionsDto,
    @AuthUser() user: User,
  ) {
    const page = await this.loadPageOrThrow(dto.pageId);
    await this.assertCanManage(user, page);
    return this.pagePermissionService.listPermissions(page.id, dto);
  }

  /**
   * ENG-1596 (AC2-AC4, AC7, AC8) — restriction-info read. Same guard,
   * same thin-handler shape as `list` above.
   */
  @HttpCode(HttpStatus.OK)
  @Post('restriction-info')
  async restrictionInfo(
    @Body() dto: RestrictionInfoDto,
    @AuthUser() user: User,
  ) {
    const page = await this.loadPageOrThrow(dto.pageId);
    await this.assertCanManage(user, page);
    return this.pagePermissionService.getRestrictionInfo(page.id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('restrict')
  async restrict(
    @Body() dto: RestrictPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.loadPageOrThrow(dto.pageId);
    await this.assertCanManage(user, page);

    const existing = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (existing) {
      throw new BadRequestException('Page is already restricted');
    }

    return executeTx(this.db, async (trx) => {
      const pageAccess = await this.pagePermissionRepo.insertPageAccess(
        {
          pageId: page.id,
          workspaceId: page.workspaceId,
          spaceId: page.spaceId,
          accessLevel: PageAccessLevel.RESTRICTED,
          creatorId: user.id,
        },
        trx,
      );

      // The restricting admin is granted writer immediately, so restricting
      // a page never produces an orphaned no-writer restricted page.
      await this.pagePermissionRepo.insertPagePermissions(
        [
          {
            pageAccessId: pageAccess.id,
            userId: user.id,
            role: PagePermissionRole.WRITER,
            addedById: user.id,
          },
        ],
        trx,
      );

      await this.orvexAudit.logAndCommit(trx, {
        event: AuditEvent.PAGE_RESTRICTED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        workspaceId: workspace.id,
        actorId: user.id,
        actorType: 'user',
      });

      return { pageAccess };
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-restriction')
  async removeRestriction(
    @Body() dto: RemoveRestrictionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.loadPageOrThrow(dto.pageId);
    await this.assertCanManage(user, page);

    const existing = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!existing) {
      throw new BadRequestException('Page is not restricted');
    }

    return executeTx(this.db, async (trx) => {
      await this.pagePermissionRepo.deletePageAccess(page.id, trx);

      await this.orvexAudit.logAndCommit(trx, {
        event: AuditEvent.PAGE_RESTRICTION_REMOVED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        workspaceId: workspace.id,
        actorId: user.id,
        actorType: 'user',
      });

      return { success: true };
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('add-permission')
  async addPermission(
    @Body() dto: AddPagePermissionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.loadPageOrThrow(dto.pageId);
    await this.assertCanManage(user, page);
    const principal = this.assertSinglePrincipal(dto);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      throw new BadRequestException('Page is not restricted');
    }

    const existing =
      principal.type === 'user'
        ? await this.pagePermissionRepo.findPagePermissionByUserId(
            pageAccess.id,
            principal.id,
          )
        : await this.pagePermissionRepo.findPagePermissionByGroupId(
            pageAccess.id,
            principal.id,
          );
    if (existing) {
      throw new BadRequestException('Permission already exists');
    }

    return executeTx(this.db, async (trx) => {
      await this.pagePermissionRepo.insertPagePermissions(
        [
          {
            pageAccessId: pageAccess.id,
            userId: principal.type === 'user' ? principal.id : null,
            groupId: principal.type === 'group' ? principal.id : null,
            role: dto.role,
            addedById: user.id,
          },
        ],
        trx,
      );

      await this.orvexAudit.logAndCommit(trx, {
        event: AuditEvent.PAGE_PERMISSION_ADDED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        workspaceId: workspace.id,
        actorId: user.id,
        actorType: 'user',
        metadata: { [principal.type + 'Id']: principal.id, role: dto.role },
      });

      return { success: true };
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-permission')
  async removePermission(
    @Body() dto: RemovePagePermissionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.loadPageOrThrow(dto.pageId);
    await this.assertCanManage(user, page);
    const principal = this.assertSinglePrincipal(dto);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      throw new BadRequestException('Page is not restricted');
    }

    const existing =
      principal.type === 'user'
        ? await this.pagePermissionRepo.findPagePermissionByUserId(
            pageAccess.id,
            principal.id,
          )
        : await this.pagePermissionRepo.findPagePermissionByGroupId(
            pageAccess.id,
            principal.id,
          );
    if (!existing) {
      throw new NotFoundException('Permission not found');
    }

    // AC7 — last-writer guard: block removing the sole remaining writer.
    if (existing.role === PagePermissionRole.WRITER) {
      const writerCount = await this.pagePermissionRepo.countWritersByPageAccessId(
        pageAccess.id,
      );
      if (writerCount <= 1) {
        throw new BadRequestException(
          'Cannot remove the last writer of a restricted page',
        );
      }
    }

    return executeTx(this.db, async (trx) => {
      if (principal.type === 'user') {
        await this.pagePermissionRepo.deletePagePermissionByUserId(
          pageAccess.id,
          principal.id,
          trx,
        );
      } else {
        await this.pagePermissionRepo.deletePagePermissionByGroupId(
          pageAccess.id,
          principal.id,
          trx,
        );
      }

      await this.orvexAudit.logAndCommit(trx, {
        event: AuditEvent.PAGE_PERMISSION_REMOVED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        workspaceId: workspace.id,
        actorId: user.id,
        actorType: 'user',
        metadata: { [principal.type + 'Id']: principal.id },
      });

      return { success: true };
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-permission')
  async updatePermission(
    @Body() dto: UpdatePagePermissionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.loadPageOrThrow(dto.pageId);
    await this.assertCanManage(user, page);
    const principal = this.assertSinglePrincipal(dto);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      throw new BadRequestException('Page is not restricted');
    }

    const existing =
      principal.type === 'user'
        ? await this.pagePermissionRepo.findPagePermissionByUserId(
            pageAccess.id,
            principal.id,
          )
        : await this.pagePermissionRepo.findPagePermissionByGroupId(
            pageAccess.id,
            principal.id,
          );
    if (!existing) {
      throw new NotFoundException('Permission not found');
    }

    // AC7 — last-writer guard also applies to a writer->reader demotion.
    if (
      existing.role === PagePermissionRole.WRITER &&
      dto.role !== PagePermissionRole.WRITER
    ) {
      const writerCount = await this.pagePermissionRepo.countWritersByPageAccessId(
        pageAccess.id,
      );
      if (writerCount <= 1) {
        throw new BadRequestException(
          'Cannot demote the last writer of a restricted page',
        );
      }
    }

    return executeTx(this.db, async (trx) => {
      await this.pagePermissionRepo.updatePagePermissionRole(
        pageAccess.id,
        dto.role,
        principal.type === 'user'
          ? { userId: principal.id }
          : { groupId: principal.id },
        trx,
      );

      await this.orvexAudit.logAndCommit(trx, {
        event: AuditEvent.PAGE_PERMISSION_ROLE_UPDATED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        workspaceId: workspace.id,
        actorId: user.id,
        actorType: 'user',
        metadata: {
          [principal.type + 'Id']: principal.id,
          fromRole: existing.role,
          toRole: dto.role,
        },
      });

      return { success: true };
    });
  }

  private async loadPageOrThrow(pageId: string): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  /**
   * AC8 — the single IDOR choke point every mutating endpoint above passes
   * through, BEFORE any ACL row is read or written. Only space-admins
   * (`Manage,Settings`) may manage page permissions.
   */
  private async assertCanManage(user: User, page: Page): Promise<void> {
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException(
        'Only space admins may manage page permissions',
      );
    }
  }

  private assertSinglePrincipal(dto: {
    userId?: string;
    groupId?: string;
  }): { type: 'user' | 'group'; id: string } {
    if (dto.userId && dto.groupId) {
      throw new BadRequestException(
        'Provide exactly one of userId or groupId, not both',
      );
    }
    if (dto.userId) {
      return { type: 'user', id: dto.userId };
    }
    if (dto.groupId) {
      return { type: 'group', id: dto.groupId };
    }
    throw new BadRequestException('Provide either userId or groupId');
  }
}
