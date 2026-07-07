import { Reflector } from '@nestjs/core';
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';
import { UserExportController } from './user-export.controller';
import {
  ALL_THROTTLER_NAMES,
  USER_EXPORT_THROTTLER,
} from '../../orvex/orvex-throttler-names';

/**
 * ENG-1436 fix-pass-1 (review F1) — RED->GREEN regression gate.
 *
 * The export route must be preempted-throttler-free against the SAME
 * canonical registry `throttle.module.ts` actually registers the
 * `throttlers` array from (`orvex/orvex-throttler-names.ALL_THROTTLER_NAMES`
 * — CS §5c single source). Before this fix the route imported a SECOND,
 * stale skip-map (`integrations/throttle/throttler-names.ts`, frozen at
 * {auth, ai-chat}) that predates `mcp_tool`'s registration — so a real
 * request to `POST /users/me/export` was gated by the shared `mcp_tool`
 * 120/60s counter ahead of its own 5/hour budget, silently reintroducing
 * the exact preemption AC9 exists to rule out. Reading the REAL
 * `@SkipThrottle` metadata off the controller method (not re-deriving it)
 * is what makes this test fail on the bug and pass only once the route is
 * repointed at the single canonical registry.
 */
describe('UserExportController route throttle skip-map (F1 regression)', () => {
  it('skips every canonical throttler except its own dedicated one', () => {
    const reflector = new Reflector();
    const handler = UserExportController.prototype.exportUserData;

    const skipped = ALL_THROTTLER_NAMES.filter(
      (name) => reflector.get(THROTTLER_SKIP + name, handler) === true,
    );

    expect(skipped.sort()).toEqual(
      [...ALL_THROTTLER_NAMES]
        .filter((name) => name !== USER_EXPORT_THROTTLER)
        .sort(),
    );
    // Explicitly pin the regression: mcp_tool must be in the skip set.
    expect(skipped.includes('mcp_tool')).toBe(true);
  });
});
