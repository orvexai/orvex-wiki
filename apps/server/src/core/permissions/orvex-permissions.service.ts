import { BadRequestException, Injectable } from '@nestjs/common';
import { User } from '@docmost/db/types/entity.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { PagePermissionRole } from '../../common/helpers/types/permission';
import {
  OrvexAction,
  OrvexEvalResult,
  OrvexEvalSubject,
} from './orvex-permissions.types';

/**
 * Known page-permission ACL roles this build understands. A role value added
 * by a later migration that this build has never heard of MUST fail closed
 * (no access), never fall open to the space-level actions (AC9, CS §10).
 */
const KNOWN_PAGE_PERMISSION_ROLES = new Set<string>([
  PagePermissionRole.READER,
  PagePermissionRole.WRITER,
]);

/**
 * The authorization-evaluation domain module (CS §7 seam, in-process — no new
 * network port). `evaluateOne`/`evaluateBatch` are the public contract every
 * satellite read narrows through; `filterAccessiblePageIds` is FR-13.
 *
 * All ACL storage/CTE reads route through `PagePermissionRepo` (the one deep
 * ACL module, CS §3) — this service never touches Kysely directly (❌#2/❌#12).
 */
@Injectable()
export class OrvexPermissionsService {
  constructor(
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async evaluateOne(
    user: User,
    target: OrvexEvalSubject,
  ): Promise<OrvexEvalResult> {
    if (target.subject !== 'Page') {
      throw new BadRequestException(
        `Unsupported permission-evaluation subject: ${target.subject}`,
      );
    }
    return this.evalPage(user, target.id);
  }

  async evaluateBatch(
    user: User,
    targets: OrvexEvalSubject[],
  ): Promise<OrvexEvalResult[]> {
    return Promise.all(targets.map((target) => this.evaluateOne(user, target)));
  }

  /**
   * FR-13 — a single set-based (recursive-CTE) batch filter, never a per-id
   * loop (AC10). Delegates entirely to the deep repo.
   */
  async filterAccessiblePageIds(opts: {
    pageIds: string[];
    userId: string;
    spaceId?: string;
  }): Promise<string[]> {
    return this.pagePermissionRepo.filterAccessiblePageIds(opts);
  }

  /**
   * evalPage — resolves a page's effective actions for `user`.
   *
   * FIXED DEFECT: this no longer returns the page's *space* actions verbatim.
   * When the page (or an ancestor) carries a per-page restriction, the ACL is
   * authoritative: it can only narrow the space actions, never widen them,
   * and an unrestricted-inaccessible outcome (or an unrecognised ACL role)
   * drops `read`/`edit` entirely — fail-closed (AC1, AC9).
   */
  private async evalPage(
    user: User,
    pageId: string,
  ): Promise<OrvexEvalResult> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) {
      return { subject: 'Page', id: pageId, actions: [] };
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    const spaceActions = new Set<OrvexAction>();
    if (ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      spaceActions.add('read');
    }
    if (ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      spaceActions.add('edit');
    }

    const accessLevel = await this.pagePermissionRepo.getUserPageAccessLevel(
      user.id,
      pageId,
    );

    // No page-level ACL anywhere in the ancestor chain — space actions are
    // authoritative, returned verbatim (this is the ONLY case they are).
    if (!accessLevel.hasAnyRestriction) {
      return { subject: 'Page', id: pageId, actions: [...spaceActions] };
    }

    // Restricted, and the user has no grant on the restricted ancestor chain
    // at all: fail closed, no actions — regardless of space role.
    if (!accessLevel.canAccess) {
      return { subject: 'Page', id: pageId, actions: [] };
    }

    // Fail-closed forward-compat (AC9): validate the user's own direct grant
    // (if any) on THIS page carries a role this build recognises. An
    // unrecognised role is treated as no access, never full/open access.
    const directGrant = await this.pagePermissionRepo.getUserPagePermission(
      user.id,
      pageId,
    );
    if (directGrant && !KNOWN_PAGE_PERMISSION_ROLES.has(directGrant.role)) {
      return { subject: 'Page', id: pageId, actions: [] };
    }

    const actions: OrvexAction[] = ['read'];
    if (accessLevel.canEdit && spaceActions.has('edit')) {
      actions.push('edit');
    }
    return { subject: 'Page', id: pageId, actions };
  }
}
