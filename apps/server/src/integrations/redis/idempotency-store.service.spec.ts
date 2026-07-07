import { IdempotencyStore } from './idempotency-store.service';

/**
 * A miniredis-analogue: an in-memory fake implementing exactly the ioredis
 * surface `IdempotencyStore` calls (`set` with NX/EX, `get`) — a real
 * command-semantics replay, not hand-authored verdicts (CS §5 4f).
 */
class FakeRedisClient {
  private store = new Map<string, { value: string; expiresAt: number }>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt !== Infinity && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<'OK' | null> {
    const exIdx = args.indexOf('EX');
    const ttlSeconds = exIdx >= 0 ? Number(args[exIdx + 1]) : undefined;
    const nx = args.includes('NX');

    if (nx && !this.isExpired(key)) {
      return null;
    }

    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity,
    });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    return this.store.get(key)!.value;
  }
}

class ThrowingRedisClient {
  async set(): Promise<never> {
    throw new Error('ECONNREFUSED');
  }
  async get(): Promise<never> {
    throw new Error('ECONNREFUSED');
  }
}

function storeWith(client: unknown): IdempotencyStore {
  const redisServiceStub = { getOrNil: () => client } as any;
  return new IdempotencyStore(redisServiceStub);
}

describe('IdempotencyStore', () => {
  it('AC3: first-claim-wins — the first caller for a key is claimed', async () => {
    const store = storeWith(new FakeRedisClient());

    const claim = await store.claim('page-write', 'page-1', 'user-1', 'key-1');

    expect(claim).toEqual({ claimed: true, degraded: false });
  });

  it('AC3: the loser does NOT re-apply and returns the winner\'s recorded result', async () => {
    const client = new FakeRedisClient();
    const store = storeWith(client);

    const winner = await store.claim(
      'page-write',
      'page-1',
      'user-1',
      'key-1',
    );
    expect(winner.claimed).toBe(true);

    await store.record('page-write', 'page-1', 'user-1', 'key-1', {
      pageId: 'page-1',
      version: 2,
    });

    const loser = await store.claim('page-write', 'page-1', 'user-1', 'key-1');

    expect(loser.claimed).toBe(false);
    expect(loser.degraded).toBe(false);
    expect(loser.result).toEqual({ pageId: 'page-1', version: 2 });
  });

  it('keys are scoped by namespace + pageId + userId + key — no cross-user collision', async () => {
    const client = new FakeRedisClient();
    const store = storeWith(client);

    const first = await store.claim('page-write', 'page-1', 'user-A', 'key-1');
    const second = await store.claim(
      'page-write',
      'page-1',
      'user-B',
      'key-1',
    );

    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(true); // different user -> different slot
  });

  it('AC4: degrades to {claimed:true, degraded:true} when there is no Redis client', async () => {
    const store = storeWith(null);

    const claim = await store.claim('page-write', 'page-1', 'user-1', 'key-1');

    expect(claim).toEqual({ claimed: true, degraded: true });
  });

  it('AC4: degrades (never throws) when SET throws', async () => {
    const store = storeWith(new ThrowingRedisClient());

    const claim = await store.claim('page-write', 'page-1', 'user-1', 'key-1');

    expect(claim).toEqual({ claimed: true, degraded: true });
  });

  it('AC4: record() never throws when there is no client or the client errors', async () => {
    const noClientStore = storeWith(null);
    const throwingStore = storeWith(new ThrowingRedisClient());

    await expect(
      noClientStore.record('page-write', 'page-1', 'user-1', 'key-1', {}),
    ).resolves.toBeUndefined();
    await expect(
      throwingStore.record('page-write', 'page-1', 'user-1', 'key-1', {}),
    ).resolves.toBeUndefined();
  });
});
