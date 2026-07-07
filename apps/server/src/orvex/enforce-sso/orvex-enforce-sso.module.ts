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
 * OrvexEnforceSsoModule — T6: the single composition point for the
 * settings-merge + enforce-SSO surface (ENG-1432). Mounted by
 * `OrvexRootModule.register()` behind the same `ORVEX_MODULES_ENABLED`
 * vanilla-byte-parity gate as the rest of the additive orvex tree — when
 * disabled, none of this is imported and the engine runs byte-for-byte as
 * upstream.
 *
 * `mergeWorkspaceSettings` (./merge-settings.ts) and `OrvexWorkspaceSettings`
 * (./workspace-settings.dto.ts) are pure/validation-tier exports with no
 * providers of their own — callers import them directly at the
 * `workspaces.settings` write path, which keeps `mergeWorkspaceSettings` the
 * single merge-and-persist entry point without this module needing to own
 * that call site.
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
