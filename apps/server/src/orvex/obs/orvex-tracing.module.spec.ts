// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { HttpAdapterHost } from '@nestjs/core';

import { __getActiveProviderForTests, initOrvexTracing } from './orvex-tracing.bootstrap';
import { OrvexTracingModule } from './orvex-tracing.module';

/**
 * F3 fix (§4i graceful flush) — `OrvexTracingModule.onApplicationShutdown`
 * is what `app.enableShutdownHooks()` (already wired in `main.ts`) invokes
 * on SIGTERM/SIGINT. This exercises the REAL lifecycle method against a
 * REAL `initOrvexTracing`-activated provider, asserting the process-level
 * singleton is actually torn down — the exact gap F3 flagged (spans
 * silently dropped because nothing called `.shutdown()` on graceful stop).
 */
describe('OrvexTracingModule.onApplicationShutdown', () => {
  const fakeHttpAdapterHost = { httpAdapter: undefined } as unknown as HttpAdapterHost;

  afterEach(async () => {
    // Best-effort cleanup if a test left an active provider registered.
    const active = __getActiveProviderForTests();
    if (active) {
      await active.shutdown();
    }
  });

  it('flushes/stops the active OTel provider on graceful shutdown', async () => {
    initOrvexTracing({
      ORVEX_MODULES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
    });
    expect(__getActiveProviderForTests()).not.toBeNull();

    await new OrvexTracingModule(fakeHttpAdapterHost).onApplicationShutdown();

    expect(__getActiveProviderForTests()).toBeNull();
  });

  it('is a no-op when tracing was never activated (flag-off boot)', async () => {
    expect(__getActiveProviderForTests()).toBeNull();
    await expect(
      new OrvexTracingModule(fakeHttpAdapterHost).onApplicationShutdown(),
    ).resolves.toBeUndefined();
  });
});
