// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { PageStatusValue } from "@/features/page/types/page.types";

/** Every status a human can explicitly assign. `superseded` is
 * deliberately excluded — mirrors the engine's `StatusPageDto`
 * (`@IsIn(SETTABLE_STATUSES)`): that transition belongs exclusively to
 * the paired supersede/unsupersede mutation, never a bare status write. */
export const SETTABLE_STATUSES: PageStatusValue[] = [
  "draft",
  "published",
  "canonical",
  "deprecated",
  "archived",
];

/** AC1 — the dropdown offers every settable status other than the one
 * the page already has. */
export function getAssignableStatuses(
  current: PageStatusValue,
): PageStatusValue[] {
  return SETTABLE_STATUSES.filter((status) => status !== current);
}
