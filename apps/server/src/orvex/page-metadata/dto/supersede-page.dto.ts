// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import 'reflect-metadata';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * ENG-1434 AC1-AC8 — `POST /api/orvex/pages/supersede` body.
 *
 * `supersedes` XOR `supersededBy` (AC1) is a cross-field business rule, not
 * a per-field shape constraint, so it is enforced in
 * `OrvexPageMetadataService.supersedeAtomic` (the real chokepoint, AC12),
 * never duplicated here — this DTO only validates each field's own shape.
 */
export class SupersedePageDto {
  @IsUUID()
  pageId: string;

  /** This page becomes canonical, superseding the page at this slug. */
  @IsOptional()
  @IsString()
  supersedes?: string;

  /** This page is superseded by the canonical page at this slug. */
  @IsOptional()
  @IsString()
  supersededBy?: string;

  /** A `CONFIRM_TOKEN` minted by `ConfirmTokenService.issue()` for
   * `action: 'supersede'`, required for a non-human (`api_key`) caller
   * unless `forceSupersede` is used instead (AC3/AC4). */
  @IsOptional()
  @IsString()
  confirmToken?: string;

  /** The fail-closed, workspace-admin-gated break-glass override (AC5-AC8). */
  @IsOptional()
  @IsBoolean()
  forceSupersede?: boolean;

  @IsOptional()
  @IsString()
  forceReason?: string;
}
