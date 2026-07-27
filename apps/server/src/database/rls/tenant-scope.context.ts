// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * ENG-2502 (FR-W8, AC1) — the ambient tenant scope for the RLS GUC hook.
 *
 * AC1 requires the GUC hook be wired "into the request lifecycle so EVERY
 * tenant-scoped mutation/read transaction calls it, sourcing `workspaceId`
 * from `req.workspaceId` (resolved by `DomainMiddleware`)". The engine has
 * ~30 `executeTx` transaction sites across core services; threading a
 * `workspaceId` argument through all of them would be ~30 signature changes
 * that a 31st site can silently forget — the exact easy-to-forget ordering
 * failure the RLS backstop exists to catch. Instead the tenant is carried
 * AMBIENTLY, established once at the request boundary and read once at the
 * shared transaction chokepoint (`executeTx`, `database/utils.ts`), so a
 * new transaction site is scoped by construction.
 *
 * `AsyncLocalStorage` is the correct primitive here and not a hidden global:
 * its store is bound to the async execution context of ONE request, so two
 * concurrent requests for different tenants never observe each other's
 * value — unlike a module-level variable, which would be a genuine
 * cross-tenant hazard on a shared Node process.
 *
 * Deletion test (CS §3.1): this module owns the request→transaction tenant
 * propagation invariant. Deleting it pushes the workspaceId argument back
 * onto every current and future `executeTx` caller.
 *
 * The RLS layer this feeds is a BACKSTOP beneath the FR-13 app-layer ACL
 * (`OrvexPermissionsService`) — never a replacement for it.
 */

export interface TenantScope {
  /** The request's resolved workspace id, or null when none resolved. */
  readonly workspaceId: string | null;
}

const storage = new AsyncLocalStorage<TenantScope>();

/**
 * Runs `fn` with `workspaceId` as the ambient tenant scope. Everything
 * awaited inside `fn` — including `executeTx` transactions opened many
 * frames deeper — observes this scope and nothing outside it does.
 */
export function runInTenantScope<T>(workspaceId: string | null, fn: () => T): T {
  return storage.run({ workspaceId }, fn);
}

/**
 * The ambient workspace id, or null when the current execution context has
 * no tenant scope (a boot task, a queue worker, a background job, or a
 * request that resolved no workspace). Null is the FAIL-CLOSED answer: the
 * caller leaves the GUC unset and RLS denies by default (AC5), rather than
 * guessing a tenant.
 */
export function currentTenantScope(): string | null {
  return storage.getStore()?.workspaceId ?? null;
}
