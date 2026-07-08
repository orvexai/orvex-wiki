// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { PageStatusValue } from "@/features/page/types/page.types";

/** AC4 — the space-agnostic redirect route to a page by slugId (the
 * engine resolves `/p/:slugId` regardless of title/space, mirroring
 * `buildPageUrl`'s no-space-name branch). */
export function buildPageLink(supersededBySlugId: string): string {
  return `/p/${supersededBySlugId}`;
}

/** AC5 — the archived-reason suffix appended to the banner text; empty
 * when there is no reason on record. */
export function buildArchivedReasonSuffix(
  archiveReason: string | null | undefined,
): string {
  return archiveReason ? ` — ${archiveReason}` : "";
}

/** AC5 — Unarchive is offered only for an archived page, and never in
 * the read-only variant. */
export function shouldShowUnarchive(
  status: PageStatusValue | undefined,
  readOnly: boolean | undefined,
): boolean {
  return status === "archived" && !readOnly;
}
