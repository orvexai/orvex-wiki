import { getSchema } from '@tiptap/core';
import { Node as PMNode, Schema } from '@tiptap/pm/model';
import { ChangeSet, simplifyChanges } from '@tiptap/pm/changeset';
import { Transform } from '@tiptap/pm/transform';
import { recreateTransform, AiAuthored } from '@docmost/editor-ext';
import { tiptapExtensions } from '../../collaboration/collaboration.util';

/**
 * Pure ProseMirror content logic for AI provenance.
 *
 * These functions operate purely on ProseMirror document JSON
 * (`Record<string, any>`), are deterministic, and perform no I/O or DB
 * access. They are intended to be offline-unit-testable.
 *
 * The `aiAuthored` mark (see `@docmost/editor-ext`) is applied at
 * BLOCK-LEVEL granularity: if any change touches a top-level block, the
 * ENTIRE block's inline content is marked as AI-authored. This mirrors the
 * diff machinery used by the page-history editor
 * (`apps/client/src/features/page-history/components/history-editor.tsx`):
 * `recreateTransform` -> `ChangeSet.create(...).addSteps(...)` -> `simplifyChanges`.
 */

const MARK_NAME = AiAuthored.name; // 'aiAuthored'

let cachedSchema: Schema | null = null;

/**
 * Build (and cache) the server ProseMirror schema.
 *
 * We reuse the exact same extension list the server uses everywhere else
 * (`tiptapExtensions` from `collaboration.util`, the same symbol that
 * `collaboration.util#jsonToNode` feeds to `getSchema`). AiAuthored is
 * already included in tiptapExtensions — do NOT add it again here. Tiptap
 * warns on duplicate names but ProseMirror throws RangeError: Duplicate mark
 * type, crashing the process.
 */
function getProvenanceSchema(): Schema {
  if (!cachedSchema) {
    cachedSchema = getSchema(tiptapExtensions);
  }
  return cachedSchema;
}

function parseDoc(docJson: Record<string, any>): PMNode {
  return PMNode.fromJSON(getProvenanceSchema(), docJson);
}

/**
 * Deep-clone plain JSON. Inputs to these functions are ProseMirror-document
 * JSON (no functions, no circular refs), so a JSON round-trip is safe and
 * keeps the functions pure (never mutate inputs).
 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function isEmptyDoc(docJson: Record<string, any> | null | undefined): boolean {
  if (!docJson) return true;
  const content = docJson.content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return false;
}

/**
 * Mark every top-level block of `newDocJson` that changed relative to
 * `oldDocJson` as AI-authored, at block-level granularity.
 *
 * Algorithm:
 *  1. Parse both docs into ProseMirror nodes via the server schema.
 *  2. Compute the changed ranges in the NEW doc using
 *     `recreateTransform` + `ChangeSet` + `simplifyChanges`
 *     (the same pattern as the page-history diff editor).
 *  3. For each changed range, resolve which TOP-LEVEL block (direct child of
 *     the doc node) encloses it, and collect those block indexes.
 *  4. Apply the `aiAuthored` mark across the ENTIRE inline range of each
 *     changed top-level block via `addMark`, then serialize back to JSON.
 *
 * Edge cases:
 *  - Identical docs -> `newDocJson` is returned unchanged (a deep clone).
 *  - `oldDocJson` null/empty -> the whole new doc is treated as changed
 *    (every top-level block is marked).
 *
 * Note: only inline content can carry a mark. A top-level block with no inline
 * content (e.g. an image-only block, a horizontal rule) is left untouched even
 * if it changed, because there is nothing to attach the mark to.
 *
 * Pure: inputs are never mutated.
 */
export function markAiChangedBlocks(
  oldDocJson: Record<string, any> | null | undefined,
  newDocJson: Record<string, any>,
): Record<string, any> {
  const schema = getProvenanceSchema();
  const aiMarkType = schema.marks[MARK_NAME];
  if (!aiMarkType) {
    throw new Error(
      `Schema is missing the "${MARK_NAME}" mark; cannot apply AI provenance.`,
    );
  }

  const newDoc = parseDoc(newDocJson);

  // Determine which top-level block indexes changed.
  const changedBlockIndexes = new Set<number>();

  if (isEmptyDoc(oldDocJson)) {
    // No prior content -> the entire new doc is "AI changed".
    newDoc.forEach((_block, _offset, index) => {
      changedBlockIndexes.add(index);
    });
  } else {
    const oldDoc = parseDoc(oldDocJson as Record<string, any>);

    const tr = recreateTransform(oldDoc, newDoc, {
      complexSteps: false,
      wordDiffs: true,
      simplifyDiff: true,
    });

    const changeSet = ChangeSet.create(oldDoc).addSteps(
      tr.doc,
      tr.mapping.maps,
      [],
    );

    const simplified = simplifyChanges(changeSet.changes, newDoc);

    if (simplified.length === 0) {
      // Diff found no changes (e.g. semantically identical docs).
      return deepClone(newDocJson);
    }

    // Each change carries `fromB`/`toB`: positions in the NEW (B) doc. Map
    // every changed position range to the top-level block(s) whose INLINE
    // interior it overlaps. This yields the candidate set of changed blocks.
    const candidates = new Set<number>();
    for (const change of simplified) {
      const from = Math.max(0, Math.min(change.fromB, newDoc.content.size));
      const to = Math.max(from, Math.min(change.toB, newDoc.content.size));
      collectBlockIndexesForRange(newDoc, from, to, candidates);
    }

    if (candidates.size === 0) {
      return deepClone(newDocJson);
    }

    // Suppress false positives from structural boundary artifacts.
    //
    // When a NEW top-level block is inserted, ProseMirror's diff widens the
    // change range to span the inserted block's leading boundary, which bleeds
    // a single position into the END of the preceding (unchanged) block. That
    // makes the preceding block a spurious candidate even though its content is
    // byte-identical. To filter these out we align the old and new top-level
    // blocks by content (an order-preserving longest-common-subsequence over
    // block JSON): any new block that has a content-equal partner in the old
    // doc under that alignment is genuinely UNCHANGED and is dropped from the
    // candidate set, regardless of what the position diff suggested.
    const unchangedNewIndexes = contentAlignedUnchangedNewBlocks(
      oldDoc,
      newDoc,
    );
    for (const idx of candidates) {
      if (!unchangedNewIndexes.has(idx)) {
        changedBlockIndexes.add(idx);
      }
    }

    if (changedBlockIndexes.size === 0) {
      return deepClone(newDocJson);
    }
  }

  // Build a transaction over the new doc that marks the full inline range of
  // every changed top-level block.
  const transform: Transform = new Transform(newDoc);

  for (const blockIndex of changedBlockIndexes) {
    const child = newDoc.child(blockIndex);
    const blockStart = blockStartPos(newDoc, blockIndex);
    // Inline content of a block sits between blockStart+1 and
    // blockStart + nodeSize - 1 (the +/-1 skips the block's own open/close
    // boundary tokens). For leaf/atom blocks with no inline content there is
    // nothing to mark, so skip them.
    if (child.isLeaf || child.content.size === 0) {
      continue;
    }
    const inlineFrom = blockStart + 1;
    const inlineTo = blockStart + child.nodeSize - 1;
    transform.addMark(inlineFrom, inlineTo, aiMarkType.create());
  }

  return transform.doc.toJSON();
}

/**
 * Identify the NEW top-level block indexes that are content-identical to an
 * OLD top-level block under an order-preserving alignment.
 *
 * We serialize each top-level block to canonical JSON and run a standard
 * longest-common-subsequence (LCS) over the two block sequences. Blocks that
 * fall on the LCS (i.e. matched, in order, byte-for-byte) are UNCHANGED; their
 * new-doc indexes are returned. Everything else (insertions / modifications)
 * is treated as changed.
 *
 * This is what disambiguates a true edit from the boundary-bleed artifact:
 * an inserted block leaves the preceding block's JSON untouched, so that
 * preceding block matches on the LCS and is correctly reported as unchanged.
 */
function contentAlignedUnchangedNewBlocks(
  oldDoc: PMNode,
  newDoc: PMNode,
): Set<number> {
  const oldKeys: string[] = [];
  for (let i = 0; i < oldDoc.childCount; i++) {
    oldKeys.push(JSON.stringify(oldDoc.child(i).toJSON()));
  }
  const newKeys: string[] = [];
  for (let i = 0; i < newDoc.childCount; i++) {
    newKeys.push(JSON.stringify(newDoc.child(i).toJSON()));
  }

  const m = oldKeys.length;
  const n = newKeys.length;

  // dp[i][j] = LCS length of oldKeys[i..] and newKeys[j..].
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        oldKeys[i] === newKeys[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Walk the dp table to recover which NEW indexes are on the LCS.
  const unchanged = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldKeys[i] === newKeys[j]) {
      unchanged.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return unchanged;
}

/**
 * Resolve all top-level block indexes whose span overlaps the position range
 * [from, to] in `doc`, and add them to `acc`.
 *
 * We compute block indexes purely from doc-child offsets (rather than relying
 * on ResolvedPos depth), which is robust for positions that land exactly on a
 * block boundary. A block at child-index `i` with absolute span [start, end]
 * is included when [from, to] overlaps [start, end].
 */
function collectBlockIndexesForRange(
  doc: PMNode,
  from: number,
  to: number,
  acc: Set<number>,
): void {
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const start = offset;
    const end = offset + child.nodeSize;
    // Overlap against the block's INLINE interior (start+1 .. end-1) rather
    // than its full structural span, so a change that touches only a shared
    // block boundary does not pull in an adjacent block. For an empty block
    // (no interior) fall back to the structural span so it can still match.
    const interiorFrom = start + 1;
    const interiorTo = Math.max(interiorFrom, end - 1);
    const hasInterior = end - 1 > start + 1;
    if (hasInterior) {
      if (from <= interiorTo && to >= interiorFrom) {
        acc.add(i);
      }
    } else if (from <= end && to >= start) {
      acc.add(i);
    }
    offset = end;
  }
}

/**
 * Absolute position of the start (open boundary) of the top-level block at
 * `blockIndex`.
 */
function blockStartPos(doc: PMNode, blockIndex: number): number {
  let offset = 0;
  for (let i = 0; i < blockIndex; i++) {
    offset += doc.child(i).nodeSize;
  }
  return offset;
}

/**
 * Return a deep copy of `docJson` with EVERY `aiAuthored` mark removed from all
 * nodes' `marks` arrays. Other marks (e.g. `bold`) are preserved. If removing
 * the mark leaves an empty `marks` array, the empty array is kept (rather than
 * deleting the key) to stay deterministic.
 *
 * Pure: the input is never mutated.
 */
export function stripAiAuthoredMarks(
  docJson: Record<string, any>,
): Record<string, any> {
  const clone = deepClone(docJson);
  stripMarksInPlace(clone);
  return clone;
}

function stripMarksInPlace(node: any): void {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node.marks)) {
    node.marks = node.marks.filter(
      (mark: any) => !(mark && mark.type === MARK_NAME),
    );
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      stripMarksInPlace(child);
    }
  }
}
