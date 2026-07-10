// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { getSchema, JSONContent } from '@tiptap/core';
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

      case 'section-edit': {
        const loc = requireLocation(
          working,
          op.blockId,
          'MISSING_REF_BLOCK_ID',
          'section-edit blockId',
        );
        loc.siblings[loc.index].content = op.node?.content ?? [];
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
