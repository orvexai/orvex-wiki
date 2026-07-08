// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OrvexTransclusionSafeguardService } from './orvex-transclusion-safeguard.service';
import { OrvexTransclusionImpactController } from './orvex-transclusion-impact.controller';
import { TransclusionSafeguardInterceptor } from './interceptors/transclusion-safeguard.interceptor';

/**
 * ENG-1470 — the transclusion write-block safeguard module. `KyselyDB`,
 * `PageTransclusionReferencesRepo` and `AUDIT_SERVICE` are all provided by
 * `@Global()` modules (`DatabaseModule`/`NoopAuditModule`), so this module
 * only declares + exports the safeguard's own three symbols and registers
 * `TransclusionSafeguardInterceptor` as a GLOBAL `APP_INTERCEPTOR` (T6) —
 * it must see every request to gate `/pages/delete` +
 * `/orvex/pages/status` + `/orvex/pages/supersede`.
 */
@Module({
  controllers: [OrvexTransclusionImpactController],
  providers: [
    OrvexTransclusionSafeguardService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TransclusionSafeguardInterceptor,
    },
  ],
  exports: [OrvexTransclusionSafeguardService],
})
export class OrvexTransclusionSafeguardModule {}
