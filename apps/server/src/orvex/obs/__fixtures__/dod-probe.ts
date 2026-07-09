// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * Test-only fixture (ENG-1599 §5a — `TestEngineEmitsConformantSpan`). Run as
 * a separate, REAL Node process (spawned by `orvex-tracing.spec.ts`) rather
 * than in-process under Jest, for the SAME reason as
 * `redis-seam-probe.ts`: OTel's `@opentelemetry/instrumentation-http`
 * patches the core `http` module via `require-in-the-middle`, which does
 * not reliably observe modules already loaded through Jest's own module
 * registry — a documented environment limitation, not a defect in
 * `initOrvexTracing`.
 *
 * Uses a plain Node `http.createServer` (not Fastify/Nest) as the HTTP
 * ingress under test: this leg's ACs (AC1/AC2/AC3) are about OTel span/
 * attribute/log correctness on the ingress seam, which
 * `@opentelemetry/instrumentation-http` provides at the `http` module level
 * regardless of the framework built on top of it. The REAL production
 * primitives are exercised unmodified: `initOrvexTracing`,
 * `deriveCorrelationId`, `applySpanAttributes`/`buildSpanAttributes`, and
 * `buildOrvexTraceMixin`. The Fastify-specific wiring
 * (`orvex-correlation.hook.ts`'s `onRequest` hook,
 * `orvex-tracing.module.ts`) is covered separately by
 * `orvex-correlation.hook.spec.ts` (in-process; it does not depend on
 * auto-instrumentation patching).
 *
 * Drives three requests and prints one tagged JSON line per event to
 * stdout: `SPAN:<...>` per exported span, `LOG:<...>` per pino log line.
 */
import { context, trace } from '@opentelemetry/api';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ExportResultCode } from '@opentelemetry/core';
import { Writable } from 'stream';

import { initOrvexTracing } from '../orvex-tracing.bootstrap';
import { deriveCorrelationId, ORVEX_CORRELATION_CONTEXT_KEY } from '../orvex-correlation.hook';
import { applySpanAttributes, buildSpanAttributes } from '../orvex-span-attributes.util';
import { buildOrvexTraceMixin } from '../../../common/logger/pino.config';

const TEST_WORKSPACE_ID = '9b2e4f6a-1c3d-4e5f-8a7b-0c1d2e3f4a5b';

class StdoutSpanExporter implements SpanExporter {
  export(
    spans: ReadableSpan[],
    resultCallback: (result: { code: ExportResultCode }) => void,
  ): void {
    for (const span of spans) {
      process.stdout.write(
        `SPAN:${JSON.stringify({
          name: span.name,
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          resourceAttributes: span.resource.attributes,
          attributes: span.attributes,
        })}\n`,
      );
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

async function main(): Promise<void> {
  const handle = initOrvexTracing(
    {
      ORVEX_MODULES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://fake-collector:4318',
      CELL_ID: 'eu1',
    },
    { exporter: new StdoutSpanExporter() },
  );

  // Required AFTER initOrvexTracing so require-in-the-middle observes the
  // first require of 'http'/'pino' in this fresh process.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = require('http');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require('pino');

  const logStream = new Writable({
    write(chunk, _enc, cb) {
      process.stdout.write(`LOG:${chunk.toString()}`);
      cb();
    },
  });
  const logger = pino({ mixin: buildOrvexTraceMixin }, logStream);

  const server = http.createServer(
    (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
      const correlationId = deriveCorrelationId(
        req.headers as Record<string, string | string[] | undefined>,
      );
      const span = trace.getActiveSpan();
      applySpanAttributes(
        span,
        buildSpanAttributes({ workspaceId: TEST_WORKSPACE_ID, correlationId }),
      );
      const ctx = context.active().setValue(ORVEX_CORRELATION_CONTEXT_KEY, correlationId);
      context.with(ctx, () => {
        logger.info('handled probe request');
        res.end('ok');
      });
    },
  );

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  // A raw `net` socket, NOT `http.get`/`http.request` — the CLIENT side of
  // `@opentelemetry/instrumentation-http` is ALSO patched (by design), and
  // would `propagation.inject()` its OWN fresh `traceparent` into an
  // instrumented outgoing request, clobbering the header this probe sets
  // deliberately to test SERVER-side ingress-continue (AC2). A raw socket
  // request is invisible to that patch, so the header this test sends is
  // the exact header the server sees.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const net = require('net');
  function get(path: string, headers: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        const headerLines = Object.entries(headers)
          .map(([k, v]) => `${k}: ${v}\r\n`)
          .join('');
        socket.write(
          `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n${headerLines}\r\n`,
        );
      });
      socket.on('data', () => {});
      socket.on('end', resolve);
      socket.on('error', reject);
    });
  }

  // (1) main scenario — drives AC1/AC3.
  await get('/probe', { 'x-correlation-id': 'dod-correlation-1' });
  // (2) AC2 — continues an inbound W3C traceparent.
  await get('/probe', {
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  });
  // (3) AC2 — no inbound traceparent => fresh trace.
  await get('/probe', {});
  // (4) review-2 F1/AC6 — a real PII-laden request line (page-title-derived
  // slug in the path + title/email in the query string) through the REAL
  // HttpInstrumentation, tagged via x-correlation-id so the spec can find
  // the exported span without relying on the (now-redacted) http.url.
  await get(
    '/api/pages/Q3-Board-Deck-Jane-Doe-salary-review?title=Patient%20diagnosis%20John%20Smith&email=jane@acme.com',
    { 'x-correlation-id': 'dod-correlation-pii' },
  );

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await handle?.shutdown();
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exitCode = 1;
});
