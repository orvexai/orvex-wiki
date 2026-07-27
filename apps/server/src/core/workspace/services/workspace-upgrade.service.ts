// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import {
  IdentityRegistryClient,
  RegistryClientError,
} from '../../../orvex/http/identity-registry-client';
import { IDENTITY_REGISTRY_CLIENT } from '../../../orvex/http/orvex-identity-registry.module';
import { TenantPrincipalKind } from '../tenant-principal.types';

export interface UpgradeToTeamInput {
  workspaceId: string;
}

export interface UpgradeToTeamResult {
  workspaceId: string;
  principalKind: TenantPrincipalKind;
  orgId: string;
  /** false when the tenant was ALREADY org-keyed (idempotent no-op). */
  upgraded: boolean;
}

/**
 * ENG-2503 (A-TENANCY / D-S17) — the personal→Teams UPGRADE-PASS.
 *
 * Re-keys an existing user-keyed tenant to an org-keyed one IN PLACE:
 *  (a) calls out to identity (the sole org minter — this engine never holds
 *      a Clerk client) via the existing `IdentityRegistryClient` seam to
 *      mint/vouch the org and re-record the tenant's kind globally;
 *  (b) flips `workspaces.principal_kind` `'user'` → `'org'` and stamps
 *      `principal_id` with the identity-vouched org id — on the SAME
 *      `workspaces` row, in one transaction;
 *  (c) `workspace_id` stays byte-for-byte unchanged as the RLS tenant key
 *      (ENG-2502), so ALL data (pages/spaces/comments/attachments — every
 *      row keyed on `workspace_id`) and entitlements (keyed on the same
 *      workspace-id principal, `EntitlementService.toPrincipal`) remain
 *      queryable with NO data migration and NO cutover window;
 *  (d) seat-counting continues on the same workspace principal (the
 *      member-cap chokepoint keys on `workspace_id`, unchanged).
 *
 * ATOMICITY (CS §11 honesty — no half-upgraded tenant): the registry call
 * runs FIRST; any registry failure aborts before a single local write, so
 * `principal_kind` stays `'user'`. If the local commit fails after a
 * successful registry mint, the tenant is still consistently `'user'`
 * locally and the registry reservation is idempotently re-consumable on
 * retry — never a tenant claiming `'org'` without a real org behind it.
 *
 * Deletion test (CS §3.1): this service owns the mint→re-key ordering and
 * the typed-conflict mapping; deleting it would scatter that orchestration
 * across callers.
 */
@Injectable()
export class WorkspaceUpgradeService {
  private readonly logger = new Logger(WorkspaceUpgradeService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly workspaceRepo: WorkspaceRepo,
    /**
     * The identity registry port (existing seam, extended with
     * `reserveTenant` — one adapter, CS §3.2), composed once by the
     * `@Global()` `OrvexIdentityRegistryModule` and REQUIRED at composition.
     * Not `@Optional()`: an absent provider must be a loud boot failure, not
     * a silently registry-less upgrade-pass. A registry-less DEPLOYMENT is
     * expressed by the fail-closed `NotConfiguredRegistryClient`, which
     * rejects `reserveTenant` with the typed `NOT_CONFIGURED` error — the
     * upgrade-pass then fails loud, never fabricating an org.
     */
    @Inject(IDENTITY_REGISTRY_CLIENT)
    private readonly registryClient: IdentityRegistryClient,
  ) {}

  async upgradeToTeam(input: UpgradeToTeamInput): Promise<UpgradeToTeamResult> {
    const { workspaceId } = input;

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Idempotent: an already-org-keyed tenant is a no-op, never a re-mint.
    if (workspace.principalKind === 'org') {
      return {
        workspaceId,
        principalKind: 'org',
        orgId: workspace.principalId ?? '',
        upgraded: false,
      };
    }

    // (a) identity mints the org — BEFORE any local write (atomicity).
    // A registry-less deployment surfaces here as the composed
    // `NotConfiguredRegistryClient`'s typed `NOT_CONFIGURED` rejection,
    // propagated by the `throw err` below — never a fabricated org (CS §11).
    let orgId: string;
    try {
      const reservation = await this.registryClient.reserveTenant({
        tenantId: workspaceId,
        hostname: workspace.hostname ?? '',
        principalKind: 'org',
      });
      if (!reservation.reserved || !reservation.orgId) {
        throw new RegistryClientError(
          'DEPENDENCY_ERROR',
          'identity registry reserve returned no org id for the upgrade-pass',
        );
      }
      orgId = reservation.orgId;
    } catch (err) {
      if (
        err instanceof RegistryClientError &&
        err.code === 'TENANT_ALREADY_RESERVED'
      ) {
        throw new ConflictException({
          code: 'TENANT_ALREADY_RESERVED',
          message: `tenant ${workspaceId} is already reserved in the global registry`,
        });
      }
      throw err; // fail loud — principal_kind is still 'user', untouched
    }

    // (b)+(c) — re-key IN PLACE: same `workspaces` row, same workspace_id,
    // no data copy. One transaction; commit-or-nothing.
    await executeTx(this.db, async (trx) => {
      await this.workspaceRepo.updateWorkspace(
        { principalKind: 'org', principalId: orgId },
        workspaceId,
        trx,
      );
    });

    this.logger.log(
      `upgrade-pass re-keyed workspace ${workspaceId} 'user' -> 'org' in place (org ${orgId}); workspace_id unchanged`,
    );

    return { workspaceId, principalKind: 'org', orgId, upgraded: true };
  }
}
