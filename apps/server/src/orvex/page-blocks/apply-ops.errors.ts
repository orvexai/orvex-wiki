// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1652 AC4 — the typed error taxonomy for a failed block-op inside an
 * apply-ops batch. Every op-application failure path throws one of these
 * codes (never a plain `Error`, never a 200-with-no-change) so the HTTP
 * layer can map it to a typed 4xx body deterministically.
 *
 * `INVALID_CONTENT_FORMAT` added 2026-07-13 (PM content-corruption
 * root-cause fix): `section-edit` now schema-validates the candidate
 * content BEFORE mutating the working doc (real `ContentMatch`, not a
 * guess) and throws this code when NEITHER legitimate interpretation fits
 * the target block's content model — previously an ill-fitting content
 * shape sailed past the batch stage unchecked and crashed uncaught later,
 * deep inside `stampBlockIds`/`addUniqueIdsToDoc`, as a real ProseMirror
 * `TransformError` instead of a clean, pre-mutation 400 (AC2/AC4).
 */
export type ApplyOpsErrorCode =
  | 'MISSING_REF_BLOCK_ID'
  | 'STRING_NOT_FOUND'
  | 'MOVE_SOURCE_MISSING'
  | 'UNKNOWN_BLOCK_TYPE'
  | 'UNSUPPORTED_OP'
  | 'INVALID_CONTENT_FORMAT'
  // amazing-MCP block string-replace ambiguity guard (`string-replace` op).
  // Distinct from the legacy `patch-string`'s single-`STRING_NOT_FOUND` /
  // replace-first semantics: the verified string-replace refuses to guess.
  //   NO_REPLACEMENT — `find` occurs ZERO times in the target block.
  //   AMBIGUOUS_OLD  — `find` occurs MORE THAN ONCE and `replaceAll` was not
  //                    set, so which occurrence to change is ambiguous; the
  //                    caller must disambiguate (unique `find`) or opt into
  //                    `replaceAll`. Never a silent first-match replace.
  | 'NO_REPLACEMENT'
  | 'AMBIGUOUS_OLD';

/**
 * Thrown by `applyOpsBatch` (apply-ops-batch.util.ts) the moment ANY op in
 * the ordered batch cannot be applied. The caller (ApplyOpsService) catches
 * this and maps it to a `BadRequestException({code, message})` — it never
 * reaches the point of touching the database, which is what guarantees
 * AC2's "on any op failure ZERO writes commit" (the whole batch is applied
 * against an in-memory working doc before any transaction opens).
 */
export class ApplyOpsError extends Error {
  constructor(
    public readonly code: ApplyOpsErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApplyOpsError';
  }
}
