// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { MetricsAuthConfig, readMetricsAuthConfig } from '../metrics/metrics-auth';

/**
 * Reads the `/metrics` fail-closed-by-default auth config from
 * `process.env`. `readMetricsAuthConfig` itself is a pure, injectable
 * reader (`metrics-auth.ts`); this one-line wrapper exists ONLY so the
 * bare `process.env` reference lives in this repo's declared `process-env`
 * ban owner directory (`config/services.yaml`
 * `lint.orvex-wiki.env_read_paths: [scripts, apps/server/src/orvex/
 * config]`) instead of inline in `metrics.module.ts`'s DI factory.
 */
export function readMetricsAuthConfigFromProcessEnv(): MetricsAuthConfig {
  return readMetricsAuthConfig(process.env);
}
