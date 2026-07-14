// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1445 — the payload/result shapes shared by `RatifyTokenService` and
 * `ConfirmTokenService`. Kept typed end-to-end (CS §12 ❌12 any-laundering
 * guard): callers never see `any` at the mint/verify boundary.
 */

/** The decoded payload of a minted `RATIFY_TOKEN` (AC1). */
export interface RatifyTokenPayload {
  pageId: string;
  workspaceId: string;
  confirmingUserId: string;
  /** epoch millis */
  expiresAt: number;
}

/** The action union a `CONFIRM_TOKEN` may be scoped to (AC4). */
export type ConfirmTokenAction = 'supersede' | 'bulk_delete';

/** The decoded payload of a minted `CONFIRM_TOKEN` (AC4). */
export interface ConfirmTokenPayload {
  workspaceId: string;
  action: ConfirmTokenAction;
  /** The resource the confirm token authorizes the action against — a
   * pageId for `supersede`, or an opaque batch/scope id for `bulk_delete`. */
  scopeId: string;
  confirmingUserId: string;
  /** epoch millis */
  expiresAt: number;
}

/** Typed rejection reasons — verify never throws-with-stack (AC2). */
export type TokenVerifyFailureReason =
  | 'malformed'
  | 'invalid'
  | 'expired';

export type TokenVerifyResult<TPayload> =
  | { ok: true; payload: TPayload }
  | { ok: false; reason: TokenVerifyFailureReason };

/**
 * AC5/AC6 — the caller context the ratify-gate chokepoint (promote to
 * `PageStatus.CANONICAL`) evaluates. Threaded from the HTTP edge
 * (`OrvexPagePromoteController`) into `OrvexPageMetadataService
 * .applyMetadata` so a real, non-human caller can never flip a page to
 * `canonical` without either a valid `RATIFY_TOKEN` or an explicitly
 * audited `forceSelfRatify` override.
 */
export interface RatifyGateContext {
  /** `'api_key'` for an agent/non-human caller, `undefined` for a human
   * browser session. Only `api_key` callers are gated (AC5). */
  authMethod: 'api_key' | undefined;
  actorId: string;
  ratifyToken?: string;
  forceSelfRatify?: boolean;
  forceReason?: string;
}
