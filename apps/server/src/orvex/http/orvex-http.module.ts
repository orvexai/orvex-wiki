// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';

import { OrvexConfigModule } from '../config/orvex-config.module';
import { OrvexQuotaController } from './orvex-quota.controller';
import { OrvexSourceController } from './orvex-source.controller';
import { OrvexTenantMoveController } from './orvex-tenant-move.controller';

/**
 * Mounts the additive `/api/orvex/*` primitive surface (the paths traced by
 * `contracts/openapi.yaml`). Imports {@link OrvexConfigModule} because the REAL
 * source-offer controller injects {@link OrvexConfigService}. Only reachable
 * when the master flag is on — see {@link OrvexRootModule}.
 *
 * ENG-1652 — `OrvexApplyOpsController` (`POST /orvex/pages/:pageId/apply-ops`)
 * is deliberately NOT mounted here: its real orchestrator needs `PageRepo`/
 * `@InjectKysely()`, and `orvex-http.e2e.spec.ts` boots this module's
 * `OrvexRootModule.register()` tree WITHOUT `DatabaseModule` — the same
 * DB-dependency conflict documented on `OrvexModulesEnabledGuard` (which
 * this ticket reuses). It lives in `OrvexApplyOpsModule`
 * (`page-blocks/apply-ops.module.ts`), mounted unconditionally by
 * `PageModule`, same precedent as `OrvexLlmsModule`/`OrvexPageMetadataModule`.
 *
 * FR-W6 — `POST /api/orvex/session/exchange` left this module when it stopped
 * being a 501 stub: the REAL session-mint needs `UserRepo`/`SessionService`
 * (DB), so — same carve-out as `orvexApplyOps` — it moved to the DB-backed,
 * unconditionally-mounted `OrvexSessionMintModule`
 * (`orvex/session-mint/orvex-session-mint.module.ts`).
 */
@Module({
  imports: [OrvexConfigModule],
  controllers: [
    OrvexQuotaController,
    OrvexSourceController,
    OrvexTenantMoveController,
  ],
})
export class OrvexHttpModule {}
