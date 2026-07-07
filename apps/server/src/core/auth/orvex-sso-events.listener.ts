import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserSessionRepo } from '../../database/repos/session/user-session.repo';

/**
 * OrvexSsoEventsListener — ported from the fork at pin
 * `050187676624f2395c55b36ec60e365f87fd4a9f`
 * (`apps/server/src/core/auth/orvex-sso-events.listener.ts#L5-L18`).
 *
 * Handles `orvex.enforce_sso.toggled` (emitted by
 * `OrvexEnforceSsoCheckService.invalidateAllMemberSessions`) by delegating the
 * actual session-store mutation to `UserSessionRepo` — the one confined
 * session-store adapter (CS §3.2 one-adapter rule). ENG-1432 AC9.
 *
 * `UserSessionRepo` is injected via `@Optional()` (same seam-decoupling
 * pattern as the rest of this feature's seams, CS ❌#8): in the real app
 * `DatabaseModule` is `@Global()` and it is always resolvable; `@Optional()`
 * only matters for a graph that mounts this listener without the database
 * tier, where it degrades to a logged warning (never a crash, AC11 spirit)
 * instead of failing DI resolution.
 */
export type OrvexEnforceSsoToggledEvent = { workspaceId: string };

@Injectable()
export class OrvexSsoEventsListener {
  private readonly logger = new Logger(OrvexSsoEventsListener.name);

  constructor(@Optional() private readonly userSessionRepo?: UserSessionRepo) {}

  @OnEvent('orvex.enforce_sso.toggled')
  async handleEnforceSsoToggled(
    event: OrvexEnforceSsoToggledEvent,
  ): Promise<void> {
    if (!this.userSessionRepo) {
      this.logger.warn(
        `UserSessionRepo unavailable — cannot force-revoke sessions for workspace ${event.workspaceId}; they will expire at their natural TTL.`,
      );
      return;
    }
    await this.userSessionRepo.revokeByWorkspaceId(event.workspaceId);
  }
}
