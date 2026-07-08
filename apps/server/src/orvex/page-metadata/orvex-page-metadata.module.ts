// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { OrvexPageMetadataService } from './orvex-page-metadata.service';
import { OrvexMarkdownInterceptor } from './markdown/orvex-markdown.interceptor';

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
 */
@Module({
  providers: [OrvexPageMetadataService, OrvexMarkdownInterceptor],
  exports: [OrvexPageMetadataService, OrvexMarkdownInterceptor],
})
export class OrvexPageMetadataModule {}
