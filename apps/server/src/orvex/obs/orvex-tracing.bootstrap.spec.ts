// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { trace } from '@opentelemetry/api';

import { initOrvexTracing } from './orvex-tracing.bootstrap';

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
});
