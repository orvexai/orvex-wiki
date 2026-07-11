// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { PageAccessService } from '../page/page-access/page-access.service';
import { ExportService } from '../../integrations/export/export.service';
import { ExportFormat } from '../../integrations/export/dto/export-dto';
import { Page, User } from '@docmost/db/types/entity.types';

export interface ResolvedPage {
  pageId: string;
  spaceId: string;
  spaceSlug: string | null;
  workspaceId: string;
  canEdit: boolean;
  hasRestriction: boolean;
}

export interface ExportedPage {
  page: Page;
  content: string;
}

export interface AiSearchSettings {
  workspaceId: string;
  aiSearchEnabled: boolean;
}

/**
 * InternalApiService (ENG-1957) — the composition-depth layer behind the
 * `/internal/*` surface. Composes over the ENGINE'S OWN existing
 * authorization primitives (`PageAccessService`, `SpaceAbilityFactory`,
 * `PagePermissionRepo`) — CS §3 deep module / one-adapter rule: this ticket
 * does NOT reimplement the ACL model, it exposes it to an internal caller.
 *
 * Every method takes an explicit `workspaceId` (tenant scope) and `userId`
 * (the caller's principal) rather than reading them off a session/JWT —
 * the caller of this surface (`orvex-studio-knowledge`'s
 * `internal/clients.Engine`) authenticates via `InternalApiAuthGuard`'s
 * shared bearer token, not a per-request user session; it supplies WHICH
 * user's ACL to evaluate as an explicit parameter.
 */
@Injectable()
export class InternalApiService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceRepo: SpaceRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly exportService: ExportService,
  ) {}

  private principal(userId: string): User {
    // Only `.id` is read by SpaceAbilityFactory/PageAccessService along
    // this path (`createForUser` keys off `user.id`; the token-scope
    // symbol is absent so `intersectWithTokenScope` floors to the
    // unrestricted creator ability) — a minimal stand-in is honest here,
    // not a fabricated full User.
    return { id: userId } as User;
  }

  /**
   * AC1 — batch ACL intersection. Returns exactly the subset of `pageIds`
   * (scoped to `workspaceId`, tenant isolation) that `userId` is
   * authorized to read: page must belong to a space the user is a member
   * of with `Read,Page`, AND (if the page is restricted) the user must
   * hold a page-level grant — the SAME two-layer check
   * `PageAccessService.validateCanView` enforces for a single page,
   * batched per-space via `PagePermissionRepo.filterAccessiblePageIds`.
   * Foreign-workspace or nonexistent ids are silently excluded (never a
   * partial-batch error — the caller wants the readable subset).
   */
  async filterAccessiblePages(
    workspaceId: string,
    userId: string,
    pageIds: string[],
  ): Promise<string[]> {
    if (pageIds.length === 0) return [];

    const pages = await this.pageRepo.findManyByIds(pageIds, {
      workspaceId,
    });
    if (pages.length === 0) return [];

    const bySpace = new Map<string, string[]>();
    for (const page of pages) {
      const ids = bySpace.get(page.spaceId) ?? [];
      ids.push(page.id);
      bySpace.set(page.spaceId, ids);
    }

    const principal = this.principal(userId);
    const accessible: string[] = [];

    for (const [spaceId, ids] of bySpace) {
      let ability;
      try {
        ability = await this.spaceAbility.createForUser(principal, spaceId);
      } catch {
        // Not a space member (createForUser throws NotFoundException) —
        // nothing in this space is accessible to this principal.
        continue;
      }
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        continue;
      }
      const filtered = await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: ids,
        userId,
        spaceId,
      });
      accessible.push(...filtered);
    }

    return accessible;
  }

  /**
   * AC2 — export a page's canonical content (Markdown; never the SPA
   * `index.html` catch-all — the CI gate on `Content-Type` is enforced at
   * the controller, which sets it explicitly rather than trusting a mime
   * lookup). Authorized against `userId` via the SAME
   * `PageAccessService.validateCanView` every user-facing page read uses.
   * Typed 404 for an absent/foreign-workspace page; typed 403 for an
   * unauthorized caller (never conflated — AC2).
   */
  async exportPage(
    workspaceId: string,
    userId: string,
    pageId: string,
  ): Promise<ExportedPage> {
    const page = await this.loadPageInWorkspace(workspaceId, pageId, {
      includeContent: true,
    });

    await this.pageAccessService.validateCanView(page, this.principal(userId));

    const result = await this.exportService.exportPages(
      pageId,
      ExportFormat.Markdown,
      false,
      false,
      userId,
    );

    if (result.type !== 'file') {
      // includeChildren=false + includeAttachments=false always yields the
      // single-page 'file' branch in ExportService.exportPages — this
      // would only trip if that contract changes underneath us.
      throw new NotFoundException('Page not found');
    }

    return { page: result.page, content: result.content as string };
  }

  /**
   * AC3 — resolve a page id to its current ACL/space/tenant metadata for
   * an upstream admission decision, in one round-trip. Same authorization
   * gate as export (`validateCanView`) plus the effective `canEdit` /
   * `hasRestriction` flags from `validateCanViewWithPermissions`.
   */
  async resolvePage(
    workspaceId: string,
    userId: string,
    pageId: string,
  ): Promise<ResolvedPage> {
    const page = await this.loadPageInWorkspace(workspaceId, pageId);

    const { canEdit, hasRestriction } =
      await this.pageAccessService.validateCanViewWithPermissions(
        page,
        this.principal(userId),
      );

    const space = await this.spaceRepo.findById(page.spaceId, workspaceId);

    return {
      pageId: page.id,
      spaceId: page.spaceId,
      spaceSlug: space?.slug ?? null,
      workspaceId: page.workspaceId,
      canEdit,
      hasRestriction,
    };
  }

  /**
   * AC4 — the AI-search opt-in/opt-out surface knowledge's indexing gate
   * reads. Real, at the workspace scope that actually exists in this
   * engine today (`workspaces.settings.ai.search`, wired by
   * `WorkspaceService.updateWorkspace`) — no fabricated space/page-level
   * toggle is invented; the engine has no such setting at HEAD.
   */
  async getAiSearchSettings(workspaceId: string): Promise<AiSearchSettings> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const settings = (workspace.settings ?? {}) as Record<string, any>;
    return {
      workspaceId,
      aiSearchEnabled: Boolean(settings?.ai?.search),
    };
  }

  private async loadPageInWorkspace(
    workspaceId: string,
    pageId: string,
    opts?: { includeContent?: boolean },
  ): Promise<Page> {
    const page = await this.pageRepo.findById(pageId, {
      includeContent: opts?.includeContent,
    });
    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }
}
