// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalApiAuthGuard } from './internal-api-auth.guard';
import { InternalApiService } from './internal-api.service';
import { PrincipalProvisioningService } from './principal-provisioning.service';
import {
  AclFilterDto,
  ProvisionPrincipalDto,
  TenantQueryDto,
  UpgradeTenantToTeamDto,
} from './dto/internal-api.dto';
import { WorkspaceUpgradeService } from '../workspace/services/workspace-upgrade.service';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { WorkspaceCellAssertionService } from '../../common/cell-isolation/workspace-cell-assertion.service';

/**
 * InternalApiController (ENG-1957; ENG-1559 principal-resolution) — the
 * engine-internal HTTP surface for knowledge's ACL/export/resolve/ai-search
 * seam (`internal/clients.Engine` in `orvex-studio-knowledge`).
 *
 * PLACEMENT (AC5): sits OUTSIDE the `/api` global prefix (see
 * `orvex-global-prefix-exclude.ts`'s `internal/(.*)` entry) and behind
 * `InternalApiAuthGuard` (fail-closed shared bearer token) — NOT the
 * public/tenant-facing `JwtAuthGuard` session auth. This controller never
 * applies `JwtAuthGuard`, so the route is reached purely by
 * `InternalApiAuthGuard`; it is NOT reachable without a valid
 * `INTERNAL_API_BEARER_TOKEN` bearer (AC1/AC5). Because Nest skips
 * DomainMiddleware for global-prefix exclusions, each handler also asserts
 * the cell of its DTO/query tenant before touching tenant data.
 *
 * RULED CONTRACT (ENG-1559, 2026-07-12, fork (a)): the wire surface is the
 * IdP-agnostic PRINCIPAL the consumer sends — `{subject, tenant}` on
 * `acl/filter`, `?tenant=` on the workspace-scoped reads — and the engine
 * (sole owner of the workspace/user mapping) resolves it internally. Response
 * shapes match the consumer's decode types exactly: `{allowed}`, `{text_repr}`,
 * `{title, content}`, `{enabled}`.
 *
 * RAW BODY (@SkipTransform, per handler): the sole consumer decodes these BARE
 * shapes off the top level, so every handler opts OUT of the global
 * `TransformHttpResponseInterceptor`'s `{data, success, status}` envelope —
 * the same pattern the other machine-facing surfaces use (`/metrics`,
 * `/health`, `/llms.txt`). Without this the consumer sees `{data:{...}}` and
 * decodes every field as empty (fail-closed for the whole seam). The metadata
 * is read via `reflector.get(getHandler())`, so it MUST sit on each method, not
 * the class.
 *
 * THIN HANDLER (CS §6): auth guard -> parse DTO -> one service call -> shape
 * response. All resolution + ACL/export logic lives in `InternalApiService`.
 */
@UseGuards(InternalApiAuthGuard)
@Controller('internal')
export class InternalApiController {
  constructor(
    private readonly internalApiService: InternalApiService,
    private readonly principalProvisioningService: PrincipalProvisioningService,
    // ENG-2503 AC3 — the personal→Teams upgrade-pass. Exposed on THIS
    // machine-facing, bearer-guarded surface (not the tenant-facing `/api`
    // one) because the actor is identity's provisioning/billing worker, the
    // same actor that already drives `principals/provision`.
    private readonly workspaceUpgradeService: WorkspaceUpgradeService,
    private readonly cellAssertion: WorkspaceCellAssertionService,
  ) {}

  /**
   * ENG-1559 write-path — POST /internal/principals/provision —
   * `{subject, tenant, email, name?, provision_workspace?}` ->
   * `{user_id, created, workspace_created}`. Establishes the `auth_accounts`
   * subject->user linkage the `acl/filter` read seam resolves. The real caller
   * is orvex-studio-identity's provisioning worker. Idempotent. Fail-closed on
   * an unknown workspace (404) UNLESS `provision_workspace` vouches for the
   * identity-issued UUID, in which case the workspace is get-or-created
   * atomically with this principal (ENG-1559 R6). The read path is untouched and
   * still fails closed for any not-yet-provisioned subject.
   */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Post('principals/provision')
  async provisionPrincipal(@Body() dto: ProvisionPrincipalDto) {
    // A missing row is legitimate only for the explicit JIT-provisioning
    // command. The assertion still requires a real deployment CELL_ID first;
    // materialization stamps that same value on the new workspace.
    await this.cellAssertion.assertWorkspaceId(
      dto.tenant,
      'internal principals/provision',
      { allowMissingWorkspace: dto.provision_workspace === true },
    );
    const { userId, created, workspaceCreated } =
      await this.principalProvisioningService.provision({
        subject: dto.subject,
        tenant: dto.tenant,
        email: dto.email,
        name: dto.name,
        provisionWorkspace: dto.provision_workspace,
        // ENG-2503 AC1/AC2 — the polymorphic tenant marker travels on the
        // wire. Absent ⇒ 'user' (personal, no Clerk org anywhere).
        principalKind: dto.principal_kind,
        orgId: dto.org_id,
      });
    return { user_id: userId, created, workspace_created: workspaceCreated };
  }

  /**
   * ENG-2503 AC3 — POST /internal/tenants/upgrade-to-team — `{tenant}` ->
   * `{workspace_id, principal_kind, org_id, upgraded}`. The personal→Teams
   * UPGRADE-PASS entry point: identity mints the org (via the registry seam),
   * then the engine re-keys the EXISTING `workspaces` row IN PLACE. The
   * `workspace_id` is byte-for-byte unchanged, so every row keyed on it
   * (pages/spaces/comments) and the entitlement/seat principal carry with no
   * data migration and no cutover window. Idempotent: an already org-keyed
   * tenant returns `upgraded: false` and is never re-minted. A registry
   * failure aborts BEFORE any local write (no half-upgraded tenant), and a
   * cross-cell collision surfaces as a typed 409 carrying
   * `TENANT_ALREADY_RESERVED` — never an opaque 500.
   */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Post('tenants/upgrade-to-team')
  async upgradeTenantToTeam(@Body() dto: UpgradeTenantToTeamDto) {
    await this.cellAssertion.assertWorkspaceId(
      dto.tenant,
      'internal tenants/upgrade-to-team',
    );
    const { workspaceId, principalKind, orgId, upgraded } =
      await this.workspaceUpgradeService.upgradeToTeam({
        workspaceId: dto.tenant,
      });
    return {
      workspace_id: workspaceId,
      principal_kind: principalKind,
      org_id: orgId,
      upgraded,
    };
  }

  /** AC1 — POST /internal/acl/filter — `{subject, tenant, page_ids}` -> `{allowed}` */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Post('acl/filter')
  async aclFilter(@Body() dto: AclFilterDto) {
    await this.cellAssertion.assertWorkspaceId(
      dto.tenant,
      'internal acl/filter',
    );
    const allowed = await this.internalApiService.filterAccessiblePages(
      dto.tenant,
      dto.subject,
      dto.page_ids,
    );
    return { allowed };
  }

  /**
   * AC2 — GET /internal/pages/{id}/export?tenant= (workspace-scoped) ->
   * `{text_repr, title, space, slug_id}`. `text_repr` is unchanged (existing
   * decoders read it off the top level); the additive `title`/`space`/`slug_id`
   * are the addressing fields the indexer stamps onto each projected document so
   * a knowledge hit is chainable back to its page (addressable-hits).
   */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Get('pages/:id/export')
  async exportPage(
    @Param('id') pageId: string,
    @Query() query: TenantQueryDto,
  ) {
    await this.cellAssertion.assertWorkspaceId(
      query.tenant,
      'internal pages/export',
    );
    const { textRepr, title, space, slugId } =
      await this.internalApiService.exportPage(query.tenant, pageId);
    return { text_repr: textRepr, title, space, slug_id: slugId };
  }

  /** AC3 — GET /internal/pages/{id}/resolve?tenant= -> `{title, content}` (workspace-scoped) */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Get('pages/:id/resolve')
  async resolvePage(
    @Param('id') pageId: string,
    @Query() query: TenantQueryDto,
  ) {
    await this.cellAssertion.assertWorkspaceId(
      query.tenant,
      'internal pages/resolve',
    );
    return this.internalApiService.resolvePage(query.tenant, pageId);
  }

  /** AC4 — GET /internal/settings/ai-search?tenant= -> `{enabled}` */
  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Get('settings/ai-search')
  async aiSearchSettings(@Query() query: TenantQueryDto) {
    await this.cellAssertion.assertWorkspaceId(
      query.tenant,
      'internal settings/ai-search',
    );
    const enabled = await this.internalApiService.getAiSearchEnabled(
      query.tenant,
    );
    return { enabled };
  }
}
