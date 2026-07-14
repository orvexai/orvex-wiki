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

function buildGuard(): TestableGuard {
  const options = { throttlers: [{ name: AI_CHAT_THROTTLER, ttl: 60_000, limit: 180 }] };
  const storageService = { increment: jest.fn() };
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
