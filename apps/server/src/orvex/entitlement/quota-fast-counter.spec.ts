// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { RedisService } from '@nestjs-labs/nestjs-ioredis';
import { QuotaFastCounter } from './quota-fast-counter';

/**
 * ENG-2490 — `QuotaFastCounter` behavioural suite (AC1's counter mechanics +
 * the declared Redis-loss degrade). The Redis double is behaviourally real
 * (get/set-EX/eval command semantics — the repo's miniredis-equivalent
 * pattern), never a mock of the counter's own logic (CS §5, ❌#4).
 */
describe('QuotaFastCounter (ENG-2490)', () => {
  class InMemoryRedis {
    store = new Map<string, string>();
    failing = false;

    private assertUp() {
      if (this.failing) {
        throw new Error('connection refused (simulated Redis outage)');
      }
    }

    async get(key: string): Promise<string | null> {
      this.assertUp();
      return this.store.has(key) ? this.store.get(key) : null;
    }

    async set(key: string, value: string): Promise<'OK'> {
      this.assertUp();
      this.store.set(key, value);
      return 'OK';
    }

    async eval(
      _script: string,
      _numKeys: number,
      key: string,
      delta: string,
    ): Promise<number | null> {
      this.assertUp();
      if (!this.store.has(key)) {
        return null;
      }
      const next = Number(this.store.get(key)) + Number(delta);
      this.store.set(key, String(next));
      return next;
    }
  }

  let redis: InMemoryRedis;
  let counter: QuotaFastCounter;
  let redisAbsent: boolean;

  beforeEach(() => {
    redis = new InMemoryRedis();
    redisAbsent = false;
    counter = new QuotaFastCounter({
      getOrNil: () => (redisAbsent ? null : redis),
    } as unknown as RedisService);
  });

  it('seed + get round-trips a real integer', async () => {
    await counter.seed('ws-1', 'pages', 7);
    await expect(counter.get('ws-1', 'pages')).resolves.toBe(7);
  });

  it('increment is conditional: an absent counter stays absent (no restart-at-zero cap bypass)', async () => {
    await counter.increment('ws-1', 'pages', 1);
    await expect(counter.get('ws-1', 'pages')).resolves.toBeNull();

    await counter.seed('ws-1', 'pages', 5);
    await counter.increment('ws-1', 'pages', 1);
    await expect(counter.get('ws-1', 'pages')).resolves.toBe(6);
  });

  it('currentUsage: counter miss falls back to truth ONCE, re-seeds, then reads O(1)', async () => {
    let truthCalls = 0;
    const truth = async () => {
      truthCalls += 1;
      return 42;
    };

    await expect(counter.currentUsage('ws-1', 'storage', truth)).resolves.toBe(42);
    expect(truthCalls).toBe(1);

    await expect(counter.currentUsage('ws-1', 'storage', truth)).resolves.toBe(42);
    expect(truthCalls).toBe(1); // counter hit — no second aggregate
  });

  it('degrade: Redis erroring never throws — reads fall back to truth, writes no-op', async () => {
    redis.failing = true;

    await expect(counter.get('ws-1', 'pages')).resolves.toBeNull();
    await expect(counter.seed('ws-1', 'pages', 3)).resolves.toBeUndefined();
    await expect(counter.increment('ws-1', 'pages', 1)).resolves.toBeUndefined();

    let truthCalls = 0;
    await expect(
      counter.currentUsage('ws-1', 'pages', async () => {
        truthCalls += 1;
        return 9;
      }),
    ).resolves.toBe(9);
    expect(truthCalls).toBe(1);
  });

  it('degrade: Redis unconfigured (getOrNil null) behaves identically', async () => {
    redisAbsent = true;

    await expect(counter.get('ws-1', 'files')).resolves.toBeNull();
    await expect(
      counter.currentUsage('ws-1', 'files', async () => 11),
    ).resolves.toBe(11);
  });

  it('a corrupted counter value degrades to null (truth fallback), never NaN', async () => {
    await redis.set('quota:pages:ws-1', 'not-a-number');
    await expect(counter.get('ws-1', 'pages')).resolves.toBeNull();
  });
});
