// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * CLOUD — read directly from `process.env` at MODULE-LOAD time (before
 * Nest's DI container exists), so it cannot go through `OrvexConfigService`
 * (a DI-constructed instance) the way every other config read in this
 * engine does. `apps/server/src/orvex/config` is this repo's declared
 * `process-env` ban owner (`config/services.yaml`
 * `lint.orvex-wiki.env_read_paths`), so the ONE bare `process.env` read
 * `app.module.ts` needs at its top-level `require('./ee/ee.module')` guard
 * lives here instead of inline there — the same "PUBLIC repo, no
 * `@orvexai/contracts.loadConfig` remedy" reasoning already documented on
 * `env_read_paths`, applied to a pre-DI call site rather than a DI one.
 */
export function isCloudModeAtBoot(): boolean {
  return process.env.CLOUD === 'true';
}
