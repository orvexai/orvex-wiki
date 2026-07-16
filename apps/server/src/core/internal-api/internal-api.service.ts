// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { ExportService } from '../../integrations/export/export.service';
import { ExportFormat } from '../../integrations/export/dto/export-dto';
import { Page, User } from '@docmost/db/types/entity.types';

export interface ResolvedPage {
  title: string | null;
  content: unknown;
}

/**
 * ExportedPage (addressable-hits, 2026-07-16) — the enriched `/export` reply.
 * `text_repr` is the FR-18/38 embed-resolved Markdown the indexer embeds; the
 * ADDRESSING fields (`title`, `space`, `slug_id`) are what make a knowledge hit
 * chainable back to a page: `title` labels the hit, `space` (the space SLUG,
 * not the internal UUID) + `slug_id` build the deep-linkable citation URL
 * `/s/{space}/p/{slug_id}`. Before this the indexer only received `text_repr`,
 * so every projected hit carried an empty title/space and no citation URL was
 * derivable. Workspace-scoped (indexer plane) — same tenant-isolation guard as
 * the bare export.
 */
export interface ExportedPage {
  textRepr: string;
  title: string | null;
  space: string | null;
  slugId: string | null;
}

/**
 * InternalApiService (ENG-1957; ENG-1559 principal-resolution) — the
 * composition-depth layer behind the `/internal/*` surface. Composes over the
 * ENGINE'S OWN existing authorization primitives (`SpaceAbilityFactory`,
 * `PagePermissionRepo`) — CS §3 deep module / one-adapter rule: this does NOT
 * reimplement the ACL model, it exposes it to an internal caller.
 *
 * RULED CONTRACT (ENG-1559, 2026-07-12, fork (a)): the caller sends the
 * IdP-agnostic principal (`subject` + `tenant`), and this service — the sole
 * owner of the workspace/user mapping — resolves it internally:
 *  - `tenant` IS the orvex-wiki workspace UUID (convention
 *    `Principal.Tenant == workspaceId`).
 *  - `subject` is resolved to the internal user id via the `auth_accounts`
 *    SSO-linkage table (`UserRepo.findUserIdByProviderUserId`), scoped to the
 *    tenant. An unresolvable subject fails closed (no access).
 *
 * TWO-PLANE MODEL (A1): `acl/filter` is the per-user egress narrowing (the
 * engine ACL for THIS principal). `export`/`resolve`/`ai-search` are
 * workspace-scoped INDEXER reads — no per-user ACL, because the indexer must
 * see all in-tenant content so a permitted user can later find it; per-user
 * narrowing then happens at query time via `acl/filter` ∩ token_scope. Tenant
 * isolation is preserved on every plane (a foreign-workspace page 404s / is
 * excluded).
 */
@Injectable()
export class InternalApiService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceRepo: SpaceRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly userRepo: UserRepo,
    private readonly exportService: ExportService,
  ) {}

  private principal(userId: string): User {
    // Only `.id` is read by SpaceAbilityFactory/PagePermissionRepo along this
    // path (`createForUser` keys off `user.id`; the token-scope symbol is
    // absent so `intersectWithTokenScope` floors to the unrestricted creator
    // ability) — a minimal stand-in is honest here, not a fabricated full User.
    return { id: userId } as User;
  }

  /**
   * AC1 — batch ACL intersection. `tenant` is the workspace UUID; `subject` is
   * the IdP subject resolved to an internal user id. Returns exactly the subset
   * of `pageIds` (scoped to the tenant) that the resolved user is authorized to
   * read: page must belong to a space the user is a member of with `Read,Page`,
   * AND (if restricted) the user must hold a page-level grant — the SAME
   * two-layer check `PageAccessService.validateCanView` enforces per page,
   * batched per-space via `PagePermissionRepo.filterAccessiblePageIds`.
   * Foreign-workspace / nonexistent ids are silently excluded. Fail-closed: an
   * unresolvable subject (no live `auth_accounts` linkage in this tenant)
   * returns an empty allow-set.
   */
  async filterAccessiblePages(
    tenant: string,
    subject: string,
    pageIds: string[],
  ): Promise<string[]> {
    if (pageIds.length === 0) return [];

    const userId = await this.userRepo.findUserIdByProviderUserId(
      subject,
      tenant,
    );
    if (!userId) return [];

    const pages = await this.pageRepo.findManyByIds(pageIds, {
      workspaceId: tenant,
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
   * AC2 — the FR-18/38 `text_repr` export for the indexer body fetch:
   * a page's canonical content flattened to Markdown, plus the ADDRESSING
   * metadata (title + space slug + page slug id) that makes a knowledge hit
   * chainable back to the page (addressable-hits). Workspace-scoped (no
   * per-user ACL — the indexer plane); tenant isolation enforced by
   * `loadPageInWorkspace` (a page outside `tenant` is a typed 404).
   *
   * The space is resolved to its SLUG (not the internal space UUID) — the
   * citation URL the consumer builds is `/s/{space}/p/{slug_id}`, which is
   * keyed by the human-facing slug. A page whose space cannot be resolved
   * yields a null space (honest — the consumer then emits no citation URL for
   * that hit rather than a broken one), never a fabricated slug.
   */
  async exportPage(tenant: string, pageId: string): Promise<ExportedPage> {
    // Tenant-isolation guard BEFORE the export (ExportService fetches by id
    // without a workspace scope) — a foreign-workspace id must 404, never leak.
    // The loaded page is reused for the addressing fields (one read, not two).
    const page = await this.loadPageInWorkspace(tenant, pageId);

    const result = await this.exportService.exportPages(
      pageId,
      ExportFormat.Markdown,
      false, // includeAttachments
      false, // includeChildren
      undefined, // userId — none: indexer plane, ignorePermissions below
      true, // ignorePermissions — workspace-scoped indexer read
    );

    if (result.type !== 'file') {
      // includeChildren=false + includeAttachments=false always yields the
      // single-page 'file' branch — this only trips if that contract changes.
      throw new NotFoundException('Page not found');
    }

    // Resolve the space SLUG for the citation URL. A missing space id or an
    // unresolvable space degrades to a null slug (no fabricated citation) —
    // never an error that would fail-close the whole body export.
    let spaceSlug: string | null = null;
    if (page.spaceId) {
      const space = await this.spaceRepo.findById(page.spaceId, tenant);
      spaceSlug = space?.slug ?? null;
    }

    return {
      textRepr: result.content as string,
      title: page.title ?? null,
      space: spaceSlug,
      slugId: page.slugId ?? null,
    };
  }

  /**
   * AC3 — resolve a page id to its title + RAW ProseMirror document (the shape
   * knowledge's `dfm.PmToDfm` consumes). Workspace-scoped (indexer plane);
   * tenant isolation enforced (foreign-workspace id 404s).
   */
  async resolvePage(tenant: string, pageId: string): Promise<ResolvedPage> {
    const page = await this.loadPageInWorkspace(tenant, pageId, {
      includeContent: true,
    });
    return { title: page.title, content: page.content ?? null };
  }

  /**
   * AC4 — the per-tenant AI-search opt-in flag knowledge's indexing gate reads
   * (`workspaces.settings.ai.search`). `tenant` is the workspace UUID. Returns
   * the boolean the consumer decodes into `{enabled}`.
   */
  async getAiSearchEnabled(tenant: string): Promise<boolean> {
    const workspace = await this.workspaceRepo.findById(tenant);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const settings = (workspace.settings ?? {}) as Record<string, any>;
    return Boolean(settings?.ai?.search);
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
