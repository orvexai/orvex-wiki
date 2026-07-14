import { FastifyReply } from 'fastify';
import { EnvironmentService } from '../../integrations/environment/environment.service';

/**
 * setAuthCookie — the single, shared session-mint chokepoint (ENG-1409 AC1).
 *
 * Mints the identical `authToken` httpOnly cookie for EVERY caller that hands
 * this landing a signed session token: today the password-login path
 * (`AuthController.login`) and the password-reset path
 * (`AuthController.passwordReset`); once `oidc-identity-rp` lands in
 * orvex-studio-identity, the identity-callback landing will call this exact
 * same helper with the token it receives from the verified-principal
 * exchange (AC8) — this helper takes only a token + env, never anything
 * OIDC-specific, so it does not hard-code an OIDC-only assumption.
 *
 * `setAuthCookie` is a shared helper with >=2 real callers, not a
 * pass-through (CS ❌#7) — it centralizes the cookie option set (httpOnly,
 * sameSite, path, secure, expires) so it can only ever be set in one place.
 */
export function setAuthCookie(
  res: FastifyReply,
  token: string,
  env: Pick<EnvironmentService, 'getCookieExpiresIn' | 'isHttps'>,
): void {
  res.setCookie('authToken', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: env.getCookieExpiresIn(),
    secure: env.isHttps(),
  });
}
