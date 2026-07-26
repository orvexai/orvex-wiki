// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import { QuotaResource } from './entitlement.types';

const KEY_PREFIX = 'quota';

/** The recognised `quota:{resource}:{tenant}` resource segments (typed parse). */
const QUOTA_RESOURCES: readonly string[] = [
  'pages',
  'storage',
  'members',
  'files',
  'file_bytes',
];

/** SCAN page size for the sweep's candidate discovery — a batching knob. */
const SCAN_BATCH_SIZE = 100;

// Freshness knob (like the entitlement cache's CACHE_TTL_SECONDS — never a
// cap ceiling, ❌#10): a counter self-expires after this window so ANY drift
// class (a delete that never decrements, a crashed post-INCR write, a manual
// data fix) is bounded — the next read re-seeds from the store-tier truth.
// The reconciliation sweep (ENG-2492) is the ACTIVE drift corrector; this
// TTL is only the passive worst-case bound.
const COUNTER_TTL_SECONDS = 3600;

/**
 * Conditional INCRBY: increments ONLY when the counter key already exists.
 * An absent key means "usage unknown — must be re-seeded from truth"; a
 * blind INCRBY on an absent key would restart the count at ~0 mid-life and
 * silently bypass the cap. Atomic (single Lua eval) so there is no
 * EXISTS→INCRBY race window.
 */
const INCR_IF_EXISTS_LUA =
  "if redis.call('EXISTS', KEYS[1]) == 1 then " +
  "return redis.call('INCRBY', KEYS[1], ARGV[1]) else return nil end";

/**
 * ENG-2490 — the O(1) Redis fast-counter (`quota:{resource}:{tenant}`,
 * INCR-on-write) that replaces the per-request `COUNT(*)`/`SUM(...)` as the
 * `currentUsage` source at the quota chokepoints (REST + collab).
 *
 * Deliberately cap-ignorant (CS §3.7 design-it-twice, sketch 2 chosen): this
 * service ONLY supplies the usage number; the ALLOW/REJECT verdict — and the
 * cap VALUE — stay in `EntitlementService` (ENG-2489/ENG-2491), so a cap can
 * never silently diverge between two owners.
 *
 * Degrade contract (CS §10 / ADR-0003): Redis unavailable or erroring NEVER
 * throws out of this class — reads degrade to `null` ("counter unavailable";
 * the caller decides: chokepoints fall back to the store-tier truth,
 * ENG-2492's counter-sourced verdict branches fail-open/fail-closed per
 * resource class), and writes degrade to logged no-ops. Same
 * `RedisService.getOrNil()` idiom as `EntitlementCache`/`IdempotencyStore`
 * (❌#8 — the injected client, never an inline `new Redis(...)`).
 *
 * Accuracy contract (CS §11): a returned number is ALWAYS a real Redis
 * integer that originated from a store-tier truth seed plus real
 * INCR-on-write deltas — never fabricated or estimated. Drift correction is
 * ENG-2492's reconciliation sweep (plus the passive TTL bound above).
 */
@Injectable()
export class QuotaFastCounter {
  private readonly logger = new Logger(QuotaFastCounter.name);

  constructor(private readonly redisService: RedisService) {}

  private buildKey(tenantId: string, resource: QuotaResource): string {
    return `${KEY_PREFIX}:${resource}:${tenantId}`;
  }

  /**
   * O(1) counter read. `null` means "unavailable" — the key is absent
   * (never seeded, expired, or flushed) or Redis itself is down. Never
   * throws. Callers that must DISTINGUISH a miss from an outage (the
   * ENG-2492 fail-mode branch) use {@link readCounter} instead.
   */
  async get(tenantId: string, resource: QuotaResource): Promise<number | null> {
    const read = await this.readCounter(tenantId, resource);
    return read.kind === 'value' ? read.value : null;
  }

  /**
   * ENG-2492 AC2/AC3 — the typed counter read the fail-mode branch needs:
   * `value` (a real counted integer), `miss` (Redis reachable, counter not
   * seeded/expired/flushed), or `unavailable` (Redis unconfigured, down, or
   * erroring — including a corrupted non-numeric value). Never throws.
   */
  async readCounter(
    tenantId: string,
    resource: QuotaResource,
  ): Promise<
    | { kind: 'value'; value: number }
    | { kind: 'miss' }
    | { kind: 'unavailable' }
  > {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return { kind: 'unavailable' };
    }
    try {
      const raw = await redis.get(this.buildKey(tenantId, resource));
      if (raw === null) {
        return { kind: 'miss' };
      }
      const value = Number(raw);
      return Number.isFinite(value)
        ? { kind: 'value', value }
        : { kind: 'unavailable' };
    } catch (err) {
      this.logger.warn(
        `QuotaFastCounter.get degraded (${resource}/${tenantId}): ${(err as Error).message}`,
      );
      return { kind: 'unavailable' };
    }
  }

  /**
   * ENG-2492 AC1 — the reconciliation sweep's candidate set: every LIVE
   * `quota:{resource}:{tenant}` counter, discovered via a bounded SCAN
   * (O(live counters), never a store-tier tenant scan). An unreadable Redis
   * degrades to an empty candidate set (the sweep simply has nothing to
   * correct until Redis recovers). Never throws.
   */
  async listCounters(): Promise<
    Array<{ tenantId: string; resource: QuotaResource; value: number }>
  > {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return [];
    }
    try {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [next, batch] = await redis.scan(
          cursor,
          'MATCH',
          `${KEY_PREFIX}:*`,
          'COUNT',
          SCAN_BATCH_SIZE,
        );
        cursor = next;
        keys.push(...batch);
      } while (cursor !== '0');

      const out: Array<{
        tenantId: string;
        resource: QuotaResource;
        value: number;
      }> = [];
      for (const key of keys) {
        const parsed = this.parseKey(key);
        if (!parsed) {
          continue;
        }
        const raw = await redis.get(key);
        if (raw === null) {
          continue; // expired between SCAN and GET
        }
        const value = Number(raw);
        if (!Number.isFinite(value)) {
          continue;
        }
        out.push({ ...parsed, value });
      }
      return out;
    } catch (err) {
      this.logger.warn(
        `QuotaFastCounter.listCounters degraded (empty candidate set): ${(err as Error).message}`,
      );
      return [];
    }
  }

  private parseKey(
    key: string,
  ): { tenantId: string; resource: QuotaResource } | null {
    const [prefix, resource, ...tenantParts] = key.split(':');
    const tenantId = tenantParts.join(':');
    if (prefix !== KEY_PREFIX || !resource || tenantId.length === 0) {
      return null;
    }
    if (!QUOTA_RESOURCES.includes(resource as QuotaResource)) {
      return null;
    }
    return { tenantId, resource: resource as QuotaResource };
  }

  /**
   * Seeds the counter from a store-tier truth value (a real repo
   * count/aggregate — the ONLY legitimate source of an absolute value).
   * No-op when Redis is unavailable. Never throws.
   */
  async seed(
    tenantId: string,
    resource: QuotaResource,
    truthValue: number,
  ): Promise<void> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return;
    }
    try {
      await redis.set(
        this.buildKey(tenantId, resource),
        String(truthValue),
        'EX',
        COUNTER_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `QuotaFastCounter.seed degraded (${resource}/${tenantId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * INCR-on-write: records a committed write's delta in O(1). Increments
   * ONLY an already-seeded counter (see {@link INCR_IF_EXISTS_LUA}) — an
   * absent counter stays absent until the next {@link currentUsage} read
   * re-seeds it from truth. No-op when Redis is unavailable. Never throws.
   */
  async increment(
    tenantId: string,
    resource: QuotaResource,
    delta: number,
  ): Promise<void> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return;
    }
    try {
      await redis.eval(
        INCR_IF_EXISTS_LUA,
        1,
        this.buildKey(tenantId, resource),
        String(delta),
      );
    } catch (err) {
      this.logger.warn(
        `QuotaFastCounter.increment degraded (${resource}/${tenantId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * The chokepoint read: O(1) counter value when available; on a counter
   * miss (or Redis loss) falls back to the caller-supplied store-tier truth
   * (the owning repo's count/aggregate — CS §6 store confinement: the SQL
   * stays in the repo, this class never runs a query) and re-seeds the
   * counter so the NEXT read is O(1) again. The declared Redis-loss degrade
   * mode is therefore "enforce from the store-tier truth" — never an
   * unhandled crash, never a fabricated number (CS §10/§11).
   */
  async currentUsage(
    tenantId: string,
    resource: QuotaResource,
    computeTruth: () => Promise<number>,
  ): Promise<number> {
    const counted = await this.get(tenantId, resource);
    if (counted !== null) {
      return counted;
    }
    const truth = await computeTruth();
    await this.seed(tenantId, resource, truth);
    return truth;
  }
}
