// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';

/**
 * ENG-2505 (FR-22 / FR-16 / NFR-7) — the tenant-suspension status cache.
 *
 * DELIBERATELY SEPARATE from `EntitlementCache` (design-it-twice, CS §3.7):
 *  - `entitlement:*` carries a "last-known projection usable within a 300s
 *    staleness window" semantics — WRONG for suspension, which must be
 *    live-or-fall-back-to-durable-truth, never "usable if stale".
 *  - This cache uses its OWN `suspension:*` Redis namespace and NO TTL:
 *    state is PUSH-invalidated — written on receipt of a suspend/unsuspend
 *    signal (`setSuspended`, the signal consumer's entry point) and
 *    read-through-populated from the durable `workspaces.status` column —
 *    never left to expire passively. Because the store is the cell's SHARED
 *    Redis, a signal written by one replica is observed by every replica's
 *    very next read: propagation is bounded by construction (NFR-7), no
 *    per-replica TTL race.
 *
 * Failure semantics (CS §10, fail-closed direction): `isSuspended` returns
 * `undefined` — "no live knowledge" — when Redis is unreachable or holds no
 * entry; the CALLER (`TenantSuspensionGuard`) then resolves the durable
 * `workspaces.status` row, so an invalidation-channel outage can never
 * silently un-suspend a tenant (nor lock out an active one).
 */

/** Distinct from the entitlement cache's `entitlement:` namespace (§4e). */
const KEY_PREFIX = 'suspension';

export const SUSPENSION_CACHE = Symbol('SUSPENSION_CACHE');

export interface SuspensionCache {
  /**
   * `true`/`false` = live knowledge; `undefined` = no live knowledge (no
   * entry yet, or the channel is down) — the caller must fall back to the
   * durable `workspaces.status` source of truth, never assume "not
   * suspended".
   */
  isSuspended(workspaceId: string): Promise<boolean | undefined>;
  /**
   * The push-invalidation entry point: called by the suspend-signal
   * consumer (and by the guard's read-through population). Overwrites any
   * previous state immediately — the next request on ANY replica sees it.
   */
  setSuspended(workspaceId: string, suspended: boolean): Promise<void>;
}

function buildKey(workspaceId: string): string {
  return `${KEY_PREFIX}:${workspaceId}`;
}

@Injectable()
export class RedisSuspensionCache implements SuspensionCache {
  private readonly logger = new Logger(RedisSuspensionCache.name);

  constructor(private readonly redisService: RedisService) {}

  async isSuspended(workspaceId: string): Promise<boolean | undefined> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return undefined; // channel unavailable — caller falls back to durable truth
    }
    try {
      const raw = await redis.get(buildKey(workspaceId));
      if (raw === null) {
        return undefined; // no live knowledge yet — caller resolves durably
      }
      return raw === '1';
    } catch (err) {
      // Loud, never silent — and NEVER fail-open: `undefined` routes the
      // caller to the durable row, so a known-suspended tenant stays
      // blocked through a Redis outage (AC5).
      this.logger.warn(
        `SuspensionCache.isSuspended degraded to durable fallback: ${(err as Error).message}`,
      );
      return undefined;
    }
  }

  async setSuspended(workspaceId: string, suspended: boolean): Promise<void> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return; // no channel — the durable row remains the (slower) truth
    }
    try {
      // NO TTL: push-invalidated state, never TTL-guessed (AC3 — this is
      // exactly what keeps suspension independent of the entitlement
      // cache's 300s staleness window).
      await redis.set(buildKey(workspaceId), suspended ? '1' : '0');
    } catch (err) {
      // Logged and swallowed: the durable `workspaces.status` row is the
      // source of truth; a failed cache write only costs the fast path.
      this.logger.warn(
        `SuspensionCache.setSuspended degraded (durable row remains truth): ${(err as Error).message}`,
      );
    }
  }
}
