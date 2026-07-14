// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { trace } from '@opentelemetry/api';

import {
  __getActiveProviderForTests,
  initOrvexTracing,
  resolveOtlpTracesUrl,
  shutdownOrvexTracing,
} from './orvex-tracing.bootstrap';

/**
 * ENG-1599 T1/AC5 — unit. VANILLA BYTE-PARITY DOCTRINE: with the flag off (or
 * the OTLP endpoint unset) `initOrvexTracing` MUST be a pure no-op — no
 * `NodeTracerProvider` constructed, no global tracer provider registered, no
 * exporter opened.
 */
describe('orvex-tracing.bootstrap', () => {
  const originalGlobalProvider = trace.getTracerProvider();

  afterEach(() => {
    // Undo any accidental global registration so specs stay isolated.
    trace.disable();
    void originalGlobalProvider;
  });

  it('returns null and registers no global tracer provider when ORVEX_MODULES_ENABLED is unset (AC5)', () => {
    const handle = initOrvexTracing({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
    });
    expect(handle).toBeNull();
  });

  it('returns null when ORVEX_MODULES_ENABLED is set to something other than the literal "true"', () => {
    const handle = initOrvexTracing({
      ORVEX_MODULES_ENABLED: 'TRUE',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
    });
    expect(handle).toBeNull();
  });

  it('returns null when OTEL_EXPORTER_OTLP_ENDPOINT is unset even with the flag on', () => {
    const handle = initOrvexTracing({
      ORVEX_MODULES_ENABLED: 'true',
    });
    expect(handle).toBeNull();
  });

  it('returns null when OTEL_EXPORTER_OTLP_ENDPOINT is blank', () => {
    const handle = initOrvexTracing({
      ORVEX_MODULES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: '   ',
    });
    expect(handle).toBeNull();
  });

  it('initializes and returns a ShutdownHandle when both the flag and endpoint are set', async () => {
    const handle = initOrvexTracing({
      ORVEX_MODULES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
    });
    expect(handle).not.toBeNull();
    expect(typeof handle?.shutdown).toBe('function');
    await handle?.shutdown();
  });

  // F2 fix: the endpoint MUST be resolved through OrvexConfigService (its
  // documented first consumer), not a second/parallel raw `env[...]` read —
  // this exercises OrvexConfigService's own trim-and-nullify behaviour
  // (leading/trailing whitespace around an otherwise-valid endpoint) so a
  // divergence between the two reads would fail this test.
  it('resolves the endpoint via OrvexConfigService (trims surrounding whitespace, AC5/T2)', async () => {
    const handle = initOrvexTracing({
      ORVEX_MODULES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: '  http://collector:4318  ',
    });
    expect(handle).not.toBeNull();
    await handle?.shutdown();
  });

  // F3 fix (§4i graceful flush): `shutdownOrvexTracing` is the handle-free
  // seam `OrvexTracingModule`'s `OnApplicationShutdown` calls via Nest's
  // existing `app.enableShutdownHooks()` wiring (main.ts) — it must flush/
  // stop whatever `initOrvexTracing` most recently activated, without the
  // caller needing to have kept the returned `ShutdownHandle` itself.
  // Review-1 F1 fix (FR-CT1): `OTEL_EXPORTER_OTLP_ENDPOINT` is documented as
  // the OTLP collector BASE URL (no signal path) — the exporter must resolve
  // the traces-specific resource path itself, or the collector 404s the root
  // and spans never reach Tempo in prod (tests passed only because the
  // injected in-memory exporter never touches the URL).
  describe('resolveOtlpTracesUrl (review-1 F1)', () => {
    it('appends /v1/traces to a bare base endpoint with no trailing slash', () => {
      expect(resolveOtlpTracesUrl('http://collector:4318')).toBe(
        'http://collector:4318/v1/traces',
      );
    });

    it('appends /v1/traces to a base endpoint that already has a trailing slash without doubling it', () => {
      expect(resolveOtlpTracesUrl('http://collector:4318/')).toBe(
        'http://collector:4318/v1/traces',
      );
    });

    it('preserves an existing base path when appending the traces resource path', () => {
      expect(resolveOtlpTracesUrl('http://collector:4318/otlp')).toBe(
        'http://collector:4318/otlp/v1/traces',
      );
    });

    it('is idempotent when the configured endpoint already ends in /v1/traces', () => {
      expect(resolveOtlpTracesUrl('http://collector:4318/v1/traces')).toBe(
        'http://collector:4318/v1/traces',
      );
    });
  });

  describe('shutdownOrvexTracing', () => {
    it('is a no-op when tracing was never activated (flag-off boot)', async () => {
      await expect(shutdownOrvexTracing()).resolves.toBeUndefined();
    });

    it('shuts down the active provider and clears the singleton (graceful stop)', async () => {
      const handle = initOrvexTracing({
        ORVEX_MODULES_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      });
      expect(handle).not.toBeNull();
      expect(__getActiveProviderForTests()).not.toBeNull();

      await shutdownOrvexTracing();

      expect(__getActiveProviderForTests()).toBeNull();
    });

    it('is idempotent — calling it twice after activation does not throw', async () => {
      initOrvexTracing({
        ORVEX_MODULES_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      });

      await shutdownOrvexTracing();
      await expect(shutdownOrvexTracing()).resolves.toBeUndefined();
    });
  });
});
