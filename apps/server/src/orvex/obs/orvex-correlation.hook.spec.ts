// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { context, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';

import {
  deriveCorrelationId,
  getActiveCorrelationId,
  registerOrvexCorrelationHook,
} from './orvex-correlation.hook';

describe('orvex-correlation.hook', () => {
  describe('deriveCorrelationId', () => {
    it('reuses an inbound x-correlation-id header', () => {
      expect(deriveCorrelationId({ 'x-correlation-id': 'inbound-corr-1' })).toBe(
        'inbound-corr-1',
      );
    });

    it('falls back to x-request-id when x-correlation-id is absent', () => {
      expect(deriveCorrelationId({ 'x-request-id': 'inbound-req-1' })).toBe(
        'inbound-req-1',
      );
    });

    it('mints a fresh UUID when neither header is present', () => {
      const a = deriveCorrelationId(undefined);
      const b = deriveCorrelationId({});
      expect(a).toMatch(/^[0-9a-f-]{36}$/);
      expect(b).toMatch(/^[0-9a-f-]{36}$/);
      expect(a).not.toBe(b);
    });

    it('mints a fresh UUID when the inbound header is blank', () => {
      const id = deriveCorrelationId({ 'x-correlation-id': '   ' });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('registerOrvexCorrelationHook', () => {
    it('registers exactly one onRequest hook', () => {
      const addHook = jest.fn();
      registerOrvexCorrelationHook({ addHook });
      expect(addHook).toHaveBeenCalledTimes(1);
      expect(addHook.mock.calls[0][0]).toBe('onRequest');
    });

    it('threads the derived correlation id through the active context for getActiveCorrelationId (AC3)', (done) => {
      const provider = new NodeTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
      });
      provider.register();

      let hookHandler:
        | ((request: { headers: Record<string, string> }, reply: unknown, cb: () => void) => void)
        | undefined;
      registerOrvexCorrelationHook({
        addHook: (_name, handler) => {
          hookHandler = handler;
        },
      });

      const tracer = trace.getTracer('correlation-hook-spec');
      const span = tracer.startSpan('server-span');
      const ctxWithSpan = trace.setSpan(context.active(), span);

      context.with(ctxWithSpan, () => {
        hookHandler!(
          { headers: { 'x-correlation-id': 'hook-corr-42' } },
          {},
          () => {
            try {
              expect(getActiveCorrelationId()).toBe('hook-corr-42');
              span.end();
              void provider.shutdown();
              trace.disable();
              done();
            } catch (err) {
              done(err as Error);
            }
          },
        );
      });
    });

    it('getActiveCorrelationId returns null outside any stamped context', () => {
      expect(getActiveCorrelationId()).toBeNull();
    });
  });
});
