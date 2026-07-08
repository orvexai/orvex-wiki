import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * ENG-1434 review2 F1 — the api-key CLIENT identity threaded by
 * {@link JwtStrategy.validateApiKey} (`request.user.apiKeyId`). Mirrors
 * `AuthMethod`: read-only, `undefined` for a real human browser/cookie
 * session (which never carries an `apiKeyId` claim).
 */
export const AuthApiKeyId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return typeof request?.user?.apiKeyId === 'string'
      ? request.user.apiKeyId
      : undefined;
  },
);
