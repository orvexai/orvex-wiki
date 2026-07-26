import { DfmOpaqueUnknownRefError } from './errors';
import type { PmNode } from './types';

/** The reference node type {@link reattachOpaqueRefs} looks for and resolves. */
export const OPAQUE_REF_TYPE = '__dfmOpaqueRef__' as const;

/** Build an id -> node index over an entire base document (write-side CAS doc). */
export function buildNodeIndex(base: PmNode): Map<string, PmNode> {
  const index = new Map<string, PmNode>();
  const visit = (node: PmNode): void => {
    const id = node.attrs?.id;
    if (typeof id === 'string' && id.length > 0) {
      index.set(id, node);
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(base);
  return index;
}

function isOpaqueRef(node: PmNode): boolean {
  return node.type === OPAQUE_REF_TYPE;
}

/**
 * Resolve every `__dfmOpaqueRef__` reference in `parsed` against `base` by
 * matching `attrs.id`. `base` may be the base document itself (indexed via
 * {@link buildNodeIndex}) or an already-resolved id -> node opaque-body map.
 *
 * Never silently drops or leaves a reference unresolved — an id with no
 * match in `base` is a hard typed error ({@link DfmOpaqueUnknownRefError},
 * code `DFM_OPAQUE_UNKNOWN_REF`), never a lossy/partial write.
 */
export function reattachOpaqueRefs(
  parsed: PmNode,
  base: PmNode | ReadonlyMap<string, PmNode>,
): PmNode {
  const index: ReadonlyMap<string, PmNode> =
    base instanceof Map ? base : buildNodeIndex(base as PmNode);

  const visit = (node: PmNode): PmNode => {
    if (isOpaqueRef(node)) {
      const id = typeof node.attrs?.id === 'string' ? node.attrs.id : '';
      const nodeType =
        typeof node.attrs?.nodeType === 'string' ? node.attrs.nodeType : 'unknown';
      const resolved = index.get(id);
      if (!resolved) {
        throw new DfmOpaqueUnknownRefError(nodeType, id);
      }
      // Byte-for-byte: return the exact base node (structural clone so the
      // caller can't accidentally mutate the base doc through the result).
      return structuredCloneNode(resolved);
    }
    if (node.content) {
      return { ...node, content: node.content.map(visit) };
    }
    return node;
  };

  return visit(parsed);
}

function structuredCloneNode(node: PmNode): PmNode {
  return JSON.parse(JSON.stringify(node)) as PmNode;
}
