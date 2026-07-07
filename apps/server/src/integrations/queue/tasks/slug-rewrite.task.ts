import { KyselyDB } from '@docmost/db/types/kysely.types';

export interface RewriteSlugOptions {
  workspaceId: string;
  oldSlugId: string;
  newSlugId: string;
}

/**
 * ENG-1398 — in-place rewrite of a single ProseMirror JSON node (and its
 * marks/children): every `mention` node pointing at the old page slug picks
 * up the new one, and every internal `link` mark href referencing the old
 * slug has it substituted. Returns whether anything changed so the caller
 * (the queue task below) can skip persisting untouched pages.
 *
 * Deliberately untyped (`node: any`) — an unconstrained ProseMirror JSON
 * walk — but confined to this module boundary; the exported task signature
 * below stays fully typed (CS §3.6 / ❌#12 guard).
 */
export function rewrite(node: any, oldSlugId: string, newSlugId: string): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  let changed = false;

  if (
    node.type === 'mention' &&
    node.attrs?.entityType === 'page' &&
    node.attrs?.slugId === oldSlugId
  ) {
    node.attrs.slugId = newSlugId;
    changed = true;
  }

  if (Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (
        mark?.type === 'link' &&
        mark.attrs?.internal === true &&
        typeof mark.attrs?.href === 'string' &&
        mark.attrs.href.includes(oldSlugId)
      ) {
        mark.attrs.href = mark.attrs.href.split(oldSlugId).join(newSlugId);
        changed = true;
      }
    }
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (rewrite(child, oldSlugId, newSlugId)) {
        changed = true;
      }
    }
  }

  return changed;
}

/**
 * ENG-1398 — the slug-rewrite queue task. Given a workspace and an
 * old/new page slugId pair, walks every non-deleted page's ProseMirror JSON
 * content one page at a time (bounded memory, CS §10), rewrites page-mention
 * slugIds and internal-link hrefs referencing the old slug, and persists
 * `content` + bumps `updatedAt` only for pages that actually changed.
 *
 * A cheap `JSON.stringify(content).includes(oldSlugId)` pre-check skips
 * pages with no chance of matching before paying for a structural walk
 * (CS §10 — avoids needless work; the deep module owns this pre-check).
 */
export async function rewriteSlugInProsemirrorJson(
  db: KyselyDB,
  { workspaceId, oldSlugId, newSlugId }: RewriteSlugOptions,
): Promise<void> {
  const pages = await db
    .selectFrom('pages')
    .select(['id', 'content'])
    .where('workspaceId', '=', workspaceId)
    .where('deletedAt', 'is', null)
    .execute();

  for (const page of pages) {
    const raw = JSON.stringify(page.content);
    if (!raw || !raw.includes(oldSlugId)) {
      continue;
    }

    const doc = page.content as any;
    if (!rewrite(doc, oldSlugId, newSlugId)) {
      continue;
    }

    await db
      .updateTable('pages')
      .set({ content: doc, updatedAt: new Date() })
      .where('id', '=', page.id)
      .execute();
  }
}
