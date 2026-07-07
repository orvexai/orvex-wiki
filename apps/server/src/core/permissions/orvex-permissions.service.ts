import { Injectable, NotFoundException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { User } from '@docmost/db/types/entity.types';
import { PagePermissionRole } from '../../common/helpers/types/permission';

export type PermissionSubject = 'Space' | 'Page';

export interface EvaluateTarget {
  subject: PermissionSubject;
  id: string;
}

export interface EvaluationResult {
  subject: PermissionSubject;
  id: string;
  /** Lowercase CASL-style action strings, e.g. ['read', 'edit']. */
  actions: string[];
}

/**
 * ENG-1373 — the authorization-evaluation domain module.
 *
 * PLACEMENT DEVIATION (A-BOUNDARY, same precedent as `core/api-key`,
 * ENG-1473/ENG-1380): the ticket's dev-context path names
 * `apps/server/src/orvex/permissions/...`, but this service must
 * statically import `@docmost/db/*` (PagePermissionRepo, PageRepo) and
 * the CASL space-ability factory. The repo-root `no-restricted-imports`
 * boundary fence (`eslint.config.mjs`) forbids ANY `apps/server/src/orvex/**`
 * file from statically importing `@docmost/*`, with no per-file escape
 * hatch — so this lives in `core/permissions/` alongside the other
 * DB-backed core verticals, keeping the `Orvex`-prefixed class name the
 * ticket asks for.
 *
 * Evaluation contract (ADR-worthy, per the ticket's SE-Arch trigger):
 *   effective actions = space-ability ∩ page-ACL, fail-closed.
 * A per-page restriction can only ever NARROW what the space ability
 * already grants — it can never widen it. An unrecognised ACL role, or no
 * grant at all on a restricted page, denies ALL actions (not just edit).
 */
@Injectable()
export class OrvexPermissionsService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async evaluateOne(
    user: User,
    target: EvaluateTarget,
  ): Promise<EvaluationResult> {
    switch (target.subject) {
      case 'Page':
        return this.evalPage(user, target.id);
      case 'Space':
        return this.evalSpace(user, target.id);
      default:
        throw new NotFoundException(
          `Unsupported permission subject: ${target.subject}`,
        );
    }
  }

  async evaluateBatch(
    user: User,
    targets: EvaluateTarget[],
  ): Promise<EvaluationResult[]> {
    return Promise.all(targets.map((target) => this.evaluateOne(user, target)));
  }

  /**
   * Space-level actions for the Page subject. This is the pre-fix return
   * value of `evalPage` (verbatim space actions) — now used ONLY as the
   * ceiling that a page-level restriction intersects against.
   */
  private async evalSpace(
    user: User,
    spaceId: string,
  ): Promise<EvaluationResult> {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    const actions: string[] = [];
    if (ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      actions.push('read');
    }
    if (ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      actions.push('edit');
    }
    return { subject: 'Space', id: spaceId, actions };
  }

  /**
   * AC1 (defect fix) — consults the page-permission repo instead of
   * returning the space's actions verbatim.
   */
  private async evalPage(
    user: User,
    pageId: string,
  ): Promise<EvaluationResult> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const spaceResult = await this.evalSpace(user, page.spaceId);

    const restrictedAncestor =
      await this.pagePermissionRepo.findRestrictedAncestor(pageId);

    // No restriction anywhere in the ancestor chain (including self) — the
    // page fully inherits the space's actions, unrestricted.
    if (!restrictedAncestor) {
      return { subject: 'Page', id: pageId, actions: spaceResult.actions };
    }

    const permission = await this.pagePermissionRepo.getUserPagePermission(
      user.id,
      restrictedAncestor.pageId,
    );

    // AC9 — fail closed: no grant at all, OR a role value this service does
    // not recognise, denies EVERY action (never falls back to "read-only").
    const allowedActions = this.actionsForRole(permission?.role);

    const actions = spaceResult.actions.filter((action) =>
      allowedActions.includes(action),
    );

    return { subject: 'Page', id: pageId, actions };
  }

  private actionsForRole(role: string | undefined): string[] {
    if (role === PagePermissionRole.WRITER) {
      return ['read', 'edit'];
    }
    if (role === PagePermissionRole.READER) {
      return ['read'];
    }
    // No grant, or an unrecognised/forward-compat role value: fail closed.
    return [];
  }
}
