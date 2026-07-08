// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import 'reflect-metadata';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ForceSelfRatifyDto } from './ratify-gate-settings.dto';

/**
 * ENG-1445 AC5/AC6 — `POST /api/pages/promote` body: the real HTTP
 * chokepoint that flips a page's `orvex_page_meta.status` to `canonical`.
 *
 * Extends `ForceSelfRatifyDto` (review1 F3 — that DTO was previously
 * defined but never imported/routed anywhere; this is the HTTP surface
 * that actually invokes it).
 */
export class PromotePageDto extends ForceSelfRatifyDto {
  @IsUUID()
  pageId: string;

  /** A `RATIFY_TOKEN` minted by `RatifyTokenService.issue()`. Required for
   * an `api_key` caller when the workspace's ratify-gate is `required`,
   * unless `forceSelfRatify` is used instead. */
  @IsOptional()
  @IsString()
  ratifyToken?: string;
}
