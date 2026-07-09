// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Module } from '@nestjs/common';
import { OrvexLlmsController } from './orvex-llms.controller';
import { OrvexLlmsService } from './orvex-llms.service';
import { OrvexModulesEnabledGuard } from './orvex-modules-enabled.guard';

/**
 * OrvexLlmsModule (ENG-1492, F29) — mounts the token-scope-filtered LLM
 * discovery surface (`llms.txt` / `llms-full.txt` / `pages/:id/page.md`).
 *
 * NOT mounted under `OrvexRootModule.register()` (unlike most additive
 * orvex surfaces): `OrvexLlmsService` needs `PageRepo`/`PagePermissionRepo`
 * (`@InjectKysely()`), and `orvex-http.e2e.spec.ts` boots the `register()`
 * tree WITHOUT `DatabaseModule` — the same conflict documented on
 * `OrvexPageMetadataModule` in the `OrvexRootModule` docstring. Real
 * delivery path: wired unconditionally into `PageModule`
 * (`core/page/page.module.ts`, DB-aware), with
 * `OrvexModulesEnabledGuard` reproducing the `ORVEX_MODULES_ENABLED` gate
 * at the request edge (AC6 — 404 byte-parity when the flag is off).
 * `PageRepo`/`PagePermissionRepo` come from the `@Global()`
 * `DatabaseModule`; `SpaceAbilityFactory` from the `@Global()`
 * `CaslModule` — neither needs an explicit `imports:` entry.
 */
@Module({
  controllers: [OrvexLlmsController],
  providers: [OrvexLlmsService, OrvexModulesEnabledGuard],
})
export class OrvexLlmsModule {}
