// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IsUUID, Matches } from 'class-validator';

/**
 * `shortCellId` — mirrors orvex-studio-identity's own registry constraint
 * (`internal/registry/registry.go` `shortCellID`, `^[a-z]{2}[0-9]+$`): a
 * short registry alias (e.g. `eu1`, `eu9`), never a long-form AWS-mirror
 * region string. Enforced HERE too so a malformed cell token 400s at this
 * seam rather than surfacing as an opaque identity 400/422.
 */
const SHORT_CELL_ID = /^[a-z]{2}[0-9]+$/;

/**
 * The registry cross-cell tenant-MOVE request body — `POST
 * /api/orvex/tenant-move` (ENG-1578). Deliberately NOT the A-MOVE
 * `TenantMoveManifest` shape (`tenant-move-manifest.dto.ts`): this is the
 * REGISTRY-level cell-binding relocation only (identity's `Registry.Move`,
 * already real — ENG-1507), not the bulk-content quiesce/export/import
 * pipeline (still a deliberate 501 stub, `orvex-tenant-move.controller.ts`).
 */
export class TenantCellMoveRequestDto {
  @IsUUID()
  tenantId!: string;

  @Matches(SHORT_CELL_ID, {
    message: 'sourceCellId must be a short registry cell token (e.g. "eu1")',
  })
  sourceCellId!: string;

  @Matches(SHORT_CELL_ID, {
    message: 'targetCellId must be a short registry cell token (e.g. "eu9")',
  })
  targetCellId!: string;
}
