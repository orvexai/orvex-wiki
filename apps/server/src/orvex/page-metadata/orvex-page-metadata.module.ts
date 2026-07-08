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
 */
@Module({
  controllers: [RatifyGateSettingsController, OrvexPagePromoteController],
  providers: [
    OrvexPageMetadataService,
    OrvexMarkdownInterceptor,
    RatifyTokenService,
    ConfirmTokenService,
    RatifyGateSettingsService,
  ],
  exports: [
    OrvexPageMetadataService,
    OrvexMarkdownInterceptor,
    RatifyTokenService,
    ConfirmTokenService,
    RatifyGateSettingsService,
  ],
})
export class OrvexPageMetadataModule {}
