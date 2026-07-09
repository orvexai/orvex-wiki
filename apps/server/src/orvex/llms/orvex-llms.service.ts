// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MongoAbility } from '@casl/ability';
import { pmToDfm } from '@orvex/dfm';
import type { PmDoc } from '@orvex/dfm';
import { User } from '../../database/types/entity.types';
import { PageRepo } from '../../database/repos/page/page.repo';
import { PagePermissionRepo } from '../../database/repos/page/page-permission.repo';
import { PaginationOptions } from '../../database/pagination/pagination-options';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  ISpaceAbility,
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';

/** ENG-1492 AC1/AC3 — the discovery caps (docmost fork parity). */
export const LLMS_SITEMAP_CAP = 500;
export const LLMS_HYDRATION_CAP = 100;

/** One entry in the token-scope-filtered discovery listing. */
export interface OrvexLlmsPageSummary {
  id: string;
  slugId: string;
  spaceId: string;
  title: string | null;
  updatedAt: Date;
}

/**
 * OrvexLlmsService (ENG-1492) — the discovery/export PROJECTION over the
 * engine's own page store, composing two independent ACL layers so the
 * surface can never leak a page the caller's bearer token cannot read:
 *
 *  1. Space-level, TOKEN-SCOPE-AWARE — {@link SpaceAbilityFactory.createForUser}
 *     is the sole choke point that floors a space-member's ability to
 *     whatever `TokenScopeGrant` (readOnly / spaceIds allowlist, ENG-1454)
 *     was stamped onto the resolved user at the auth seam. A space the
 *     token's own scope excludes is NEVER reachable here, even if the
 *     underlying user is a full member.
 *  2. Page-level — {@link PagePermissionRepo.filterAccessiblePageIds}
 *     (ENG-1373) additionally strips individually-restricted pages within
 *     an otherwise-reachable space.
 *
 * A "deep module": three exported operations (`listAccessiblePages`,
 * `hydratedMarkdownSections`, `pageMarkdown`) compose the ACL layers + the
 * `@orvex/dfm` converter into an agent-discovery projection — no caller
 * sees the ACL/converter plumbing.
 *
 * DETERMINISM (CS ❌#9): ordering is derived entirely from stored page
 * fields (`updatedAt`, `id`) via {@link PageRepo.getRecentPages} — no
 * `Date.now()`/`Math.random()` enters the projection.
 */
@Injectable()
export class OrvexLlmsService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  /**
   * Resolves the caller's (space-scoped, token-floored) ability for
   * `spaceId`, treating "not a member of this space at all" the same as
   * "no ability" — fail closed, never propagate the repo's 404.
   */
  private async resolveSpaceReadAbility(
    user: User,
    spaceId: string,
    cache: Map<string, MongoAbility<ISpaceAbility> | null>,
  ): Promise<MongoAbility<ISpaceAbility> | null> {
    if (cache.has(spaceId)) {
      return cache.get(spaceId) ?? null;
    }
    let ability: MongoAbility<ISpaceAbility> | null;
    try {
      ability = await this.spaceAbility.createForUser(user, spaceId);
    } catch {
      // NotFoundException ("Space permissions not found") == no access.
      ability = null;
    }
    cache.set(spaceId, ability);
    return ability;
  }

  /**
   * AC1/AC2 — the token-scope + per-page-ACL-filtered listing, capped at
   * `limit` (never more; may honestly return fewer once both ACL layers
   * are applied). Ordering: `updatedAt desc, id desc` (stored fields only).
   */
  async listAccessiblePages(
    user: User,
    limit: number = LLMS_SITEMAP_CAP,
  ): Promise<OrvexLlmsPageSummary[]> {
    const pagination = new PaginationOptions();
    pagination.limit = limit;

    const { items } = await this.pageRepo.getRecentPages(user.id, pagination);

    const abilityCache = new Map<
      string,
      MongoAbility<ISpaceAbility> | null
    >();
    const spaceReadable: typeof items = [];
    for (const item of items) {
      const ability = await this.resolveSpaceReadAbility(
        user,
        item.spaceId,
        abilityCache,
      );
      if (ability && ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        spaceReadable.push(item);
      }
    }

    if (spaceReadable.length === 0) return [];

    const accessibleIds = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: spaceReadable.map((p) => p.id),
        userId: user.id,
      }),
    );

    return spaceReadable
      .filter((p) => accessibleIds.has(p.id))
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        slugId: p.slugId,
        spaceId: p.spaceId,
        title: p.title,
        updatedAt: p.updatedAt as Date,
      }));
  }

  /** AC1 — `GET /api/orvex/llms.txt`: a Markdown sitemap, cap 500. */
  async llmsTxt(user: User): Promise<string> {
    const pages = await this.listAccessiblePages(user, LLMS_SITEMAP_CAP);
    if (pages.length === 0) {
      return '# LLMs sitemap\n\nNo accessible pages.\n';
    }
    const lines = pages.map(
      (p) => `- [${p.title ?? 'Untitled'}](/api/orvex/pages/${p.id}/page.md)`,
    );
    return `# LLMs sitemap\n\n${lines.join('\n')}\n`;
  }

  /**
   * AC3 — `GET /api/orvex/llms-full.txt`: hydrates at most
   * {@link LLMS_HYDRATION_CAP} bodies. A page whose content is outside the
   * `@orvex/dfm` covered subset yields an honest typed note (its
   * `DfmNotImplementedError` code) rather than fabricated or skipped-silent
   * output (CS §11 honesty).
   */
  async llmsFullTxt(user: User): Promise<string> {
    const pages = await this.listAccessiblePages(user, LLMS_SITEMAP_CAP);
    const hydrated = pages.slice(0, LLMS_HYDRATION_CAP);

    if (hydrated.length === 0) {
      return '# LLMs full export\n\nNo accessible pages.\n';
    }

    const sections = await Promise.all(
      hydrated.map(async (summary) => {
        const heading = `## ${summary.title ?? 'Untitled'} (${summary.id})`;
        try {
          const dfm = await this.renderPageDfm(summary.id);
          return `${heading}\n\n${dfm}`;
        } catch (err) {
          const code =
            err instanceof Error && 'code' in err
              ? (err as { code: string }).code
              : 'DFM_RENDER_FAILED';
          return `${heading}\n\n> _[${code}] page content could not be rendered as DfM._`;
        }
      }),
    );

    return `# LLMs full export\n\n${sections.join('\n\n')}\n`;
  }

  /**
   * AC4 — `GET /api/orvex/pages/:pageId/page.md`: the single-page DfM
   * export. Fails closed: unknown page -> 404; known page outside the
   * caller's (token-scoped) space ability or per-page ACL -> 403.
   */
  async pageMarkdown(user: User, pageId: string): Promise<string> {
    const page = await this.pageRepo.findById(pageId, { includeContent: true });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const abilityCache = new Map<
      string,
      MongoAbility<ISpaceAbility> | null
    >();
    const ability = await this.resolveSpaceReadAbility(
      user,
      page.spaceId,
      abilityCache,
    );
    if (!ability || ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('Page not accessible');
    }

    const accessibleIds = await this.pagePermissionRepo.filterAccessiblePageIds(
      {
        pageIds: [page.id],
        userId: user.id,
        spaceId: page.spaceId,
      },
    );
    if (!accessibleIds.includes(page.id)) {
      throw new ForbiddenException('Page not accessible');
    }

    return this.renderPageDfm(page.id, page);
  }

  /**
   * Loads (if not already given) and converts a page's ProseMirror content
   * to DfM. `@orvex/dfm` is exercised IN-PROCESS, never mocked (CS §5 ❌#4).
   */
  private async renderPageDfm(
    pageId: string,
    preloaded?: { content: unknown },
  ): Promise<string> {
    const page =
      preloaded ??
      (await this.pageRepo.findById(pageId, { includeContent: true }));
    const doc = (page?.content ?? { type: 'doc', content: [] }) as PmDoc;
    return pmToDfm(doc);
  }
}
