import { getNodeSerializer, isKnownNode } from './registry';
import { emitOpaqueFence } from './reattach-opaque';
import { Dfm, PmDoc, PmNode } from './types';

/**
 * `pmToDfm` — serialize a ProseMirror document to DfM (imported by the engine's
 * `collaboration.util.ts` on the write path). Unknown node types serialize to a
 * lossless `:::dfm-opaque` fence rather than being dropped.
 *
 * SCAFFOLD: registry-driven walk; the full node coverage is authored in the
 * fold-in against the golden fixtures.
 */
export function pmToDfm(doc: PmDoc): Dfm {
  return (doc.content ?? []).map(serializeNode).join('');
}

function serializeNode(node: PmNode): string {
  if (isKnownNode(node.type)) {
    return getNodeSerializer(node.type)!.toDfm(node);
  }
  // Unknown → opaque fence (lossless). The id is the node's own attr when
  // present; the reattach step splices the body back from the CAS base page.
  const id = String(node.attrs?.id ?? '');
  return emitOpaqueFence({ type: node.type, id }) + '\n\n';
}
