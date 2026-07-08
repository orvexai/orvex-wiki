// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { OrvexTransclusionSafeguardService } from '../orvex-transclusion-safeguard.service';
import {
  TransclusionConflictMode,
  TransclusionOperation,
} from '../transclusion-safeguard.types';

type ResolvedGuard = {
  pageId: string;
  operation: TransclusionOperation;
  mode: TransclusionConflictMode;
};

/** The minimal shape this interceptor reads off the Fastify request. */
type GuardableRequest = {
  url?: string;
  body?: {
    pageId?: string;
    permanentlyDelete?: boolean;
    status?: string;
    onTransclusionConflict?: string;
  };
  raw?: { workspace?: { id?: string } };
  user?: { user?: { id?: string }; workspace?: { id?: string } };
};

/**
 * TransclusionSafeguardInterceptor — the global write-block gate, ported
 * from the fork's `interceptors/transclusion-safeguard.interceptor.ts`
 * L26-80 (pin `050187676624f2395c55b36ec60e365f87fd4a9f`) with ONE
 * necessary route-surface adaptation (documented below, not a redesign of
 * the safeguard's behaviour):
 *
 * The fork scoped to `POST /pages/delete` + `POST /pages/update` with a
 * `body.orvex.status` field. In THIS split repo the orvex-status side
 * table (ENG-1371, already landed) exposes its own lifecycle-status HTTP
 * surface instead of riding `/pages/update`:
 *   - `POST /pages/delete` — unchanged, matches the fork exactly.
 *   - `POST /orvex/pages/status` with `body.status === 'archived'` — the
 *     real archive transition (`OrvexPageSupersedeController.setStatus`).
 *   - `POST /orvex/pages/supersede` — the real supersede transition
 *     (`OrvexPageSupersedeController.supersede`); this route only ever
 *     produces a `superseded` page, so it always guards.
 * Any other route, or a status-less/`published` write on the two
 * lifecycle routes, passes through untouched — preserving AC7's "exactly
 * the destructive page routes, no other route" contract against this
 * repo's actual surface.
 *
 * The interceptor carries NO domain rule of its own beyond this
 * route/operation/mode mapping (CS §12 ❌1) — the verdict lives entirely
 * in `OrvexTransclusionSafeguardService.enforceOrUnsync`. It is awaited
 * BEFORE the downstream handler (fail-closed, CS §10).
 */
@Injectable()
export class TransclusionSafeguardInterceptor implements NestInterceptor {
  constructor(
    private readonly transclusionSafeguardService: OrvexTransclusionSafeguardService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request: GuardableRequest = context.switchToHttp().getRequest();
    const resolved = this.resolveGuard(request);

    if (!resolved) {
      return next.handle();
    }

    const workspaceId: string | undefined =
      request?.raw?.workspace?.id ?? request?.user?.workspace?.id;
    const actorId: string | undefined = request?.user?.user?.id;

    if (!workspaceId) {
      return next.handle();
    }

    return from(
      this.transclusionSafeguardService.enforceOrUnsync(
        resolved.pageId,
        resolved.operation,
        resolved.mode,
        { workspaceId, actorId, actorType: 'user' },
      ),
    ).pipe(switchMap(() => next.handle()));
  }

  private resolveGuard(request: GuardableRequest): ResolvedGuard | null {
    const path: string = (request?.url ?? '').split('?')[0];
    const body = request?.body ?? {};
    const pageId: string | undefined = body?.pageId;

    if (!pageId) {
      return null;
    }

    const mode: TransclusionConflictMode =
      body?.onTransclusionConflict === 'unsync' ||
      body?.onTransclusionConflict === 'force'
        ? body.onTransclusionConflict
        : 'block';

    if (path.endsWith('/pages/delete')) {
      return {
        pageId,
        operation: body?.permanentlyDelete ? 'permanent-delete' : 'delete',
        mode,
      };
    }

    if (path.endsWith('/orvex/pages/status')) {
      if (body?.status !== 'archived') {
        return null;
      }
      return { pageId, operation: 'archive', mode };
    }

    if (path.endsWith('/orvex/pages/supersede')) {
      return { pageId, operation: 'supersede', mode };
    }

    return null;
  }
}
