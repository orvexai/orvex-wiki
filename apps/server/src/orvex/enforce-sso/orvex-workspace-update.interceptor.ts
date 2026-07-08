// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

/**
 * OrvexWorkspaceUpdateInterceptor — ported from the fork at pin
 * `050187676624f2395c55b36ec60e365f87fd4a9f`
 * (`packages/orvex-extensions/src/orvex-workspace-update.interceptor.ts#L39-L118`).
 *
 * Response-tap only: reads the pre-update workspace off `request.raw.workspace`
 * (the same value `@AuthWorkspace()` resolves) as "before", and the
 * controller's returned, already-persisted workspace as "after". When (and
 * only when) `settings.oidc.enforceSso` actually differs, it emits
 * `AuditEvent.OIDC_ENFORCE_SSO_TOGGLED` — fire-and-forget, never awaited on
 * the response path, so an audit-sink hiccup can never delay or fail the
 * `/workspace/update` response (CS §10 operability).
 *
 * NOT YET BOUND to any route (no `@UseInterceptors`, no `APP_INTERCEPTOR`) —
 * `/workspace/update` does not run through this interceptor today (ENG-1432
 * review #1, finding F1/F1c). Route-binding is deferred to ENG-1490.
 */
type WorkspaceLike = {
  id?: string;
  settings?: { oidc?: { enforceSso?: boolean } } | null;
};

function isWorkspaceLike(value: unknown): value is WorkspaceLike {
  return typeof value === 'object' && value !== null;
}

function extractEnforceSso(value: unknown): boolean {
  if (!isWorkspaceLike(value)) {
    return false;
  }
  return Boolean(value.settings?.oidc?.enforceSso);
}

function extractId(value: unknown): string | undefined {
  return isWorkspaceLike(value) ? value.id : undefined;
}

@Injectable()
export class OrvexWorkspaceUpdateInterceptor implements NestInterceptor {
  constructor(
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const beforeWorkspace: unknown =
      request?.raw?.workspace ?? request?.user?.workspace;
    const beforeEnforceSso = extractEnforceSso(beforeWorkspace);

    return next.handle().pipe(
      tap((updatedWorkspace: unknown) => {
        const afterEnforceSso = extractEnforceSso(updatedWorkspace);
        if (beforeEnforceSso === afterEnforceSso) {
          return;
        }

        // Fire-and-forget: never block or fail the response on the audit write.
        void this.auditService.logWithContext(
          {
            event: AuditEvent.OIDC_ENFORCE_SSO_TOGGLED,
            resourceType: AuditResource.WORKSPACE,
            resourceId: extractId(updatedWorkspace),
            changes: {
              before: { enforceSso: beforeEnforceSso },
              after: { enforceSso: afterEnforceSso },
            },
          },
          { workspaceId: extractId(updatedWorkspace) },
        );
      }),
    );
  }
}
