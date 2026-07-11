// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { OrvexConfigService } from '../config/orvex-config.service';

/** The hardcoded upstream exclusions (unrelated to the Orvex env surface). */
export const UPSTREAM_GLOBAL_PREFIX_EXCLUDE: readonly string[] = [
  'robots.txt',
  'share/:shareId/p/:pageSlug',
  // 'metrics' — ENG-1360 AC6: the Prometheus scrape endpoint stays OUTSIDE
  // the /api prefix (own fail-closed CIDR/bearer authz, not the app's).
  // Fixed, not env-overridable, like the other upstream exclusions above.
  'metrics',
  // 'internal/(.*)' — ENG-1957 AC5: the engine-internal ACL/export/
  // resolve/ai-search surface stays OUTSIDE the /api prefix (own
  // fail-closed bearer authz via InternalApiAuthGuard, never the
  // public/tenant-facing session auth). Fixed, not env-overridable, same
  // posture as 'metrics' above.
  'internal/(.*)',
];

/**
 * resolveGlobalPrefixExclude (ENG-1604 AC8.4) — the real `/api` global-prefix
 * exclude list `main.ts` passes to `setGlobalPrefix()`. Merges the hardcoded
 * upstream exclusions with `OrvexConfigService#globalPrefixExclude`
 * (env-driven, defaults to `mcp` + `health/orvex`) — deduplicated, order
 * preserved.
 *
 * A pure function of an env bag (constructed the same pre-DI way as
 * `OrvexRootModule.register()`'s `OrvexConfigService`) so it is unit-testable
 * without booting Nest.
 */
export function resolveGlobalPrefixExclude(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const config = new OrvexConfigService(env);
  const merged = [...UPSTREAM_GLOBAL_PREFIX_EXCLUDE, ...config.globalPrefixExclude];
  return [...new Set(merged)];
}
