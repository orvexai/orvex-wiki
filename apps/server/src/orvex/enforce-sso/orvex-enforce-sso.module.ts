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
 * settings-merge + enforce-SSO PRIMITIVES (ENG-1432). Mounted by
 * `OrvexRootModule.register()` behind the same `ORVEX_MODULES_ENABLED`
 * vanilla-byte-parity gate as the rest of the additive orvex tree — when
 * disabled, none of this is imported and the engine runs byte-for-byte as
 * upstream.
 *
 * SCOPE / LIVE-WIRING STATUS (corrected post-review — ENG-1432 review #1,
 * finding F1/F1c). This module lands the primitives at the exported-interface
 * level only; it is NOT yet consumed by the live request flow:
 *  - The real workspace-update handler
 *    (`core/workspace/services/workspace.service.ts#update()`) persists
 *    `settings` via its own per-key repo writes and does NOT call
 *    `mergeWorkspaceSettings`. That is a parallel, pre-existing write path —
 *    `mergeWorkspaceSettings` is NOT (yet) the single merge-and-persist entry
 *    point into `workspaces.settings`, despite an earlier, inaccurate claim
 *    in this comment.
 *  - `OrvexWorkspaceUpdateInterceptor` is a registered provider but is not
 *    bound to any route (no `@UseInterceptors`, no `APP_INTERCEPTOR`), so the
 *    `OIDC_ENFORCE_SSO_TOGGLED` audit row and the toggle-triggered session
 *    revoke are not yet emitted by a real `/workspace/update` call.
 *  - `OrvexEnforceSsoCheckService.checkOrThrow` is not invoked by any
 *    login/auth controller, so the `403 SSO_REQUIRED` gate does not yet fire
 *    live.
 * Wiring all of the above into the live workspace-update route and the login
 * path is EXPLICITLY DEFERRED to ENG-1490 (which this ticket blocks); E2E
 * coverage of the wired path is ENG-1572. Until ENG-1490 lands, treat this
 * module's exports as a tested-but-not-yet-consumed substrate, not a
 * delivered end-to-end enforcement path.
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
