// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Inject, Injectable, PreconditionFailedException } from '@nestjs/common';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

const MIN_FORCE_REASON_LENGTH = 20;

/** Defensive read of `settings.ratifyGate.required` from an untyped jsonb value. */
function readSettingsRatifyGateRequired(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return true;
  const ratifyGate = (settings as Record<string, unknown>).ratifyGate;
  if (!ratifyGate || typeof ratifyGate !== 'object') return true;
  const required = (ratifyGate as Record<string, unknown>).required;
  // Secure default (AC5 NFR): only an explicit `false` opts out.
  return required !== false;
}

/**
 * ENG-1445 AC5/AC6 — the per-workspace ratify-gate setting + the opt-in,
 * audited forced-self-ratify override.
 *
 * Deep module (CS §3): `getRequired`/`updateRequired` own the workspace-
 * scoped jsonb read/write (no cross-tenant bleed — every read/write is
 * keyed on `workspaceId`); `assertForceSelfRatify` owns the 20+ char
 * reason gate AND the single audit emission — a caller cannot get the
 * override to "succeed" without exactly one audit row being written.
 *
 * Scope note (mirrors ENG-1371's own scope carve-out, CS §8 anti-ball-of-
 * mud): this leg builds the setting + override PRIMITIVE. The actual
 * page-promote/supersede HTTP chokepoint that CONSULTS `getRequired()`
 * before allowing a tokenless `api_key` promotion does not exist yet in
 * this repo (`OrvexPageMetadataService`'s own docstring defers the R3
 * ratify/confirm-token gate wiring to a later leg) — wiring this service
 * into that chokepoint is real, separable follow-up work for that leg,
 * not fabricated here.
 */
@Injectable()
export class RatifyGateSettingsService {
  constructor(
    private readonly workspaceRepo: WorkspaceRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  /** AC5 — default `required = true`; only an explicit `false` disables the gate. */
  async getRequired(workspaceId: string): Promise<boolean> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    return readSettingsRatifyGateRequired(workspace?.settings);
  }

  /**
   * AC5 — toggling this setting is what flips whether a tokenless
   * `api_key` promotion is refused vs. allowed at the (future) promote
   * chokepoint; scoped strictly to `workspaceId` (no cross-tenant bleed).
   */
  async updateRequired(
    workspaceId: string,
    required: boolean,
    actorId: string,
  ): Promise<boolean> {
    await this.workspaceRepo.updateRatifyGateSettings(
      workspaceId,
      'required',
      required,
    );

    await this.auditService.logWithContext(
      {
        event: AuditEvent.RATIFY_GATE_SETTING_UPDATED,
        resourceType: AuditResource.WORKSPACE,
        resourceId: workspaceId,
        changes: { after: { required } },
      },
      { workspaceId, actorId, actorType: 'user' },
    );

    return required;
  }

  /**
   * AC6 — the opt-in forced-self-ratify override. Throws
   * `PreconditionFailedException` when `forceReason` is shorter than
   * {@link MIN_FORCE_REASON_LENGTH} chars; otherwise emits EXACTLY ONE
   * audit row carrying the actor + reason. Never silently succeeds
   * without that audit write (CS §11 honesty/never-silently-drop).
   */
  async assertForceSelfRatify(
    input: {
      workspaceId: string;
      pageId: string;
      actorId: string;
      forceSelfRatify?: boolean;
      forceReason?: string;
    },
  ): Promise<void> {
    if (!input.forceSelfRatify) {
      return;
    }

    const reason = input.forceReason ?? '';
    if (reason.length < MIN_FORCE_REASON_LENGTH) {
      throw new PreconditionFailedException({
        error: 'FORCE_SELF_RATIFY_REASON_TOO_SHORT',
        minLength: MIN_FORCE_REASON_LENGTH,
      });
    }

    await this.auditService.logWithContext(
      {
        event: AuditEvent.RATIFY_GATE_FORCE_SELF_RATIFY,
        resourceType: AuditResource.PAGE,
        resourceId: input.pageId,
        metadata: { reason },
      },
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        actorType: 'api_key',
      },
    );
  }
}
