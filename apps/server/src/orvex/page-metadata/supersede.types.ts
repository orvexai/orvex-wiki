// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1434 — the caller context the supersede chokepoint
 * (`OrvexPageMetadataService.supersedeAtomic`) evaluates. Threaded from the
 * HTTP edge (`OrvexPageSupersedeController`), mirroring `RatifyGateContext`
 * (ENG-1445).
 */
export interface SupersedeGateContext {
  /** `'api_key'` for an agent/non-human caller, `undefined` for a human
   * browser session. Only `api_key` callers require a CONFIRM_TOKEN or a
   * forced override (AC3). */
  authMethod: 'api_key' | undefined;
  actorId: string;
  confirmToken?: string;
  forceSupersede?: boolean;
  forceReason?: string;
}

/** The XOR-guarded pair a supersede write resolves (AC1). */
export interface SupersedeDirection {
  /** This page becomes canonical, superseding the page at this slug. */
  supersedes?: string;
  /** This page is superseded by the canonical page at this slug. */
  supersededBy?: string;
}

/**
 * AC13 — the post-commit realtime freshness port. Injected so the atomic
 * supersede/unsupersede/status write can notify connected workspace clients
 * without owning a concrete transport; a failing broadcast is caught by the
 * caller and logged, never allowed to fail the request (AC13).
 */
export interface IPageLifecycleBroadcaster {
  broadcastLifecycleChange(event: {
    workspaceId: string;
    spaceId: string;
    pageId: string;
    status: string;
  }): void | Promise<void>;
}

export const PAGE_LIFECYCLE_BROADCASTER = Symbol('PAGE_LIFECYCLE_BROADCASTER');
