// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectKysely } from 'nestjs-kysely';

import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Workspace } from '../../database/types/entity.types';
import { KyselyDB } from '../../database/types/kysely.types';
import { EntitlementService } from '../entitlement/entitlement.service';
import { QuotaStatus } from '../entitlement/entitlement.types';

/**
 * FR-W15 — the F-QUOTA usage-vs-caps readout that backs the 402
 * QUOTA_EXCEEDED guard on the write surfaces.
 *
 * ENG-2493 AC3 — this route previously threw the honest
 * `OrvexNotImplementedException('orvexGetQuota')` 501 sentinel, because
 * emitting fabricated zero-usage readings would have been a mock. It now
 * serves the REAL read: usage comes from the same fast counters the write
 * chokepoints enforce against, and a cold counter miss is seeded from the
 * store-tier truth query rather than reported as zero. The 501 sentinel is
 * GONE from this path — superseded, never left as a parallel dead branch.
 *
 * Thin handler (CS §3): authz -> ONE service call -> return. The verdict
 * logic (and the 402 it can raise) stays in `EntitlementService`; this read
 * never rejects, so a tenant already over cap simply reads
 * `current > limit`.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('orvex/quota')
export class OrvexQuotaController {
  constructor(
    private readonly entitlementService: EntitlementService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Get()
  async getQuota(@AuthWorkspace() workspace: Workspace): Promise<QuotaStatus> {
    return this.entitlementService.getQuotaStatus(workspace.id, {
      // Cold-miss truth queries: these run ONLY when the counter is
      // genuinely absent, and their result seeds it so the next read is
      // O(1). Without them a cold counter would read `current: null`
      // (honest UNKNOWN) rather than a real number.
      pages: async () => {
        const row = await this.db
          .selectFrom('pages')
          .select(({ fn }) => fn.countAll<string>().as('count'))
          .where('workspaceId', '=', workspace.id)
          .where('deletedAt', 'is', null)
          .executeTakeFirst();
        return Number(row?.count ?? 0);
      },
      // Members are counted from `users` — the SAME source the member-cap
      // chokepoint enforces against (`UserRepo.countByWorkspaceId`, see
      // PrincipalProvisioningService), so the readout can never disagree
      // with the verdict.
      members: async () => {
        const row = await this.db
          .selectFrom('users')
          .select(({ fn }) => fn.countAll<string>().as('count'))
          .where('workspaceId', '=', workspace.id)
          .where('deletedAt', 'is', null)
          .executeTakeFirst();
        return Number(row?.count ?? 0);
      },
    });
  }
}
