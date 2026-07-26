import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { OrvexNativeLoginGuard } from './orvex-native-login.guard';

/**
 * ENG-1490 — `OrvexNativeLoginGuard` unit spec, updated by ENG-2499 (FR-W6
 * AC3: native login removed FULLY under the fold-in — no break-glass).
 *
 * Deep-module deletion test (CS §3.1 / dev-context 4e): the guard encodes
 * the `ORVEX_MODULES_ENABLED==='true'` fail-closed decision — deleting it
 * would silently re-open the native-login backdoor on the hosted platform,
 * so this is NOT a pass-through. No mocks of own packages: the guard has no
 * collaborators (a module-level env read), so there is nothing to
 * substitute.
 *
 * NOTE on numbering: AC1/AC5/AC6 below are THIS spec's own historical
 * (ENG-1490) case numbering, not ENG-2499's issue-level AC lettering. AC5
 * (vanilla/flag-off byte-parity) is intentionally UNMODIFIED by ENG-2499's
 * tightening — its continued pass is the T7 regression guard.
 */
function fakeContext(workspace: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ raw: { workspace } }),
    }),
  } as unknown as ExecutionContext;
}

function expectRejects(
  guard: OrvexNativeLoginGuard,
  context: ExecutionContext,
) {
  let caught: unknown;
  try {
    guard.canActivate(context);
  } catch (err) {
    caught = err;
  }

  expect(caught).toBeInstanceOf(ForbiddenException);
  const httpException = caught as ForbiddenException;
  expect(httpException.getStatus()).toBe(403);
  const body = httpException.getResponse() as {
    success: boolean;
    message: string;
  };
  expect(body.success).toBe(false);
  expect(body.message).toMatch(/sso.?enforced|native login disabled/i);
}

describe('OrvexNativeLoginGuard', () => {
  const ORIGINAL_FLAG = process.env.ORVEX_MODULES_ENABLED;

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.ORVEX_MODULES_ENABLED;
    } else {
      process.env.ORVEX_MODULES_ENABLED = ORIGINAL_FLAG;
    }
  });

  it('AC1 — rejects fail-closed when the module flag is on AND enforceSso is true', () => {
    process.env.ORVEX_MODULES_ENABLED = 'true';
    const guard = new OrvexNativeLoginGuard();

    expectRejects(guard, fakeContext({ id: 'ws1', enforceSso: true }));
  });

  it('AC5 — vanilla mode (module flag unset) always allows native login through, regardless of enforceSso', () => {
    delete process.env.ORVEX_MODULES_ENABLED;
    const guard = new OrvexNativeLoginGuard();
    const context = fakeContext({ id: 'ws1', enforceSso: true });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('AC6 (ENG-2499 tightened) — module flag on with enforceSso false/absent now ALSO rejects: full removal, no default-open break-glass', () => {
    process.env.ORVEX_MODULES_ENABLED = 'true';
    const guard = new OrvexNativeLoginGuard();

    expectRejects(guard, fakeContext({ id: 'ws1', enforceSso: false }));
    expectRejects(guard, fakeContext({ id: 'ws1' }));
  });

  it('ENG-2499 — flag on with NO resolvable workspace rejects fail-closed (removal no longer depends on workspace resolution)', () => {
    process.env.ORVEX_MODULES_ENABLED = 'true';
    const guard = new OrvexNativeLoginGuard();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ raw: {} }) }),
    } as unknown as ExecutionContext;

    expectRejects(guard, context);
  });

  it('vanilla mode (flag off) with no workspace still passes through — flag-off byte-parity holds on every shape', () => {
    delete process.env.ORVEX_MODULES_ENABLED;
    const guard = new OrvexNativeLoginGuard();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ raw: {} }) }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
