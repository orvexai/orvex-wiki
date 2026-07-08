// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { PreconditionFailedException } from '@nestjs/common';
import { RatifyGateSettingsService } from './ratify-gate-settings.service';

describe('RatifyGateSettingsService', () => {
  function makeWorkspaceRepo(initialSettings: unknown = undefined) {
    const workspaces = new Map<string, { id: string; settings: unknown }>();
    workspaces.set('ws-1', { id: 'ws-1', settings: initialSettings });
    workspaces.set('ws-2', { id: 'ws-2', settings: undefined });

    return {
      findById: jest.fn(async (workspaceId: string) => workspaces.get(workspaceId)),
      updateRatifyGateSettings: jest.fn(
        async (workspaceId: string, prefKey: string, prefValue: unknown) => {
          const ws = workspaces.get(workspaceId);
          const settings = (ws?.settings as any) ?? {};
          const ratifyGate = settings.ratifyGate ?? {};
          workspaces.set(workspaceId, {
            id: workspaceId,
            settings: {
              ...settings,
              ratifyGate: { ...ratifyGate, [prefKey]: prefValue },
            },
          });
        },
      ),
    };
  }

  function makeAuditService() {
    return {
      log: jest.fn(),
      logWithContext: jest.fn(
        async (_payload: any, _context: any): Promise<void> => {},
      ),
      logBatchWithContext: jest.fn(),
      setActorId: jest.fn(),
      setActorType: jest.fn(),
      updateRetention: jest.fn(),
    };
  }

  describe('AC5 — per-workspace gate toggle', () => {
    it('defaults to required=true when no setting has ever been written', async () => {
      const repo = makeWorkspaceRepo(undefined);
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(repo as any, audit as any);

      expect(await service.getRequired('ws-1')).toBe(true);
    });

    it('toggling required=false in one workspace flips only that workspace (no cross-tenant bleed)', async () => {
      const repo = makeWorkspaceRepo(undefined);
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(repo as any, audit as any);

      await service.updateRequired('ws-1', false, 'admin-user');

      expect(await service.getRequired('ws-1')).toBe(false);
      expect(await service.getRequired('ws-2')).toBe(true);
    });

    it('updateRequired emits exactly one RATIFY_GATE_SETTING_UPDATED audit row', async () => {
      const repo = makeWorkspaceRepo(undefined);
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(repo as any, audit as any);

      await service.updateRequired('ws-1', false, 'admin-user');

      expect(audit.logWithContext).toHaveBeenCalledTimes(1);
      const [payload, context] = audit.logWithContext.mock.calls[0];
      expect(payload.event).toBe('ratify_gate.setting_updated');
      expect(context.workspaceId).toBe('ws-1');
      expect(context.actorId).toBe('admin-user');
    });
  });

  describe('AC6 — forced-self-ratify override', () => {
    it('rejects forceSelfRatify with a forceReason shorter than 20 chars', async () => {
      const repo = makeWorkspaceRepo();
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(repo as any, audit as any);

      await expect(
        service.assertForceSelfRatify({
          workspaceId: 'ws-1',
          pageId: 'page-1',
          actorId: 'agent-1',
          forceSelfRatify: true,
          forceReason: 'too short',
        }),
      ).rejects.toBeInstanceOf(PreconditionFailedException);

      expect(audit.logWithContext).not.toHaveBeenCalled();
    });

    it('a valid override (>=20 char reason) proceeds and emits exactly one audit event carrying the reason', async () => {
      const repo = makeWorkspaceRepo();
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(repo as any, audit as any);
      const reason = 'automated nightly reconcile requires an unattended promotion';

      await service.assertForceSelfRatify({
        workspaceId: 'ws-1',
        pageId: 'page-1',
        actorId: 'agent-1',
        forceSelfRatify: true,
        forceReason: reason,
      });

      expect(audit.logWithContext).toHaveBeenCalledTimes(1);
      const [payload, context] = audit.logWithContext.mock.calls[0];
      expect(payload.event).toBe('ratify_gate.force_self_ratify');
      expect(payload.metadata).toEqual({ reason });
      expect(context.actorId).toBe('agent-1');
    });

    it('is a no-op (no audit) when forceSelfRatify is not set', async () => {
      const repo = makeWorkspaceRepo();
      const audit = makeAuditService();
      const service = new RatifyGateSettingsService(repo as any, audit as any);

      await service.assertForceSelfRatify({
        workspaceId: 'ws-1',
        pageId: 'page-1',
        actorId: 'agent-1',
      });

      expect(audit.logWithContext).not.toHaveBeenCalled();
    });
  });
});
