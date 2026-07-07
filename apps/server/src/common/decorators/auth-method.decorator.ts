import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * ENG-1447 (AC5) — the auth-method marker threaded by {@link JwtStrategy}.
 * `'api_key'` for a REST-API-key-authenticated caller, `undefined` for a
 * real human browser/cookie session. Read-only: mirrors `AuthTokenScope`.
 */
export const AuthMethod = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): 'api_key' | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request?.user?.authMethod === 'api_key' ? 'api_key' : undefined;
  },
);
