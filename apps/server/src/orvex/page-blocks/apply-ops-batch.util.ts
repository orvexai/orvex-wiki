// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { getSchema, JSONContent } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { tiptapExtensions } from '../../collaboration/collaboration.util';
import { ApplyOpsError } from './apply-ops.errors';

/**
 * ENG-1652 — the ordered block-op grammar (`#/components/schemas/PmOp`'s
 * `type` discriminant). Coarse validation lives on the DTO (CS scope
 * discipline, `apply-ops.dto.ts`); this file is what actually interprets
 * each op against the working ProseMirror-json tree.
 */
export type PmOpInput = {
  type: string;
  blockId?: string;
  refBlockId?: string;
  index?: number;
  node?: JSONContent;
  patch?: Record<string, unknown>;
  find?: string;
  replace?: string;
  /**
   * `string-replace` only — opt into replacing EVERY occurrence of `find` in
   * the target block. Absent/false + a >1-occurrence `find` is the
   * `AMBIGUOUS_OLD` guard (never a silent first-match replace).
   */
  replaceAll?: boolean;
};

// Lazily built — `getSchema` walks every registered tiptap extension, which
// is not free; every op-batch application shares the same schema instance.
let cachedSchema: ReturnType<typeof getSchema> | undefined;
function schema() {
  if (!cachedSchema) {
    cachedSchema = getSchema(tiptapExtensions);
  }
  return cachedSchema;
}

/**
 * ENG-1652 residue fix (2026-07-13, PM content-corruption root-cause) —
 * checks whether `content` is a schema-valid child fragment for a node of
 * type `nodeType`, using the REAL ProseMirror content-match machinery
 * (`Fragment.fromJSON` + `ContentMatch.matchFragment`), not a hand-rolled
 * approximation. Returns `false` (never throws) on any malformed input —
 * callers treat "doesn't fit" as one candidate interpretation to reject,
 * not a crash.
 */
function contentFitsNode(
  nodeType: string | undefined,
  content: JSONContent[] | undefined,
): boolean {
  const type = nodeType ? schema().nodes[nodeType] : undefined;
  if (!type) return false;
  try {
    const fragment = Fragment.fromJSON(schema(), content ?? []);
    return !!type.contentMatch.matchFragment(fragment);
  } catch {
    return false;
  }
}

function assertKnownNodeType(node: JSONContent | undefined): asserts node is JSONContent {
  if (
    !node ||
    typeof node !== 'object' ||
    typeof node.type !== 'string' ||
    !schema().nodes[node.type]
  ) {
    throw new ApplyOpsError(
      'UNKNOWN_BLOCK_TYPE',
      `Unknown or missing block type: ${JSON.stringify(node?.type)}`,
    );
  }
}

interface NodeLocation {
  siblings: JSONContent[];
  index: number;
}

/**
 * Depth-first search of the whole doc tree (not just top-level blocks) for
 * a node whose `attrs.id` matches — nested blocks (columns, details,
 * callouts…) are legitimate op targets, not just doc-root siblings.
 */
function findNodeLocation(
  root: JSONContent,
  id: string | undefined,
): NodeLocation | undefined {
  if (!id) return undefined;

  function walk(node: JSONContent): NodeLocation | undefined {
    if (!node || !Array.isArray(node.content)) return undefined;
    for (let i = 0; i < node.content.length; i++) {
      const child = node.content[i];
      if (child?.attrs?.id === id) {
        return { siblings: node.content, index: i };
      }
      const found = walk(child);
      if (found) return found;
    }
    return undefined;
  }

  return walk(root);
}

function extractText(node: JSONContent | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (!Array.isArray(node.content)) return '';
  return node.content.map(extractText).join('');
}

function replaceTextInNode(
  node: JSONContent,
  find: string,
  replace: string,
): boolean {
  if (!Array.isArray(node.content)) return false;
  for (const child of node.content) {
    if (
      child.type === 'text' &&
      typeof child.text === 'string' &&
      child.text.includes(find)
    ) {
      child.text = child.text.split(find).join(replace);
      return true;
    }
    if (replaceTextInNode(child, find, replace)) return true;
  }
  return false;
}

/**
 * Counts NON-overlapping occurrences of `find` across every text node in a
 * block's subtree — the denominator the `string-replace` ambiguity guard
 * decides on (0 → NO_REPLACEMENT, >1 & !replaceAll → AMBIGUOUS_OLD). Counted
 * per text node (the same granularity replacement operates on), so the count
 * always reflects exactly what a replace would touch. `find === ''` counts as
 * zero (an empty needle is never a legitimate replacement target).
 */
function countOccurrencesInNode(node: JSONContent, find: string): number {
  if (find === '') return 0;
  let total = 0;
  const walk = (n: JSONContent) => {
    if (n.type === 'text' && typeof n.text === 'string') {
      total += n.text.split(find).length - 1;
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(node);
  return total;
}

/**
 * Replaces EVERY occurrence of `find` with `replace` across all text nodes in
 * a block's subtree (the `replaceAll` / disambiguated-single path). Unlike
 * `replaceTextInNode` (legacy `patch-string`, which stops at the first text
 * node), this mutates all nodes so a count-then-replace pair is consistent.
 */
function replaceAllTextInNode(
  node: JSONContent,
  find: string,
  replace: string,
): void {
  const walk = (n: JSONContent) => {
    if (n.type === 'text' && typeof n.text === 'string' && n.text.includes(find)) {
      n.text = n.text.split(find).join(replace);
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(node);
}

function requireLocation(
  working: JSONContent,
  id: string | undefined,
  code: 'MISSING_REF_BLOCK_ID' | 'MOVE_SOURCE_MISSING',
  label: string,
): NodeLocation {
  const loc = findNodeLocation(working, id);
  if (!loc) {
    throw new ApplyOpsError(code, `${label}: ${JSON.stringify(id)} not found`);
  }
  return loc;
}

/**
 * ENG-1652 AC2 — applies the ordered op batch against a CLONE of `doc`
 * (never the caller's object), so a mid-batch failure leaves the caller's
 * original doc completely untouched. Throws `ApplyOpsError` (AC4) the
 * instant any op cannot be applied — the batch orchestrator (never this
 * function) is responsible for making sure that failure never reaches the
 * database (this function does no I/O at all).
 */
export function applyOpsBatch(
  doc: JSONContent,
  ops: PmOpInput[],
): JSONContent {
  const working: JSONContent = JSON.parse(JSON.stringify(doc ?? {}));
  if (!Array.isArray(working.content)) {
    working.content = [];
  }

  for (const op of ops) {
    switch (op.type) {
      case 'append': {
        assertKnownNodeType(op.node);
        working.content!.push(op.node);
        break;
      }

      case 'prepend': {
        assertKnownNodeType(op.node);
        working.content!.unshift(op.node);
        break;
      }

      case 'insert-at': {
        assertKnownNodeType(op.node);
        const len = working.content!.length;
        const idx = Math.max(0, Math.min(op.index ?? len, len));
        working.content!.splice(idx, 0, op.node);
        break;
      }

      case 'insert_before': {
        assertKnownNodeType(op.node);
        const loc = requireLocation(
          working,
          op.refBlockId,
          'MISSING_REF_BLOCK_ID',
          'insert_before refBlockId',
        );
        loc.siblings.splice(loc.index, 0, op.node);
        break;
      }

      case 'replace-at': {
        assertKnownNodeType(op.node);
        const loc = requireLocation(
          working,
          op.blockId,
          'MISSING_REF_BLOCK_ID',
          'replace-at blockId',
        );
        loc.siblings[loc.index] = op.node;
        break;
      }

      case 'delete-by-id': {
        const loc = requireLocation(
          working,
          op.blockId,
          'MISSING_REF_BLOCK_ID',
          'delete-by-id blockId',
        );
        loc.siblings.splice(loc.index, 1);
        break;
      }

      case 'patch-by-id': {
        const loc = requireLocation(
          working,
          op.blockId,
          'MISSING_REF_BLOCK_ID',
          'patch-by-id blockId',
        );
        const target = loc.siblings[loc.index];
        target.attrs = { ...(target.attrs ?? {}), ...(op.patch ?? {}) };
        break;
      }

      case 'move': {
        const sourceLoc = requireLocation(
          working,
          op.blockId,
          'MOVE_SOURCE_MISSING',
          'move blockId',
        );
        const destLoc = op.refBlockId
          ? requireLocation(
              working,
              op.refBlockId,
              'MISSING_REF_BLOCK_ID',
              'move refBlockId',
            )
          : undefined;

        const [moved] = sourceLoc.siblings.splice(sourceLoc.index, 1);

        if (!destLoc) {
          working.content!.push(moved);
        } else if (destLoc.siblings === sourceLoc.siblings) {
          // Same array: removing the source may have shifted the dest
          // index down by one if it followed the source.
          const destIndex =
            sourceLoc.index < destLoc.index ? destLoc.index - 1 : destLoc.index;
          destLoc.siblings.splice(destIndex, 0, moved);
        } else {
          destLoc.siblings.splice(destLoc.index, 0, moved);
        }
        break;
      }

      case 'patch-string': {
        const loc = requireLocation(
          working,
          op.blockId,
          'MISSING_REF_BLOCK_ID',
          'patch-string blockId',
        );
        const target = loc.siblings[loc.index];
        if (
          typeof op.find !== 'string' ||
          !extractText(target).includes(op.find)
        ) {
          throw new ApplyOpsError(
            'STRING_NOT_FOUND',
            `String ${JSON.stringify(op.find)} not found in block ${JSON.stringify(op.blockId)}`,
          );
        }
        replaceTextInNode(target, op.find, op.replace ?? '');
        break;
      }

      case 'string-replace': {
        // amazing-MCP server-side block string-replace with the ambiguity
        // guard — the verified sibling of the legacy `patch-string`
        // (which throws STRING_NOT_FOUND on 0 and silently replaces only the
        // FIRST match). This op refuses to guess: block-scoped `old → new`,
        // rejecting an ambiguous or absent target under the same atomic CAS
        // batch. Deliberately NOT a whole-page find/replace — it is always
        // block-scoped (a `blockId` is required), so the footgun of a
        // document-wide blind replace is structurally impossible.
        const loc = requireLocation(
          working,
          op.blockId,
          'MISSING_REF_BLOCK_ID',
          'string-replace blockId',
        );
        const target = loc.siblings[loc.index];
        if (typeof op.find !== 'string') {
          throw new ApplyOpsError(
            'NO_REPLACEMENT',
            `string-replace requires a string 'find' for block ${JSON.stringify(op.blockId)}`,
          );
        }
        const occurrences = countOccurrencesInNode(target, op.find);
        if (occurrences === 0) {
          throw new ApplyOpsError(
            'NO_REPLACEMENT',
            `String ${JSON.stringify(op.find)} not found in block ${JSON.stringify(op.blockId)}`,
          );
        }
        if (occurrences > 1 && !op.replaceAll) {
          throw new ApplyOpsError(
            'AMBIGUOUS_OLD',
            `String ${JSON.stringify(op.find)} occurs ${occurrences} times in block ${JSON.stringify(op.blockId)}; pass replaceAll or a unique 'find'`,
          );
        }
        // Exactly one occurrence, or replaceAll opted in — replace them all
        // (a single occurrence "all" is that one occurrence).
        replaceAllTextInNode(target, op.find, op.replace ?? '');
        break;
      }

      case 'section-edit': {
        const loc = requireLocation(
          working,
          op.blockId,
          'MISSING_REF_BLOCK_ID',
          'section-edit blockId',
        );
        const target = loc.siblings[loc.index];
        const newContent = op.node?.content ?? [];

        // ENG-1652 residue fix (2026-07-13, PM content-corruption
        // root-cause): callers (wiki-api's applySectionEdit) translate a
        // doc-shaped edit body into `op.node.content` by taking the
        // wrapper doc's own top-level children — correct when the target
        // is a CONTAINER whose content model accepts those children
        // verbatim (e.g. `details`, `column`), but wrong when the target
        // is a leaf/inline-content node (`paragraph`, `heading`, …) and
        // the wrapper's one child re-states the target itself (e.g.
        // editing a paragraph via `{type:'doc',content:[{type:'paragraph',
        // content:[...]}]}`) — splicing a block node in as a paragraph's
        // own content is invalid-by-construction and, before this fix,
        // sailed past the unchecked `jsonToNode`/`Node.fromJSON` "gate"
        // to crash uncaught deep inside `stampBlockIds`
        // (`TransformError: Invalid content for node paragraph`) instead
        // of failing loud here, before any mutation (AC2/AC4).
        //
        // Real `ContentMatch`-based validation (never a hand-rolled
        // guess) picks between the two legitimate interpretations, and
        // only THEN mutates `target` — first try wins, so a container
        // target that genuinely receives valid children takes that path
        // unchanged from before this fix:
        if (contentFitsNode(target.type, newContent)) {
          target.content = newContent;
        } else if (
          newContent.length === 1 &&
          newContent[0]?.type === target.type &&
          contentFitsNode(target.type, newContent[0]?.content)
        ) {
          // The wrapper's single child re-states the target block itself
          // (same node type) — unwrap one level and adopt ITS children,
          // preserving the target's own id/attrs (ENG-1397 block-id
          // stability: the block is edited in place, not replaced).
          target.content = newContent[0].content ?? [];
        } else {
          throw new ApplyOpsError(
            'INVALID_CONTENT_FORMAT',
            `content is not valid for block type ${JSON.stringify(target.type)} (blockId ${JSON.stringify(op.blockId)})`,
          );
        }
        break;
      }

      default: {
        throw new ApplyOpsError(
          'UNSUPPORTED_OP',
          `Unsupported op type: ${JSON.stringify(op.type)}`,
        );
      }
    }
  }

  return working;
}
