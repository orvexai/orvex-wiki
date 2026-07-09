// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { context, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';

import { ORVEX_CORRELATION_CONTEXT_KEY } from '../../orvex/obs/orvex-correlation.hook';
import { createPinoConfig } from './pino.config';

/**
 * ENG-1599 T4/AC3 — unit. Captures the real pino `mixin` function built into
 * `createPinoConfig()` (CS §5 mocking: real pure function, no logger mock)
 * and asserts it stamps trace_id/span_id/correlation_id while a span is
 * active, and stamps NONE of those keys with no active span (AC5 byte-parity,
 * driven with the OTel API's own no-op tracer — no SDK registered in this
 * branch of the test).
 */
describe('pino.config mixin (trace<->log join)', () => {
  function getMixin(): () => Record<string, unknown> {
    const config = createPinoConfig();
    const pinoHttp = config.pinoHttp as { mixin?: () => Record<string, unknown> };
    const mixin = pinoHttp?.mixin;
    if (!mixin) {
      throw new Error('createPinoConfig() did not configure a pinoHttp.mixin');
    }
    return mixin;
  }

  it('stamps NONE of trace_id/span_id/correlation_id when there is no active span (byte-parity)', () => {
    const mixin = getMixin();
    const fields = mixin();
    expect(fields).toEqual({});
    expect(fields.trace_id).toBeUndefined();
    expect(fields.span_id).toBeUndefined();
    expect(fields.correlation_id).toBeUndefined();
  });

  it('stamps trace_id/span_id equal to the active span, and correlation_id from the active context', () => {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();

    try {
      const tracer = trace.getTracer('pino-config-spec');
      const span = tracer.startSpan('test-span');
      const spanContext = span.spanContext();

      const ctxWithSpan = trace.setSpan(context.active(), span);
      const ctxWithCorrelation = ctxWithSpan.setValue(
        ORVEX_CORRELATION_CONTEXT_KEY,
        'corr-xyz-789',
      );

      const fields = context.with(ctxWithCorrelation, () => getMixin()());

      expect(fields.trace_id).toBe(spanContext.traceId);
      expect(fields.span_id).toBe(spanContext.spanId);
      expect(fields.correlation_id).toBe('corr-xyz-789');

      span.end();
    } finally {
      void provider.shutdown();
      trace.disable();
    }
  });
});
