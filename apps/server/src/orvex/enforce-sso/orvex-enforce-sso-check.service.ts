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
 * LIVE as of ENG-1409: `AuthController.login` now calls `checkOrThrow` BEFORE
 * credential verification (AC2/AC3/AC4). Corrects the prior ENG-1432 doc
 * comment, which deferred that wiring to ENG-1490 — this ticket (which
 * ENG-1490 depends on) delivers it instead.
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
  /** The real `workspaces.enforceSso` column (AC2/AC3/AC4). */
  enforceSso?: boolean | null;
  /**
   * Back-compat: the orvex settings-jsonb mirror, checked as a fallback.
   * Typed `unknown` because the real `Workspace` entity's `settings` column
   * is a generic `JsonValue`, not this feature's narrow shape — read
   * defensively via {@link readSettingsEnforceSso}.
   */
  settings?: unknown;
};

/** Optional request context threaded through to the audit row (AC2). */
export type OrvexSsoCheckContext = {
  ipAddress?: string;
  userAgent?: string;
};

/** Defensive read of `settings.oidc.enforceSso` from an untyped jsonb value. */
function readSettingsEnforceSso(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const oidc = (settings as Record<string, unknown>).oidc;
  if (!oidc || typeof oidc !== 'object') return false;
  return (oidc as Record<string, unknown>).enforceSso === true;
}

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
   * `enforceSso` enabled. Resolves silently when enforceSso is off, or the
   * resolved member is exempt (owner/admin) — AC3. Otherwise throws
   * `SSO_REQUIRED` and audits `OIDC_LOGIN_BLOCKED_BY_ENFORCE_SSO`, INCLUDING
   * when the member cannot be resolved at all (defensive null-role path,
   * AC4) — an unresolvable principal under enforced SSO is blocked here,
   * not silently waved through to the normal auth path.
   */
  async checkOrThrow(
    workspace: OrvexWorkspaceForSsoCheck,
    email: string,
    ctx?: OrvexSsoCheckContext,
  ): Promise<void> {
    const enforceSso =
      workspace.enforceSso ?? readSettingsEnforceSso(workspace.settings);
    if (!enforceSso) {
      return;
    }

    const member = await this.memberLookup.findMemberRole(
      workspace.id,
      email,
    );

    if (member && isExemptFromSso(member.role)) {
      return;
    }

    const userRole = member?.role ?? null;

    await this.auditService.logWithContext(
      {
        event: AuditEvent.OIDC_LOGIN_BLOCKED_BY_ENFORCE_SSO,
        resourceType: AuditResource.WORKSPACE,
        resourceId: workspace.id,
        metadata: { attemptedEmail: email, userRole },
      },
      {
        workspaceId: workspace.id,
        actorId: member?.id,
        actorType: 'user',
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
      },
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
