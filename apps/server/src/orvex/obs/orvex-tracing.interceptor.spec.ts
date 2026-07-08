// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { of } from 'rxjs';

import { ORVEX_TENANT_ATTR } from './orvex-span-attributes.util';
import { OrvexTracingInterceptor } from './orvex-tracing.interceptor';

/**
 * Real ExecutionContext double — only implements the one method the
 * interceptor calls (`switchToHttp().getRequest()`), never a mock of an
 * owned OTel/Nest type (CS §5/❌#4). Asserts against a REAL span recorded by
 * a REAL InMemorySpanExporter, driving the interceptor exactly as Nest would
 * (request -> intercept -> next.handle()).
 */
function fakeExecutionContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

const noopCallHandler: CallHandler = { handle: () => of('handled') };

describe('OrvexTracingInterceptor', () => {
  let provider: NodeTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();
  });

  afterEach(async () => {
    exporter.reset();
    await provider.shutdown();
    trace.disable();
    context.disable();
  });

  function runWithActiveSpan(request: unknown) {
    const tracer = trace.getTracer('orvex-tracing.interceptor.spec');
    const span = tracer.startSpan('server-span');
    const ctxWithSpan = trace.setSpan(context.active(), span);

    let result: unknown;
    context.with(ctxWithSpan, () => {
      result = new OrvexTracingInterceptor().intercept(
        fakeExecutionContext(request),
        noopCallHandler,
      );
    });
    span.end();
    return result;
  }

  it('stamps orvex.tenant from request.raw.workspaceId (Fastify raw path, AC1)', () => {
    runWithActiveSpan({ raw: { workspaceId: 'ws-raw-1' } });

    const [recorded] = exporter.getFinishedSpans();
    expect(recorded.attributes[ORVEX_TENANT_ATTR]).toBe('ws-raw-1');
  });

  it('falls back to request.workspaceId when request.raw is absent', () => {
    runWithActiveSpan({ workspaceId: 'ws-flat-1' });

    const [recorded] = exporter.getFinishedSpans();
    expect(recorded.attributes[ORVEX_TENANT_ATTR]).toBe('ws-flat-1');
  });

  it('prefers request.raw.workspaceId over request.workspaceId when both are present', () => {
    runWithActiveSpan({ raw: { workspaceId: 'ws-raw-wins' }, workspaceId: 'ws-flat-loses' });

    const [recorded] = exporter.getFinishedSpans();
    expect(recorded.attributes[ORVEX_TENANT_ATTR]).toBe('ws-raw-wins');
  });

  it('does not stamp orvex.tenant when no workspaceId is resolvable anywhere on the request', () => {
    runWithActiveSpan({});

    const [recorded] = exporter.getFinishedSpans();
    expect(recorded.attributes[ORVEX_TENANT_ATTR]).toBeUndefined();
  });

  it('is a no-op (never throws) when there is no active span', () => {
    expect(() =>
      new OrvexTracingInterceptor().intercept(
        fakeExecutionContext({ raw: { workspaceId: 'ws-no-span' } }),
        noopCallHandler,
      ),
    ).not.toThrow();
  });

  it('calls next.handle() and passes its observable through unchanged', (done) => {
    const result = runWithActiveSpan({ raw: { workspaceId: 'ws-passthrough' } });
    (result as ReturnType<CallHandler['handle']>).subscribe((value) => {
      expect(value).toBe('handled');
      done();
    });
  });
});
