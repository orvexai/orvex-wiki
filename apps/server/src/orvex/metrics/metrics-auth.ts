// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * metrics-auth — dependency-free CIDR/bearer matcher guarding `/metrics`
 * (ENG-1360, T1/T2). Ported from the fork at pin
 * `050187676624f2395c55b36ec60e365f87fd4a9f`
 * (`apps/server/src/orvex/metrics/metrics-auth.ts#L92-L101`).
 *
 * Fail-closed default (po-ruling 5 — no degradation to "open"): when
 * neither `METRICS_ALLOWED_CIDRS` nor `METRICS_BEARER_TOKEN` is configured,
 * every request is denied (AC4).
 */

export interface MetricsAuthConfig {
  allowedCidrs: string[];
  bearerToken: string | null;
}

/**
 * DI token for the fail-closed-by-default auth config (CIDR allow-list +
 * bearer token). Lives here (not in `metrics.module.ts`) to avoid a
 * controller<->module circular import — `metrics.controller.ts` needs the
 * token but must not import `metrics.module.ts` (which imports the
 * controller for `@Module({ controllers: [...] })`). Read from
 * `process.env` ONCE at module-init (§4h ❌#8 — no inline credentialed
 * client); tests override it directly via this token instead of mutating
 * `process.env`.
 */
export const METRICS_AUTH_CONFIG = 'METRICS_AUTH_CONFIG';

/** Reads the fail-closed-by-default auth config from process.env (or an
 * injected env-like record for tests). §4h ❌#8 — env read only, no inline
 * credentialed client. */
export function readMetricsAuthConfig(
  env: Record<string, string | undefined>,
): MetricsAuthConfig {
  const rawCidrs = env.METRICS_ALLOWED_CIDRS;
  const allowedCidrs = rawCidrs
    ? rawCidrs
        .split(',')
        .map((cidr) => cidr.trim())
        .filter((cidr) => cidr.length > 0)
    : [];
  const bearerToken = env.METRICS_BEARER_TOKEN?.trim() || null;
  return { allowedCidrs, bearerToken };
}

/** Strips a leading `::ffff:` IPv4-mapped-IPv6 prefix, if present. */
function normalizeIp(ip: string): string {
  const prefix = '::ffff:';
  return ip.toLowerCase().startsWith(prefix) ? ip.slice(prefix.length) : ip;
}

function parseIpv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

/** Returns true iff `ip` (IPv4, optionally IPv4-mapped-IPv6) falls within
 * `cidr`. Returns false (never throws) for malformed input — AC5. */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [rangeIpRaw, prefixLenRaw] = cidr.split('/');
  if (!rangeIpRaw || prefixLenRaw === undefined) return false;

  const prefixLen = Number(prefixLenRaw);
  if (!Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 32) {
    return false;
  }

  const rangeValue = parseIpv4(rangeIpRaw);
  const ipValue = parseIpv4(normalizeIp(ip));
  if (rangeValue === null || ipValue === null) return false;

  if (prefixLen === 0) return true;
  const mask = (0xffffffff << (32 - prefixLen)) >>> 0;
  return (rangeValue & mask) === (ipValue & mask);
}

/** Returns true iff `ip` matches any CIDR in `cidrs` (AC5). */
export function ipMatchesAny(ip: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => ipMatchesCidr(ip, cidr));
}

/** Length-checked, constant-time-ish equality compare so a valid bearer
 * token cannot be inferred via response-time short-circuiting (SE-Arch
 * §Security). Returns false if no token is configured or the header is
 * absent/malformed (AC1). */
export function bearerTokenMatches(
  authorizationHeader: string | undefined,
  bearerToken: string | null,
): boolean {
  if (!bearerToken || !authorizationHeader) return false;
  const prefix = 'Bearer ';
  if (!authorizationHeader.startsWith(prefix)) return false;
  const provided = authorizationHeader.slice(prefix.length);

  if (provided.length !== bearerToken.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ bearerToken.charCodeAt(i);
  }
  return diff === 0;
}

/** The single fail-closed authorization gate for `/metrics` (AC1/AC4/AC5).
 * Denies when neither a CIDR allow-list nor a bearer token is configured;
 * otherwise authorizes on a matching bearer token OR a matching source IP.
 */
export function isMetricsRequestAuthorized(
  config: MetricsAuthConfig,
  sourceIp: string,
  authorizationHeader: string | undefined,
): boolean {
  if (config.allowedCidrs.length === 0 && !config.bearerToken) return false;
  if (bearerTokenMatches(authorizationHeader, config.bearerToken)) {
    return true;
  }
  return ipMatchesAny(sourceIp, config.allowedCidrs);
}
