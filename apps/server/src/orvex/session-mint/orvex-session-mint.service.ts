// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { isUserDisabled } from '../../common/helpers';
import { SessionService } from '../../core/session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  IDENTITY_INTROSPECTOR,
  IdentityIntrospector,
} from './identity-introspector';

/** The minted engine session the controller turns into a cookie + result body. */
export interface MintedSession {
  /** The engine ACCESS JWT — set as the `authToken` session cookie. */
  readonly accessToken: string;
  /** The identity subject the session was minted for (contract `sub`). */
  readonly sub: string;
  /** The workspace the session is scoped to (contract `workspaceId`). */
  readonly workspaceId: string;
  /** Session expiry, bounded by the engine cookie TTL (contract `expiresAt`). */
  readonly expiresAt: Date;
}

/**
 * OrvexSessionMintService (FR-W6 / A-AUTH) — consume an identity-minted exchange
 * token and mint an ENGINE session for the RESOLVED, ALREADY-PROVISIONED
 * principal.
 *
 * THE THREE STEPS (each a hard deny-by-default gate):
 *  1. VERIFY — introspect the opaque exchange token against identity
 *     (`IdentityIntrospector`). An inactive/unknown/malformed token yields no
 *     principal → 401. (Identity mints an opaque token, not a JWT — see the
 *     introspector's doc for why this is introspection, not local RS256/JWKS.)
 *  2. RESOLVE — map the verified `{subject, tenant}` to an engine user via the
 *     `auth_accounts` linkage (`UserRepo.findUserIdByProviderUserId`, scoped to
 *     the workspace/tenant). NO create-on-resolve: a subject with no linkage is
 *     an UNPROVISIONED principal → 401. Provisioning is the internal-API's
 *     explicit, bearer-guarded act (`PrincipalProvisioningService`); this mint
 *     only issues a session for a principal the registry has already provisioned.
 *  3. MINT — create a real user session + engine ACCESS token
 *     (`SessionService.createSessionAndToken`), the SAME session the password
 *     and (future) OIDC-callback paths mint. Audited on success.
 *
 * TENANT ISOLATION: every read is scoped to the introspected `workspaceId`
 * (tenant). A token for tenant A can only ever resolve tenant A's linkage and
 * mint a session in tenant A — there is no cross-tenant path.
 *
 * SECRET DISCIPLINE: the exchange token and the minted access token are never
 * logged; rejections log only the stable reason + workspace scope.
 */
@Injectable()
export class OrvexSessionMintService {
  private readonly logger = new Logger(OrvexSessionMintService.name);

  constructor(
    @Inject(IDENTITY_INTROSPECTOR)
    private readonly introspector: IdentityIntrospector,
    private readonly userRepo: UserRepo,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async mintSession(exchangeToken: string): Promise<MintedSession> {
    // 1 · VERIFY — introspect. A null principal is a rejected token (deny).
    const principal = await this.introspector.introspect(exchangeToken);
    if (!principal) {
      throw new UnauthorizedException('exchange token rejected');
    }
    const { subject, workspaceId } = principal;

    // 2 · RESOLVE — the auth_accounts linkage, scoped to the tenant. No linkage
    // ⇒ the subject was never provisioned here ⇒ deny (no create-on-resolve).
    const userId = await this.userRepo.findUserIdByProviderUserId(
      subject,
      workspaceId,
    );
    if (!userId) {
      // Deny-by-default: an unprovisioned subject never mints a session.
      this.logger.warn(
        `session-mint denied: no provisioned principal for subject in workspace ${workspaceId}`,
      );
      throw new UnauthorizedException('principal not provisioned');
    }

    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException('principal not provisioned');
    }

    // 3 · MINT — a real session + engine ACCESS token (the shared session path).
    const accessToken = await this.sessionService.createSessionAndToken(user);

    // Audit (best-effort, post-mint). A session was established for a resolved,
    // provisioned principal — the operability record of an identity-federated
    // engine login. `system`-initiated (machine exchange), attributed to the
    // resolved user; source names the seam. Never carries token bytes.
    await this.auditService.logWithContext(
      {
        event: AuditEvent.USER_LOGIN,
        resourceType: AuditResource.USER,
        resourceId: user.id,
        metadata: { source: 'session-exchange', subject },
      },
      { workspaceId: user.workspaceId, actorId: user.id, actorType: 'user' },
    );

    return {
      accessToken,
      sub: subject,
      workspaceId: user.workspaceId,
      expiresAt: this.environmentService.getCookieExpiresIn(),
    };
  }
}
