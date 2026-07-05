import { Dfm, PmDoc } from './types';

/**
 * `dfmToJson` — parse DfM back into a ProseMirror JSON document (imported by the
 * engine's `page.service.ts` on the write path). The inverse of `pmToDfm`;
 * `:::dfm-opaque` fences parse into opaque placeholder nodes that
 * `reattachOpaqueRefs` later re-hydrates from the CAS base page.
 *
 * SCAFFOLD: returns an empty doc; the real parser is authored in the fold-in
 * against the golden fixtures (round-trip stability with `pmToDfm`).
 */
export function dfmToJson(_dfm: Dfm): PmDoc {
  // TODO(fold-in): tokenize DfM, build the PM node tree, capture opaque fences.
  return { type: 'doc', content: [] };
}
