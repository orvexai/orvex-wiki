import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { PageAccessLevel } from '../../common/helpers/types/permission';
import {
  AddPagePermissionDto,
  PageIdOnlyDto,
  PagePermissionsListDto,
  RemovePagePermissionDto,
  UpdatePagePermissionRoleDto,
} from './dto/page-permission.dto';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';

/**
 * Per-page permission (ACL) management — grant/revoke/role-change, restrict/
 * unrestrict. Controller is thin (CS §7/4h#1): guard → resolve → repo →
 * serialize. Every mutation is gated on space-admin (`Manage, Settings`) —
 * the same bar the existing "permanently delete" path uses — never merely
 * space-Read/Write (AC8, zero-trust).
 */
@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PagePermissionController {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private async requireManagePermission(pageId: string, user: User) {
    const page = await this.pageRepo.findById(pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException(
        'Only space admins can manage page permissions',
      );
    }
    return page;
  }

  private validatePrincipal(dto: { userId?: string; groupId?: string }) {
    if (!dto.userId && !dto.groupId) {
      throw new ConflictException('Either userId or groupId is required');
    }
    if (dto.userId && dto.groupId) {
      throw new ConflictException('Only one of userId or groupId is allowed');
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('restrict')
  async restrict(@Body() dto: PageIdOnlyDto, @AuthUser() user: User) {
    const page = await this.requireManagePermission(dto.pageId, user);

    const existing = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (existing) {
      throw new ConflictException('Page is already restricted');
    }

    const pageAccess = await this.pagePermissionRepo.insertPageAccess({
      pageId: page.id,
      workspaceId: page.workspaceId,
      spaceId: page.spaceId,
      accessLevel: PageAccessLevel.RESTRICTED,
      creatorId: user.id,
    });

    // The actor granting the restriction is always seeded as a writer so the
    // page never becomes a restricted-with-no-writer orphan (AC7 invariant
    // holds from the very first mutation).
    await this.pagePermissionRepo.insertPagePermissions([
      {
        pageAccessId: pageAccess.id,
        userId: user.id,
        role: 'writer',
        addedById: user.id,
      },
    ]);

    this.auditService.log({
      event: AuditEvent.PAGE_RESTRICTED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { actorId: user.id },
    });

    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-restriction')
  async removeRestriction(@Body() dto: PageIdOnlyDto, @AuthUser() user: User) {
    const page = await this.requireManagePermission(dto.pageId, user);

    const existing = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!existing) {
      throw new NotFoundException('Page is not restricted');
    }

    await this.pagePermissionRepo.deletePageAccess(page.id);

    this.auditService.log({
      event: AuditEvent.PAGE_RESTRICTION_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: { actorId: user.id },
    });

    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('add-permission')
  async addPermission(
    @Body() dto: AddPagePermissionDto,
    @AuthUser() user: User,
  ) {
    this.validatePrincipal(dto);
    const page = await this.requireManagePermission(dto.pageId, user);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      throw new NotFoundException(
        'Page must be restricted before granting page-level permissions',
      );
    }

    await this.pagePermissionRepo.insertPagePermissions([
      {
        pageAccessId: pageAccess.id,
        userId: dto.userId ?? null,
        groupId: dto.groupId ?? null,
        role: dto.role,
        addedById: user.id,
      },
    ]);

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_ADDED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        actorId: user.id,
        targetUserId: dto.userId,
        targetGroupId: dto.groupId,
        role: dto.role,
      },
    });

    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-permission')
  async removePermission(
    @Body() dto: RemovePagePermissionDto,
    @AuthUser() user: User,
  ) {
    this.validatePrincipal(dto);
    const page = await this.requireManagePermission(dto.pageId, user);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      throw new NotFoundException('Page is not restricted');
    }

    await this.assertNotLastWriter(pageAccess.id, dto);

    if (dto.userId) {
      await this.pagePermissionRepo.deletePagePermissionByUserId(
        pageAccess.id,
        dto.userId,
      );
    } else {
      await this.pagePermissionRepo.deletePagePermissionByGroupId(
        pageAccess.id,
        dto.groupId,
      );
    }

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        actorId: user.id,
        targetUserId: dto.userId,
        targetGroupId: dto.groupId,
      },
    });

    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-permission')
  async updatePermission(
    @Body() dto: UpdatePagePermissionRoleDto,
    @AuthUser() user: User,
  ) {
    this.validatePrincipal(dto);
    const page = await this.requireManagePermission(dto.pageId, user);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      throw new NotFoundException('Page is not restricted');
    }

    if (dto.role !== 'writer') {
      await this.assertNotLastWriter(pageAccess.id, dto);
    }

    await this.pagePermissionRepo.updatePagePermissionRole(
      pageAccess.id,
      dto.role,
      { userId: dto.userId, groupId: dto.groupId },
    );

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_ROLE_UPDATED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      metadata: {
        actorId: user.id,
        targetUserId: dto.userId,
        targetGroupId: dto.groupId,
        role: dto.role,
      },
    });

    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('permissions')
  async listPermissions(
    @Body() dto: PagePermissionsListDto,
    @AuthUser() user: User,
  ) {
    const page = await this.requireManagePermission(dto.pageId, user);

    const pageAccess = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!pageAccess) {
      return { items: [], meta: { hasNextPage: false, hasPrevPage: false } };
    }

    return this.pagePermissionRepo.getPagePermissionsPaginated(
      pageAccess.id,
      { limit: 50, cursor: dto.cursor, query: dto.query, adminView: false },
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('permission-info')
  async permissionInfo(@Body() dto: PageIdOnlyDto, @AuthUser() user: User) {
    const page = await this.requireManagePermission(dto.pageId, user);
    return this.pagePermissionRepo.getUserPageAccessLevel(user.id, page.id);
  }

  /**
   * Last-writer guard (AC7): reject a removal/demotion that would leave a
   * restricted page with zero writers — never orphan it.
   */
  private async assertNotLastWriter(
    pageAccessId: string,
    principal: { userId?: string; groupId?: string },
  ) {
    if (!principal.userId && !principal.groupId) return;

    const current = principal.userId
      ? await this.pagePermissionRepo.findPagePermissionByUserId(
          pageAccessId,
          principal.userId,
        )
      : await this.pagePermissionRepo.findPagePermissionByGroupId(
          pageAccessId,
          principal.groupId,
        );

    if (current?.role !== 'writer') return;

    const writerCount =
      await this.pagePermissionRepo.countWritersByPageAccessId(pageAccessId);
    if (writerCount <= 1) {
      throw new ConflictException(
        'Cannot remove the last writer of a restricted page',
      );
    }
  }
}
