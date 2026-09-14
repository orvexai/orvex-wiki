// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * Pre-DI process flags for the native-login surface.
 *
 * `AuthModule.register()` builds its controller list while the module graph
 * is being assembled, and `OrvexNativeLoginGuard` deliberately has no
 * constructor collaborators, so neither can reach `OrvexConfigService` (a
 * DI-constructed instance). `apps/server/src/orvex/config` is this repo's
 * declared `process-env` ban owner (`config/services.yaml`
 * `lint.orvex-wiki.env_read_paths`), so the bare `process.env` reads those
 * two call sites need live here, the same way `isCloudModeAtBoot()` serves
 * `app.module.ts`.
 *
 * Both functions read the environment on EVERY call (no module-load
 * caching): the flags are process-level switches that specs toggle between
 * calls, and a cached value would silently diverge from the process state.
 */

/**
 * `ORVEX_MODULES_ENABLED === 'true'` — the exact literal check
 * `OrvexRootModule.register()` applies to decide whether the orvex module
 * tree is active.
 */
export function isOrvexModulesEnabled(): boolean {
  return process.env.ORVEX_MODULES_ENABLED === 'true';
}

/**
 * `NATIVE_LOGIN_REMOVED === 'true'` — the ENG-2420 rollout flag that removes
 * the native login, forgot-password and password-reset routes from
 * registration entirely.
 */
export function isNativeLoginRemoved(): boolean {
  return process.env.NATIVE_LOGIN_REMOVED === 'true';
}
