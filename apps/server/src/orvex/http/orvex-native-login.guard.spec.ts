import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { OrvexNativeLoginGuard } from './orvex-native-login.guard';

/**
 * ENG-1490 — `OrvexNativeLoginGuard` unit spec.
 *
 * Deep-module deletion test (CS §3.1 / dev-context 4e): the guard encodes
 * the `ORVEX_MODULES_ENABLED==='true' ∧ workspace.enforceSso===true`
 * decision — deleting it would silently re-open the native-login backdoor,
 * so this is NOT a pass-through. No mocks of own packages: the guard has no
 * collaborators (module-level env read + the request's own `workspace`), so
 * there is nothing to substitute.
 */
function fakeContext(workspace: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ raw: { workspace } }),
    }),
  } as unknown as ExecutionContext;
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
    const context = fakeContext({ id: 'ws1', enforceSso: true });

    let caught: unknown;
    try {
      guard.canActivate(context);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    const httpException = caught as ForbiddenException;
    expect(httpException.getStatus()).toBe(403);
    const body = httpException.getResponse() as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/sso.?enforced|native login disabled/i);
  });

  it('AC5 — vanilla mode (module flag unset) always allows native login through, regardless of enforceSso', () => {
    delete process.env.ORVEX_MODULES_ENABLED;
    const guard = new OrvexNativeLoginGuard();
    const context = fakeContext({ id: 'ws1', enforceSso: true });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('AC6 — module flag on but enforceSso false/absent still allows native login through', () => {
    process.env.ORVEX_MODULES_ENABLED = 'true';
    const guard = new OrvexNativeLoginGuard();

    expect(guard.canActivate(fakeContext({ id: 'ws1', enforceSso: false }))).toBe(
      true,
    );
    expect(guard.canActivate(fakeContext({ id: 'ws1' }))).toBe(true);
  });

  it('defensive: a missing workspace on the request never throws — resolves to the pass-through default', () => {
    process.env.ORVEX_MODULES_ENABLED = 'true';
    const guard = new OrvexNativeLoginGuard();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ raw: {} }) }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
