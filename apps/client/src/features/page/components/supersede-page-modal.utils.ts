// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/** A destination picked in the supersede modal's page search. */
export interface PageDestinationSelection {
  type: "page";
  slugId: string;
  title?: string | null;
}

/**
 * AC3 — Confirm is enabled only for an actual page selection with a
 * slugId; `null`/`undefined`/a non-page selection never gates it open.
 */
export function canConfirmSupersede(
  selection: PageDestinationSelection | null | undefined,
): boolean {
  return !!selection && selection.type === "page" && !!selection.slugId;
}
