// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { randomBytes } from 'crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import {
  acquireWorkspaceProvisionLock,
  executeTx,
} from '@docmost/db/utils';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import {
  InsertableUser,
  InsertableWorkspace,
  Workspace,
} from '@docmost/db/types/entity.types';
import { UserRole } from '../../common/helpers/types/permission';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../common/events/audit-events';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import {
  EVT_WORKSPACE_CREATED,
  EVT_WORKSPACE_MEMBER_ADDED,
} from '../../orvex/events/constants/orvex-event-types';

export interface ProvisionPrincipalInput {
  subject: string;
  tenant: string;
  email: string;
  name?: string;
  /**
   * Registry vouch (ENG-1559 R6): when true, the engine get-or-creates the
   * workspace at `tenant` (the identity-issued UUID) atomically with this
   * principal, and the principal becomes its OWNER. Absent/false ⇒ an unknown
   * workspace fails closed (404) — deny-by-default for an unregistered UUID.
   */
  provisionWorkspace?: boolean;
}

export interface ProvisionPrincipalResult {
  /** The internal engine user id the subject now resolves to. */
  userId: string;
  /** True iff a NEW `auth_accounts` linkage was written this call (idempotent hits return false). */
  created: boolean;
  /** True iff the workspace `tenant` was materialized by THIS call (get-or-create; idempotent hits return false). */
  workspaceCreated: boolean;
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
 *
 * WORKSPACE MATERIALIZATION (ENG-1559 R6): identity is the SOLE source of the
 * engine workspace UUID (minted on first `/v1/exchange`), but nothing created
 * the engine-side `workspaces` row for it, so a real flow 404'd here. When the
 * registry-authorized caller vouches (`provisionWorkspace`), this service
 * get-or-creates the workspace at the identity-issued UUID ATOMICALLY with the
 * principal (one transaction) and makes the vouching principal its OWNER — a
 * fresh workspace born fully formed (default "Everyone" group + `workspace.created`
 * outbox, ENG-1609 parity). Deny-by-default is intact: without the vouch an
 * unknown workspace is a hard 404, and the READ seam never reaches this write
 * path (no create-on-resolve). A concurrent first-exchange race is serialized by
 * a transaction advisory lock so the loser re-resolves the winner's workspace.
 */
@Injectable()
export class PrincipalProvisioningService {
  private readonly logger = new Logger(PrincipalProvisioningService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly groupRepo: GroupRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly outboxWriter: OutboxWriter,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async provision(
    input: ProvisionPrincipalInput,
  ): Promise<ProvisionPrincipalResult> {
    const { subject, tenant, email, name, provisionWorkspace } = input;

    let auditNewUser:
      | { id: string; email: string; name: string; role: string }
      | undefined;
    let auditNewWorkspace: { id: string; name: string | null } | undefined;

    const result = await executeTx(this.db, async (trx) => {
      // Serialize concurrent materialization of the SAME workspace up front:
      // `findById ... FOR UPDATE` cannot lock a not-yet-existing row, so two
      // concurrent first-exchange provisions would both race the insert. The
      // advisory lock makes the loser block, then re-resolve on the get path.
      await acquireWorkspaceProvisionLock(trx, tenant);

      // Resolve-or-materialize the workspace, atomically with the account.
      // Fail-closed by default: an unknown workspace is a hard 404. The engine
      // materializes ONLY when the registry-authorized caller EXPLICITLY vouches
      // for the identity-issued UUID (deny-by-default for an unregistered UUID;
      // the read seam never reaches this write path, so no create-on-resolve).
      let workspace = await this.workspaceRepo.findById(tenant, {
        trx,
        withLock: true,
      });
      let workspaceCreated = false;

      if (!workspace) {
        if (!provisionWorkspace) {
          throw new NotFoundException('Workspace not found');
        }
        workspace = await this.materializeWorkspace(tenant, trx);
        workspaceCreated = true;
        auditNewWorkspace = { id: workspace.id, name: workspace.name };
      }

      // Idempotency: an existing live linkage short-circuits with ZERO further
      // writes, returning the already-resolved user id. The read seam is the
      // source of truth for "is this subject already provisioned here".
      const existing = await this.userRepo.findUserIdByProviderUserId(
        subject,
        tenant,
        trx,
      );
      if (existing) {
        return { userId: existing, created: false, workspaceCreated };
      }

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
            // The principal that MATERIALIZES the workspace is its OWNER (parity
            // with the signup path, WorkspaceService.create); a principal
            // joining an existing workspace gets the workspace default role.
            role: workspaceCreated ? UserRole.OWNER : workspace.defaultRole,
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

      return { userId: user.id, created: true, workspaceCreated };
    });

    // Audit (post-commit). A genuinely NEW workspace is an operability record
    // that a registry-issued UUID was materialized; a genuinely NEW user gets
    // its own USER_CREATED (a linked pre-existing user was already audited at
    // its own creation). `system` actor — a machine-driven provisioning call
    // with no request-scoped human behind it.
    if (auditNewWorkspace) {
      await this.auditService.logWithContext(
        {
          event: AuditEvent.WORKSPACE_CREATED,
          resourceType: AuditResource.WORKSPACE,
          resourceId: auditNewWorkspace.id,
          changes: { after: { name: auditNewWorkspace.name } },
          metadata: {
            source: 'internal-provisioning',
            subject,
            registryIssued: true,
          },
        },
        { workspaceId: auditNewWorkspace.id, actorType: 'system' },
      );
    }
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

    return result;
  }

  /**
   * Materialize a fresh engine workspace at the identity-issued UUID (ENG-1559
   * R6). It is born fully formed — the `workspaces` row carrying the SUPPLIED id
   * plus the default "Everyone" group every real workspace has (so the JIT owner
   * and every later member resolve `addUserToDefaultGroup`) — and emits
   * `workspace.created` in the SAME transaction as the insert (ENG-1609 AC1
   * parity). Deliberately does NOT generate a hostname or a billing trial: an
   * identity-federated workspace is reached by its tenant-claim UUID, not by
   * hostname, and billing is owned by the satellite, not the AGPL engine.
   */
  private async materializeWorkspace(
    workspaceId: string,
    trx: KyselyTransaction,
  ): Promise<Workspace> {
    const workspace = await this.workspaceRepo.insertWorkspace(
      {
        id: workspaceId,
        // Deterministic, non-secret placeholder label (❌#9 — no rand/time);
        // identity owns the human-facing org name, the engine only needs a row.
        name: `Workspace ${workspaceId.slice(0, 8)}`,
      } as InsertableWorkspace,
      trx,
    );

    await this.groupRepo.createDefaultGroup(workspace.id, { trx });

    await this.outboxWriter.enqueue(trx, {
      type: EVT_WORKSPACE_CREATED,
      aggregateId: workspace.id,
      workspaceId: workspace.id,
      payload: { id: workspace.id, name: workspace.name },
    });

    this.logger.log(
      `materialized engine workspace ${workspace.id} for a registry-issued UUID (internal provisioning)`,
    );
    return workspace;
  }
}
