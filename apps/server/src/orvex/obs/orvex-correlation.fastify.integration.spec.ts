// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import Fastify from 'fastify';
import pino from 'pino';
import { context, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';

import { getActiveCorrelationId, registerOrvexCorrelationHook } from './orvex-correlation.hook';
import { buildOrvexTraceMixin } from '../../common/logger/pino.config';

/**
 * ENG-1599 review-3 F2 (AC3) — closes the gap flagged as PLAUSIBLE-not-proven:
 * `orvex-correlation.hook.spec.ts` only asserted `getActiveCorrelationId()`
 * SYNCHRONOUSLY inside the hook's own `done()` callback, which does not
 * exercise Fastify's OWN lifecycle dispatch (onRequest -> ... ->
 * preValidation -> handler) at all — it proves the primitive
 * (`context.with`/`ORVEX_CORRELATION_CONTEXT_KEY`) works, not that
 * production Fastify wiring carries it into a route HANDLER, where almost
 * all request-scoped log lines actually originate.
 *
 * This spec drives a REAL `fastify()` instance (not a hand-rolled fake
 * `{ addHook }`), registers `registerOrvexCorrelationHook` exactly as
 * `OrvexTracingModule.onModuleInit` does, and asserts from INSIDE a real
 * route handler — reached only via Fastify's own internal continuation,
 * never by test code manually re-entering `context.with()` — that both
 * `getActiveCorrelationId()` and a pino log line emitted from the handler
 * carry the correlation id. Uses the SAME `AsyncHooksContextManager` the
 * production bootstrap registers (`orvex-tracing.bootstrap.ts`), not the
 * newer/more-robust `AsyncLocalStorageContextManager`, so this proves (or
 * would have disproven) propagation under the ACTUAL production context
 * manager, not a more forgiving substitute.
 *
 * A leading `onRequest` hook stands in for what
 * `@opentelemetry/instrumentation-http` does in production (activate a
 * server span's context for the causal chain of the whole request) so the
 * correlation hook's `context.with` nests inside an already-active span,
 * exactly like production — `getActiveSpan()`-dependent code
 * (`buildOrvexTraceMixin`) would otherwise see no span and short-circuit.
 */
describe('orvex-correlation.hook — real Fastify lifecycle propagation (review-3 F2/AC3)', () => {
  let provider: NodeTracerProvider;
  let exporter: InMemorySpanExporter;
  let contextManager: AsyncHooksContextManager;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    contextManager = new AsyncHooksContextManager();
    contextManager.enable();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register({ contextManager });
  });

  afterEach(async () => {
    context.disable();
    trace.disable();
    await provider.shutdown();
  });

  it('carries correlation_id from the onRequest hook into a real route HANDLER (not just done())', async () => {
    const app = Fastify();
    const tracer = trace.getTracer('correlation-fastify-integration-spec');

    // Stand-in for HttpInstrumentation: activates a server span's context
    // for the whole request BEFORE the correlation hook runs, exactly as
    // in production ordering.
    app.addHook('onRequest', (_request, _reply, done) => {
      const span = tracer.startSpan('server-span');
      const ctx = trace.setSpan(context.active(), span);
      context.with(ctx, () => done());
    });

    registerOrvexCorrelationHook(app);

    let handlerCorrelationId: string | null | undefined;
    let handlerLogFields: Record<string, unknown> | undefined;
    app.get('/probe', async () => {
      handlerCorrelationId = getActiveCorrelationId();
      handlerLogFields = buildOrvexTraceMixin();
      return 'ok';
    });

    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-correlation-id': 'fastify-handler-corr-1' },
    });

    expect(response.statusCode).toBe(200);
    // The actual F2 assertion: reached the handler purely via Fastify's own
    // dispatch, and the correlation id set two lifecycle phases earlier is
    // still on the active context.
    expect(handlerCorrelationId).toBe('fastify-handler-corr-1');
    expect(handlerLogFields?.correlation_id).toBe('fastify-handler-corr-1');
    expect(typeof handlerLogFields?.trace_id).toBe('string');

    await app.close();
  });

  it('a pino log line emitted from inside the handler carries correlation_id end-to-end', async () => {
    const app = Fastify();
    const tracer = trace.getTracer('correlation-fastify-integration-spec');

    app.addHook('onRequest', (_request, _reply, done) => {
      const span = tracer.startSpan('server-span');
      const ctx = trace.setSpan(context.active(), span);
      context.with(ctx, () => done());
    });

    registerOrvexCorrelationHook(app);

    const loggedLines: Array<Record<string, unknown>> = [];
    const logger = pino(
      { mixin: buildOrvexTraceMixin },
      { write: (line: string) => loggedLines.push(JSON.parse(line)) },
    );

    app.get('/probe', async () => {
      logger.info('handled real fastify route');
      return 'ok';
    });

    await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { 'x-correlation-id': 'fastify-handler-corr-2' },
    });

    expect(loggedLines).toHaveLength(1);
    expect(loggedLines[0].correlation_id).toBe('fastify-handler-corr-2');
    expect(loggedLines[0].msg).toBe('handled real fastify route');

    await app.close();
  });
});
