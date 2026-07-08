// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-1376 — shared shape reference for the role-anchored "tldr" lead
 * callout (`registerBlockSchema('tldr', ...)` in
 * `handlers/structure.ts`). The write-DTO for the block-PATCH surface is
 * schema-only there (blocked-by `blockid-chokepoint-engine`); this file
 * gives the READ side (`extractTldrText`, page-visuals) a single typed
 * definition of the ProseMirror node shape it recognises as a tldr block,
 * instead of ad-hoc `any` casts scattered through the projection code
 * (CS ❌#12).
 */

/** The `attrs.role` value that marks a callout as the page's tldr lead. */
export const TLDR_ROLE = 'tldr' as const;

/** Minimal ProseMirror JSON node shape `extractTldrText` walks. */
export interface ProseMirrorJsonNode {
  type?: string;
  attrs?: Record<string, unknown> & { role?: string };
  content?: ProseMirrorJsonNode[];
  text?: string;
}
