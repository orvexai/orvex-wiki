// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Global, Module } from '@nestjs/common';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';

/**
 * TEST-ONLY DI stub for the `OrvexRootModule.register()` DB-free harness
 * pattern (`orvex-root.module.ts`'s own doc comment: several modules — page
 * metadata, the migrator, llms — are deliberately NOT mounted there so this
 * tree can boot `@nestjs/testing` WITHOUT `DatabaseModule`/Kysely at all).
 *
 * ENG-3167 introduced ONE dependency that carve-out cannot route around:
 * `OrvexEnforceSsoModule` (required unconditionally, not excludable from
 * `register()`) now imports `OrvexAuditModule` (`@Global()`), whose
 * `OrvexAuditService`/`OutboxWriter` both `@InjectKysely()` the real
 * connection — so every harness that boots `OrvexRootModule.register()`
 * alone now fails DI resolution ("KyselyModuleConnectionToken ... not
 * available") even though none of these DB-free suites ever exercises an
 * audit-emitting route.
 *
 * `overrideProvider()` cannot fix this: it only SWAPS an already-registered
 * provider's implementation, and no module in this tree registers
 * `KyselyModuleConnectionToken` at all (there is no `KyselyModule.forRoot()`
 * here) — `overrideProvider` on a token nothing provides is a silent no-op,
 * still throws the exact same DI error. This module instead ADDS a real
 * (`@Global()`, so it is visible to the deeply-nested `OrvexAuditModule`
 * regardless of import path) provider for that token — the placeholder
 * `KyselyModuleConnectionToken` value itself, an inert placeholder: the
 * exact "true-external port double" shape CS §5 asks for here, since none
 * of these harnesses' routes ever reach an audit-emitting code path
 * (verified: neither `OrvexAuditService` nor `OutboxWriter` does anything
 * with the connection outside a `log()`/`enqueue()` call). A REAL Kysely
 * instance (testcontainers Postgres) is exactly what the audit path's OWN
 * suites already exercise (`orvex-audit.service.spec.ts`,
 * `orvex-audit-outbox-route.integration.spec.ts`) — this stub is
 * deliberately narrower than that, not a substitute for it.
 *
 * Usage: add {@link DbFreeAuditKyselyStubModule} alongside
 * `OrvexRootModule.register()` in the harness's `Test.createTestingModule`
 * `imports` array.
 */
@Global()
@Module({
  providers: [{ provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} }],
  exports: [KYSELY_MODULE_CONNECTION_TOKEN()],
})
export class DbFreeAuditKyselyStubModule {}
