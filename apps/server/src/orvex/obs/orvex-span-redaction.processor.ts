// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-node';

/**
 * ENG-1599 review-2 F1 fix (AC6). Stock `@opentelemetry/instrumentation-http`
 * auto-sets `http.url` + `http.target` on every server span from the raw
 * request line (method/path/query string), independent of and unreachable
 * by this leg's bespoke `denyIfLikelyPii` deny-list (`orvex-mask.util.ts`),
 * which only ever gates the `orvex.tenant`/`correlation_id` attributes this
 * repo builds by hand via `buildSpanAttributes`. A page-title-derived slug
 * (`/api/pages/Q3-Board-Deck-Jane-Doe-salary-review`) or a `?title=...&
 * email=...` query string would otherwise be exported to Tempo verbatim —
 * directly violating AC6 ("no page title/body or user PII appears in span
 * names OR attributes") and NFR-CT2/NFR-CT5.
 *
 * Deny-by-default (same doctrine as `denyIfLikelyPii`: no partial reveal,
 * no allowlist of "safe-looking" URLs — there isn't one): this processor
 * unconditionally strips `http.url`/`http.target` from EVERY span's
 * attribute bag in `onEnd`, before the wrapped delegate (the real
 * `BatchSpanProcessor`) ever observes it, so the redaction cannot be
 * bypassed by request shape and never depends on a regex heuristic over
 * free-form URL content. `http.method`, `http.route` (Fastify's route
 * TEMPLATE, e.g. `/api/pages/:id` — never the raw path), `http.status_code`,
 * and every other attribute are left untouched.
 */
const REDACTED_HTTP_SPAN_ATTRS = ['http.url', 'http.target'] as const;

export class OrvexPiiRedactingSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes as Record<string, unknown>;
    for (const key of REDACTED_HTTP_SPAN_ATTRS) {
      if (key in attrs) {
        delete attrs[key];
      }
    }
    this.delegate.onEnd(span);
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }
}
