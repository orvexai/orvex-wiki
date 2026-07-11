// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsUUID,
} from 'class-validator';

/**
 * AclFilterDto (ENG-1957 AC1) — the batch ACL-intersection request body.
 * `workspaceId` scopes tenant isolation (a page from a foreign workspace
 * is silently excluded from the result, never a 403/404 — this route
 * intersects, it doesn't validate a single target's existence).
 */
export class AclFilterDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  userId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  pageIds: string[];
}
