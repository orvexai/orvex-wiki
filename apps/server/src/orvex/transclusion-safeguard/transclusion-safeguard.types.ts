// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1470 — port of the fork's `TransclusionConflictMode` /
 * `TransclusionImpact*Dto` shapes (originally sourced from
 * `@orvex/extensions` at the fork pin). This split repo's `@orvex/extensions`
 * package does not (yet) carry these transclusion types, so they are kept
 * local to the safeguard subsystem — no new cross-package port is
 * introduced (CS §3/§7 "no design-it-twice"; 4h #3 premature-interface N/A).
 */

/** The four write-block resolution modes `enforceOrUnsync` honours. */
export type TransclusionConflictMode = 'block' | 'unsync' | 'force';

/**
 * The destructive page operation being guarded. `permanent-delete` is the
 * only operation `force` mode is allowed against (AC4).
 */
export type TransclusionOperation =
  | 'delete'
  | 'permanent-delete'
  | 'archive'
  | 'supersede';

export interface TransclusionReferenceDto {
  referencePageId: string;
  referencePageTitle: string | null;
  referencePageSlugId: string;
  transclusionId: string;
}

export interface TransclusionImpactReport {
  pageId: string;
  operation: TransclusionOperation;
  activeReferenceCount: number;
  canForce: boolean;
  references: TransclusionReferenceDto[];
}

export interface TransclusionImpactRequest {
  pageId: string;
  operation: TransclusionOperation;
}

/** The audit/actor context `enforceOrUnsync` needs to attribute a write. */
export interface TransclusionEnforceContext {
  workspaceId: string;
  actorId?: string;
  actorType?: 'user' | 'system' | 'api_key';
}
