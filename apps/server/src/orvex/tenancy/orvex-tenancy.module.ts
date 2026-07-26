// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RedisSuspensionCache, SUSPENSION_CACHE } from './suspension-cache';
import { TenantSuspensionGuard } from './tenant-suspension.guard';

/**
 * ENG-2505 (FR-22) — mounts the live, push-invalidated tenant-suspension
 * enforcement: `TenantSuspensionGuard` runs globally (every route is
 * governed; the read/export/auth allow-list lives INSIDE the guard as a
 * total classification, so no route is silently ungoverned by omission).
 *
 * `Global` + unconditional app.module import — the same precedent as
 * `EntitlementModule` (enforcement modules sit outside the flag-gated
 * `OrvexRootModule` tree because core surfaces must be governed whether or
 * not the optional orvex HTTP tree is enabled). `WorkspaceRepo` (durable
 * fallback) resolves from the global DatabaseModule; `RedisService` from
 * the global RedisModule.
 *
 * SUSPEND-SIGNAL PRODUCER (genuinely open, named — not silently resolved):
 * no control-plane/billing suspend event exists anywhere upstream at build
 * time (verified — the engine has no Kafka consumer for any suspend-shaped
 * CloudEvent). `SUSPENSION_CACHE.setSuspended(workspaceId, true)` +
 * the durable `workspaces.status` column ARE the consumer-side entry
 * points a future producer story wires into; this story proves the
 * ENFORCEMENT side with an injected synthetic signal, per its own scope.
 */
@Global()
@Module({
  providers: [
    { provide: SUSPENSION_CACHE, useClass: RedisSuspensionCache },
    TenantSuspensionGuard,
    { provide: APP_GUARD, useExisting: TenantSuspensionGuard },
  ],
  exports: [SUSPENSION_CACHE, TenantSuspensionGuard],
})
export class OrvexTenancyModule {}
