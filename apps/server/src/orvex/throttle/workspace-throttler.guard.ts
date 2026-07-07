import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerRequest,
} from '@nestjs/throttler';
import { lookupConfig, resolveLimit } from './throttler-configs';

/**
 * WorkspaceThrottlerGuard — per-workspace rate limiting, ported for the
 * standalone `orvex-wiki` engine. ENG-1436 (fork pin
 * `050187676624f2395c55b36ec60e365f87fd4a9f`,
 * `packages/orvex-extensions/src/throttle/workspace-throttler.guard.ts#L1-L68`).
 *
 * Overrides exactly the three framework hooks it needs (CS §3 deep-module —
 * small surface, real behaviour change, not a pass-through):
 *  - `getTracker` — keys by `workspace:<id>`, falling back to the framework
 *    IP tracker only when no workspace is on the request (AC1-AC3).
 *  - `handleRequest` — resolves the per-workspace effective limit via
 *    `resolveLimit` before delegating to `super.handleRequest` (AC8, AC10,
 *    AC11).
 *  - `throwThrottlingException` — reshapes the 429 into the stable
 *    `{error:'RATE_LIMITED',retryAfter,limit,ttl}` contract with a
 *    `Retry-After` header (AC7).
 *
 * The guard owns no store — the `@nestjs/throttler` storage (Redis in prod)
 * is injected by the framework via `super`; it is never constructed here
 * (CS ❌8).
 */
type WorkspaceAwareRequest = {
  raw?: { workspaceId?: string };
  user?: { workspace?: { id?: string; settings?: unknown } };
};

@Injectable()
export class WorkspaceThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: WorkspaceAwareRequest): Promise<string> {
    const workspaceId = req.raw?.workspaceId ?? req.user?.workspace?.id;
    if (workspaceId) {
      return `workspace:${workspaceId}`;
    }
    return super.getTracker(
      req as Parameters<ThrottlerGuard['getTracker']>[0],
    );
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const config = lookupConfig(requestProps.throttler.name ?? '');
    if (!config) {
      // AC10 — an unknown throttler name is a no-op override: delegate
      // unchanged, no crash.
      return super.handleRequest(requestProps);
    }

    const { req } = this.getRequestResponse(requestProps.context);
    const workspaceSettings = (req as WorkspaceAwareRequest).user?.workspace
      ?.settings;
    // AC11 — a request context missing `user.workspace` entirely degrades to
    // the config default via resolveLimit(config.name, undefined); never
    // throws.
    const limit = resolveLimit(config.name, workspaceSettings);

    return super.handleRequest({ ...requestProps, limit });
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const { limit, ttl, timeToExpire } = throttlerLimitDetail;
    const retryAfter = timeToExpire;

    res.header('Retry-After', String(retryAfter));

    throw new HttpException(
      { error: 'RATE_LIMITED', retryAfter, limit, ttl },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
