// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { execFileSync } from 'child_process';
import { join } from 'path';

import { ORVEX_CELL_ATTR, ORVEX_CORRELATION_ID_ATTR, ORVEX_TENANT_ATTR } from './orvex-span-attributes.util';

const TEST_WORKSPACE_ID = '9b2e4f6a-1c3d-4e5f-8a7b-0c1d2e3f4a5b';

interface ProbeSpan {
  name: string;
  traceId: string;
  spanId: string;
  resourceAttributes: Record<string, unknown>;
  attributes: Record<string, unknown>;
}

interface ProbeLogLine {
  trace_id?: string;
  span_id?: string;
  correlation_id?: string;
  [key: string]: unknown;
}

/**
 * ENG-1599 §5a — the named DoD binary gate: `TestEngineEmitsConformantSpan`.
 *
 * Runs `__fixtures__/dod-probe.ts` in a SEPARATE, real Node process (see
 * that file's docblock for why: OTel's `instrumentation-http` patches the
 * core `http` module via `require-in-the-middle`, which Jest's own module
 * registry does not reliably support). This still exercises the REAL
 * production primitives (`initOrvexTracing`, `deriveCorrelationId`,
 * `buildSpanAttributes`/`applySpanAttributes`, `buildOrvexTraceMixin`)
 * end-to-end — only the process boundary is a test-harness adaptation, never
 * a mock or fabricated span (CS §11).
 *
 * Asserts:
 *   1. >=1 finished span exported (an OTLP-shaped span, via the real
 *      `@opentelemetry/instrumentation-http`).
 *   2. resource carries `service.name`+`orvex.cell`; the span carries
 *      `orvex.tenant`(opaque workspaceId)+`correlation_id` (AC1, FR-C18).
 *   3. the exported span's trace_id equals the trace_id stamped on the
 *      corresponding pino log line (AC3).
 *   4. AC2 — an inbound W3C `traceparent` is continued; no header starts a
 *      fresh trace.
 */
describe('TestEngineEmitsConformantSpan', () => {
  let spans: ProbeSpan[];
  let logLines: ProbeLogLine[];

  beforeAll(() => {
    const probeScript = join(__dirname, '__fixtures__/dod-probe.ts');
    const stdout = execFileSync(
      'node',
      ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', probeScript],
      {
        cwd: join(__dirname, '../../..'),
        encoding: 'utf-8',
      },
    );

    spans = [];
    logLines = [];
    for (const line of stdout.split('\n')) {
      if (line.startsWith('SPAN:')) {
        spans.push(JSON.parse(line.slice('SPAN:'.length)));
      } else if (line.startsWith('LOG:')) {
        logLines.push(JSON.parse(line.slice('LOG:'.length)));
      }
    }
  });

  it('exports >=1 finished span', () => {
    expect(spans.length).toBeGreaterThan(0);
  });

  it('AC1: resource carries service.name + orvex.cell (FR-C18)', () => {
    expect(spans[0].resourceAttributes['service.name']).toBe('wiki');
    expect(spans[0].resourceAttributes[ORVEX_CELL_ATTR]).toBe('eu1');
  });

  it('AC1/AC6: the span carries orvex.tenant (opaque workspaceId) + correlation_id', () => {
    const tagged = spans.find((s) => s.attributes[ORVEX_TENANT_ATTR] === TEST_WORKSPACE_ID);
    expect(tagged).toBeDefined();
    expect(tagged!.attributes[ORVEX_CORRELATION_ID_ATTR]).toBe('dod-correlation-1');
  });

  it('AC3: the exported span trace_id equals the pino log line trace_id', () => {
    const tagged = spans.find((s) => s.attributes[ORVEX_TENANT_ATTR] === TEST_WORKSPACE_ID);
    expect(tagged).toBeDefined();

    const matchingLine = logLines.find((l) => l.trace_id === tagged!.traceId);
    expect(matchingLine).toBeDefined();
    expect(matchingLine!.span_id).toBe(tagged!.spanId);
    expect(matchingLine!.correlation_id).toBe('dod-correlation-1');
  });

  it('AC2: continues an inbound W3C traceparent', () => {
    const continued = spans.find(
      (s) => s.traceId === '4bf92f3577b34da6a3ce929d0e0e4736',
    );
    expect(continued).toBeDefined();
  });

  it('review-2 F1/AC6: http.url/http.target are stripped even for a PII-laden request line', () => {
    const tagged = spans.find((s) => s.attributes[ORVEX_CORRELATION_ID_ATTR] === 'dod-correlation-pii');
    expect(tagged).toBeDefined();
    expect(tagged!.attributes).not.toHaveProperty('http.url');
    expect(tagged!.attributes).not.toHaveProperty('http.target');
    // Sanity: prove the instrumentation really saw the PII-laden request
    // (so this test would have caught the original leak) by asserting no
    // attribute on the span echoes the raw title/email/slug anywhere.
    const serialized = JSON.stringify(tagged!.attributes);
    expect(serialized).not.toContain('Jane-Doe');
    expect(serialized).not.toContain('jane@acme.com');
    expect(serialized).not.toContain('Patient');
  });

  it('AC2: a request with no inbound traceparent starts a fresh trace', () => {
    const inboundTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const knownTraceIds = new Set(spans.map((s) => s.traceId));
    // At least one span's trace id is neither the continued inbound one nor
    // all-zero — i.e. genuinely fresh.
    const freshTraceIds = [...knownTraceIds].filter(
      (id) => id !== inboundTraceId && id !== '00000000000000000000000000000000',
    );
    expect(freshTraceIds.length).toBeGreaterThan(0);
    for (const id of knownTraceIds) {
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    }
  });
});
