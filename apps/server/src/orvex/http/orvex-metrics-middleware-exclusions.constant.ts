// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ORVEX_METRICS_MIDDLEWARE_EXCLUDED_ROUTES (ENG-1604 AC8.5) — routes that
 * must NEVER get a per-request metric emitted by the metrics HTTP
 * middleware.
 *
 * Present-but-dormant: the real `/metrics` endpoint is ENG-1360 (blocked on
 * ENG-1610 publishing the shared `@orvex/metrics` registry) and is not
 * landed at HEAD, so no middleware reads this constant yet. It is declared
 * here — co-located with the future middleware registration point
 * (`apps/server/src/orvex/http`) — so ENG-1360 wires the exclusion
 * unconditionally rather than inventing its own list.
 *
 * - `metrics`                          — self-scrape would inflate its own counters
 * - `health`, `health/orvex`, `health/live` — K8s probe traffic, not user traffic
 * - `mcp`                              — satellite-owned host route (already prefix-excluded)
 * - `robots.txt`, `share/:shareId/p/:pageSlug` — static/public, no metric value
 */
export const ORVEX_METRICS_MIDDLEWARE_EXCLUDED_ROUTES: readonly string[] = [
  'metrics',
  'health',
  'health/orvex',
  'health/live',
  'mcp',
  'robots.txt',
  'share/:shareId/p/:pageSlug',
];
