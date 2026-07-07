import type { Extensions, JSONContent } from '@tiptap/core';
import { addUniqueIdsToDoc } from '@docmost/editor-ext';

/**
 * ENG-1397 — the widened block-ID coverage set (AC1). Single source of
 * truth consumed by:
 *  - `collaboration.util.ts` (`UniqueID.configure({ types: BLOCK_ID_TYPES })`
 *    — the ydoc/collab byte path)
 *  - the legacy backfill migration (AC4)
 *  - `countMissingBlockIds` / `backfillPageContent` below (AC2)
 *
 * Deliberately excludes inline/atom nodes that are not block-level (e.g.
 * `mention`, `status`) — the DoD only requires coverage of block-level
 * node types (AC1).
 */
export const BLOCK_ID_TYPES: string[] = [
  'heading',
  'paragraph',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'callout',
  'details',
  'detailsSummary',
  'detailsContent',
  'columns',
  'column',
  'table',
  'image',
  'video',
  'audio',
  'pdf',
  'attachment',
  'drawio',
  'excalidraw',
  'transclusionSource',
];

/**
 * Walks a raw ProseMirror JSON doc (no schema/editor instance required) and
 * counts nodes of a configured block-level type that are missing their `id`
 * attr. Pure JSON tree walk — CS §5 (in-process transform, no mock).
 */
export function countMissingBlockIds(
  doc: JSONContent,
  types: readonly string[] = BLOCK_ID_TYPES,
): number {
  if (!doc || typeof doc !== 'object') return 0;

  let missing = 0;

  const visit = (node: JSONContent) => {
    if (!node || typeof node !== 'object') return;
    if (node.type && types.includes(node.type) && !node.attrs?.id) {
      missing += 1;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  };

  visit(doc);
  return missing;
}

/**
 * ENG-1397 AC2/AC4 — idempotent block-ID backfill. Mints ids only for
 * nodes of a configured type that don't already have one; pre-existing ids
 * are never regenerated (byte-identical after the pass). Re-running against
 * fully-stamped content is a true no-op (`nodesAdded === 0`), which is what
 * makes the legacy migration (AC4) safe to re-run.
 */
export function backfillPageContent(
  content: JSONContent,
  extensions: Extensions,
): { content: JSONContent; nodesAdded: number } {
  const before = countMissingBlockIds(content);
  const stamped = addUniqueIdsToDoc(content, extensions) as JSONContent;
  const after = countMissingBlockIds(stamped);
  return { content: stamped, nodesAdded: before - after };
}
