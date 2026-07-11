// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * internal-api-auth (ENG-1957, AC1/AC5) — the fail-closed bearer-token
 * matcher guarding every `/internal/*` route. Ported pattern from
 * `orvex/metrics/metrics-auth.ts` (ENG-1360): a single shared-secret
 * bearer token, constant-time-ish compared, read from `process.env` ONCE
 * at module-init (CS §4h ❌#8 — no inline credentialed client). We reuse
 * `bearerTokenMatches` directly rather than re-implementing the compare
 * (CS one-adapter rule) — this module supplies only the read + wiring
 * that is specific to the `/internal/*` surface (its own env var, its own
 * DI token), the compare primitive itself is NOT duplicated.
 *
 * Fail-closed default (AC5 — "fail closed (deny-by-default) on
 * missing/invalid internal credentials", mirroring metrics po-ruling 5):
 * when `INTERNAL_API_BEARER_TOKEN` is unset, EVERY request to
 * `/internal/*` is denied — there is no "open" fallback.
 */

import { bearerTokenMatches } from '../../orvex/metrics/metrics-auth';

export interface InternalApiAuthConfig {
  bearerToken: string | null;
}

/**
 * DI token for the fail-closed-by-default internal-API auth config. Lives
 * here (not in `internal-api.module.ts`) for the same reason
 * `METRICS_AUTH_CONFIG` lives in `metrics-auth.ts` — avoids a
 * controller<->module circular import; tests override it directly via
 * this token instead of mutating `process.env`.
 */
export const INTERNAL_API_AUTH_CONFIG = 'INTERNAL_API_AUTH_CONFIG';

/** Reads the fail-closed-by-default internal-API bearer token from
 * process.env (or an injected env-like record for tests). */
export function readInternalApiAuthConfig(
  env: Record<string, string | undefined>,
): InternalApiAuthConfig {
  const bearerToken = env.INTERNAL_API_BEARER_TOKEN?.trim() || null;
  return { bearerToken };
}

/** The single fail-closed authorization gate for `/internal/*` (AC1/AC5).
 * Denies when no bearer token is configured; otherwise authorizes on a
 * matching `Authorization: Bearer <token>` header only (no CIDR leg —
 * unlike `/metrics`, `/internal/*` has no scrape-from-known-subnet use
 * case, so we do not carry that surface over).
 */
export function isInternalApiRequestAuthorized(
  config: InternalApiAuthConfig,
  authorizationHeader: string | undefined,
): boolean {
  if (!config.bearerToken) return false;
  return bearerTokenMatches(authorizationHeader, config.bearerToken);
}
