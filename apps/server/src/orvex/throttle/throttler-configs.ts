// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  AI_CHAT_THROTTLER,
  AUTH_THROTTLER,
  USER_EXPORT_THROTTLER,
} from '../orvex-throttler-names';

/**
 * throttler-configs — the canonical per-throttler override table + the pure
 * `resolveLimit` resolver, ported for the standalone `orvex-wiki` engine.
 * ENG-1436 (fork pin `050187676624f2395c55b36ec60e365f87fd4a9f`,
 * `packages/orvex-extensions/src/throttle/throttler-configs.ts#L1-L112`).
 *
 * `resolveLimit` is a PURE helper: no I/O, no `Date.now`/`Math.random`/
 * `process.env`, inputs are never mutated (CS §10, §4c pure-helper tier).
 */

export interface OrvexThrottlerConfig {
  /** The `@nestjs/throttler` throttler name this config governs. */
  readonly name: string;
  /** The limit applied when no valid workspace override is present. */
  readonly defaultLimit: number;
  /**
   * Dotted path into `workspace.settings` where a per-workspace override may
   * live, e.g. `['ai', 'throttle', 'chatRpm']` for
   * `workspace.settings.ai.throttle.chatRpm`. An empty path means this
   * throttler is a ratified ceiling with NO workspace override (CS ❌10) —
   * `resolveLimit` always returns `defaultLimit` for it.
   */
  readonly settingsPath: readonly string[];
}

const CONFIGS: readonly OrvexThrottlerConfig[] = [
  {
    name: AUTH_THROTTLER,
    defaultLimit: 10,
    settingsPath: [],
  },
  {
    name: AI_CHAT_THROTTLER,
    defaultLimit: 180,
    settingsPath: ['ai', 'throttle', 'chatRpm'],
  },
  {
    name: USER_EXPORT_THROTTLER,
    // Ratified ceiling (ENG-1473) — empty settingsPath below means this can
    // NEVER be raised via a workspace override (CS ❌10).
    defaultLimit: 5,
    settingsPath: [],
  },
];

/**
 * Looks up the `OrvexThrottlerConfig` for a throttler name. Returns `null`
 * for a name with no config — callers (the guard's `handleRequest`) MUST
 * treat `null` as "no override applies, delegate unchanged" (AC10); they
 * must never call `resolveLimit` with a name that has no config.
 */
export function lookupConfig(name: string): OrvexThrottlerConfig | null {
  return CONFIGS.find((config) => config.name === name) ?? null;
}

function readPath(source: unknown, path: readonly string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isValidOverride(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Resolves the effective limit for `throttlerName` given the raw
 * `workspaceSettings` blob (or `null`/`undefined` when absent). Applies a
 * per-workspace override when present and valid (floored to an integer via
 * `Math.floor`), and fails safe to the config's `defaultLimit` on ANY
 * malformed override — `0`, negative, `NaN`, a non-number (e.g. a numeric
 * string), or an unreachable/non-object mid-path segment (AC4-AC6, AC11).
 *
 * Throws if `throttlerName` has no registered config — this is a programming
 * error, not a request-time condition: every real call site guards via
 * `lookupConfig(name) !== null` first (AC10), so this path is unreachable in
 * the request flow.
 */
export function resolveLimit(
  throttlerName: string,
  workspaceSettings: unknown,
): number {
  const config = lookupConfig(throttlerName);
  if (!config) {
    throw new Error(
      `resolveLimit: no OrvexThrottlerConfig registered for "${throttlerName}"`,
    );
  }

  const rawOverride = readPath(workspaceSettings, config.settingsPath);
  if (isValidOverride(rawOverride)) {
    return Math.floor(rawOverride);
  }
  return config.defaultLimit;
}
