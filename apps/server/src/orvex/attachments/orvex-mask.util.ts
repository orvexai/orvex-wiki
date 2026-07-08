// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * Pure credential-masking helper (CS §6 — handler-tier pure helper, no I/O).
 *
 * Shared by both operational-config admin surfaces (storage + mail) so a
 * secret is NEVER echoed back in cleartext. The masked shape always matches
 * `/^.{0,4}•+.{0,4}$/` and never equals the raw input for any non-empty value
 * (the bullet prefix guarantees this even for very short secrets).
 */
export function maskKey(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const tail = value.length > 4 ? value.slice(-4) : value;
  return `••••${tail}`;
}

// Same masking rule applies to mail credentials (username/password).
export const maskValue = maskKey;

/**
 * FR-C18 PII deny-list (ENG-1599 AC6 — span-attribute-tier pure helper, no
 * I/O). Telemetry attributes may carry ONLY opaque identifiers (a UUID or a
 * short slug-shaped token — the `workspaceId`/`correlation_id` shapes), never
 * free-form user content (a page title/body is exactly the shape this must
 * catch). Deny-by-default: anything that does not match the narrow opaque-id
 * shape is DROPPED (returns `null`), never truncated or partially echoed —
 * unlike {@link maskKey}, there is no safe partial reveal for a value that
 * might be a page title, so the only sound behaviour is absence.
 */
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function denyIfLikelyPii(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return OPAQUE_ID_PATTERN.test(trimmed) ? trimmed : null;
}
