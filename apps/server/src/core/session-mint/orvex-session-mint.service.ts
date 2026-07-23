// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { isUserDisabled } from '../../common/helpers';
import { SessionService } from '../session/session.service';
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
import { EDGE_ASSERTION_VERIFIER } from '../../orvex/edge-auth/edge-auth.module';
import type { EdgeAssertionVerifier } from '../../orvex/edge-auth/edge-assertion-verifier';
import { EdgeAssertionVerificationError } from '../../orvex/edge-auth/edge-assertion.types';

/**
 * The one behaviour the mint service depends on from the edge-assertion
 * verifier — `Pick`ed so the composition root may inject either the real
 * {@link EdgeAssertionVerifier} or a fail-closed NOT_CONFIGURED stand-in
 * (parity with how `OrvexRootModule` injects the `ExchangeTokenVerifier` port).
 */
export type EdgeAssertionVerifierPort = Pick<EdgeAssertionVerifier, 'verify'>;

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
 * OrvexSessionMintService (FR-W6 / A-AUTH) — consume an identity-issued
 * credential and mint an ENGINE session for the RESOLVED, ALREADY-PROVISIONED
 * principal.
 *
 * TWO ACCEPTED CREDENTIALS (both deny-by-default, both land on the SAME
 * resolve→mint tail):
 *  - {@link mintSessionFromAssertion} (ADR-0049 S2S, PREFERRED) — a short-lived
 *    ES256 edge assertion (`aud[0] === orvex-wiki`) an upstream obtained from
 *    identity's delegation-exchange. Verified LOCALLY against identity's internal
 *    JWKS (no per-request network round-trip), `sub`/`tenant` taken from the
 *    verified claims. This is the seam wiki-api (and ai) switch to once identity's
 *    delegate endpoint is live, so the raw caller bearer can be edge-stripped.
 *  - {@link mintSession} (TRANSIENT — introspect) — an identity-minted OPAQUE
 *    exchange token, verified by a per-request `POST /v1/introspect`. This is the
 *    pre-ADR-0049 path; it is retained ONLY for the dual-accept window of the safe
 *    3-step S2S migration and MUST be removed (hard cut, no fallback) once every
 *    upstream has switched to sending an assertion. See the module docstring.
 *
 * THE SHARED TAIL (each a hard deny-by-default gate, {@link resolveAndMint}):
 *  · RESOLVE — map the verified `{subject, tenant}` to an engine user via the
 *    `auth_accounts` linkage (`UserRepo.findUserIdByProviderUserId`, scoped to
 *    the workspace/tenant). NO create-on-resolve: a subject with no linkage is an
 *    UNPROVISIONED principal → 401. Provisioning is the internal-API's explicit,
 *    bearer-guarded act (`PrincipalProvisioningService`); this mint only issues a
 *    session for a principal the registry has already provisioned.
 *  · MINT — create a real user session + engine ACCESS token
 *    (`SessionService.createSessionAndToken`), the SAME session the password and
 *    (future) OIDC-callback paths mint. Audited on success.
 *
 * TENANT ISOLATION: every read is scoped to the credential's `workspaceId`
 * (tenant). A credential for tenant A can only ever resolve tenant A's linkage
 * and mint a session in tenant A — there is no cross-tenant path. For the
 * assertion path the `aud`-value bind additionally means an assertion minted for
 * any OTHER service is rejected before a tenant is even read (confused-deputy).
 *
 * SECRET DISCIPLINE: the exchange token, the edge assertion, and the minted
 * access token are never logged; rejections log only the stable reason + scope.
 */
@Injectable()
export class OrvexSessionMintService {
  private readonly logger = new Logger(OrvexSessionMintService.name);

  constructor(
    @Inject(IDENTITY_INTROSPECTOR)
    private readonly introspector: IdentityIntrospector,
    @Inject(EDGE_ASSERTION_VERIFIER)
    private readonly edgeVerifier: EdgeAssertionVerifierPort,
    private readonly userRepo: UserRepo,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  /**
   * ADR-0049 S2S path — mint an engine session FROM a verified edge assertion.
   *
   * VERIFY (deny-by-default): the assertion is verified against identity's
   * internal JWKS — ES256-pinned, `aud[0] === orvex-wiki` (confused-deputy
   * bound), `iss` exact, `exp` zero-leeway. ANY verification rejection is a hard
   * 401 that never leaks the stable code or the claims. A NOT_CONFIGURED /
   * transport failure is a DISTINCT, honest 5xx (a thrown non-verification
   * error), never a silent accept — the same discipline as the introspect path.
   * The principal is reconstructed from the VERIFIED claims (`sub`, and `tenant`
   * which the ENG-1559 convention pins to be the engine workspace UUID), then
   * flows through the identical resolve→mint tail.
   */
  async mintSessionFromAssertion(assertion: string): Promise<MintedSession> {
    let claims;
    try {
      claims = await this.edgeVerifier.verify(assertion);
    } catch (err: unknown) {
      if (err instanceof EdgeAssertionVerificationError) {
        // A verification verdict is a rejection → 401. Never surface the code
        // or any claim (signature-before-claims holds at the delivery seam too).
        throw new UnauthorizedException('edge assertion rejected');
      }
      // NOT_CONFIGURED / JWKS transport failure: a genuine inability to verify,
      // not a token verdict — an honest 5xx, never a silent deny/accept.
      throw err;
    }
    // ENG-1559: identity's `tenant` claim IS the engine workspace UUID.
    return this.resolveAndMint(claims.sub, claims.tenant, 'session-exchange-assertion');
  }

  /**
   * TRANSIENT introspect path — mint an engine session from an OPAQUE identity
   * exchange token. A null principal is a rejected token (deny → 401). Retained
   * only for the dual-accept migration window; see the class/module docstrings.
   */
  async mintSession(exchangeToken: string): Promise<MintedSession> {
    // VERIFY — introspect. A null principal is a rejected token (deny).
    const principal = await this.introspector.introspect(exchangeToken);
    if (!principal) {
      throw new UnauthorizedException('exchange token rejected');
    }
    return this.resolveAndMint(
      principal.subject,
      principal.workspaceId,
      'session-exchange',
    );
  }

  /**
   * The shared RESOLVE→MINT→audit tail both accepted credentials converge on,
   * given an ALREADY-VERIFIED `{subject, workspaceId}`. `auditSource` names the
   * credential seam in the audit record so the trail distinguishes an assertion
   * mint from a (transient) introspect mint. Never carries token/assertion bytes.
   */
  private async resolveAndMint(
    subject: string,
    workspaceId: string,
    auditSource: 'session-exchange' | 'session-exchange-assertion',
  ): Promise<MintedSession> {
    // GUARD — the workspaceId/tenant claim binds straight into a `uuid`-typed
    // column below; a well-formed credential ALWAYS carries a UUID tenant
    // (ENG-1559), so a non-UUID value is itself proof of an unprovisioned/
    // invalid principal. Reject it here, before the DB cast, so the failure
    // is the same deny-by-default 401 as "not provisioned" rather than an
    // unhandled `invalid input syntax for type uuid` 500 from Postgres.
    if (!isUUID(workspaceId)) {
      this.logger.warn(
        'session-mint denied: credential tenant is not a well-formed UUID',
      );
      throw new UnauthorizedException('principal not provisioned');
    }

    // RESOLVE — the auth_accounts linkage, scoped to the tenant. No linkage ⇒
    // the subject was never provisioned here ⇒ deny (no create-on-resolve).
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

    // MINT — a real session + engine ACCESS token (the shared session path).
    const accessToken = await this.sessionService.createSessionAndToken(user);

    // Audit (best-effort, post-mint). A session was established for a resolved,
    // provisioned principal — the operability record of an identity-federated
    // engine login. `system`-initiated (machine exchange), attributed to the
    // resolved user; source names the seam. Never carries token/assertion bytes.
    await this.auditService.logWithContext(
      {
        event: AuditEvent.USER_LOGIN,
        resourceType: AuditResource.USER,
        resourceId: user.id,
        metadata: { source: auditSource, subject },
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
