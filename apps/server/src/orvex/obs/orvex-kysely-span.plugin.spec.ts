// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { context, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import type { RootOperationNode } from 'kysely';

import { OrvexKyselySpanPlugin } from './orvex-kysely-span.plugin';

/**
 * ENG-1599 T5/AC1 — unit (real OTel SDK + `InMemorySpanExporter`, no mock of
 * an owned package, CS §5/❌#4). Asserts the plugin opens a span in
 * `transformQuery` that becomes a CHILD of the active (server) span, and
 * closes it in `transformResult` keyed by the same `queryId`.
 */
describe('OrvexKyselySpanPlugin', () => {
  it('opens a child span under the active span and ends it on transformResult', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register();

    try {
      const tracer = trace.getTracer('kysely-span-plugin-spec');
      const serverSpan = tracer.startSpan('server-span');
      const ctxWithServerSpan = trace.setSpan(context.active(), serverSpan);

      const plugin = new OrvexKyselySpanPlugin(tracer);
      const queryId = { queryId: 'q-1' };
      const node = { kind: 'SelectQueryNode' } as unknown as RootOperationNode;

      await context.with(ctxWithServerSpan, async () => {
        const returnedNode = plugin.transformQuery({ queryId, node });
        expect(returnedNode).toBe(node);

        await plugin.transformResult({
          queryId,
          result: { rows: [] },
        });
      });

      serverSpan.end();
      await provider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const dbSpan = spans.find((s) => s.name === 'postgres.SelectQueryNode');
      const server = spans.find((s) => s.name === 'server-span');

      expect(dbSpan).toBeDefined();
      expect(server).toBeDefined();
      expect(dbSpan!.parentSpanContext?.spanId).toBe(server!.spanContext().spanId);
      expect(dbSpan!.attributes['db.system']).toBe('postgresql');
    } finally {
      await provider.shutdown();
      trace.disable();
    }
  });

  it('never mutates the query node (no query logic added)', () => {
    const plugin = new OrvexKyselySpanPlugin(trace.getTracer('kysely-span-plugin-spec-2'));
    const node = { kind: 'InsertQueryNode' } as unknown as RootOperationNode;
    const returned = plugin.transformQuery({ queryId: { queryId: 'q-2' }, node });
    expect(returned).toBe(node);
  });
});
