import { Module } from '@nestjs/common';
import {
  ORVEX_MEMBER_LOOKUP,
  OrvexEnforceSsoCheckService,
} from './orvex-enforce-sso-check.service';
import { OrvexWorkspaceUpdateInterceptor } from './orvex-workspace-update.interceptor';
import { OrvexSsoEventsListener } from '../../core/auth/orvex-sso-events.listener';
import { OrvexMemberLookupAdapter } from '../../core/auth/orvex-member-lookup';
import { NoopAuditModule } from '../../integrations/audit/audit.module';

/**
 * OrvexEnforceSsoModule — the composition point for the ported
 * settings-merge + enforce-SSO PRIMITIVES (ENG-1432), and — as of ENG-1409 —
 * imported UNCONDITIONALLY by `AuthModule` (not gated behind
 * `ORVEX_MODULES_ENABLED`): the enforce-SSO login gate and the toggle→revoke
 * coordination are core FR-15 session behaviour, not an additive/experimental
 * orvex surface. `OrvexRootModule.register()` also mounts it behind the
 * vanilla-byte-parity flag for the rest of the additive orvex tree; the two
 * imports resolve to the same Nest module singleton.
 *
 * SCOPE / LIVE-WIRING STATUS (ENG-1409 — supersedes the ENG-1432 review #1
 * finding F1/F1c note that used to live here):
 *  - `OrvexEnforceSsoCheckService.checkOrThrow` IS invoked by
 *    `AuthController.login`, BEFORE credential verification (AC2/AC3/AC4).
 *  - `OrvexSsoEventsListener` IS discovered by `EventEmitterModule` via this
 *    module's provider graph, so `orvex.enforce_sso.toggled` →
 *    `UserSessionRepo.revokeByWorkspaceId` (AC6) fires live once something
 *    calls `checkOrThrow`'s sibling `invalidateAllMemberSessions`.
 *  - The real workspace-update handler
 *    (`core/workspace/services/workspace.service.ts#update()`) still persists
 *    `settings` via its own per-key repo writes and does NOT call
 *    `mergeWorkspaceSettings`, and `OrvexWorkspaceUpdateInterceptor` is still
 *    not bound to any route — that toggle-emission wiring remains deferred to
 *    ENG-1490 (which this ticket blocks); E2E coverage of the fully wired
 *    toggle path is ENG-1572.
 */
@Module({
  imports: [NoopAuditModule],
  providers: [
    { provide: ORVEX_MEMBER_LOOKUP, useClass: OrvexMemberLookupAdapter },
    OrvexEnforceSsoCheckService,
    OrvexSsoEventsListener,
    OrvexWorkspaceUpdateInterceptor,
  ],
  exports: [
    OrvexEnforceSsoCheckService,
    OrvexWorkspaceUpdateInterceptor,
  ],
})
export class OrvexEnforceSsoModule {}
