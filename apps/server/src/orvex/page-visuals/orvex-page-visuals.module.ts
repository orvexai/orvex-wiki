// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { CaslModule } from '../../core/casl/casl.module';
import { OrvexPageVisualsController } from './orvex-page-visuals.controller';
import { OrvexPageVisualsService } from './orvex-page-visuals.service';

/**
 * ENG-1376 — P7 read-only visual projections (subpage-cards / freshness /
 * changelog). Mounted directly on `app.module.ts` (same core-integration
 * precedent as `OrvexPageProvenanceModule`, ENG-1447) rather than through
 * `OrvexRootModule.register()` — this module needs `@InjectKysely()`
 * (`DatabaseModule` is `@Global()`) which `OrvexRootModule`'s isolated
 * e2e harness cannot resolve (see the ENG-1371 note on
 * `orvex-root.module.ts`).
 */
@Module({
  imports: [CaslModule],
  controllers: [OrvexPageVisualsController],
  providers: [OrvexPageVisualsService],
  exports: [OrvexPageVisualsService],
})
export class OrvexPageVisualsModule {}
