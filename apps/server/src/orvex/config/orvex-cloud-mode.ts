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
import { CELL_SOLO } from './orvex-config.service';

export function isCloudModeAtBoot(): boolean {
  return process.env.CLOUD === 'true';
}

/**
 * The deployment shape that cannot safely run the workspace cell-id backfill.
 *
 * Keep this predicate beside the pre-DI CLOUD reader so the migration guard and
 * the eventual process-level boot guard share exactly one interpretation of
 * the cloud + solo/unset state. An explicit environment bag keeps the rule
 * deterministic for migration tests and the later boot-sequencing gate.
 */
export function isCloudSoloCellAtBoot(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const cellId = env.CELL_ID?.trim();
  return (
    env.CLOUD === 'true' &&
    (cellId === undefined || cellId === '' || cellId === CELL_SOLO)
  );
}

/**
 * Refuse to enter the application boot path when cloud cell isolation cannot
 * identify a real cell. This is deliberately a synchronous assertion so the
 * caller can run it before Nest, tracing, migrations, or the HTTP listener
 * are initialized.
 */
export function assertCloudCellPostureAtBoot(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isCloudSoloCellAtBoot(env)) {
    throw new Error(
      'ENG-3789 AC2: refusing to start: CLOUD=true requires a non-solo CELL_ID; correct the deployment posture before starting the wiki process',
    );
  }
}
