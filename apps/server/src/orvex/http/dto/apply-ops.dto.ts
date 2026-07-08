// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * A single typed PM-JSON / block-op — `#/components/schemas/PmOp`.
 *
 * Coarse-but-real: the exact discriminated op grammar (replaceBlock /
 * insertBlock / deleteBlock / mark / opaque-node reattach) is frozen at delivery
 * against the DfM parity corpus, so only the `type` discriminant is constrained
 * here. The contract marks PmOp `additionalProperties: true`; the op payload is
 * carried through untouched by the write primitive (which is 501 today).
 */
export class PmOpDto {
  @IsString()
  type!: string;
}

/**
 * FR-W1 apply-ops request — `#/components/schemas/ApplyOpsRequest`.
 *
 * Only the two contract fields (CS scope discipline — no speculative surface):
 * the CAS baseline `ifVersion` (a monotonic version/etag, D-CON-5) and the
 * ordered `ops[]` batch applied atomically.
 */
export class ApplyOpsRequestDto {
  @IsInt()
  @Min(0)
  ifVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PmOpDto)
  ops!: PmOpDto[];
}
