/**
 * Typed DfM errors.
 *
 * HONESTY CONTRACT (no-op ≠ mock): every failure mode this package can
 * produce is a typed, `code`-bearing, greppable error — never a silent drop,
 * never a bare `Error`. Since the ENG-2487 fold-in the serializer is total
 * over ProseMirror JSON (an unregistered block becomes a lossless
 * `:::dfm-opaque` reference fence, an unregistered inline atom/mark becomes a
 * `{dfm:BASE64}` inline fence), so the ONLY live throw is the genuinely
 * unresolvable case: an opaque reference whose base document lacks the
 * referenced node ({@link DfmOpaqueUnknownRefError}).
 */

/** Greppable sentinel for the not-implemented error. */
export const DFM_NOT_IMPLEMENTED = 'DFM_NOT_IMPLEMENTED' as const;
/** Greppable sentinel for the opaque unknown-ref error. */
export const DFM_OPAQUE_UNKNOWN_REF = 'DFM_OPAQUE_UNKNOWN_REF' as const;

/**
 * Thrown when serialization/parsing reaches a surface outside the implemented
 * subset.
 *
 * Retained (exported, typed, greppable) as the sentinel for any FUTURE
 * genuinely-uncovered surface. No live path throws it today: the ENG-2487
 * fold-in made both directions total — unregistered node types fence
 * losslessly instead of throwing (see `pm-to-dfm.ts` / `inline-serializer.ts`).
 *
 * `nodeType` is the offending ProseMirror node type (or a scoped sentinel such
 * as `text-marks` for surfaces that are not a single node type).
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
 * Thrown by {@link reattachOpaqueRefs} (live since ENG-2487) when a
 * `:::dfm-opaque` reference's id has no matching node in the supplied base
 * document / opaque-body map. Never a lossy best-effort write: an unresolvable
 * reference is a hard, typed error the caller can catch by class or by `code`.
 */
export class DfmOpaqueUnknownRefError extends Error {
  readonly code = DFM_OPAQUE_UNKNOWN_REF;
  /** The unresolved opaque block id. */
  readonly ref: string;
  /** The fenced node's original type (from the fence header). */
  readonly nodeType: string;

  constructor(nodeType: string, ref: string, message?: string) {
    super(
      message ??
        `DfM opaque ref unresolved: type="${nodeType}" id="${ref}" has no ` +
          `matching node in the base document (${DFM_OPAQUE_UNKNOWN_REF}).`,
    );
    this.name = 'DfmOpaqueUnknownRefError';
    this.ref = ref;
    this.nodeType = nodeType;
    Object.setPrototypeOf(this, DfmOpaqueUnknownRefError.prototype);
  }
}
