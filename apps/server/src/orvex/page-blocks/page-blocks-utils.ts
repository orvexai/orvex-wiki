// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1376 — ported (behavior-parity, re-authored) from the fork's
 * `apps/server/src/orvex/page-blocks/page-blocks-utils.ts#L274-L340`
 * (`extractTldrText`). Pure, in-process, no I/O — CS §5 mocking strategy
 * calls this out as directly unit-testable, never mocked.
 */
import { ProseMirrorJsonNode, TLDR_ROLE } from './dto/tldr.dto';

/**
 * Depth-first search for the first node whose `attrs.role` marks it as the
 * page's tldr lead callout (`registerBlockSchema('tldr', ...)`).
 */
function findTldrNode(node: ProseMirrorJsonNode): ProseMirrorJsonNode | null {
  if (node.attrs?.role === TLDR_ROLE) {
    return node;
  }
  for (const child of node.content ?? []) {
    const found = findTldrNode(child);
    if (found) return found;
  }
  return null;
}

/** Concatenates all `text` leaves under a node, in document order. */
function collectText(node: ProseMirrorJsonNode): string {
  if (typeof node.text === 'string') {
    return node.text;
  }
  return (node.content ?? []).map(collectText).join('');
}

/**
 * AC2 — extracts the plain-text body of a page's tldr lead callout for use
 * as a subpage-card `blurb`. Returns `null` when the content has no tldr
 * node, or the tldr node has no text (never throws on malformed/absent
 * content — AC8 empty-state discipline).
 */
export function extractTldrText(content: unknown): string | null {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const root = content as ProseMirrorJsonNode;
  const tldrNode = findTldrNode(root);
  if (!tldrNode) {
    return null;
  }

  const text = collectText(tldrNode).trim();
  return text.length > 0 ? text : null;
}
