// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { OrvexApplyOpsController } from './orvex-apply-ops.controller';
import { ApplyOpsService } from './apply-ops.service';

/**
 * ENG-1652 — the apply-ops HTTP write primitive's DB-aware home.
 * `PageRepo`/`KyselyDB`/`IdempotencyStore` are all provided by `@Global()`
 * modules (`DatabaseModule`/the redis integration module), so this module
 * only needs to declare its own controller + service.
 *
 * Deliberately NOT mounted by `OrvexRootModule.register()` — see
 * `OrvexHttpModule`'s docstring and `OrvexModulesEnabledGuard` (same
 * DB-dependency conflict as `OrvexPageMetadataModule`/`OrvexLlmsModule`).
 * Mounted unconditionally by `PageModule` instead, its real runtime home;
 * `OrvexModulesEnabledGuard` reproduces the `ORVEX_MODULES_ENABLED` gate at
 * the request edge (AC6 vanilla byte-parity).
 */
@Module({
  controllers: [OrvexApplyOpsController],
  providers: [ApplyOpsService],
  exports: [ApplyOpsService],
})
export class OrvexApplyOpsModule {}
