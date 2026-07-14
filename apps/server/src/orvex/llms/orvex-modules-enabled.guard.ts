// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

/**
 * OrvexModulesEnabledGuard — ENG-1492 AC6 (vanilla byte-parity).
 *
 * `OrvexLlmsModule` cannot mount under `OrvexRootModule.register()` like
 * most additive orvex surfaces: `OrvexLlmsService` needs `PageRepo` /
 * `PagePermissionRepo` (`@InjectKysely()`), and `orvex-http.e2e.spec.ts`
 * boots the `register()` tree WITHOUT `DatabaseModule` — the same
 * DB-dependency conflict that keeps `OrvexPageMetadataModule` out of that
 * tree too (see the `OrvexRootModule` docstring). So `OrvexLlmsModule` is
 * wired unconditionally into `PageModule` (its real, DB-aware runtime
 * home) and THIS guard reproduces the `ORVEX_MODULES_ENABLED` gate at the
 * request edge instead: flag off (or unset) -> every route it protects
 * 404s BEFORE the handler body runs (byte-parity with vanilla Docmost,
 * which has no `/api/orvex/llms*` routes at all) -> flag on -> pass
 * through to the next guard (`OrvexBearerAuthGuard`).
 *
 * Same literal check as `OrvexRootModule.register()` (CS §3 one-adapter
 * rule: one source of truth for the flag).
 */
@Injectable()
export class OrvexModulesEnabledGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.ORVEX_MODULES_ENABLED !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
