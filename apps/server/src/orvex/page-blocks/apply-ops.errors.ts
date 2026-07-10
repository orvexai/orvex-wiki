// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1652 AC4 — the typed error taxonomy for a failed block-op inside an
 * apply-ops batch. Every op-application failure path throws one of these
 * FIVE codes (never a plain `Error`, never a 200-with-no-change) so the
 * HTTP layer can map it to a typed 4xx body deterministically.
 */
export type ApplyOpsErrorCode =
  | 'MISSING_REF_BLOCK_ID'
  | 'STRING_NOT_FOUND'
  | 'MOVE_SOURCE_MISSING'
  | 'UNKNOWN_BLOCK_TYPE'
  | 'UNSUPPORTED_OP';

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
