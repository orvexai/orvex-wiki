/**
 * Typed DfM errors.
 *
 * HONESTY CONTRACT (no-op ≠ mock): every surface this twin does not yet
 * implement THROWS one of these — a typed, greppable sentinel — instead of
 * returning a plausible-looking value. There is no fabricated fence, no empty
 * `{ type: 'doc', content: [] }`, no lossy best-effort parse.
 */

/** Greppable sentinel for the not-implemented error. */
export const DFM_NOT_IMPLEMENTED = 'DFM_NOT_IMPLEMENTED' as const;
/** Greppable sentinel for the opaque unknown-ref error. */
export const DFM_OPAQUE_UNKNOWN_REF = 'DFM_OPAQUE_UNKNOWN_REF' as const;

/**
 * Thrown when serialization/parsing reaches a node type (or mark, or block
 * construct) outside the implemented — i.e. contract-fixture-covered — subset.
 *
 * `nodeType` is the offending ProseMirror node type (or a scoped sentinel such
 * as `dfm-opaque` / `text-marks` for surfaces that are not a single node type).
 */
export class DfmNotImplementedError extends Error {
  readonly code = DFM_NOT_IMPLEMENTED;
  readonly nodeType: string;

  constructor(nodeType: string, message?: string) {
    super(
      message ??
        `DfM has no serializer for node type "${nodeType}" (${DFM_NOT_IMPLEMENTED}). ` +
          `Only the contract-fixture-covered subset is implemented; a new type ` +
          `requires a fixture-pair in orvex-studio-contracts (fixtures/dfm/**) first.`,
    );
    this.name = 'DfmNotImplementedError';
    this.nodeType = nodeType;
    // Restore the prototype chain across the ES2022/CommonJS transpile so
    // `instanceof DfmNotImplementedError` holds for callers.
    Object.setPrototypeOf(this, DfmNotImplementedError.prototype);
  }
}

/**
 * Thrown by the (future) opaque round-trip path when an opaque handle
 * (`{ block_id, type, summary }` colon-directive) references a block id that is
 * not present in the reattach set.
 *
 * Defined and exported now as the typed error for that path; it is NOT thrown
 * by any currently-implemented surface (the opaque machinery is delivery work
 * with its own fixtures — see {@link serializeOpaque}). Wiring it before its
 * fixtures exist would be fabrication.
 */
export class DfmOpaqueUnknownRefError extends Error {
  readonly code = DFM_OPAQUE_UNKNOWN_REF;
  readonly ref: string;

  constructor(ref: string, message?: string) {
    super(
      message ??
        `DfM opaque handle references unknown block "${ref}" (${DFM_OPAQUE_UNKNOWN_REF}).`,
    );
    this.name = 'DfmOpaqueUnknownRefError';
    this.ref = ref;
    Object.setPrototypeOf(this, DfmOpaqueUnknownRefError.prototype);
  }
}
