import { CollaborationHandler } from './collaboration.handler';

/**
 * Bounded defense-in-depth for the cold-page edit hang (engine-side
 * connection resolution fix, 2026-07-13). The root cause (a same-row
 * transaction self-deadlock in `PageService.update`) is fixed at the
 * source, but `withYdocConnection` must never again be able to wedge a
 * request open indefinitely if some OTHER stall reappears in the
 * collaboration subsystem — it must fail fast and loud instead.
 */
describe('CollaborationHandler.withYdocConnection — bounded timeout', () => {
  it('rejects instead of hanging forever when openDirectConnection never resolves', async () => {
    jest.useFakeTimers();
    try {
      const handler = new CollaborationHandler({} as any);
      const neverResolves = new Promise(() => {
        /* simulates a stuck direct connection */
      });
      const hocuspocus = {
        openDirectConnection: jest.fn(() => neverResolves),
      } as any;

      const result = handler.withYdocConnection(
        hocuspocus,
        'page.cold-doc',
        {},
        () => undefined,
      );
      // Swallow the rejection on this promise so an unhandled-rejection
      // warning from the timer-driven reject doesn't leak past the assert
      // below (the assertion itself awaits the same promise).
      result.catch(() => undefined);

      await jest.advanceTimersByTimeAsync(15_000);

      await expect(result).rejects.toThrow(/timed out after 15000ms/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves normally well within the timeout for a fast connection', async () => {
    const handler = new CollaborationHandler({} as any);
    const disconnect = jest.fn(async () => undefined);
    const transact = jest.fn(async (fn: (doc: unknown) => void) => fn({}));
    const hocuspocus = {
      openDirectConnection: jest.fn(async () => ({ transact, disconnect })),
    } as any;

    await handler.withYdocConnection(hocuspocus, 'page.warm-doc', {}, () => {
      /* no-op mutation */
    });

    expect(transact).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
