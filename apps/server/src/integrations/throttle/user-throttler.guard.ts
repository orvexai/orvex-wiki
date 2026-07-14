import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// ENG-1473 fix: JwtStrategy.validate() returns { user, workspace } (see
// core/auth/strategies/jwt.strategy.ts + the AuthUser decorator, which reads
// `request.user.user`), so the authenticated user id lives at
// `req.user.user.id` — NOT `req.user.id`. The previous shape here never
// matched a real request, so every call silently fell through to the
// IP-based tracker (no functional consumer existed yet to surface this).
// This is this guard's first real consumer (the ENG-1473 export route) —
// fixed here so per-user throttling actually tracks per user.
type AuthedRequest = { user?: { user?: { id?: string }; id?: string } };

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: AuthedRequest): Promise<string> {
    const userId = req.user?.user?.id ?? req.user?.id;
    if (userId) return `user:${userId}`;
    return super.getTracker(req as Parameters<ThrottlerGuard['getTracker']>[0]);
  }
}
