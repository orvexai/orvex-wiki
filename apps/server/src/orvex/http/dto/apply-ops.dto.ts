// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * A single typed PM-JSON / block-op — `#/components/schemas/PmOp`.
 *
 * ENG-1652 — the ten-verb grammar (append/prepend/insert-at/insert_before/
 * replace-at/move/patch-by-id/delete-by-id/patch-string/section-edit).
 * Coarse-but-real (CS scope discipline): only `type` is required; every op
 * uses whichever subset of the optional fields its verb needs (see
 * `apply-ops-batch.util.ts` for the per-verb requirements + typed error
 * taxonomy on a missing/invalid one). The contract marks PmOp
 * `additionalProperties: true` — the `node`/`patch` payloads are carried
 * through untouched.
 */
export class PmOpDto {
  @IsString()
  type!: string;

  /** append/prepend/insert-at/insert_before/replace-at: the node payload. */
  @IsOptional()
  @IsObject()
  node?: Record<string, unknown>;

  /** replace-at/delete-by-id/patch-by-id/move/patch-string/section-edit target. */
  @IsOptional()
  @IsString()
  blockId?: string;

  /** insert_before/move: the anchor block id. */
  @IsOptional()
  @IsString()
  refBlockId?: string;

  /** insert-at: the target doc-root index. */
  @IsOptional()
  @IsInt()
  index?: number;

  /** patch-by-id: the attrs patch merged onto the target block. */
  @IsOptional()
  @IsObject()
  patch?: Record<string, unknown>;

  /** patch-string: the substring to find within the target block's text. */
  @IsOptional()
  @IsString()
  find?: string;

  /** patch-string: the replacement text. */
  @IsOptional()
  @IsString()
  replace?: string;
}

/**
 * FR-W1 apply-ops request — `#/components/schemas/ApplyOpsRequest`.
 *
 * Only the two contract fields (CS scope discipline — no speculative surface):
 * the CAS baseline `ifVersion` (a monotonic version/etag, D-CON-5) and the
 * ordered `ops[]` batch applied atomically.
 *
 * `ifVersion` is OPTIONAL (2026-07-13, root-fix — night-mode wiki-engine
 * lane): every other real caller convention in this family (wiki-api's
 * `Engine.ApplyOps`, and the engine's own `BatchBlockOpsDto`/
 * `SectionEditDto`/`PatchStringDto` before it) already treats "no CAS
 * baseline supplied" as unconstrained, wire-encoded as an ABSENT field, not
 * a literal `0` (0 is a legitimate version value elsewhere and must never be
 * silently coerced into "unconstrained" by the engine itself — that
 * decision belongs to the caller, at the wire level, once, not re-derived
 * here). Previously `ifVersion` was `@IsInt() @Min(0)` and REQUIRED, so a
 * caller using 0-as-sentinel (wiki-api's own established convention,
 * `internal/clients/clients.go`'s `ifVersionPtr`) had no way to signal
 * "unconstrained" without either sending a literal `0` — which
 * `isIntegerVersion` (core/page/if-version.util.ts) rejects as invalid
 * (`value >= 1`), producing a false-positive `400 INVALID_IF_VERSION` on
 * every first-edit/unconstrained write — or omitting the field, which this
 * required decorator rejected as a validation error before the handler ever
 * ran. `assertIfVersionMatches` already treats `undefined`/`null` as a
 * true no-op (see that util's own doc comment); this DTO simply stops
 * getting in its way. No change needed to `if-version.util.ts` or
 * `apply-ops.service.ts`'s CAS logic — both already do the right thing once
 * the field can genuinely be absent.
 */
export class ApplyOpsRequestDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  ifVersion?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PmOpDto)
  ops!: PmOpDto[];
}
