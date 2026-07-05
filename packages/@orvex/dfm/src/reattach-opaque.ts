import { DfmOpaqueRef, PmDoc } from './types';

/** The fence marker for a losslessly-preserved opaque node. */
export const DFM_OPAQUE_FENCE = ':::dfm-opaque';

/**
 * Thrown when `reattachOpaqueRefs` cannot find the referenced opaque body in the
 * CAS base page — it NEVER silently drops the node (A-DFM / FR-W18).
 */
export class DfmOpaqueUnknownRefError extends Error {
  readonly code = 'DFM_OPAQUE_UNKNOWN_REF';
  constructor(readonly ref: DfmOpaqueRef) {
    super(`DFM_OPAQUE_UNKNOWN_REF: no opaque body for type=${ref.type} id=${ref.id}`);
    this.name = 'DfmOpaqueUnknownRefError';
  }
}

/** Emit the opaque fence for an unknown node (lossless round-trip). */
export function emitOpaqueFence(ref: DfmOpaqueRef): string {
  return `${DFM_OPAQUE_FENCE} type=${ref.type} id=${ref.id}\n:::`;
}

/**
 * Splice each `:::dfm-opaque type=… id=…` fence's original body back from the
 * CAS base page. SCAFFOLD: throws for any ref not present in `baseBodies` — the
 * throw contract is real (contract tests assert it), the parse/splice is TODO.
 */
export function reattachOpaqueRefs(
  doc: PmDoc,
  baseBodies: Map<string, unknown>,
): PmDoc {
  // TODO(fold-in): walk the doc, find opaque fences, and splice the base body.
  for (const ref of findOpaqueRefs(doc)) {
    if (!baseBodies.has(ref.id)) {
      throw new DfmOpaqueUnknownRefError(ref);
    }
  }
  return doc;
}

function findOpaqueRefs(_doc: PmDoc): DfmOpaqueRef[] {
  // TODO(fold-in): collect opaque refs from the doc tree.
  return [];
}
