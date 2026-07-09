// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ENG-1599 §5c — static gate. §4h ❌#6 (big-upfront/wrong-driver guard):
 * `@opentelemetry/instrumentation-pg` targets node-`pg`, not this engine's
 * `postgres`/postgres.js driver (via kysely) — it must never be added.
 * `@opentelemetry/auto-instrumentations-node` is the broad bundle
 * design-it-twice explicitly rejected (§4e) in favour of hand-picked
 * instrumentations — it must never be added either.
 */
describe('orvex-tracing dependency guard (§4h ❌#6)', () => {
  it('apps/server/package.json never adds @opentelemetry/instrumentation-pg or auto-instrumentations-node', () => {
    const pkgPath = join(__dirname, '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };

    expect(allDeps['@opentelemetry/instrumentation-pg']).toBeUndefined();
    expect(allDeps['@opentelemetry/auto-instrumentations-node']).toBeUndefined();
  });

  it('does pin the hand-picked instrumentations this leg registers', () => {
    const pkgPath = join(__dirname, '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    for (const dep of [
      '@opentelemetry/api',
      '@opentelemetry/sdk-trace-node',
      '@opentelemetry/exporter-trace-otlp-proto',
      '@opentelemetry/instrumentation-http',
      '@opentelemetry/instrumentation-fastify',
      '@opentelemetry/instrumentation-ioredis',
    ]) {
      expect(pkg.dependencies[dep]).toBeDefined();
    }
  });
});
