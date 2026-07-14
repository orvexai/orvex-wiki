// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { diag, DiagConsoleLogger, DiagLogLevel, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from '@opentelemetry/sdk-trace-node';
import type { SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
// @opentelemetry/instrumentation-fastify is DEPRECATED upstream (in favour of
// the fastify-authors-maintained `@fastify/otel`) but is what §4b of ENG-1599
// pins for this leg; a follow-up ADR may migrate it (tracked, not scope here).
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';

import { OrvexConfigService } from '../config/orvex-config.service';
import { buildResourceAttributes } from './orvex-span-attributes.util';
import { OrvexPiiRedactingSpanProcessor } from './orvex-span-redaction.processor';

/**
 * resolveOtlpTracesUrl — review-1 F1 fix (FR-CT1). `OTEL_EXPORTER_OTLP_ENDPOINT`
 * is documented (both upstream and by `OrvexConfigService.otelExporterOtlpEndpoint`)
 * as the OTLP collector's BASE URL, with no signal-specific resource path.
 * `OTLPTraceExporter` only derives the `/v1/traces` suffix itself when it
 * resolves the endpoint from `process.env` internally; passing an explicit
 * `url` (required here — env is not naturally in scope at this pre-DI boot
 * tier, and `OrvexConfigService` is the single documented read path, F2)
 * bypasses that auto-resolution entirely, so the base URL is used verbatim
 * and the collector 404s the root path — spans never reach Tempo.
 *
 * Idempotent (a base already ending in `/v1/traces` is returned unchanged)
 * and preserves any existing base path (e.g. an `/otlp` prefix) rather than
 * overwriting it, mirroring the upstream SDK's own
 * `appendResourcePathToUrl` env-resolution behaviour.
 */
export function resolveOtlpTracesUrl(baseEndpoint: string): string {
  const withoutTrailingSlash = baseEndpoint.endsWith('/')
    ? baseEndpoint.slice(0, -1)
    : baseEndpoint;
  if (withoutTrailingSlash.endsWith('/v1/traces')) {
    return withoutTrailingSlash;
  }
  return `${withoutTrailingSlash}/v1/traces`;
}

/** Handle returned by a successful `initOrvexTracing` — the only way to flush/stop the SDK. */
export interface ShutdownHandle {
  shutdown(): Promise<void>;
}

/**
 * The minimal env bag `initOrvexTracing` reads. Deliberately NOT
 * `NodeJS.ProcessEnv` — a plain index signature keeps the function testable
 * with a literal object (no `process.env` mutation needed in specs) and
 * mirrors `OrvexRootModule.register()`'s direct-env-read pattern (DI does not
 * exist yet at this point in the boot sequence).
 */
export type OrvexTracingEnv = Record<string, string | undefined>;

/**
 * Optionally injectable span exporter — used ONLY by tests (OTel's own
 * `InMemorySpanExporter`, never a mock of an owned package, CS §5/❌#4). The
 * real boot path always uses the real OTLP exporter; this parameter exists
 * so specs can drive `initOrvexTracing` end-to-end without a live collector
 * (AC-operability: the request path never depends on collector reachability
 * anyway — the batch processor drops/retries out of band).
 */
export interface InitOrvexTracingOptions {
  exporter?: SpanExporter;
}

let activeProvider: NodeTracerProvider | null = null;
let activeShutdownHandle: ShutdownHandle | null = null;

/**
 * initOrvexTracing — process-level OTel SDK bootstrap (CS §4c: process
 * bootstrap tier, runs BEFORE Nest DI exists, same tier as
 * `OrvexRootModule.register()`'s env read).
 *
 * VANILLA BYTE-PARITY DOCTRINE (AC5): returns `null` and constructs NOTHING
 * — no `NodeTracerProvider`, no exporter, no instrumentation registration —
 * unless BOTH `ORVEX_MODULES_ENABLED === 'true'` (exact string) AND
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is set (non-blank). Any other value on
 * either gate is flag-OFF.
 *
 * When ON: registers the W3C `TraceContextPropagator` (AC2 ingress-continue),
 * an async-hooks context manager, the FR-C18 `Resource` (AC1), and hand-picked
 * instrumentations (fastify/http/ioredis — NOT `instrumentation-pg`, which
 * targets node-`pg` and does not apply to this engine's `postgres`/postgres.js
 * driver, §4h ❌#6) behind a `BatchSpanProcessor` (async/batched export — no
 * blocking I/O on the request path, AC-NFR-freshness/latency).
 */
export function initOrvexTracing(
  env: OrvexTracingEnv,
  options: InitOrvexTracingOptions = {},
): ShutdownHandle | null {
  if (env.ORVEX_MODULES_ENABLED !== 'true') {
    return null;
  }

  // F2 fix (ENG-1599 T2/§4a): the endpoint is resolved through
  // OrvexConfigService — its documented first consumer — same pre-DI direct-
  // construction pattern as `OrvexRootModule.register()`'s
  // `new OrvexConfigService()` (DI does not exist yet at this boot tier).
  const endpoint = new OrvexConfigService(env as NodeJS.ProcessEnv)
    .otelExporterOtlpEndpoint;
  if (!endpoint) {
    return null;
  }

  if (env.DEBUG_MODE?.toLowerCase() === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
  }

  const resource = resourceFromAttributes(buildResourceAttributes(env));

  // Review-1 F1 fix (FR-CT1): resolve the traces-specific resource path
  // ourselves — see `resolveOtlpTracesUrl` docblock for why the exporter
  // can't be trusted to do this from an explicit `url`.
  const exporter: SpanExporter =
    options.exporter ?? new OTLPTraceExporter({ url: resolveOtlpTracesUrl(endpoint) });
  // Review-2 F1 fix (AC6): wrap the real BatchSpanProcessor in the PII
  // redaction seam so `http.url`/`http.target` (auto-set by stock
  // HttpInstrumentation from the raw request line — page slug + query
  // string included) are stripped from every span BEFORE they are ever
  // batched/exported. See orvex-span-redaction.processor.ts docblock.
  const spanProcessor: SpanProcessor = new OrvexPiiRedactingSpanProcessor(
    new BatchSpanProcessor(exporter),
  );

  const provider = new NodeTracerProvider({
    resource,
    spanProcessors: [spanProcessor],
  });

  const contextManager = new AsyncHooksContextManager();
  contextManager.enable();

  provider.register({
    propagator: new W3CTraceContextPropagator(),
    contextManager,
  });

  // F4 (LOW, flagged for the tracing ADR / collector-side scrubbing — not
  // fixed here): `HttpInstrumentation` derives its server SPAN NAME from the
  // request method only (e.g. "GET") in this instrumentation version, so no
  // path/route ever surfaces there today; if a future upgrade changes that
  // derivation, span-name sanitisation would need a route-template allowlist
  // (not a deny-list) and remains out of scope for this leg. The ATTRIBUTE
  // leak from the same instrumentation (`http.url`/`http.target`, which DO
  // carry the raw path + query string) is a separate vector and IS fixed —
  // see the `OrvexPiiRedactingSpanProcessor` wrapping `spanProcessor` above
  // (review-2 F1/AC6).
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new HttpInstrumentation(),
      new FastifyInstrumentation(),
      new IORedisInstrumentation(),
    ],
  });

  activeProvider = provider;

  const handle: ShutdownHandle = {
    async shutdown(): Promise<void> {
      await provider.shutdown();
      if (activeProvider === provider) {
        activeProvider = null;
      }
      if (activeShutdownHandle === handle) {
        activeShutdownHandle = null;
      }
    },
  };
  activeShutdownHandle = handle;

  return handle;
}

/**
 * shutdownOrvexTracing — the handle-FREE graceful-flush seam (F3 fix, §4i).
 * `OrvexTracingModule`'s `OnApplicationShutdown` calls this via Nest's
 * existing `app.enableShutdownHooks()` wiring (already present in
 * `main.ts`) so a SIGTERM flushes the `BatchSpanProcessor`'s buffered spans
 * before the process exits — WITHOUT `main.ts` needing to thread the
 * `ShutdownHandle` returned by `initOrvexTracing` through app bootstrap
 * itself (that handle stays available for callers, e.g. tests, that DO hold
 * it directly). A no-op, never throws, when tracing was never activated
 * (flag-off boot, AC5) or has already been shut down (idempotent).
 */
export async function shutdownOrvexTracing(): Promise<void> {
  await activeShutdownHandle?.shutdown();
}

/**
 * The stable tracer accessor ENG-1600 reuses (AC7) — returns the OTel API's
 * global tracer, which is a real no-op tracer (never throws, never blocks)
 * when tracing is OFF, exactly like every other OTel API call site.
 */
export function getOrvexTracer(name = 'orvex-wiki') {
  return trace.getTracer(name);
}

/** Test-only accessor so specs can assert on the process-level singleton without a second init. */
export function __getActiveProviderForTests(): NodeTracerProvider | null {
  return activeProvider;
}

// Re-exported so callers don't need a second import for the ingress-continue
// propagator type check in tests (AC2) — `propagation` itself is used by the
// Fastify/HTTP instrumentations transparently; no direct call needed here.
export { propagation };
