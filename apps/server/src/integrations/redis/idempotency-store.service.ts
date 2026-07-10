import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';

const KEY_PREFIX = 'idem';
const DEFAULT_TTL_SECONDS = 300; // 5-minute window (CS §4i cost/governance)
const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 50; // 5 * 50ms = 250ms poll budget (CS §4i)

export interface IdempotencyClaim<T = unknown> {
  /** true when this caller may proceed with the write (first writer, OR a
   *  degraded/no-Redis fallback that never dedups). */
  claimed: boolean;
  /** true when Redis was unavailable/erroring — dedup was skipped, the
   *  write proceeded anyway (never a 500, CS §10). */
  degraded: boolean;
  /** populated only when `claimed` is false — the prior writer's
   *  recorded result, returned to the loser WITHOUT re-applying. */
  result?: T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ENG-1413 — cross-replica idempotency store (AC3, AC4).
 *
 * A thin cache-tier port over Redis (`RedisService.getOrNil()` — never an
 * inline `redis.NewClient()`, CS ❌#8). `claim()` uses `SET NX EX` so
 * exactly one replica wins the write for a given
 * `(namespace, pageId, userId, key)`; the loser polls briefly for the
 * winner's recorded result and returns it WITHOUT re-applying (AC3).
 *
 * Redis being unavailable, or any client error, NEVER fails the caller —
 * `claim()` degrades to `{claimed:true, degraded:true}` (proceed without
 * dedup, CS §10 "never 500", AC4).
 */
@Injectable()
export class IdempotencyStore {
  private readonly logger = new Logger(IdempotencyStore.name);

  constructor(private readonly redisService: RedisService) {}

  private buildKey(
    namespace: string,
    pageId: string,
    userId: string,
    key: string,
  ): string {
    return `${KEY_PREFIX}:${namespace}:${pageId}:${userId}:${key}`;
  }

  /**
   * Attempts to claim the idempotency slot. Returns `{claimed:true}` for
   * the first writer (or when Redis is unavailable — degraded, no dedup).
   * Returns `{claimed:false, result}` for a loser once the winner's result
   * has been recorded (or `undefined` result if the winner hasn't recorded
   * yet within the poll budget — the caller should treat this the same as
   * "already applied, no result to show").
   */
  async claim<T = unknown>(
    namespace: string,
    pageId: string,
    userId: string,
    key: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<IdempotencyClaim<T>> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return { claimed: true, degraded: true };
    }

    const redisKey = this.buildKey(namespace, pageId, userId, key);
    const pendingMarker = JSON.stringify({ pending: true });

    try {
      const setResult = await redis.set(
        redisKey,
        pendingMarker,
        'EX',
        ttlSeconds,
        'NX',
      );

      if (setResult === 'OK') {
        return { claimed: true, degraded: false };
      }

      // Lost the claim — someone else is (or already has) applied this
      // write. Poll briefly for their recorded result.
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        const raw = await redis.get(redisKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { pending: boolean; result?: T };
            if (!parsed.pending) {
              return { claimed: false, degraded: false, result: parsed.result };
            }
          } catch {
            // fall through and keep polling
          }
        }
        if (attempt < POLL_ATTEMPTS - 1) {
          await sleep(POLL_INTERVAL_MS);
        }
      }

      return { claimed: false, degraded: false };
    } catch (err) {
      this.logger.warn(
        `IdempotencyStore.claim degraded (Redis error): ${(err as Error).message}`,
      );
      return { claimed: true, degraded: true };
    }
  }

  /**
   * ENG-1652 fix pass 2 (AC3 poisoning) — releases a previously-claimed slot
   * WITHOUT recording a result, so a same-key retry can claim it afresh
   * (`SET NX` succeeds again) instead of polling forever for a `record()`
   * that will never come. Callers MUST invoke this when the write that
   * claimed the slot fails AFTER the claim but BEFORE `record()` (e.g. the
   * atomic CAS guard 409s inside the transaction) — otherwise the slot sits
   * pinned to `{pending:true}` for the full TTL and a retry silently
   * replays the page's current state as a false-success 200 (F1 honest-
   * state fix, ruling-5 no-silent-drop).
   *
   * Best-effort / never throws: Redis being unavailable here just means the
   * slot degrades the same way `claim()` already degrades (no dedup), which
   * is the existing "never 500" contract (CS §10).
   */
  async release(
    namespace: string,
    pageId: string,
    userId: string,
    key: string,
  ): Promise<void> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return;
    }

    const redisKey = this.buildKey(namespace, pageId, userId, key);
    try {
      await redis.del(redisKey);
    } catch (err) {
      this.logger.warn(
        `IdempotencyStore.release degraded (Redis error): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Records the winner's result so losers polling the same key observe it.
   * A no-op (best-effort) when Redis is unavailable or errors — never
   * throws, since the write it is recording has already succeeded.
   */
  async record<T = unknown>(
    namespace: string,
    pageId: string,
    userId: string,
    key: string,
    result: T,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    const redis = this.redisService.getOrNil();
    if (!redis) {
      return;
    }

    const redisKey = this.buildKey(namespace, pageId, userId, key);
    try {
      await redis.set(
        redisKey,
        JSON.stringify({ pending: false, result }),
        'EX',
        ttlSeconds,
      );
    } catch (err) {
      this.logger.warn(
        `IdempotencyStore.record degraded (Redis error): ${(err as Error).message}`,
      );
    }
  }
}
