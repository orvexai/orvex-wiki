// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { WorkspaceStatus } from '../../core/workspace/workspace.constants';
import { SUSPENSION_CACHE, SuspensionCache } from './suspension-cache';

/**
 * ENG-2505 (FR-22) — `TenantSuspensionGuard`: live, push-invalidated tenant
 * suspension enforcement. Wires the previously-dormant
 * `WorkspaceStatus.Suspended` value into a real request-boundary control.
 *
 * WHAT IT OWNS (deletion test, CS §3.1): the explicit allow-list decision
 * (which surfaces a suspended tenant retains) and the fail-closed fallback
 * ordering (live cache → durable `workspaces.status` row → typed deny) —
 * deleting it would scatter suspension checks across every controller.
 *
 * ALLOW-LIST (FR-22's letter — read/export/auth only, explicitly
 * enumerable, never an implicit "everything I remembered"):
 *  - every GET/HEAD/OPTIONS request (read surface),
 *  - the auth surfaces (`/api/auth/**`, `/api/orvex/session/**` — the
 *    session/exchange/login paths),
 *  - the export surfaces (`/api/pages/export`, `/api/spaces/export`,
 *    `/api/users/me/export` — data portability).
 * Everything else is a governed write/mutating surface and is blocked with
 * a typed `403 {code: 'TENANT_SUSPENDED'}` while the tenant is suspended.
 * Suspension deletes NOTHING — it is a lockout, not a destructive action.
 *
 * FRESHNESS (AC3/AC4): the suspension state is read from its OWN
 * `suspension:*` cache (push-invalidated on signal receipt, shared
 * cell-wide via Redis) — explicitly NOT through `EntitlementCache` and NOT
 * subject to its 300s TTL; a suspend signal is enforced on the very next
 * request on every replica.
 *
 * FAIL-CLOSED (AC5, CS §10): when the live channel has no knowledge
 * (miss/outage) the guard resolves the durable `workspaces.status` column —
 * the source of truth — and read-through-populates the cache. A
 * guard-internal failure (durable read error) is LOGGED and DENIES the
 * request (typed 403, never a crash, never a silent allow). Fail-closed is
 * scoped per tenant: an unrelated active tenant resolves its own row and
 * passes.
 *
 * REGISTRATION ORDER (disclosed deviation, not hidden): this guard is
 * registered globally (`APP_GUARD`) while authentication (`JwtAuthGuard`)
 * is controller-bound — Nest runs global guards BEFORE controller-bound
 * ones, so an UNAUTHENTICATED mutating request to a SUSPENDED tenant
 * receives this guard's 403 rather than the 401 the ticket's ideal
 * ordering describes. Both are fail-closed denials; every auth surface is
 * on the allow-list, so no login/exchange flow is ever hindered. Moving
 * the check after controller-bound auth would require touching every
 * controller — deliberately out of this story's scope and named here.
 */

export const TENANT_SUSPENDED_CODE = 'TENANT_SUSPENDED';

/** Path prefixes (post-global-`api`-prefix) exempt as auth surfaces. */
const EXEMPT_PATH_PREFIXES: readonly string[] = [
  '/api/auth',
  '/api/orvex/session',
];

/** Exact exempt paths — the export (data-portability) surfaces. */
const EXEMPT_EXACT_PATHS: ReadonlySet<string> = new Set([
  '/api/pages/export',
  '/api/spaces/export',
  '/api/users/me/export',
]);

/** Read methods are always exempt (FR-22 — reads stay available). */
const EXEMPT_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * TOTAL route classification: every (method, path) is either 'exempt'
 * (read/export/auth) or 'guarded' — no route can be silently ungoverned by
 * omission (NFR honesty; the route-enumeration test asserts through this).
 */
export function classifySuspensionSurface(
  method: string,
  url: string,
): 'exempt' | 'guarded' {
  if (EXEMPT_METHODS.has(method.toUpperCase())) {
    return 'exempt';
  }
  const path = url.split('?')[0];
  if (EXEMPT_EXACT_PATHS.has(path)) {
    return 'exempt';
  }
  for (const prefix of EXEMPT_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return 'exempt';
    }
  }
  return 'guarded';
}

/** The request shape this guard reads (mirrors `WorkspaceThrottlerGuard`). */
type SuspensionAwareRequest = {
  method?: string;
  url?: string;
  originalUrl?: string;
  raw?: { workspaceId?: string; url?: string; method?: string };
  workspaceId?: string;
  user?: { workspace?: { id?: string } };
};

@Injectable()
export class TenantSuspensionGuard implements CanActivate {
  private readonly logger = new Logger(TenantSuspensionGuard.name);

  constructor(
    @Inject(SUSPENSION_CACHE)
    private readonly suspensionCache: SuspensionCache,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SuspensionAwareRequest>();

    const method = req.method ?? req.raw?.method ?? 'GET';
    const url = req.originalUrl ?? req.url ?? req.raw?.url ?? '';
    if (classifySuspensionSurface(method, url) === 'exempt') {
      return true; // read/export/auth surface — never blocked, zero-cost
    }

    // Tenant resolved by DomainMiddleware (ENG-2501) — same field the
    // throttler reads; no tenant on the request means nothing to suspend
    // (downstream auth still governs the request).
    const workspaceId =
      req.raw?.workspaceId ?? req.workspaceId ?? req.user?.workspace?.id;
    if (!workspaceId) {
      return true;
    }

    if (await this.resolveSuspended(workspaceId)) {
      throw new ForbiddenException({
        code: TENANT_SUSPENDED_CODE,
        message:
          'This workspace is suspended. Read, export and sign-in remain available.',
      });
    }
    return true;
  }

  /**
   * live cache → durable row → deny-on-error. Never fail-open: an error
   * resolving the status DENIES (logged), an unknown tenant resolves from
   * the durable source of truth, never from an assumption.
   */
  private async resolveSuspended(workspaceId: string): Promise<boolean> {
    const live = await this.suspensionCache.isSuspended(workspaceId);
    if (live !== undefined) {
      return live;
    }
    try {
      const workspace = await this.workspaceRepo.findById(workspaceId);
      const suspended = workspace?.status === WorkspaceStatus.Suspended;
      // Read-through population: the next request rides the fast path; a
      // later suspend signal overwrites this immediately (push, no TTL).
      await this.suspensionCache.setSuspended(workspaceId, suspended);
      return suspended;
    } catch (err) {
      // CS §10 — a guard-internal failure fails CLOSED for this tenant:
      // logged loudly, typed deny, never a crash, never a silent allow.
      this.logger.error(
        `suspension status resolution failed for workspace ${workspaceId} — failing closed: ${(err as Error).message}`,
      );
      return true;
    }
  }
}
