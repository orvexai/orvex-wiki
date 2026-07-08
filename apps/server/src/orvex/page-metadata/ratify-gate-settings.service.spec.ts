// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { PreconditionFailedException } from '@nestjs/common';
import { RatifyGateSettingsService } from './ratify-gate-settings.service';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { Workspace } from '../../database/types/entity.types';
import {
  AuditLogContext,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { ActorType, AuditLogPayload } from '../../common/events/audit-events';

type FakeWorkspaceRepo = Pick<
  WorkspaceRepo,
  'findById' | 'updateRatifyGateSettings'
>;

/** A real, in-process capturing audit sink (CS §5 / ❌#4). */
class CapturingAuditService implements IAuditService {
  public readonly logs: Array<{
    payload: AuditLogPayload;
    context: AuditLogContext;
  }> = [];

  log(_payload: AuditLogPayload): void {
    // unused by this service's flows
  }

  async logWithContext(
    payload: AuditLogPayload,
    context: AuditLogContext,
  ): Promise<void> {
    this.logs.push({ payload, context });
  }

  async logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
  ): Promise<void> {
    for (const payload of payloads) {
      this.logs.push({ payload, context });
    }
  }

  setActorId(_actorId: string): void {
    // unused by this service's flows
  }

  setActorType(_actorType: ActorType): void {
    // unused by this service's flows
  }

  async updateRetention(
    _workspaceId: string,
    _retentionDays: number,
  ): Promise<void> {
    // unused by this service's flows
  }
}

describe('RatifyGateSettingsService', () => {
  function makeWorkspaceRepo(initialSettings: unknown = undefined) {
    const workspaces = new Map<string, { id: string; settings: unknown }>();
    workspaces.set('ws-1', { id: 'ws-1', settings: initialSettings });
    workspaces.set('ws-2', { id: 'ws-2', settings: undefined });

    const repo: FakeWorkspaceRepo = {
      findById: jest.fn(async (workspaceId: string) => {
        const ws = workspaces.get(workspaceId);
        return ws ? (ws as unknown as Workspace) : undefined;
      }) as unknown as WorkspaceRepo['findById'],
      updateRatifyGateSettings: jest.fn(
        async (workspaceId: string, prefKey: string, prefValue: unknown) => {
          const ws = workspaces.get(workspaceId);
          const settings = (ws?.settings as Record<string, unknown>) ?? {};
          const ratifyGate =
            (settings.ratifyGate as Record<string, unknown>) ?? {};
          workspaces.set(workspaceId, {
            id: workspaceId,
            settings: {
              ...settings,
              ratifyGate: { ...ratifyGate, [prefKey]: prefValue },
            },
          });
        },
      ) as unknown as WorkspaceRepo['updateRatifyGateSettings'],
    };
    return repo;
  }

  function makeAuditService(): CapturingAuditService {
    return new CapturingAuditService();
  }

  describe('AC5 — per-workspace gate toggle', () => {
    it('defaults to required=true when no setting has ever been written', async () => {
      const repo = makeWorkspaceRepo(undefined);
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(
        repo as WorkspaceRepo,
        audit,
      );

      expect(await service.getRequired('ws-1')).toBe(true);
    });

    it('toggling required=false in one workspace flips only that workspace (no cross-tenant bleed)', async () => {
      const repo = makeWorkspaceRepo(undefined);
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(
        repo as WorkspaceRepo,
        audit,
      );

      await service.updateRequired('ws-1', false, 'admin-user');

      expect(await service.getRequired('ws-1')).toBe(false);
      expect(await service.getRequired('ws-2')).toBe(true);
    });

    it('updateRequired emits exactly one RATIFY_GATE_SETTING_UPDATED audit row', async () => {
      const repo = makeWorkspaceRepo(undefined);
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(
        repo as WorkspaceRepo,
        audit,
      );

      await service.updateRequired('ws-1', false, 'admin-user');

      expect(audit.logs).toHaveLength(1);
      const { payload, context } = audit.logs[0];
      expect(payload.event).toBe('ratify_gate.setting_updated');
      expect(context.workspaceId).toBe('ws-1');
      expect(context.actorId).toBe('admin-user');
    });
  });

  describe('AC6 — forced-self-ratify override', () => {
    it('rejects forceSelfRatify with a forceReason shorter than 20 chars', async () => {
      const repo = makeWorkspaceRepo();
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(
        repo as WorkspaceRepo,
        audit,
      );

      await expect(
        service.assertForceSelfRatify({
          workspaceId: 'ws-1',
          pageId: 'page-1',
          actorId: 'agent-1',
          forceSelfRatify: true,
          forceReason: 'too short',
        }),
      ).rejects.toBeInstanceOf(PreconditionFailedException);

      expect(audit.logs).toHaveLength(0);
    });

    it('a valid override (>=20 char reason) proceeds and emits exactly one audit event carrying the reason', async () => {
      const repo = makeWorkspaceRepo();
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(
        repo as WorkspaceRepo,
        audit,
      );
      const reason = 'automated nightly reconcile requires an unattended promotion';

      await service.assertForceSelfRatify({
        workspaceId: 'ws-1',
        pageId: 'page-1',
        actorId: 'agent-1',
        forceSelfRatify: true,
        forceReason: reason,
      });

      expect(audit.logs).toHaveLength(1);
      const { payload, context } = audit.logs[0];
      expect(payload.event).toBe('ratify_gate.force_self_ratify');
      expect(payload.metadata).toEqual({ reason });
      expect(context.actorId).toBe('agent-1');
    });

    it('is a no-op (no audit) when forceSelfRatify is not set', async () => {
      const repo = makeWorkspaceRepo();
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(
        repo as WorkspaceRepo,
        audit,
      );

      await service.assertForceSelfRatify({
        workspaceId: 'ws-1',
        pageId: 'page-1',
        actorId: 'agent-1',
      });

      expect(audit.logs).toHaveLength(0);
    });
  });
});
