// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Global, Module, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { APP_INTERCEPTOR, HttpAdapterHost } from '@nestjs/core';

import { getActiveCorrelationId, registerOrvexCorrelationHook } from './orvex-correlation.hook';
import { getOrvexTracer, shutdownOrvexTracing } from './orvex-tracing.bootstrap';
import { OrvexTracingInterceptor } from './orvex-tracing.interceptor';

/**
 * @Global OrvexTracingModule — the stable DI surface ENG-1600 reuses (AC7):
 * `getOrvexTracer`/`getActiveCorrelationId` are the tracer + correlation
 * accessors that leg's Kafka-producer span links to, WITHOUT this leg's
 * resource/attribute contract changing.
 *
 * Wires the request-lifecycle adapters into the live Fastify instance:
 *   - the `onRequest` correlation hook (T3/AC1/AC3)
 *   - the tracing interceptor as a global `APP_INTERCEPTOR` (workspace
 *     attribute, AC1/AC6)
 *
 * DELETION TEST (CS §3.1 — not a pass-through): removing this module loses
 * the W3C ingress-continue wiring's downstream consumers (the correlation
 * join + workspace stamping), the FR-C18 attribute shaping, and the pino
 * join — none of which the raw OTel SDK provides by itself. It would ALSO
 * lose the F3 graceful-flush wiring below (`onApplicationShutdown`), the
 * only production caller of `shutdownOrvexTracing`.
 *
 * GRACEFUL FLUSH (§4i): `main.ts` already calls `app.enableShutdownHooks()`,
 * which invokes `OnApplicationShutdown` across every module on SIGTERM/
 * SIGINT. `onApplicationShutdown` here calls the bootstrap's handle-free
 * `shutdownOrvexTracing()` seam so the `BatchSpanProcessor`'s buffered spans
 * flush before the process exits, instead of being silently dropped. A
 * no-op when tracing was never activated (flag-off boot, AC5).
 *
 * Gated only by `ORVEX_MODULES_ENABLED` (via `OrvexRootModule.register()`,
 * like every other orvex sub-module) — NOT by the OTel endpoint. When the
 * endpoint is unset, `initOrvexTracing` (called separately, pre-DI, in
 * `main.ts`) never registers a real `TracerProvider`, so
 * `trace.getActiveSpan()`/`context.with()` resolve to the OTel API's own
 * no-op implementations here: this module's adapters become harmless no-ops,
 * never fabricating a span or blocking a request (AC5 targets the SDK/
 * instrumentation internals specifically — see `orvex-tracing.bootstrap.ts`).
 */
@Global()
@Module({
  providers: [
    OrvexTracingInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: OrvexTracingInterceptor },
  ],
  exports: [OrvexTracingInterceptor],
})
export class OrvexTracingModule implements OnModuleInit, OnApplicationShutdown {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    const instance = this.httpAdapterHost.httpAdapter?.getInstance?.();
    if (instance) {
      registerOrvexCorrelationHook(instance);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await shutdownOrvexTracing();
  }
}

export { getActiveCorrelationId, getOrvexTracer };
