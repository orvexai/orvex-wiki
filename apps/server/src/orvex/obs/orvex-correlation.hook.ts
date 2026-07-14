// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { randomUUID } from 'crypto';

import { context, createContextKey, trace } from '@opentelemetry/api';

import { applySpanAttributes, buildSpanAttributes } from './orvex-span-attributes.util';

const CORRELATION_HEADER_CANDIDATES = ['x-correlation-id', 'x-request-id'];

/**
 * OTel Context key carrying the active request's correlation id. A `Span`'s
 * public API is write-only (you cannot read back an attribute you set via
 * `setAttributes`), so the pino mixin (T4/AC3) reads the correlation id back
 * through the active OTel `Context` instead — exactly like `trace_id`/
 * `span_id`, which come from `span.spanContext()`.
 */
export const ORVEX_CORRELATION_CONTEXT_KEY = createContextKey('orvex.correlation_id');

/** Minimal shape this module needs from a Fastify request — no framework-wide dependency. */
export interface OrvexCorrelationHeaders {
  [key: string]: string | string[] | undefined;
}

/**
 * Derive the correlation id for a request: reuse an inbound
 * `x-correlation-id`/`x-request-id` header when present and non-blank,
 * otherwise mint a fresh one. NEVER fabricated silently as anything but a
 * real random id (❌#9 — no wall-clock/derived value).
 */
export function deriveCorrelationId(headers: OrvexCorrelationHeaders | undefined): string {
  if (headers) {
    for (const name of CORRELATION_HEADER_CANDIDATES) {
      const raw = headers[name];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return randomUUID();
}

/** Read the correlation id threaded onto the active OTel context, if any. */
export function getActiveCorrelationId(): string | null {
  const value = context.active().getValue(ORVEX_CORRELATION_CONTEXT_KEY);
  return typeof value === 'string' ? value : null;
}

/** Minimal Fastify request/reply/done shape this hook needs (no `fastify` type import — keeps the file framework-edge-thin, CS §4c). */
export interface OrvexFastifyRequestLike {
  headers: OrvexCorrelationHeaders;
}
export interface OrvexFastifyInstanceLike {
  addHook(
    name: 'onRequest',
    handler: (
      request: OrvexFastifyRequestLike,
      reply: unknown,
      done: (err?: Error) => void,
    ) => void,
  ): unknown;
}

/**
 * Fastify `onRequest` hook (thin adapter, CS §4c — no store access, no domain
 * logic): derives `correlation_id` for the request, stamps it as an FR-C18
 * span attribute on the active server span (AC1), and threads it through the
 * active OTel context for the rest of the request lifecycle (AC3) via
 * `context.with` — Node's `AsyncHooksContextManager` propagates that context
 * through every async continuation spawned from inside `done()`, the same
 * mechanism the HTTP/Fastify instrumentations use to propagate the span
 * itself.
 *
 * review-3 F2 (AC3): the ONLY prior coverage of this asserted
 * `getActiveCorrelationId()` synchronously inside `done()` itself, which
 * does not exercise Fastify's OWN lifecycle dispatch into a later phase
 * (preValidation/handler — where request-scoped log lines actually
 * originate). `orvex-correlation.fastify.integration.spec.ts` closes that
 * gap with a REAL `fastify()` instance + the production
 * `AsyncHooksContextManager`, asserting from inside an actual route
 * HANDLER (reached only via Fastify's own dispatch) that both
 * `getActiveCorrelationId()` and a real pino log line carry the
 * correlation id. Empirically: it does propagate correctly — no code
 * change was needed here, only the missing proof.
 */
export function registerOrvexCorrelationHook(instance: OrvexFastifyInstanceLike): void {
  instance.addHook('onRequest', (request, _reply, done) => {
    const correlationId = deriveCorrelationId(request.headers);

    const span = trace.getActiveSpan();
    applySpanAttributes(span, buildSpanAttributes({ correlationId }));

    const ctx = context.active().setValue(ORVEX_CORRELATION_CONTEXT_KEY, correlationId);
    context.with(ctx, () => done());
  });
}
