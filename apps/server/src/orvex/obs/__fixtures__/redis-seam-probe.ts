// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * Test-only fixture (ENG-1599 §5b Redis seam coverage, AC1). Run as a
 * separate, REAL Node process (spawned by
 * `orvex-tracing.redis-seam.integration.spec.ts`) rather than in-process
 * under Jest: OTel's Node auto-instrumentation patches modules via
 * `require-in-the-middle` hooking `Module._load`, which Jest's own module
 * registry does not reliably support — a well-known limitation, not a defect
 * in `initOrvexTracing`. A genuine child process is the only way to observe
 * the REAL `IORedisInstrumentation` patch a REAL `ioredis` client (CS §11
 * honesty — no fabricated span, no mocked instrumentation).
 *
 * Prints one JSON line per exported span to stdout; the parent test parses
 * these lines and asserts the parent/child relationship.
 */
import { context, trace } from '@opentelemetry/api';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ExportResultCode } from '@opentelemetry/core';

import { initOrvexTracing } from '../orvex-tracing.bootstrap';

class StdoutSpanExporter implements SpanExporter {
  export(
    spans: ReadableSpan[],
    resultCallback: (result: { code: ExportResultCode }) => void,
  ): void {
    for (const span of spans) {
      process.stdout.write(
        `${JSON.stringify({
          name: span.name,
          spanId: span.spanContext().spanId,
          parentSpanId: span.parentSpanContext?.spanId ?? null,
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
  const host = process.env.PROBE_REDIS_HOST;
  const port = Number(process.env.PROBE_REDIS_PORT);
  if (!host || !port) {
    throw new Error('PROBE_REDIS_HOST/PROBE_REDIS_PORT must be set');
  }

  const handle = initOrvexTracing(
    {
      ORVEX_MODULES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://fake-collector:4318',
    },
    { exporter: new StdoutSpanExporter() },
  );

  // Required AFTER initOrvexTracing so require-in-the-middle observes the
  // first (and only) require of 'ioredis' in this fresh process.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require('ioredis');
  const client = new Redis({ host, port, lazyConnect: false });

  const tracer = trace.getTracer('redis-seam-probe');
  const serverSpan = tracer.startSpan('server-span');
  const ctxWithServerSpan = trace.setSpan(context.active(), serverSpan);

  await context.with(ctxWithServerSpan, async () => {
    await client.set('orvex-eng-1599-probe-key', 'orvex-eng-1599-probe-value');
    await client.get('orvex-eng-1599-probe-key');
  });

  serverSpan.end();
  await client.quit();
  await handle?.shutdown();
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exitCode = 1;
});
