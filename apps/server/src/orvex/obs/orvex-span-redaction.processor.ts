// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-node';

import { redactSensitiveUrl } from '../../common/helpers/utils';

/**
 * ENG-1599 review-2 F1 fix (AC6), hardened again by review-3 F1. Stock
 * `@opentelemetry/instrumentation-http` auto-sets URL-shaped attributes on
 * every server span from the raw request line (method/path/query string),
 * independent of and unreachable by this leg's bespoke `denyIfLikelyPii`
 * deny-list (`orvex-mask.util.ts`), which only ever gates the
 * `orvex.tenant`/`correlation_id` attributes this repo builds by hand via
 * `buildSpanAttributes`. A page-title-derived slug
 * (`/api/pages/Q3-Board-Deck-Jane-Doe-salary-review`) or a `?title=...&
 * email=...` query string would otherwise be exported to Tempo verbatim —
 * directly violating AC6 ("no page title/body or user PII appears in span
 * names OR attributes") and NFR-CT2/NFR-CT5.
 *
 * review-2 F1 only stripped the OLD semconv keys `http.url`/`http.target`.
 * review-3 F1 (CONFIRMED, empirically reproduced): the SAME instrumentation
 * (`@opentelemetry/instrumentation-http@0.220.0`) emits the STABLE semconv
 * keys `url.path`/`url.query` instead (plus, on the client/outgoing side,
 * `url.full`) whenever `OTEL_SEMCONV_STABILITY_OPT_IN` is set to `http` or
 * `http/dup` — a documented, commonly-set migration flag this deploy does
 * not set today but which is the OTel-announced future default. That
 * bypassed the 2-key strip with zero code change and no failing test.
 *
 * Deny-by-default (same doctrine as `denyIfLikelyPii`: no partial reveal,
 * no allowlist of "safe-looking" URLs — there isn't one): this processor
 * unconditionally strips EVERY key in `REDACTED_HTTP_SPAN_ATTRS` — both old
 * (`http.url`, `http.target`) and stable (`url.full`, `url.path`,
 * `url.query`) semconv generations — from EVERY span's attribute bag in
 * `onEnd`, before the wrapped delegate (the real `BatchSpanProcessor`) ever
 * observes it, so the redaction cannot be bypassed by request shape or by
 * which semconv generation the instrumentation happens to be emitting.
 *
 * A string value is first run through the existing `redactSensitiveUrl`
 * helper (the same one `pino.config.ts` already uses for request-log
 * redaction): for a handful of known-static, non-PII-bearing routes (today
 * just `/api/sso/*`) that helper strips only the query string, and a
 * genuinely-redacted result (one that differs from the input) is MORE
 * USEFUL to keep than an outright delete — it preserves "this was an SSO
 * call" telemetry while still removing the token/code query. Any value
 * `redactSensitiveUrl` does NOT change (i.e. every other route, including
 * page endpoints whose PATH itself can carry a title-derived slug) is
 * deleted outright — deny-by-default, since the path segment itself may be
 * the PII and there is no safe generic way to redact just part of it.
 *
 * `http.method`, `http.request.method`, `http.route` (Fastify's route
 * TEMPLATE, e.g. `/api/pages/:id` — never the raw path), `http.status_code`,
 * `http.response.status_code`, and every other attribute are left
 * untouched.
 */
const REDACTED_HTTP_SPAN_ATTRS = [
  'http.url',
  'http.target',
  'url.full',
  'url.path',
  'url.query',
] as const;

export class OrvexPiiRedactingSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes as Record<string, unknown>;
    for (const key of REDACTED_HTTP_SPAN_ATTRS) {
      if (!(key in attrs)) {
        continue;
      }
      const value = attrs[key];
      if (typeof value === 'string') {
        const redacted = redactSensitiveUrl(value);
        if (redacted !== value) {
          attrs[key] = redacted;
          continue;
        }
      }
      delete attrs[key];
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
