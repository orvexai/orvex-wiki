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
 * Every `/api/*` request whose path matches NEITHER this list NOR
 * {@link WORKSPACE_EXEMPT_EXACT_PATHS}, and for which `req.raw.workspaceId`
 * has not been resolved (CLOUD multi-tenancy, Host doesn't match any
 * workspace), 404s BEFORE reaching any controller. The two lists together are
 * the allow-list of surfaces that are deliberately reachable WITHOUT a
 * pre-resolved workspaceId — either because they establish/discover the
 * workspace themselves, or because they are authenticated by a bearer/
 * manifest contract that never used Host-based tenant resolution to begin
 * with.
 *
 * MATCH SEMANTICS — **PREFIX** (`originalUrl.startsWith(entry)`). Every entry
 * here therefore admits its ENTIRE subtree, which for some of them
 * (`/api/orvex/tenant-move` and its `/quiesce`|`/export`|`/import`|`/activate`
 * sub-routes) is the deliberate intent. An entry whose subtree must NOT be
 * admitted belongs in {@link WORKSPACE_EXEMPT_EXACT_PATHS} instead — see
 * ENG-3504: `'/api/spaces/'` was briefly added HERE, where the prefix silently
 * admitted all nine `SpaceController` routes (create/update/delete/members/
 * members-add/members-remove/members-change-role) instead of the one
 * (`POST /api/spaces/`) wiki-api actually calls.
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
 * WORKSPACE_EXEMPT_EXACT_PATHS — the SECOND allow-list, matched by **EXACT
 * path equality** (query string stripped, one optional trailing slash
 * normalized to mirror the adapter's `ignoreTrailingSlash: true`), never by
 * prefix. An entry here admits EXACTLY the route it names and nothing
 * beneath it.
 *
 * ENG-3504 — wiki-api's engine COMPOSITION TIER (orvex-wiki-api's
 * `internal/clients/clients.go` `Engine.*` methods, called over `ENGINE_URL`,
 * a bare cluster-internal Service URL with NO tenant Host — confirmed live:
 * `Host: orvex-wiki.orvex-wiki-dev.svc.cluster.local`, never a workspace
 * subdomain). Under CLOUD mode the preHandler 404'd EVERY one of these calls
 * before wiki-api's own S2S bearer (which the engine's `JwtAuthGuard` DOES
 * verify) ever got evaluated — first surfaced narrowly as ENG-3464
 * ("Workspace not found" on the M9 gate's whoami leg), generalized here per
 * ENG-3504's audit of the whole tier.
 *
 * Same shape/precedent as the FR-W6 session-exchange and ENG-1578 tenant-move
 * exemptions in {@link WORKSPACE_EXEMPT_PATHS}: `@AuthWorkspace()`
 * (`common/decorators/auth-workspace.decorator.ts`) already falls back to
 * `request.user.workspace` — set by `JwtStrategy.validate()` from the VERIFIED
 * bearer, which also requires `payload.workspaceId` and scopes the user lookup
 * to that workspace — whenever `request.raw.workspace` (the Host-derived value
 * this preHandler would otherwise require) is absent. Every controller below
 * keeps its class-level `@UseGuards(JwtAuthGuard)` unchanged, so exempting
 * these paths skips ONLY the Host-based PRE-resolution, never authentication:
 * tenancy becomes bearer-derived rather than Host-derived, exactly as on the
 * tenant-move/session-exchange routes.
 *
 * WHY EXACT AND NOT PREFIX. `POST /api/spaces/` (`clients.go:950`, the list
 * primitive) is the ONLY `/api/spaces...` call in wiki-api's entire engine
 * client. Under the prefix matcher a `'/api/spaces/'` entry ALSO admits the
 * other eight `SpaceController` routes — `info`, `create`, `update`, `delete`,
 * `members`, `members/add`, `members/remove`, `members/change-role` — none of
 * which this tier calls and none of which were audited for bearer-derived
 * tenancy. Those routes are reached by real users over a tenant Host, resolve
 * a workspace normally, and never touch this guard; leaving them Host-gated
 * costs nothing and keeps the blast radius equal to the audited set. Exact
 * matching is what makes the comment above a description of the diff rather
 * than an aspiration.
 *
 * Deliberately absent for the same reason: the page-id-parameterized
 * `/api/orvex/pages/:pageId/apply-ops` and `/apply-doc`. Exact matching cannot
 * express a path parameter, and a prefix broad enough to cover one would
 * re-admit the sibling `orvex/pages/supersede`|`/unsupersede`|`/status` routes
 * (`orvex-page-supersede.controller.ts`) this pass never audited. Tracked as a
 * follow-on: it needs a segment-aware pattern form, not a blanket prefix.
 */
export const WORKSPACE_EXEMPT_EXACT_PATHS: readonly string[] = [
  // Engine.GetWorkspaceInfo   — clients.go:775
  '/api/workspace/info',
  // Engine.GetPage            — clients.go:687
  '/api/pages/info',
  // Engine.CreatePage         — clients.go:1059
  '/api/pages/create',
  // Engine.UpsertPage         — clients.go:1187
  '/api/pages/upsert',
  // Engine.ListSpaces         — clients.go:950 (SpaceController `@Post('/')`)
  '/api/spaces/',
];

/**
 * Strip the query string / fragment, leaving the bare request path, and
 * normalize ONE optional trailing slash away. Mirrors the real adapter's
 * `routerOptions.ignoreTrailingSlash: true` (`main.ts`), under which
 * `/api/spaces` and `/api/spaces/` route to the SAME handler — so the exact
 * matcher must treat them as the same path too, or it would 404 a request
 * Fastify itself considers identical to an exempt one. The root `/` is left
 * alone.
 */
function canonicalPath(url: string): string {
  const cut = url.search(/[?#]/);
  const path = cut === -1 ? url : url.slice(0, cut);
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * isWorkspaceExempt — the allow-list predicate. PREFIX for
 * {@link WORKSPACE_EXEMPT_PATHS} (unchanged, byte-for-byte, from before
 * ENG-3504), EXACT for {@link WORKSPACE_EXEMPT_EXACT_PATHS}. Exported so a
 * test can assert the boundary directly rather than re-deriving it.
 */
export function isWorkspaceExempt(originalUrl: string): boolean {
  if (WORKSPACE_EXEMPT_PATHS.some((path) => originalUrl.startsWith(path))) {
    return true;
  }
  const path = canonicalPath(originalUrl);
  return WORKSPACE_EXEMPT_EXACT_PATHS.some(
    (exempt) => canonicalPath(exempt) === path,
  );
}

/**
 * registerWorkspaceExemptPreHandler — registers the REAL workspace-resolution
 * `preHandler` hook against a booted app's underlying Fastify instance. This
 * is the SAME predicate `main.ts::bootstrap()` registers (a pure move, not a
 * reimplementation): any `/api/*` request that {@link isWorkspaceExempt}
 * rejects, and whose `req.raw.workspaceId` is falsy, 404s as "Workspace not
 * found" — except the bare `/api` prefix itself, which is let through even
 * without a workspaceId.
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
        !isWorkspaceExempt(req.originalUrl)
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
