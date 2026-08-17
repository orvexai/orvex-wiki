// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IsUUID, Matches } from 'class-validator';

/**
 * `shortCellId` — the canonical registry cell alias: `<region><ordinal><az>`,
 * two lowercase letters, one or more digits, then an OPTIONAL single lowercase
 * availability-zone letter (substrate-arch AD-13 / B3). `eu1a` and the legacy
 * bare-ordinal `eu9` both conform; `eu1-a`, `EU1A` and the long-form AWS-mirror
 * `eu-central-1a` do not. Enforced HERE too so a malformed cell token 400s at
 * this seam rather than surfacing as an opaque identity 400/422.
 *
 * The AUTHORITY is orvex-studio-identity's exported `registry.IsShortCellID`
 * (`internal/registry/registry.go`), and this is a hand-copy — orvex-wiki is
 * the public AGPL engine and cannot import the private Go substrate, so the
 * pattern cannot be shared at the source. That makes this copy the exact
 * duplicate identity's own comment warns about, and it went stale once
 * already: it kept the pre-AZ `^[a-z]{2}[0-9]+$` across the eu1 -> eu1a
 * catalog migration (ENG-3268) and began rejecting the very cell the registry
 * now assigns, 400-ing lib's M14 tenant-move rehearsal at this seam.
 *
 * Do not re-quote identity's regex in prose here — a snapshot of the pattern
 * is what rotted last time: the comment and the code agreed with each other
 * while both disagreed with the authority. `tenant-cell-move.dto.spec.ts`
 * pins the conformance table instead, mirroring identity's own
 * TestShortCellID_AZSuffixConformance.
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
    message: 'sourceCellId must be a short registry cell token (e.g. "eu1")',
  })
  sourceCellId!: string;

  @Matches(SHORT_CELL_ID, {
    message: 'targetCellId must be a short registry cell token (e.g. "eu9")',
  })
  targetCellId!: string;
}
