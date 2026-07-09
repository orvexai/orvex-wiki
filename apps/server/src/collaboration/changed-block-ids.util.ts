import { BLOCK_ID_TYPES } from './backfill-block-ids.util';

/**
 * Loose input type: callers may hand this the DB's raw JSONB read (typed as
 * `JsonValue` at the entity boundary) as well as an in-memory `JSONContent`
 * — both are the same shape at runtime, this is a pure structural walk.
 */
type JsonDoc = unknown;

/**
 * ENG-1383 F5/AC5 fix-pass-2 — diffs two ProseMirror JSON docs by stable
 * block `id` (the ENG-1397 `BLOCK_ID_TYPES` attr) and returns the ids of
 * blocks that were added, removed, or whose subtree changed. Pure JSON tree
 * walk (CS §5 4f) — no mock, no fabricated data; this is what makes AC5's
 * `changedBlockIds` a genuine content-delta rather than a hardcoded value.
 *
 * Order is stable: ids new/changed in `after`'s document order first, then
 * ids removed from `before` (present in before, absent from after).
 */
export function computeChangedBlockIds(
  before: JsonDoc | null | undefined,
  after: JsonDoc | null | undefined,
  types: readonly string[] = BLOCK_ID_TYPES,
): string[] {
  const beforeIndex = indexBlocksById(before, types);
  const afterIndex = indexBlocksById(after, types);

  const changed: string[] = [];
  for (const [id, afterNode] of afterIndex) {
    const beforeNode = beforeIndex.get(id);
    if (!beforeNode || JSON.stringify(beforeNode) !== JSON.stringify(afterNode)) {
      changed.push(id);
    }
  }
  for (const id of beforeIndex.keys()) {
    if (!afterIndex.has(id)) {
      changed.push(id);
    }
  }

  return changed;
}

function indexBlocksById(
  doc: JsonDoc | null | undefined,
  types: readonly string[],
): Map<string, unknown> {
  const index = new Map<string, unknown>();
  if (!doc || typeof doc !== 'object') return index;

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type && types.includes(node.type) && node.attrs?.id) {
      index.set(node.attrs.id, node);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  };

  visit(doc);
  return index;
}
