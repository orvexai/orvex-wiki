import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenScope } from '../../core/api-key/api-key.service';

/**
 * ENG-1380 / AC11 — the identity-verified token-scope marker threaded by
 * {@link JwtStrategy}. Read-only: this engine never mints or catalogs scope
 * values, it only reads the claim through to the escalation guard.
 */
export const AuthTokenScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenScope => {
    const request = ctx.switchToHttp().getRequest();
    return request?.user?.tokenScope === 'restricted' ? 'restricted' : 'full';
  },
);
