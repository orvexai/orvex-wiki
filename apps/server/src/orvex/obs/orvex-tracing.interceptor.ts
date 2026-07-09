// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { Observable } from 'rxjs';

import { applySpanAttributes, buildSpanAttributes } from './orvex-span-attributes.util';

/**
 * OrvexTracingInterceptor — thin adapter (CS §4c, no domain logic) that
 * stamps the FR-C18 `orvex.tenant` span attribute (AC1) once the request's
 * `workspaceId` is known.
 *
 * WHY AN INTERCEPTOR, NOT THE `onRequest` CORRELATION HOOK: `workspaceId` is
 * resolved by auth (the JWT strategy guard) / the domain middleware, both of
 * which run LATER in the Fastify/Nest pipeline than `onRequest` — Nest's
 * request lifecycle is Middleware -> Guards -> Interceptors(before) ->
 * Pipes -> Handler. Binding this at the interceptor tier guarantees
 * `request.raw.workspaceId` (or `request.workspaceId`) is already resolved
 * when it runs, without this file reaching into auth/store internals itself
 * (it only reads a property already placed on the request object).
 */
@Injectable()
export class OrvexTracingInterceptor implements NestInterceptor {
  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = executionContext.switchToHttp().getRequest<{
      raw?: { workspaceId?: string | null };
      workspaceId?: string | null;
    }>();

    const workspaceId = request?.raw?.workspaceId ?? request?.workspaceId ?? null;
    const span = trace.getActiveSpan();
    applySpanAttributes(span, buildSpanAttributes({ workspaceId }));

    return next.handle();
  }
}
