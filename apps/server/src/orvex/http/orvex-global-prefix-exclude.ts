// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { OrvexConfigService } from '../config/orvex-config.service';

/** The hardcoded upstream exclusions (unrelated to the Orvex env surface). */
export const UPSTREAM_GLOBAL_PREFIX_EXCLUDE: readonly string[] = [
  'robots.txt',
  'share/:shareId/p/:pageSlug',
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
