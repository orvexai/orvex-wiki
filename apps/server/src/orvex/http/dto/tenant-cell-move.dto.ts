// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IsUUID, Matches } from 'class-validator';

/**
 * `shortCellId` — the canonical registry cell alias: two lowercase region
 * letters, one or more digits, then an optional single lowercase AZ letter
 * (for example, `eu1a`, `us1a`, or the legacy bare-ordinal `eu9`). The
 * authority is orvex-studio-identity's exported `registry.IsShortCellID`
 * (`internal/registry/registry.go:73`); this public engine keeps a hand-copy
 * because it cannot import the private Go substrate. ENG-3268 documents why
 * this duplicate must be kept in conformance: the old copy silently stayed
 * pre-AZ and rejected the live registry's `eu1a` assignment.
 *
 * Enforced HERE too so a malformed cell token 400s at this seam rather than
 * surfacing as an opaque identity 400/422. The conformance table in
 * `tenant-cell-move.dto.spec.ts` pins accepted and rejected shapes so this
 * copy cannot narrow or widen silently.
 */
const SHORT_CELL_ID = /^[a-z]{2}[0-9]+[a-z]?$/;

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
    message: 'sourceCellId must be a short registry cell token (e.g. "eu1a")',
  })
  sourceCellId!: string;

  @Matches(SHORT_CELL_ID, {
    message: 'targetCellId must be a short registry cell token (e.g. "eu1a")',
  })
  targetCellId!: string;
}
