import { Injectable } from '@nestjs/common';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import {
  CursorPaginationResult,
  emptyCursorPaginationResult,
} from '@docmost/db/pagination/cursor-pagination';
import { PagePermissionMember } from '@docmost/db/repos/page/page-permission.repo';

export interface RestrictionInfo {
  hasDirectRestriction: boolean;
  hasInheritedRestriction: boolean;
  inheritedFrom: string | null;
  userAccess: {
    canAccess: boolean;
    canEdit: boolean;
  };
}

/**
 * ENG-1596 — the domain tier for the page-permissions read side (CS §6:
 * controller = thin handler, service = domain, repo = store).
 *
 * `getRestrictionInfo` is the genuine composition (CS §3 deep module): it
 * assembles a single client-facing shape from three independent repo reads
 * (`findPageAccessByPageId`'s cousin `getUserPageAccessLevel` for the
 * direct/inherited/access flags, `findRestrictedAncestor` for the
 * inherited-from page id). `listPermissions` is a thin wrap of
 * `getPagePermissionsPaginated` — justified because both methods live
 * behind the controller's shared IDOR guard (AC7).
 */
@Injectable()
export class PagePermissionService {
  constructor(private readonly pagePermissionRepo: PagePermissionRepo) {}

  /**
   * AC1, AC8 — N seeded grants come back paginated with principal + role;
   * an unrestricted (no `pageAccess` row) page returns an empty page, never
   * an error.
   */
  async listPermissions(
    pageId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<PagePermissionMember>> {
    const pageAccess =
      await this.pagePermissionRepo.findPageAccessByPageId(pageId);
    if (!pageAccess) {
      return emptyCursorPaginationResult<PagePermissionMember>(
        pagination.limit,
      );
    }
    return this.pagePermissionRepo.getPagePermissionsPaginated(
      pageAccess.id,
      pagination,
    );
  }

  /**
   * AC2, AC3, AC4, AC8 — `hasDirectRestriction`/`hasInheritedRestriction`/
   * `userAccess` come from the single `getUserPageAccessLevel` repo query
   * (CS §11 — one real source, no duplicated/derived booleans);
   * `inheritedFrom` is resolved separately via `findRestrictedAncestor`
   * ONLY when the access-level read says the restriction is inherited
   * (never on a direct restriction or an unrestricted page).
   */
  async getRestrictionInfo(
    pageId: string,
    userId: string,
  ): Promise<RestrictionInfo> {
    const accessLevel = await this.pagePermissionRepo.getUserPageAccessLevel(
      userId,
      pageId,
    );

    let inheritedFrom: string | null = null;
    if (accessLevel.hasInheritedRestriction) {
      const restrictedAncestor =
        await this.pagePermissionRepo.findRestrictedAncestor(pageId);
      // Defensive: only a *different* page counts as "inherited from" — a
      // direct restriction on this same page is not an inheritance source.
      if (restrictedAncestor && restrictedAncestor.pageId !== pageId) {
        inheritedFrom = restrictedAncestor.pageId;
      }
    }

    return {
      hasDirectRestriction: accessLevel.hasDirectRestriction,
      hasInheritedRestriction: accessLevel.hasInheritedRestriction,
      inheritedFrom,
      userAccess: {
        canAccess: accessLevel.canAccess,
        canEdit: accessLevel.canEdit,
      },
    };
  }
}
