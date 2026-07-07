import { setAuthCookie } from './auth-cookie.helper';

describe('setAuthCookie', () => {
  it('AC1 — mints the authToken cookie with the exact shared options', () => {
    const setCookie = jest.fn();
    const res = { setCookie } as unknown as Parameters<typeof setAuthCookie>[0];
    const expires = new Date('2030-01-01T00:00:00.000Z');
    const env = {
      getCookieExpiresIn: jest.fn().mockReturnValue(expires),
      isHttps: jest.fn().mockReturnValue(true),
    };

    setAuthCookie(res, 'signed-jwt-token', env);

    expect(setCookie).toHaveBeenCalledTimes(1);
    expect(setCookie).toHaveBeenCalledWith('authToken', 'signed-jwt-token', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires,
      secure: true,
    });
  });

  it('AC8 — accepts a token + env only, no OIDC-specific payload shape', () => {
    const setCookie = jest.fn();
    const res = { setCookie } as unknown as Parameters<typeof setAuthCookie>[0];
    const env = {
      getCookieExpiresIn: jest.fn().mockReturnValue(new Date()),
      isHttps: jest.fn().mockReturnValue(false),
    };

    // A hypothetical future caller (e.g. the identity-callback mint landing)
    // needs nothing more than a plain token string + the env port.
    expect(() => setAuthCookie(res, 'another-token', env)).not.toThrow();
    expect(setCookie).toHaveBeenCalledWith(
      'authToken',
      'another-token',
      expect.objectContaining({ secure: false }),
    );
  });
});
