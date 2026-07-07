import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_SERVICE, IAuditService } from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

/**
 * OrvexEnforceSsoCheckService — ported from the fork at pin
 * `050187676624f2395c55b36ec60e365f87fd4a9f`
 * (`packages/orvex-extensions/src/orvex-enforce-sso/orvex-enforce-sso-check.service.ts#L30-L141`).
 *
 * Deep module (CS §3): composes a member-role lookup + an exemption predicate
 * + an audit write + a throw. Deleting it removes real behaviour (it is not a
 * pass-through). `EventEmitter2` is injected once at the seam via
 * `@Optional()` — never constructed inline (❌#8) — so the in-process
 * `orvex.enforce_sso.toggled` event degrades gracefully (AC11) when the event
 * module is not wired.
 *
 * NOT YET CALLED live: no login/auth controller invokes `checkOrThrow` today
 * (ENG-1432 review #1, finding F1/F1c) — the `403 SSO_REQUIRED` gate below
 * describes intended behaviour once called, not a delivered live path. Login
 * wiring is deferred to ENG-1490.
 */

export const ORVEX_MEMBER_LOOKUP = Symbol('ORVEX_MEMBER_LOOKUP');

export type OrvexMemberRole = { id: string; role: string };

/** The confined, single lookup adapter this service depends on (CS §4f). */
export interface OrvexMemberLookup {
  findMemberRole(
    workspaceId: string,
    email: string,
  ): Promise<OrvexMemberRole | undefined>;
}

const EXEMPT_ROLES = new Set(['owner', 'admin']);

/** module-level predicate — no I/O, no instance state. */
export function isExemptFromSso(role: string): boolean {
  return EXEMPT_ROLES.has(role);
}

export type OrvexWorkspaceForSsoCheck = {
  id: string;
  settings?: { oidc?: { enforceSso?: boolean } } | null;
};

@Injectable()
export class OrvexEnforceSsoCheckService {
  private readonly logger = new Logger(OrvexEnforceSsoCheckService.name);

  constructor(
    @Inject(ORVEX_MEMBER_LOOKUP) private readonly memberLookup: OrvexMemberLookup,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  /**
   * Refuses password/OIDC login for a non-exempt member of a workspace with
   * `enforceSso` enabled. Resolves silently when enforceSso is off, the user
   * cannot be resolved (fails open on lookup miss — a genuinely unknown
   * principal is rejected by the normal auth path, not this gate), or the
   * user is exempt (owner/admin). AC7, AC8.
   */
  async checkOrThrow(
    workspace: OrvexWorkspaceForSsoCheck,
    email: string,
  ): Promise<void> {
    if (!workspace.settings?.oidc?.enforceSso) {
      return;
    }

    const member = await this.memberLookup.findMemberRole(
      workspace.id,
      email,
    );
    if (!member || isExemptFromSso(member.role)) {
      return;
    }

    await this.auditService.logWithContext(
      {
        event: AuditEvent.OIDC_LOGIN_BLOCKED_BY_ENFORCE_SSO,
        resourceType: AuditResource.USER,
        resourceId: member.id,
      },
      { workspaceId: workspace.id, actorId: member.id },
    );

    throw new ForbiddenException({ error: 'SSO_REQUIRED' });
  }

  /**
   * Invalidates all non-admin member sessions for a workspace by emitting
   * `orvex.enforce_sso.toggled`, which `OrvexSsoEventsListener` handles by
   * calling `UserSessionRepo.revokeByWorkspaceId`. AC9.
   *
   * NFR/operability (AC11): when `EventEmitter2` is not provided (module not
   * wired), this logs a warning and resolves without throwing — sessions
   * simply expire at their natural TTL. Never a 500, never a white-screen.
   */
  async invalidateAllMemberSessions(workspaceId: string): Promise<void> {
    if (!this.eventEmitter) {
      this.logger.warn(
        `EventEmitter2 unavailable — enforce-SSO toggle for workspace ${workspaceId} will not force-revoke sessions; they will expire at their natural TTL.`,
      );
      return;
    }

    this.eventEmitter.emit('orvex.enforce_sso.toggled', { workspaceId });
  }
}
