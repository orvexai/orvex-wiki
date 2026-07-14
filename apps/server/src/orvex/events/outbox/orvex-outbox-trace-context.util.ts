// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Context, context, propagation } from '@opentelemetry/api';

import { getActiveCorrelationId } from '../../obs/orvex-correlation.hook';

/**
 * ENG-1600 AC1/AC2 — the trace-context carrier persisted on the outbox row
 * and later restored by the relay. Field names deliberately mirror the
 * CloudEvents Distributed-Tracing extension attribute names verbatim
 * (`traceparent`/`tracestate`) so the values captured here need no
 * reshaping when they eventually land on the CloudEvent envelope (AC3 —
 * the envelope-shaping/catalog leg itself is the separate cross-repo
 * `orvex-studio-contracts` `wiki.*` catalog amendment, ENG-1365, out of
 * this repo's scope).
 */
export interface OrvexOutboxTraceContext {
  traceparent: string | null;
  tracestate: string | null;
  correlationId: string | null;
}

interface W3CCarrier {
  traceparent?: string;
  tracestate?: string;
}

/**
 * captureOutboxTraceContext — AC1. Reads the CURRENTLY ACTIVE OTel context
 * (the engine HTTP request's span, when tracing is on) via the globally
 * registered propagator (`W3CTraceContextPropagator`, wired by
 * `initOrvexTracing` — ENG-1599) and the FR-C18 correlation id threaded by
 * `orvex-correlation.hook.ts`.
 *
 * VANILLA-SAFE (mirrors AC5 of ENG-1599): when tracing is OFF, `propagation`
 * resolves to the OTel API's own no-op propagator, `inject` never populates
 * the carrier, and this returns all-null — the outbox write path never
 * fails or fabricates a trace id. Call this INSIDE the same transaction as
 * the domain mutation (the caller's `trx`), at `OutboxWriter.enqueue` time,
 * so the captured context is the request's own — never a later, unrelated
 * one (❌#9 — no derived/fabricated value).
 */
export function captureOutboxTraceContext(): OrvexOutboxTraceContext {
  const carrier: W3CCarrier = {};
  propagation.inject(context.active(), carrier);

  return {
    traceparent: carrier.traceparent ?? null,
    tracestate: carrier.tracestate ?? null,
    correlationId: getActiveCorrelationId(),
  };
}

/**
 * restoreOutboxTraceContext — AC2 (relay side, first half). Extracts a
 * remote span context from the persisted `traceparent`/`tracestate` back
 * into an OTel `Context`, so the relay can start its producer span as a
 * child of the ORIGINAL request trace (restored, not propagated in-process
 * — the whole point of persisting it, per the ticket's "hard part").
 *
 * A row with no persisted `traceparent` (tracing was off at write time, or
 * a pre-ENG-1600 row) round-trips to the ambient root context unchanged —
 * `propagation.extract` is a documented no-op for an empty carrier, so the
 * relay's own span simply starts as a new root trace instead of throwing.
 */
export function restoreOutboxTraceContext(
  row: Pick<OrvexOutboxTraceContext, 'traceparent' | 'tracestate'>,
): Context {
  const carrier: W3CCarrier = {
    traceparent: row.traceparent ?? undefined,
    tracestate: row.tracestate ?? undefined,
  };
  return propagation.extract(context.active(), carrier);
}

/**
 * injectOutboxTraceContext — AC2 (relay side, second half) / AC4. Once the
 * relay has started its own PRODUCER span (as a child of the restored
 * context), this captures THAT span's own context as a fresh
 * `traceparent`/`tracestate` pair to stamp onto the outgoing CloudEvent —
 * so a consumer links to the producer span specifically (AC4: "a span
 * link... to the producer"), not to the original, several-hops-removed
 * HTTP request span.
 */
export function injectOutboxTraceContext(ctx: Context): {
  traceparent: string | null;
  tracestate: string | null;
} {
  const carrier: W3CCarrier = {};
  propagation.inject(ctx, carrier);
  return {
    traceparent: carrier.traceparent ?? null,
    tracestate: carrier.tracestate ?? null,
  };
}
