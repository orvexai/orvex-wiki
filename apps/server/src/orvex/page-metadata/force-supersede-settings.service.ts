// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

const MIN_FORCE_REASON_LENGTH = 20;

/** Defensive read of `settings.forceSupersede.enabled` from an untyped jsonb value. */
function readSettingsForceSupersedeEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const forceSupersede = (settings as Record<string, unknown>).forceSupersede;
  if (!forceSupersede || typeof forceSupersede !== 'object') return false;
  const enabled = (forceSupersede as Record<string, unknown>).enabled;
  // Fail-closed default (AC5, CS ❌#10): only an explicit `true` opts in.
  return enabled === true;
}

/**
 * ENG-1434 AC5/AC6/AC7 — the per-workspace forced-supersede break-glass
 * setting + the opt-in, reason-gated, audited override.
 *
 * Mirrors `RatifyGateSettingsService` (ENG-1445) but the polarity is
 * inverted: the ratify gate defaults ON (secure), the forced-supersede
 * override defaults OFF/disabled (secure) — a workspace admin must
 * explicitly flip `settings.forceSupersede.enabled = true` before ANY
 * caller (human or api_key) may use `forceSupersede` on the supersede
 * chokepoint (AC5). Even once enabled, every invocation still requires a
 * 20+ char reason (AC6) and always emits exactly one
 * `SUPERSEDE_FORCED_BYPASS` audit row (AC7) — this service never lets the
 * override "succeed" silently (CS §11).
 */
@Injectable()
export class ForceSupersedeSettingsService {
  constructor(
    private readonly workspaceRepo: WorkspaceRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  /** AC5 — fail-closed default `enabled = false`; only an explicit `true` allows it. */
  async getEnabled(workspaceId: string): Promise<boolean> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    return readSettingsForceSupersedeEnabled(workspace?.settings);
  }

  /** Workspace-admin toggle (mirrors `RatifyGateSettingsService.updateRequired`). */
  async updateEnabled(
    workspaceId: string,
    enabled: boolean,
    actorId: string,
  ): Promise<boolean> {
    await this.workspaceRepo.updateForceSupersedeSettings(
      workspaceId,
      'enabled',
      enabled,
    );

    await this.auditService.logWithContext(
      {
        event: AuditEvent.FORCE_SUPERSEDE_SETTING_UPDATED,
        resourceType: AuditResource.WORKSPACE,
        resourceId: workspaceId,
        changes: { after: { enabled } },
      },
      { workspaceId, actorId, actorType: 'user' },
    );

    return enabled;
  }

  /**
   * AC5/AC6 — the enforcement gate a caller must clear BEFORE the
   * forced-supersede path is allowed to proceed. Throws
   * `ForbiddenException({error:'SUPERSEDE_FORCE_NOT_ALLOWED'})` (403) when
   * the workspace has not opted in, or `BadRequestException
   * ({error:'FORCE_REASON_REQUIRED'})` (400) when the reason is missing/
   * short. Never audits here — the caller (the supersede chokepoint) emits
   * the single `SUPERSEDE_FORCED_BYPASS` row once the whole atomic write
   * actually commits (AC7), so a check that never resulted in a mutation
   * never produces a misleading "it happened" audit trail.
   */
  async assertForceSupersedeAllowed(input: {
    workspaceId: string;
    forceReason?: string;
  }): Promise<void> {
    const enabled = await this.getEnabled(input.workspaceId);
    if (!enabled) {
      throw new ForbiddenException({ error: 'SUPERSEDE_FORCE_NOT_ALLOWED' });
    }

    const reason = input.forceReason ?? '';
    if (reason.trim().length < MIN_FORCE_REASON_LENGTH) {
      throw new BadRequestException({
        error: 'FORCE_REASON_REQUIRED',
        minLength: MIN_FORCE_REASON_LENGTH,
      });
    }
  }
}
