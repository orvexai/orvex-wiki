import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import { Principal, EntitlementCheckResponse } from './entitlement.types';

const KEY_PREFIX = 'entitlement';
// AC7 — this is the "last-known cached entitlement projection" fallback
// window, not a freshness TTL: on a cache hit within this window we treat
// the projection as usable even if billing is currently unreachable. A
// `billing.entitlement.changed` CloudEvent consumer (deferred — see T4 note
// in the PR) evicts this key immediately on a real plan change; the TTL is
// only the worst-case staleness bound if that eviction is ever missed.
const CACHE_TTL_SECONDS = 300;

export const ENTITLEMENT_CACHE = Symbol('ENTITLEMENT_CACHE');

/**
 * The cache port EntitlementService reads through (CS §7 `Service ↔ Redis`).
 * Redis is remote-but-owned (CS §5) — a real adapter here, a miniredis-backed
 * one in unit tests; never mocked at the call-site.
 */
export interface EntitlementCache {
  get(principal: Principal): Promise<EntitlementCheckResponse | undefined>;
  set(principal: Principal, value: EntitlementCheckResponse): Promise<void>;
  evict(principal: Principal): Promise<void>;
}

function buildKey(principal: Principal): string {
  return `${KEY_PREFIX}:${principal.principal_type}:${principal.principal_id}`;
}

/**
 * Redis-backed `EntitlementCache` (event-evicted read path, NFR freshness).
 * Never throws — a Redis outage on `get` degrades to "no cached value"
 * (the caller, EntitlementService, decides what that means: AC7 fail-closed
 * when the billing port is ALSO unreachable). `set`/`evict` failures are
 * logged and swallowed — caching is a hot-path optimization, not a source
 * of truth.
 */
@Injectable()
export class RedisEntitlementCache implements EntitlementCache {
  private readonly logger = new Logger(RedisEntitlementCache.name);

  constructor(private readonly redisService: RedisService) {}

  async get(
    principal: Principal,
  ): Promise<EntitlementCheckResponse | undefined> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return undefined;
    }
    try {
      const raw = await redis.get(buildKey(principal));
      if (!raw) {
        return undefined;
      }
      return JSON.parse(raw) as EntitlementCheckResponse;
    } catch (err) {
      this.logger.warn(`EntitlementCache.get degraded: ${(err as Error).message}`);
      return undefined;
    }
  }

  async set(
    principal: Principal,
    value: EntitlementCheckResponse,
  ): Promise<void> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return;
    }
    try {
      await redis.set(
        buildKey(principal),
        JSON.stringify(value),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(`EntitlementCache.set degraded: ${(err as Error).message}`);
    }
  }

  async evict(principal: Principal): Promise<void> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return;
    }
    try {
      await redis.del(buildKey(principal));
    } catch (err) {
      this.logger.warn(`EntitlementCache.evict degraded: ${(err as Error).message}`);
    }
  }
}

/**
 * A minimal in-memory `EntitlementCache` for unit/integration tests that do
 * not stand up Redis — behaviourally equivalent (get/set/evict), never a
 * mock of the Redis client itself (CS §5).
 */
export class InMemoryEntitlementCache implements EntitlementCache {
  private readonly store = new Map<string, EntitlementCheckResponse>();

  async get(
    principal: Principal,
  ): Promise<EntitlementCheckResponse | undefined> {
    return this.store.get(buildKey(principal));
  }

  async set(
    principal: Principal,
    value: EntitlementCheckResponse,
  ): Promise<void> {
    this.store.set(buildKey(principal), value);
  }

  async evict(principal: Principal): Promise<void> {
    this.store.delete(buildKey(principal));
  }
}
