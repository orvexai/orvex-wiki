// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { randomBytes } from 'crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { InsertableUser } from '@docmost/db/types/entity.types';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../common/events/audit-events';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import { EVT_WORKSPACE_MEMBER_ADDED } from '../../orvex/events/constants/orvex-event-types';

export interface ProvisionPrincipalInput {
  subject: string;
  tenant: string;
  email: string;
  name?: string;
}

export interface ProvisionPrincipalResult {
  /** The internal engine user id the subject now resolves to. */
  userId: string;
  /** True iff a NEW `auth_accounts` linkage was written this call (idempotent hits return false). */
  created: boolean;
}

/**
 * PrincipalProvisioningService (ENG-1559 write-path) — the WRITE half of the
 * ruled engine-side principal resolution (fork (a)). It unorphans the engine's
 * `auth_accounts`: the READ seam (`InternalApiService.filterAccessiblePages` ->
 * `UserRepo.findUserIdByProviderUserId`) queries this table but nothing wrote
 * it in a live flow; this service is the explicit, bearer-guarded internal act
 * that establishes the subject->user linkage.
 *
 * RULED CONTRACT (ENG-1559, 2026-07-12; po-decisions 2026-07-12): an EXPLICIT
 * internal provisioning endpoint, NOT provision-on-first-resolve. Three
 * reasons: (1) the read path must stay fail-closed for unknown principals —
 * auto-provisioning on `acl/filter` would grant any unseen subject and defeat
 * the intra-tenant restricted-bytes=0 gate; (2) the M5 gate seeds
 * tenant/principal/workspace "through the public service interfaces only (no
 * internal mocks)" — a bearer-guarded endpoint IS such an interface, an
 * implicit read side-effect is not; (3) the engine is the data-owner, and the
 * real caller (orvex-studio-identity's provisioning worker) links the subject
 * where the data lives rather than duplicating the mapping into each consumer
 * (the silent-rot class the read-seam ruling already rejected).
 *
 * PARITY (CS §3 — reuse the deep module): a provisioned principal is a
 * first-class workspace member, indistinguishable from a signup/invite user —
 * same `users` row shape, default-group membership, and `workspace.member_added`
 * outbox event (ENG-1609). SSO principals never password-authenticate, so a
 * JIT-created user carries a strong random secret + `hasGeneratedPassword`
 * (the exact shape the removed native-OIDC login produced).
 */
@Injectable()
export class PrincipalProvisioningService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly outboxWriter: OutboxWriter,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async provision(
    input: ProvisionPrincipalInput,
  ): Promise<ProvisionPrincipalResult> {
    const { subject, tenant, email, name } = input;

    // Fail-closed: `tenant` MUST be a live workspace this engine owns. An
    // unknown tenant is a hard 404, never a silent create-in-the-void.
    const workspace = await this.workspaceRepo.findById(tenant);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Idempotency: an existing live linkage short-circuits with ZERO writes,
    // returning the already-resolved user id. The read seam is the source of
    // truth for "is this subject already provisioned in this tenant".
    const existing = await this.userRepo.findUserIdByProviderUserId(
      subject,
      tenant,
    );
    if (existing) {
      return { userId: existing, created: false };
    }

    let auditNewUser:
      | { id: string; email: string; name: string; role: string }
      | undefined;

    const userId = await executeTx(this.db, async (trx) => {
      // Account-linking: an already workspace-invited engine user with this
      // email is LINKED (the invited-then-SSO case), never duplicated. The
      // `users_email_workspace_id_unique` constraint is the concurrency guard
      // against a racing create.
      let user = await this.userRepo.findByEmail(email, tenant, { trx });

      if (!user) {
        user = await this.userRepo.insertUser(
          {
            email,
            name,
            workspaceId: tenant,
            role: workspace.defaultRole,
            emailVerifiedAt: new Date(),
            // SSO principals never password-authenticate (they always arrive
            // via identity/exchange-token). A strong random secret keeps the
            // NOT-NULL password column honest without a usable credential.
            password: randomBytes(32).toString('base64url'),
            hasGeneratedPassword: true,
          } as InsertableUser,
          trx,
        );

        // Full member parity — default-group membership + the ENG-1609
        // member_added event, atomic in this same transaction.
        await this.groupUserRepo.addUserToDefaultGroup(user.id, tenant, trx);
        await this.outboxWriter.enqueue(trx, {
          type: EVT_WORKSPACE_MEMBER_ADDED,
          aggregateId: user.id,
          workspaceId: tenant,
          payload: { userId: user.id, workspaceId: tenant },
        });

        auditNewUser = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      }

      await this.userRepo.linkProviderAccount(
        { userId: user.id, providerUserId: subject, workspaceId: tenant },
        trx,
      );

      return user.id;
    });

    // Audit only a genuinely NEW user (a linked pre-existing user was already
    // audited at its own creation). `system` actor — this is a machine-driven
    // provisioning call with no request-scoped human behind it.
    if (auditNewUser) {
      await this.auditService.logWithContext(
        {
          event: AuditEvent.USER_CREATED,
          resourceType: AuditResource.USER,
          resourceId: auditNewUser.id,
          changes: {
            after: {
              name: auditNewUser.name,
              email: auditNewUser.email,
              role: auditNewUser.role,
            },
          },
          metadata: { source: 'internal-provisioning', subject },
        },
        { workspaceId: tenant, actorType: 'system' },
      );
    }

    return { userId, created: true };
  }
}
