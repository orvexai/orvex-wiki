// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

import {
  captureOutboxTraceContext,
  injectOutboxTraceContext,
  restoreOutboxTraceContext,
} from './orvex-outbox-trace-context.util';
import {
  registerOrvexCorrelationHook,
  ORVEX_CORRELATION_CONTEXT_KEY,
} from '../../obs/orvex-correlation.hook';

const TRACEPARENT_RE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/;

describe('ENG-1600 AC1/AC2 — outbox trace-context capture/restore', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;
  let contextManager: AsyncHooksContextManager;

  beforeAll(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    contextManager = new AsyncHooksContextManager();
    contextManager.enable();
    provider.register({
      propagator: new W3CTraceContextPropagator(),
      contextManager,
    });
  });

  afterAll(async () => {
    contextManager.disable();
    await provider.shutdown();
  });

  it('AC5 vanilla-safe: with no active span, capture returns all-null (never fabricates a trace)', () => {
    // No span started here — ambient root context.
    const captured = captureOutboxTraceContext();
    expect(captured.traceparent).toBeNull();
    expect(captured.tracestate).toBeNull();
    expect(captured.correlationId).toBeNull();
  });

  it('AC1: captures a live W3C traceparent + threaded correlation_id from the active context', () => {
    const tracer = provider.getTracer('test');
    const span = tracer.startSpan('test-request');
    const spanCtx = trace.setSpan(context.active(), span);

    let captured!: ReturnType<typeof captureOutboxTraceContext>;
    context.with(spanCtx, () => {
      // Simulate the correlation hook having already threaded a correlation
      // id onto the active context (as `registerOrvexCorrelationHook` does
      // on every real request, ENG-1599 T3).
      const withCorrelation = context
        .active()
        .setValue(ORVEX_CORRELATION_CONTEXT_KEY, 'corr-abc123');
      context.with(withCorrelation, () => {
        captured = captureOutboxTraceContext();
      });
    });
    span.end();

    expect(captured.traceparent).toMatch(TRACEPARENT_RE);
    expect(captured.correlationId).toBe('corr-abc123');

    const [traceId, spanId] = extractTraceAndSpanId(captured.traceparent!);
    expect(traceId).toBe(span.spanContext().traceId);
    expect(spanId).toBe(span.spanContext().spanId);
  });

  it('AC2: restoreOutboxTraceContext round-trips a persisted traceparent back into a Context usable as a span parent', () => {
    const tracer = provider.getTracer('test');
    const producerSpan = tracer.startSpan('producer-request');
    const carrier: { traceparent?: string; tracestate?: string } = {};
    propagation.inject(trace.setSpan(context.active(), producerSpan), carrier);
    producerSpan.end();

    const restored = restoreOutboxTraceContext({
      traceparent: carrier.traceparent ?? null,
      tracestate: carrier.tracestate ?? null,
    });

    const childSpan = tracer.startSpan('relay-producer-span', undefined, restored);
    expect(childSpan.spanContext().traceId).toBe(
      producerSpan.spanContext().traceId,
    );
    childSpan.end();
  });

  it('AC2: restoreOutboxTraceContext is a no-op (root context) when no traceparent was persisted', () => {
    const restored = restoreOutboxTraceContext({
      traceparent: null,
      tracestate: null,
    });
    expect(restored).toBe(context.active());
  });

  it('AC4: injectOutboxTraceContext exposes the PRODUCER span (not the original request span) as the fresh traceparent for consumers to link to', () => {
    const tracer = provider.getTracer('test');
    const requestSpan = tracer.startSpan('original-request');
    const requestCtx = trace.setSpan(context.active(), requestSpan);

    let producerTraceparent!: { traceparent: string | null; tracestate: string | null };
    context.with(requestCtx, () => {
      const producerSpan = tracer.startSpan('outbox-producer-span');
      const producerCtx = trace.setSpan(context.active(), producerSpan);
      producerTraceparent = injectOutboxTraceContext(producerCtx);
      producerSpan.end();
    });
    requestSpan.end();

    expect(producerTraceparent.traceparent).toMatch(TRACEPARENT_RE);
    const [, spanId] = extractTraceAndSpanId(producerTraceparent.traceparent!);
    // The exposed span id is the PRODUCER's own, distinct from the original
    // request span (AC4 — a link to the producer, not the request).
    expect(spanId).not.toBe(requestSpan.spanContext().spanId);
  });
});

function extractTraceAndSpanId(traceparent: string): [string, string] {
  const parts = traceparent.split('-');
  return [parts[1], parts[2]];
}
