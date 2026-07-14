// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import 'reflect-metadata';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/**
 * ENG-1445 AC4 — `POST /api/pages/bulk-delete` body: the real destructive
 * chokepoint an `api_key` (agent) caller must present a `bulk_delete`
 * -scoped `CONFIRM_TOKEN` for (review1 F2 — the prior "chokepoint" was only
 * a local test fixture; no HTTP surface enforced it).
 *
 * `scopeId` is the opaque batch identifier the confirm token was minted
 * against (`ConfirmTokenService.issue({ action: 'bulk_delete', scopeId, ... })`)
 * — the caller must present the SAME scopeId it was minted for, so a token
 * minted for one batch can never be replayed against a different one.
 */
export class BulkDeletePagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  pageIds: string[];

  @IsString()
  scopeId: string;

  /** Required for `api_key` callers when the workspace's ratify-gate is
   * `required` (default). Ignored for human callers. */
  @IsOptional()
  @IsString()
  confirmToken?: string;
}
