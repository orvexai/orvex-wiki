// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { NotFoundException } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * WORKSPACE_EXEMPT_PATHS — `main.ts`'s workspace-resolution `preHandler`
 * allow-list, extracted (ENG-2500 AC2b) so it is importable and independently
 * testable rather than living only inline inside `bootstrap()`.
 *
 * Every `/api/*` request whose path is NOT in this list, and for which
 * `req.raw.workspaceId` has not been resolved (CLOUD multi-tenancy, Host
 * doesn't match any workspace), 404s BEFORE reaching any controller. This
 * list is the allow-list of surfaces that are deliberately reachable WITHOUT
 * a pre-resolved workspaceId — either because they establish/discover the
 * workspace themselves, or because they are authenticated by a bearer/
 * manifest contract that never used Host-based tenant resolution to begin
 * with.
 */
export const WORKSPACE_EXEMPT_PATHS: readonly string[] = [
  '/api/auth/setup',
  '/api/health',
  '/api/billing/stripe/webhook',
  '/api/workspace/check-hostname',
  '/api/sso/google',
  '/api/workspace/create',
  '/api/workspace/joined',
  '/api/workspace/find-by-email',
  // ENG-1559 FR-W6 — the public engine session-mint ESTABLISHES the
  // session from the identity exchange token carried in the request body;
  // it resolves the tenant by introspecting that token, never from a
  // host-resolved workspace, so (like /api/auth/setup + /api/workspace/*
  // above) it must not require a pre-resolved workspaceId. Without this,
  // CLOUD mode (no host->workspace match, no bearer yet) 404s the mint
  // before it can run.
  '/api/orvex/session/exchange',
  // ENG-1578 — the WHOLE tenant-move surface (`/api/orvex/tenant-move`
  // bare, the real registry cross-cell relocation, M14 closing gate
  // AC6, AND its `/quiesce`/`/export`/`/import`/`/activate` A-MOVE
  // sub-routes) resolves its caller by bearer (introspection or the
  // manifest's own `Idempotency-Key`-gated contract), NEVER from a
  // host-resolved workspace — the SAME shape as the FR-W6 session-
  // exchange exemption above, for the SAME reason. It is called over
  // a bare cluster-internal ClusterIP URL with no tenant-specific
  // Host header (orvex-studio-lib's M14 rehearsal harness, and any
  // real production caller e.g. orvex-workflows' TenantMoveWorkflow),
  // so without this exemption CLOUD mode 404s "Workspace not found"
  // before the tenant-move service's own auth even runs (confirmed
  // live against the deployed orvex-wiki-dev cell — the bare 200 gate
  // is a REAL cross-tenant relocation, so leaving it host-scoped by
  // accident is not an option: the bearer/moveId contract IS the
  // access control here, deliberately, not Host-based routing).
  '/api/orvex/tenant-move',
  // ENG-2500 AC2b — the AGPL §13 source offer (FR-W19) must be reachable by
  // ANY network user in EVERY deployment topology, including CLOUD
  // multi-tenancy where the request's Host resolves to no workspace. The
  // endpoint is intentionally public (no auth, no tenant) and reads only
  // build-time env — the SAME structural shape as the FR-W6
  // session-exchange exemption above (no pre-resolved workspaceId can ever
  // be required of it). Without this entry a CLOUD-mode compliance request
  // 404s at this hook before the controller runs — a real §13 gap.
  '/api/orvex/source',
];

/**
 * registerWorkspaceExemptPreHandler — registers the REAL workspace-resolution
 * `preHandler` hook against a booted app's underlying Fastify instance. This
 * is the SAME predicate `main.ts::bootstrap()` registers (a pure move, not a
 * reimplementation): any `/api/*` request whose path is not in
 * `WORKSPACE_EXEMPT_PATHS`, and whose `req.raw.workspaceId` is falsy, 404s as
 * "Workspace not found" — except the bare `/api` prefix itself, which is
 * let through even without a workspaceId.
 *
 * Tests that need to prove behaviour under this hook (e.g. the CLOUD-mode
 * reachability DoD case) MUST call this exported factory against a real
 * booted app — never hand-copy the predicate — so the test exercises the
 * exact hook production traffic goes through.
 */
export function registerWorkspaceExemptPreHandler(
  app: NestFastifyApplication,
): void {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('preHandler', function (req, reply, done) {
      if (
        req.originalUrl.startsWith('/api') &&
        !WORKSPACE_EXEMPT_PATHS.some((path) => req.originalUrl.startsWith(path))
      ) {
        if (!req.raw?.['workspaceId'] && req.originalUrl !== '/api') {
          throw new NotFoundException('Workspace not found');
        }
        done();
      } else {
        done();
      }
    });
}
