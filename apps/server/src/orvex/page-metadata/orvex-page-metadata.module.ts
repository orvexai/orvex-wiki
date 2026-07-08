// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { OrvexPageMetadataService } from './orvex-page-metadata.service';
import { OrvexMarkdownInterceptor } from './markdown/orvex-markdown.interceptor';
import { RatifyTokenService } from './ratify-token.service';
import { ConfirmTokenService } from './confirm-token.service';
import { RatifyGateSettingsService } from './ratify-gate-settings.service';
import { RatifyGateSettingsController } from './ratify-gate-settings.controller';
import { OrvexPagePromoteController } from './orvex-page-promote.controller';
import { ForceSupersedeSettingsService } from './force-supersede-settings.service';
import { ForceSupersedeSettingsController } from './force-supersede-settings.controller';
import { OrvexPageSupersedeController } from './orvex-page-supersede.controller';
import { WsPageLifecycleBroadcaster } from './ws-page-lifecycle-broadcaster';
import { PAGE_LIFECYCLE_BROADCASTER } from './supersede.types';
import { PageMetaVerificationService } from './page-meta-verification.service';

/**
 * ENG-1371 — the page-metadata domain module. `WorkspaceRepo`/`KyselyDB` are
 * provided by the `@Global()` `DatabaseModule`, so this module only needs to
 * declare + export the service (and the request-edge markdown interceptor,
 * AC8) itself.
 *
 * Imported unconditionally by `PageModule` (`apps/server/src/core/page/
 * page.module.ts`) — the real delivery path: `PageController.create`/
 * `.update` bind `OrvexMarkdownInterceptor` via `@UseInterceptors` (review1
 * F1/F2). Same unconditional core-integration precedent as
 * `OrvexPageProvenanceModule` (ENG-1447).
 *
 * Deliberately NOT mounted by `OrvexRootModule.register()` — see that
 * module's docstring: its flag-ON e2e harness boots without `DatabaseModule`,
 * and `OrvexPageMetadataService` needs `@InjectKysely()`.
 *
 * ENG-1445 — also declares/exports the ratify/confirm token governance
 * primitives (`RatifyTokenService`/`ConfirmTokenService`) and the
 * per-workspace ratify-gate settings surface
 * (`RatifyGateSettingsService`/`RatifyGateSettingsController`), AND
 * (review1 F1/F3) the real promote-to-`canonical` HTTP chokepoint
 * (`OrvexPagePromoteController`) that CONSULTS `getRequired()` /
 * `RatifyTokenService.verify()` / `assertForceSelfRatify()` before allowing
 * an `api_key` caller to flip a page to `canonical` — `PageRepo` and
 * `SpaceAbilityFactory` are both `@Global()`-provided (`DatabaseModule`/
 * `CaslModule`), so no explicit import is needed for either.
 *
 * ENG-1434 — also declares/exports the forced-supersede break-glass
 * primitive (`ForceSupersedeSettingsService`/
 * `ForceSupersedeSettingsController`) and the real supersede/unsupersede/
 * status HTTP chokepoint (`OrvexPageSupersedeController`), plus the
 * `WsService`-backed realtime broadcaster (`WsPageLifecycleBroadcaster`,
 * bound to `PAGE_LIFECYCLE_BROADCASTER`) for AC13's post-commit freshness
 * push. `WsService` is `@Global()`-provided (`WsModule`), so no explicit
 * import is needed.
 *
 * ENG-1379 — also declares/exports `PageMetaVerificationService`, the thin
 * `verified_against`/`verified_at` stamp+read accessor for the future
 * wiki-api (D-S8) drift-verification decision logic to call into (see that
 * service's own docstring for the ticket's premise-correction note).
 */
@Module({
  controllers: [
    RatifyGateSettingsController,
    OrvexPagePromoteController,
    ForceSupersedeSettingsController,
    OrvexPageSupersedeController,
  ],
  providers: [
    OrvexPageMetadataService,
    OrvexMarkdownInterceptor,
    RatifyTokenService,
    ConfirmTokenService,
    RatifyGateSettingsService,
    ForceSupersedeSettingsService,
    WsPageLifecycleBroadcaster,
    {
      provide: PAGE_LIFECYCLE_BROADCASTER,
      useExisting: WsPageLifecycleBroadcaster,
    },
    PageMetaVerificationService,
  ],
  exports: [
    OrvexPageMetadataService,
    OrvexMarkdownInterceptor,
    RatifyTokenService,
    ConfirmTokenService,
    RatifyGateSettingsService,
    ForceSupersedeSettingsService,
    PageMetaVerificationService,
  ],
})
export class OrvexPageMetadataModule {}
