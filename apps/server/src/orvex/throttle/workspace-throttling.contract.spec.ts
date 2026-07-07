import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import { WorkspaceThrottlerGuard } from './workspace-throttler.guard';
import { resolveLimit } from './throttler-configs';
import {
  ALL_THROTTLER_NAMES,
  AI_CHAT_THROTTLER,
  USER_EXPORT_THROTTLER,
  SKIP_NON_EXPORT_THROTTLERS,
  __THROTTLER_NAMES_FOR_TESTS,
} from '../orvex-throttler-names';

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
 * TestWorkspaceThrottlingContract — the ENG-1436 named binary DoD gate
 * (§5a). Drives ONLY exported interfaces, crossing:
 *  (1) getTracker's workspace-key + IP-fallback behaviour;
 *  (2) resolveLimit's valid-override-floor + fail-safe-to-default matrix;
 *  (3) handleRequest passing the per-workspace effective limit to `super`;
 *  (4) throwThrottlingException's 429 body + Retry-After contract;
 *  (5) the skip-map registry-sync invariant.
 * Deterministic (no Date.now/rand); survives internal renames — it only
 * touches the guard's three overridden hooks, `resolveLimit`, and the
 * exported registry constants.
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

describe('TestWorkspaceThrottlingContract', () => {
  it('(1) getTracker keys by workspace and falls back to the IP tracker', async () => {
    const guard = buildGuard();
    await expect(
      guard.testGetTracker({ raw: { workspaceId: 'ws-1' } }),
    ).resolves.toBe('workspace:ws-1');

    const superGetTrackerSpy = jest
      .spyOn(ThrottlerGuard.prototype as unknown as SpyableGuard, 'getTracker')
      .mockResolvedValue('127.0.0.1');
    const ipTracker = await guard.testGetTracker({ ip: '127.0.0.1' });
    expect(ipTracker).not.toMatch(/^workspace:/);
    superGetTrackerSpy.mockRestore();
  });

  it('(2) resolveLimit floors a valid override and fails safe to default on malformed input', () => {
    expect(
      resolveLimit(AI_CHAT_THROTTLER, { ai: { throttle: { chatRpm: 42.9 } } }),
    ).toBe(42);

    for (const malformed of [0, -5, NaN, '120']) {
      expect(
        resolveLimit(AI_CHAT_THROTTLER, {
          ai: { throttle: { chatRpm: malformed } },
        }),
      ).toBe(180);
    }
    expect(resolveLimit(AI_CHAT_THROTTLER, null)).toBe(180);
    expect(resolveLimit(AI_CHAT_THROTTLER, undefined)).toBe(180);
  });

  it('(3) handleRequest passes the resolved per-workspace effective limit to super.handleRequest', async () => {
    const guard = buildGuard();
    const superHandleRequestSpy = jest
      .spyOn(ThrottlerGuard.prototype as unknown as SpyableGuard, 'handleRequest')
      .mockResolvedValue(true);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { workspace: { settings: { ai: { throttle: { chatRpm: 7 } } } } },
        }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as unknown as ExecutionContext;

    const requestProps = {
      context,
      limit: 180,
      ttl: 60_000,
      throttler: { name: AI_CHAT_THROTTLER, limit: 180, ttl: 60_000 },
      blockDuration: 60_000,
      getTracker: jest.fn(),
      generateKey: jest.fn(),
    } as unknown as ThrottlerRequest;

    await guard.testHandleRequest(requestProps);

    expect(superHandleRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 7 }),
    );
    superHandleRequestSpy.mockRestore();
  });

  it('(4) throwThrottlingException yields a 429 RATE_LIMITED body with a Retry-After header', async () => {
    const guard = buildGuard();
    const headerSpy = jest.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({ header: headerSpy }),
      }),
    } as unknown as ExecutionContext;

    let caught: unknown;
    try {
      await guard.testThrowThrottlingException(context, {
        limit: 180,
        ttl: 60_000,
        key: 'k',
        tracker: 'workspace:ws-1',
        totalHits: 181,
        timeToExpire: 42,
        isBlocked: true,
        timeToBlockExpire: 42,
      });
    } catch (err) {
      caught = err;
    }

    const httpException = caught as {
      getStatus(): number;
      getResponse(): unknown;
    };
    expect(httpException.getStatus()).toBe(429);
    expect(httpException.getResponse()).toMatchObject({
      error: 'RATE_LIMITED',
      retryAfter: 42,
    });
    expect(headerSpy).toHaveBeenCalledWith('Retry-After', '42');
  });

  it('(5) the skip-map registry-sync invariant holds against __THROTTLER_NAMES_FOR_TESTS', () => {
    expect([...__THROTTLER_NAMES_FOR_TESTS].sort()).toEqual(
      [...ALL_THROTTLER_NAMES].sort(),
    );
    expect(Object.keys(SKIP_NON_EXPORT_THROTTLERS).sort()).toEqual(
      [...ALL_THROTTLER_NAMES].filter((n) => n !== USER_EXPORT_THROTTLER).sort(),
    );
    expect(ALL_THROTTLER_NAMES.includes('linear_webhook')).toBe(false);
    expect(ALL_THROTTLER_NAMES.includes('linear_write')).toBe(false);
  });
});
