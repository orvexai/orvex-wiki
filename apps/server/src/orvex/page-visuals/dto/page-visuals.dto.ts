// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** Body for `POST /api/orvex/page-visuals/subpage-cards` and `/freshness`. */
export class PageVisualsPageIdDto {
  @IsUUID()
  pageId: string;
}

/** Body for `POST /api/orvex/page-visuals/changelog`. */
export class ChangelogQueryDto {
  @IsUUID()
  pageId: string;

  // AC5 — clamped 1..100 server-side regardless of what's sent; the
  // decorators reject obviously-invalid input early, the service clamps
  // the rest (e.g. omitted / default).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
