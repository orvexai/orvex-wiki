// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import {
  acquireWorkspaceProvisionLock,
  acquireWorkspaceQuotaLock,
  executeTx,
} from '@docmost/db/utils';
import { withTenantScopedTransaction } from '@docmost/db/rls/rls-guc-hook';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import {
  InsertableUser,
  InsertableWorkspace,
  Workspace,
} from '@docmost/db/types/entity.types';
import { SpaceRole, UserRole } from '../../common/helpers/types/permission';
import { SpaceService } from '../space/services/space.service';
import { SpaceMemberService } from '../space/services/space-member.service';
import { CreateSpaceDto } from '../space/dto/create-space.dto';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import {
  EVT_WORKSPACE_CREATED,
  EVT_WORKSPACE_MEMBER_ADDED,
} from '../../orvex/events/constants/orvex-event-types';
import {
  IdentityRegistryClient,
  RegistryClientError,
  RegistryClientNotConfiguredError,
} from '../../orvex/http/identity-registry-client';
import { IDENTITY_REGISTRY_CLIENT } from '../../orvex/http/orvex-identity-registry.module';
import { TenantPrincipalKind } from '../workspace/tenant-principal.types';
import {
  CELL_SOLO,
  OrvexConfigService,
} from '../../orvex/config/orvex-config.service';
import { EntitlementService } from '../../orvex/entitlement/entitlement.service';
import { JIT_MEMBER_OVERAGE_MULTIPLIER } from '../../orvex/entitlement/entitlement.types';

// ENG-2503 (D-S17) — the polymorphic tenant shape lives in its own leaf
// module (`core/workspace/tenant-principal.types`) so every tenancy consumer
// can name it without importing another service module. Re-exported here for
// the callers that already import it from this service's surface.
export { TenantPrincipalKind };

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
  /**
   * ENG-2503 — polymorphic tenant kind. `'user'` (default): a personal
   * tenant, user-keyed, full workspace + entitlements, NO Clerk org minted
   * anywhere (this engine never holds a Clerk client — it only consumes
   * identity-minted context). `'org'`: a Team tenant keyed on the Clerk-org
   * id identity vouches via `orgId` (minted upstream by identity — this
   * engine never mints an org, R-WIKI-7).
   */
  principalKind?: TenantPrincipalKind;
  /**
   * ENG-2503 — the identity-vouched Clerk-org id for an `'org'`-kind
   * tenant. Required when `principalKind === 'org'`.
   */
  orgId?: string;
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
    private readonly spaceService: SpaceService,
    private readonly spaceMemberService: SpaceMemberService,
    private readonly outboxWriter: OutboxWriter,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    // ENG-2491 AC4 — the member-cap chokepoint on the JIT path (the first
    // quota check this file has ever had). The VERDICT stays in the domain
    // (`assertWithinQuotaAllowingOverage`); this service only marshals.
    private readonly entitlementService: EntitlementService,
    /**
     * ENG-2503 AC4 — the global identity registry port (mint-time uniqueness
     * delegation), composed once by the `@Global()`
     * `OrvexIdentityRegistryModule` and REQUIRED at composition.
     *
     * It is deliberately NOT `@Optional()`: an optional injection is exactly
     * what let this delegation silently never run — the port used to be a
     * module-private provider in the flag-gated `OrvexHttpModule`, Nest
     * resolved `undefined`, and `reserveTenantGlobally` took its early return
     * in every real deployment with no boot error. A missing provider must be
     * a LOUD boot failure. The single-cell / self-hosted case is expressed by
     * the fail-closed `NotConfiguredRegistryClient` the composition binds when
     * `ORVEX_IDENTITY_URL` is unset — handled at CALL time (typed
     * `NOT_CONFIGURED`, logged, local backstop constraints stand), never by an
     * absent dependency.
     */
    @Inject(IDENTITY_REGISTRY_CLIENT)
    private readonly registryClient: IdentityRegistryClient,
    /**
     * A-CELL — the deployment's own `CELL_ID`. This is the path that mints
     * every identity-federated tenant, so it is the path that must record
     * which cell that tenant now lives in.
     */
    private readonly orvexConfigService: OrvexConfigService,
  ) {}

  async provision(
    input: ProvisionPrincipalInput,
  ): Promise<ProvisionPrincipalResult> {
    const { subject, tenant, email, name, provisionWorkspace } = input;
    const principalKind: TenantPrincipalKind = input.principalKind ?? 'user';

    // ENG-2503 AC2 — an org-keyed tenant is keyed on the Clerk-org id
    // identity vouches; the engine never mints one itself, so a missing
    // vouch is a hard, typed 400 (never a fabricated org principal).
    if (principalKind === 'org' && !input.orgId) {
      throw new BadRequestException(
        'orgId is required for an org-keyed tenant (identity mints the org; this engine never does)',
      );
    }

    let auditNewUser:
      | { id: string; email: string; name: string; role: string }
      | undefined;
    let auditNewWorkspace: { id: string; name: string | null } | undefined;

    // ENG-2502 (FR-W8) — the RLS GUC hook scopes this whole provisioning
    // transaction to the tenant as its FIRST statement (transaction-local
    // `set_config`, popped at commit/rollback), so the fail-closed
    // `orvex_rls_tenant_isolation_*` policies admit the tenant-scoped rows
    // (e.g. the default "General" space insert) this transaction writes.
    // The RLS layer stays a BACKSTOP beneath the app ACL, never a
    // replacement for it.
    const result = await executeTx(this.db, (outerTrx) =>
      withTenantScopedTransaction(outerTrx, tenant, async (trx) => {
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
          // ENG-2503 AC4 — delegate tenant/hostname uniqueness to the GLOBAL
          // identity registry BEFORE the local `workspaces` insert. The local
          // `workspaces_hostname_unique` constraint stays a per-cell backstop
          // only. A registry rejection aborts this transaction — nothing is
          // ever silently accepted locally after a global refusal.
          await this.reserveTenantGlobally(tenant, principalKind);
          workspace = await this.materializeWorkspace(tenant, trx, {
            principalKind,
            principalId: principalKind === 'org' ? input.orgId! : subject,
          });
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
          // ENG-2491 AC4 — the SSO/SCIM JIT member-cap chokepoint: JIT
          // provisioning is allowed to a bounded overage of the member cap
          // (JIT_MEMBER_OVERAGE_MULTIPLIER — first login never breaks a
          // tenant slightly over via a stale SCIM sync), while manual invites
          // (`WorkspaceInvitationService.acceptInvitation`) keep blocking at
          // 100%. Same F1 discipline as that path: the advisory xact lock
          // makes count → assert → insert one atomic critical section, so two
          // concurrent JIT logins cannot both slip past the overage bound.
          // The comparison itself lives in the domain fn, never here (❌#1).
          await acquireWorkspaceQuotaLock(trx, 'members', tenant);
          const currentMemberCount = await this.userRepo.countByWorkspaceId(
            tenant,
            trx,
          );
          await this.entitlementService.assertWithinQuotaAllowingOverage(
            tenant,
            'members',
            currentMemberCount,
            JIT_MEMBER_OVERAGE_MULTIPLIER,
          );

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

        // Default "General" space (ENG-1559 R6 completion — signup parity):
        // a workspace materialized at a registry-issued UUID is born with a
        // default space so its OWNER can create pages IMMEDIATELY. Without it a
        // provisioned principal resolves a session but has no space to write into
        // — every `/v1` page create 404s PAGE_NOT_FOUND, and the host-gated
        // `/api` space-create path is unreachable for an identity-federated
        // tenant (reached by tenant-claim UUID, not hostname). Only on a
        // genuinely NEW workspace (`workspaceCreated`); a principal joining an
        // existing workspace inherits its spaces. Mirrors
        // WorkspaceService.create's default-space block exactly (owner ADMIN +
        // default "Everyone" group WRITER + workspace.defaultSpaceId), atomic in
        // this same transaction.
        if (workspaceCreated) {
          const defaultGroup = await this.groupRepo.getDefaultGroup(
            tenant,
            trx,
          );
          const space = await this.spaceService.create(
            user.id,
            tenant,
            { name: 'General', slug: 'general' } as CreateSpaceDto,
            trx,
          );
          await this.spaceMemberService.addUserToSpace(
            user.id,
            space.id,
            SpaceRole.ADMIN,
            tenant,
            trx,
          );
          if (defaultGroup?.id) {
            await this.spaceMemberService.addGroupToSpace(
              defaultGroup.id,
              space.id,
              SpaceRole.WRITER,
              tenant,
              trx,
            );
          }
          await this.workspaceRepo.updateWorkspace(
            { defaultSpaceId: space.id },
            tenant,
            trx,
          );
        }

        return { userId: user.id, created: true, workspaceCreated };
      }),
    );

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
   * ENG-2503 AC4/AC5 — mint-time delegation to the global identity
   * registry. The port is always injected (see the constructor note); the
   * only configuration axis left is what the composed client IS:
   *  - `NOT_CONFIGURED` (`ORVEX_IDENTITY_URL` unset — single-cell /
   *    self-hosted): skip, the local per-cell backstop constraints are the
   *    only guard. Logged, never silent.
   *  - `TENANT_ALREADY_RESERVED` (cross-cell mint collision): surfaces as a
   *    typed 409 Conflict carrying the code — never a bare 500, never a
   *    silent local accept.
   *  - `NOT_FOUND` (the global registry has never homed this tenant): a typed
   *    409 carrying `TENANT_NOT_REGISTERED`. Deny-by-default — the engine does
   *    not materialize a workspace for a tenant the routing core disowns.
   *  - `DEPENDENCY_ERROR` (unreachable / malformed / uncredentialled): a typed
   *    503 carrying `REGISTRY_UNAVAILABLE`. RETRYABLE, and distinguishable —
   *    which is the ENG-3350 fix: every one of these used to leave as a raw
   *    `RegistryClientError` that NestJS rendered as
   *    `{"statusCode":500,"message":"Internal server error"}`, so identity
   *    could report only `principal_provision_failed` and a whole onboarding
   *    outage looked identical to a routine conflict.
   *
   * The engine still never fabricates a reservation it could not obtain — the
   * change is in how loudly and how specifically it says so.
   */
  private async reserveTenantGlobally(
    tenant: string,
    principalKind: TenantPrincipalKind,
  ): Promise<void> {
    try {
      await this.registryClient.reserveTenant({
        tenantId: tenant,
        // Federated engine workspaces are reached by tenant-claim UUID, not
        // hostname (see materializeWorkspace) — an empty hostname reserves
        // the tenant id alone.
        hostname: '',
        principalKind,
      });
    } catch (err) {
      if (err instanceof RegistryClientNotConfiguredError) {
        this.logger.debug(
          `identity registry not configured — skipping global reservation for ${tenant} (single-cell mode)`,
        );
        return;
      }
      if (err instanceof RegistryClientError) {
        // Logged with the client's own message (which names the status and,
        // for a malformed body, a bounded snippet) so the cause is readable
        // where an operator looks — the wire carries only the code.
        this.logger.error(
          `global tenant reservation for ${tenant} failed [${err.code}]: ${err.message}`,
        );
        switch (err.code) {
          case 'TENANT_ALREADY_RESERVED':
            throw new ConflictException({
              code: 'TENANT_ALREADY_RESERVED',
              message: `tenant ${tenant} is already reserved in the global registry`,
            });
          case 'NOT_FOUND':
            throw new ConflictException({
              code: 'TENANT_NOT_REGISTERED',
              message: `tenant ${tenant} has no cell binding in the global registry`,
            });
          default:
            throw new ServiceUnavailableException({
              code: 'REGISTRY_UNAVAILABLE',
              message: `the global identity registry could not adjudicate tenant ${tenant}`,
            });
        }
      }
      throw err;
    }
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
   * ENG-2503 — stamps the polymorphic principal marker at mint time.
   */
  private async materializeWorkspace(
    workspaceId: string,
    trx: KyselyTransaction,
    principal: { principalKind: TenantPrincipalKind; principalId: string },
  ): Promise<Workspace> {
    const workspace = await this.workspaceRepo.insertWorkspace(
      {
        id: workspaceId,
        // ENG-2503 (D-S17) — the polymorphic tenant marker: 'user' for a
        // personal tenant (no Clerk org anywhere), 'org' for a Team keyed
        // on the identity-vouched Clerk-org id.
        principalKind: principal.principalKind,
        principalId: principal.principalId,
        // A-CELL — the cell that materialized this tenant owns it. This is
        // the ONLY cell record the request path can consult without making
        // identity's global registry a per-request dependency; identity
        // remains the cross-cell source of truth and its sole writer.
        cellId: this.orvexConfigService.cellId ?? CELL_SOLO,
        // Deterministic, non-secret placeholder label (❌#9 — no rand/time);
        // identity owns the human-facing org name, the engine only needs a row.
        name: `Workspace ${workspaceId.slice(0, 8)}`,
        // fix13 (2026-07-13, search-freshness gap): a workspace materialized
        // via THIS path is, by construction, an identity-`/v1/exchange`
        // auto-provisioned fresh tenant — the same moment fix10's
        // grantBaselineEntitlements already stamps `search:read` onto the
        // token so search "just works" with zero manual admin steps. That
        // promise was only half-kept: `search:read` is a TOKEN scope, but
        // knowledge's `/v1/query` (and wiki-api's `/v1/search`, which forwards
        // to it) additionally fast-paths to an honest-but-silent empty result
        // whenever THIS workspace's `settings.ai.search` is falsy
        // (orvex-studio-knowledge workflow.go Search, AC7) — and a materialized
        // workspace with no explicit settings defaults that to false. RAG's
        // `/v1/retrieve` has no such gate, so it worked while query/search
        // never did for any fresh, zero-manual user (accept4/knowledge-sync.md,
        // wiki-api.md). Setting it true here, at the SAME materialization site
        // that already establishes the workspace row, is the explicit default
        // this auto-provisioning path was missing — not a read-path fallback
        // (CS — no fallbacks): the value is a real, persisted column write, not
        // an "assume enabled if unset" guess in getAiSearchEnabled. The
        // general signup path (WorkspaceService.create) is untouched — its
        // existing default-off posture for a human-chosen workspace is a
        // separate, deliberate business decision this fix does not revisit.
        settings: { ai: { search: true } },
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
