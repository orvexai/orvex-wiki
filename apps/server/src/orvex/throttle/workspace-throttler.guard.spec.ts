import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import { WorkspaceThrottlerGuard } from './workspace-throttler.guard';
import { AI_CHAT_THROTTLER } from '../orvex-throttler-names';

/**
 * Narrow spy target used ONLY to type `jest.spyOn(ThrottlerGuard.prototype, ...)`
 * against the framework's protected hooks without `any` (root eslint config
 * flags `@typescript-eslint/no-explicit-any`).
 */
interface SpyableGuard {
  getTracker(req: unknown): Promise<string>;
  handleRequest(requestProps: unknown): Promise<boolean>;
}

/**
 * TestableGuard — exposes the protected framework hooks so the RED->GREEN
 * assertions can drive them directly (CS §5f: subclass the real guard,
 * assert real return values; never `jest.mock('@orvex/extensions')`, ❌#4).
 */
class TestableGuard extends WorkspaceThrottlerGuard {
  public testGetTracker(req: unknown) {
    return this.getTracker(req as Parameters<ThrottlerGuard['getTracker']>[0]);
  }
  public testHandleRequest(requestProps: ThrottlerRequest) {
    return this.handleRequest(requestProps);
  }
  public testThrowThrottlingException(
    context: ExecutionContext,
    detail: Parameters<ThrottlerGuard['throwThrottlingException']>[1],
  ) {
    return this.throwThrottlingException(context, detail);
  }
}

function buildGuard(storageService = { increment: jest.fn() }): TestableGuard {
  const options = { throttlers: [{ name: AI_CHAT_THROTTLER, ttl: 60_000, limit: 180 }] };
  const reflector = { getAllAndOverride: jest.fn() };
  return new TestableGuard(
    options as never,
    storageService as never,
    reflector as never,
  );
}

function fakeContext(req: unknown, res: { header: jest.Mock }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('WorkspaceThrottlerGuard', () => {
  describe('getTracker', () => {
    it('AC1 — keys by workspace when req.raw.workspaceId is present', async () => {
      const guard = buildGuard();
      const tracker = await guard.testGetTracker({ raw: { workspaceId: 'ws-1' } });
      expect(tracker).toBe('workspace:ws-1');
    });

    it('AC2 — falls back to user.workspace.id', async () => {
      const guard = buildGuard();
      const tracker = await guard.testGetTracker({
        user: { workspace: { id: 'ws-2' } },
      });
      expect(tracker).toBe('workspace:ws-2');
    });

    it('AC3 — falls back to the framework IP tracker when no workspace is on the request', async () => {
      const guard = buildGuard();
      const superGetTrackerSpy = jest
        .spyOn(ThrottlerGuard.prototype as unknown as SpyableGuard, 'getTracker')
        .mockResolvedValue('127.0.0.1');

      const tracker = await guard.testGetTracker({ ip: '127.0.0.1' });

      expect(tracker).not.toMatch(/^workspace:/);
      expect(superGetTrackerSpy).toHaveBeenCalled();
      superGetTrackerSpy.mockRestore();
    });
  });

  describe('handleRequest', () => {
    it('AC8 — resolves the per-workspace effective limit and passes it to super.handleRequest', async () => {
      const guard = buildGuard();
      const superHandleRequestSpy = jest
        .spyOn(ThrottlerGuard.prototype as unknown as SpyableGuard, 'handleRequest')
        .mockResolvedValue(true);

      const req = { user: { workspace: { settings: { ai: { throttle: { chatRpm: 5 } } } } } };
      const context = fakeContext(req, { header: jest.fn() });
      const requestProps = {
        context,
        limit: 180,
        ttl: 60_000,
        throttler: { name: AI_CHAT_THROTTLER, limit: 180, ttl: 60_000 },
        blockDuration: 60_000,
        getTracker: jest.fn(),
        generateKey: jest.fn(),
      } as unknown as ThrottlerRequest;

      const result = await guard.testHandleRequest(requestProps);

      expect(result).toBe(true);
      expect(superHandleRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 }),
      );
      superHandleRequestSpy.mockRestore();
    });

    it('AC10 — an unknown throttler name delegates unchanged (no override, no crash)', async () => {
      const guard = buildGuard();
      const superHandleRequestSpy = jest
        .spyOn(ThrottlerGuard.prototype as unknown as SpyableGuard, 'handleRequest')
        .mockResolvedValue(true);

      const context = fakeContext({ user: {} }, { header: jest.fn() });
      const requestProps = {
        context,
        limit: 99,
        ttl: 60_000,
        throttler: { name: 'unknown', limit: 99, ttl: 60_000 },
        blockDuration: 60_000,
        getTracker: jest.fn(),
        generateKey: jest.fn(),
      } as unknown as ThrottlerRequest;

      const result = await guard.testHandleRequest(requestProps);

      expect(result).toBe(true);
      expect(superHandleRequestSpy).toHaveBeenCalledWith(requestProps);
      superHandleRequestSpy.mockRestore();
    });

    it('AC11 — a request context missing user.workspace entirely degrades to the default limit, never throws', async () => {
      const guard = buildGuard();
      const superHandleRequestSpy = jest
        .spyOn(ThrottlerGuard.prototype as unknown as SpyableGuard, 'handleRequest')
        .mockResolvedValue(true);

      const context = fakeContext({}, { header: jest.fn() });
      const requestProps = {
        context,
        limit: 180,
        ttl: 60_000,
        throttler: { name: AI_CHAT_THROTTLER, limit: 180, ttl: 60_000 },
        blockDuration: 60_000,
        getTracker: jest.fn(),
        generateKey: jest.fn(),
      } as unknown as ThrottlerRequest;

      await expect(guard.testHandleRequest(requestProps)).resolves.toBe(true);
      expect(superHandleRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 180 }),
      );
      superHandleRequestSpy.mockRestore();
    });
  });

  describe('retry-after timing', () => {
    it('refuses requests during the throttle window with 429 + Retry-After, then accepts after expiry', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));

      try {
        const windows = new Map<
          string,
          { expiresAt: number; blockedUntil: number; totalHits: number }
        >();
        const storageService = {
          increment: jest.fn(
            async (
              key: string,
              ttl: number,
              limit: number,
              blockDuration: number,
            ) => {
              const now = Date.now();
              let window = windows.get(key);
              if (!window || window.expiresAt <= now) {
                window = {
                  expiresAt: now + ttl,
                  blockedUntil: 0,
                  totalHits: 0,
                };
              }

              window.totalHits += 1;
              if (window.totalHits > limit && window.blockedUntil <= now) {
                window.blockedUntil = now + blockDuration;
              }
              windows.set(key, window);

              return {
                totalHits: window.totalHits,
                timeToExpire: Math.max(0, window.expiresAt - now),
                isBlocked:
                  window.blockedUntil > now || window.totalHits > limit,
                timeToBlockExpire: Math.max(0, window.blockedUntil - now),
              };
            },
          ),
        };
        const guard = buildGuard(storageService);
        await guard.onModuleInit();
        const headerSpy = jest.fn();
        const req = {
          user: {
            workspace: {
              id: 'ws-retry',
              settings: { ai: { throttle: { chatRpm: 1 } } },
            },
          },
        };
        const context = fakeContext(req, { header: headerSpy });
        const requestProps = {
          context,
          limit: 180,
          ttl: 1_000,
          throttler: {
            name: AI_CHAT_THROTTLER,
            limit: 180,
            ttl: 1_000,
            setHeaders: false,
          },
          blockDuration: 1_000,
          getTracker: jest.fn(async () => 'workspace:ws-retry'),
          generateKey: jest.fn(() => 'workspace:ws-retry:retry-window'),
        } as unknown as ThrottlerRequest;

        await expect(guard.testHandleRequest(requestProps)).resolves.toBe(true);

        let caught: unknown;
        try {
          await guard.testHandleRequest(requestProps);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeDefined();
        const httpException = caught as {
          getStatus(): number;
          getResponse(): unknown;
        };
        expect(httpException.getStatus()).toBe(429);
        expect(httpException.getResponse()).toMatchObject({
          error: 'RATE_LIMITED',
          retryAfter: 1_000,
          limit: 1,
          ttl: 1_000,
        });
        expect(headerSpy).toHaveBeenCalledWith('Retry-After', '1000');

        jest.advanceTimersByTime(1_000);
        await expect(guard.testHandleRequest(requestProps)).resolves.toBe(true);
        expect(storageService.increment).toHaveBeenCalledTimes(3);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('throwThrottlingException', () => {
    it('AC7 — sets Retry-After and throws a 429 with the RATE_LIMITED body contract', async () => {
      const guard = buildGuard();
      const headerSpy = jest.fn();
      const context = fakeContext({}, { header: headerSpy });
      const detail = {
        limit: 180,
        ttl: 60_000,
        key: 'k',
        tracker: 'workspace:ws-1',
        totalHits: 181,
        timeToExpire: 42,
        isBlocked: true,
        timeToBlockExpire: 42,
      };

      let caught: unknown;
      try {
        await guard.testThrowThrottlingException(context, detail);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      const httpException = caught as {
        getStatus(): number;
        getResponse(): unknown;
      };
      expect(httpException.getStatus()).toBe(429);
      expect(httpException.getResponse()).toMatchObject({
        error: 'RATE_LIMITED',
        retryAfter: 42,
        limit: 180,
        ttl: 60_000,
      });
      expect(headerSpy).toHaveBeenCalledWith('Retry-After', '42');
    });
  });
});
