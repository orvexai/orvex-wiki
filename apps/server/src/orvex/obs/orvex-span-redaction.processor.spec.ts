// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-node';
import type { Context } from '@opentelemetry/api';

import { OrvexPiiRedactingSpanProcessor } from './orvex-span-redaction.processor';

/**
 * ENG-1599 review-2 F1 fix (AC6), hardened by review-3 F1: stock
 * `HttpInstrumentation` auto-sets `http.url` + `http.target` (old semconv)
 * OR `url.full` + `url.path` + `url.query` (stable semconv, emitted when
 * `OTEL_SEMCONV_STABILITY_OPT_IN=http`/`http/dup`) on the server span from
 * the raw request line — these NEVER pass through `denyIfLikelyPii` (that
 * helper only guards the bespoke `orvex.tenant`/`correlation_id`
 * attributes). A page-title-derived slug, a `?title=...` query param, or a
 * user email land verbatim in the exported span otherwise, REGARDLESS of
 * which semconv generation is active.
 *
 * `OrvexPiiRedactingSpanProcessor` wraps a delegate `SpanProcessor` and
 * strips ALL FIVE keys from every span's attribute bag in `onEnd` — BEFORE
 * the delegate (the real `BatchSpanProcessor`) ever sees it, so the
 * redaction is unconditional and cannot be bypassed by request shape or by
 * semconv generation. `http.method`/`http.route`/`http.status_code` etc.
 * are untouched.
 */
describe('OrvexPiiRedactingSpanProcessor', () => {
  function fakeSpan(attributes: Record<string, unknown>): ReadableSpan {
    return { attributes } as unknown as ReadableSpan;
  }

  function fakeDelegate() {
    const ended: ReadableSpan[] = [];
    const started: Array<{ span: Span; ctx: Context }> = [];
    const delegate: SpanProcessor = {
      onStart: (span, ctx) => {
        started.push({ span, ctx });
      },
      onEnd: (span) => {
        ended.push(span);
      },
      shutdown: () => Promise.resolve(),
      forceFlush: () => Promise.resolve(),
    };
    return { delegate, ended, started };
  }

  it('strips http.url and http.target before the delegate sees the span (F1/AC6)', () => {
    const { delegate, ended } = fakeDelegate();
    const processor = new OrvexPiiRedactingSpanProcessor(delegate);

    const span = fakeSpan({
      'http.method': 'GET',
      'http.url':
        'http://127.0.0.1:1/api/pages/Q3-Board-Deck-Jane-Doe-salary-review?title=Patient%20diagnosis%20John%20Smith&email=jane@acme.com',
      'http.target':
        '/api/pages/Q3-Board-Deck-Jane-Doe-salary-review?title=Patient%20diagnosis%20John%20Smith&email=jane@acme.com',
      'http.status_code': 200,
    });

    processor.onEnd(span);

    expect(ended).toHaveLength(1);
    expect(ended[0].attributes).not.toHaveProperty('http.url');
    expect(ended[0].attributes).not.toHaveProperty('http.target');
    // Non-PII attributes survive untouched.
    expect(ended[0].attributes['http.method']).toBe('GET');
    expect(ended[0].attributes['http.status_code']).toBe(200);
  });

  it('strips url.full/url.path/url.query (stable semconv) alongside http.url/http.target (review-3 F1)', () => {
    const { delegate, ended } = fakeDelegate();
    const processor = new OrvexPiiRedactingSpanProcessor(delegate);

    // What @opentelemetry/instrumentation-http@0.220.0 emits for this exact
    // PII-laden request line under OTEL_SEMCONV_STABILITY_OPT_IN=http/dup:
    // old AND stable keys both present on the same span.
    const span = fakeSpan({
      'http.method': 'GET',
      'http.route': '/api/pages/:id',
      'http.url':
        'http://127.0.0.1:1/api/pages/Q3-Board-Deck-Jane-Doe-salary-review?title=Patient%20diagnosis%20John%20Smith&email=jane@acme.com',
      'http.target':
        '/api/pages/Q3-Board-Deck-Jane-Doe-salary-review?title=Patient%20diagnosis%20John%20Smith&email=jane@acme.com',
      'url.full':
        'http://127.0.0.1:1/api/pages/Q3-Board-Deck-Jane-Doe-salary-review?title=Patient%20diagnosis%20John%20Smith&email=jane@acme.com',
      'url.path': '/api/pages/Q3-Board-Deck-Jane-Doe-salary-review',
      'url.query': 'title=Patient%20diagnosis%20John%20Smith&email=jane@acme.com',
      'http.status_code': 200,
    });

    processor.onEnd(span);

    const attrs = ended[0].attributes;
    for (const key of ['http.url', 'http.target', 'url.full', 'url.path', 'url.query']) {
      expect(attrs).not.toHaveProperty(key);
    }
    const serialized = JSON.stringify(attrs);
    expect(serialized).not.toContain('Jane-Doe');
    expect(serialized).not.toContain('jane@acme.com');
    expect(serialized).not.toContain('Patient');
    // Non-PII attributes survive untouched.
    expect(attrs['http.method']).toBe('GET');
    expect(attrs['http.route']).toBe('/api/pages/:id');
    expect(attrs['http.status_code']).toBe(200);
  });

  it('keeps a query-stripped (not deleted) value for the known-safe SSO route, via redactSensitiveUrl reuse', () => {
    const { delegate, ended } = fakeDelegate();
    const processor = new OrvexPiiRedactingSpanProcessor(delegate);

    const span = fakeSpan({
      'http.url': 'http://127.0.0.1:1/api/sso/callback?code=abc123&state=xyz',
      'url.full': 'http://127.0.0.1:1/api/sso/callback?code=abc123&state=xyz',
    });

    processor.onEnd(span);

    const attrs = ended[0].attributes;
    // Redacted (query stripped) rather than deleted — more useful than
    // nothing, and the SSO path itself carries no PII.
    expect(attrs['http.url']).toBe('http://127.0.0.1:1/api/sso/callback');
    expect(attrs['url.full']).toBe('http://127.0.0.1:1/api/sso/callback');
    expect(JSON.stringify(attrs)).not.toContain('abc123');
    expect(JSON.stringify(attrs)).not.toContain('xyz');
  });

  it('is a no-op when the span carries neither attribute', () => {
    const { delegate, ended } = fakeDelegate();
    const processor = new OrvexPiiRedactingSpanProcessor(delegate);

    const span = fakeSpan({ 'http.method': 'GET' });
    processor.onEnd(span);

    expect(ended[0].attributes).toEqual({ 'http.method': 'GET' });
  });

  it('forwards onStart, shutdown, and forceFlush to the delegate unchanged', async () => {
    const { delegate, started } = fakeDelegate();
    const processor = new OrvexPiiRedactingSpanProcessor(delegate);
    const shutdownSpy = jest.spyOn(delegate, 'shutdown');
    const flushSpy = jest.spyOn(delegate, 'forceFlush');

    const span = {} as Span;
    const ctx = {} as Context;
    processor.onStart(span, ctx);
    expect(started).toEqual([{ span, ctx }]);

    await processor.shutdown();
    expect(shutdownSpy).toHaveBeenCalledTimes(1);

    await processor.forceFlush();
    expect(flushSpy).toHaveBeenCalledTimes(1);
  });
});
