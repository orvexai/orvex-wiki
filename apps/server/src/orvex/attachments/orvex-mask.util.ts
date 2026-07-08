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
