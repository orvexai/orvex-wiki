import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { mergeWorkspaceSettings } from './merge-settings';
import { OrvexWorkspaceSettings } from './workspace-settings.dto';
import {
  OrvexEnforceSsoCheckService,
  OrvexMemberLookup,
} from '../enforce-sso/orvex-enforce-sso-check.service';
import { OrvexSsoEventsListener } from '../../core/auth/orvex-sso-events.listener';
import { UserSessionRepo } from '../../database/repos/session/user-session.repo';
import {
  IAuditService,
  AuditLogContext,
} from '../../integrations/audit/audit.service';
import { AuditLogPayload } from '../../common/events/audit-events';

class CapturingAuditService implements IAuditService {
  public readonly logs: Array<{
    payload: AuditLogPayload;
    context?: AuditLogContext;
  }> = [];
  log(payload: AuditLogPayload) {
    this.logs.push({ payload });
  }
  logWithContext(payload: AuditLogPayload, context: AuditLogContext) {
    this.logs.push({ payload, context });
  }
  logBatchWithContext() {}
  setActorId() {}
  setActorType() {}
  updateRetention() {}
}

class FakeMemberLookup implements OrvexMemberLookup {
  constructor(private readonly member?: { id: string; role: string }) {}
  async findMemberRole() {
    return this.member;
  }
}

/**
 * TestSettingsMergeAndEnforceSso — ENG-1432 §5a named DoD binary gate.
 *
 * Drives ONLY exported interfaces, crossing all four required behaviours:
 *  1. mergeWorkspaceSettings — sibling-preserve + array-replace + null-delete.
 *  2. validate(OrvexWorkspaceSettings) — rejects non-boolean mcp.enabled.
 *  3. checkOrThrow on enforceSso:true + member — rejects SSO_REQUIRED, audits once.
 *  4. invalidateAllMemberSessions -> real EventEmitter2 -> OrvexSsoEventsListener
 *     -> UserSessionRepo.revokeByWorkspaceId(wsId) row-effect.
 *
 * Deterministic (no Date.now/rand); survives internal renames because it only
 * touches the public surface of each module.
 */
describe('TestSettingsMergeAndEnforceSso', () => {
  it('1. mergeWorkspaceSettings: sibling-preserve + array-replace + null-delete', () => {
    const existing = {
      ai: { chat: true, search: true, models: ['a', 'b'] },
      oidc: { enabled: true, issuerUrl: 'https://issuer.example' },
    };
    const patch = {
      ai: { chat: false, models: ['c'] },
      oidc: { issuerUrl: null },
    };

    const result = mergeWorkspaceSettings(existing, patch);

    expect(result.ai.chat).toBe(false);
    expect(result.ai.search).toBe(true); // sibling preserved
    expect(result.ai.models).toEqual(['c']); // replaced, not concatenated
    expect(result.oidc.enabled).toBe(true); // sibling preserved
    expect('issuerUrl' in result.oidc).toBe(false); // null == delete
  });

  it('2. validate(OrvexWorkspaceSettings) rejects non-boolean mcp.enabled', async () => {
    const dto = plainToInstance(OrvexWorkspaceSettings, {
      mcp: { enabled: 'yes' },
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('3. checkOrThrow rejects a non-exempt member with SSO_REQUIRED and audits once', async () => {
    const audit = new CapturingAuditService();
    const lookup = new FakeMemberLookup({ id: 'u1', role: 'member' });
    const service = new OrvexEnforceSsoCheckService(lookup, audit);
    const workspace = { id: 'ws1', settings: { oidc: { enforceSso: true } } };

    let caught: unknown;
    try {
      await service.checkOrThrow(workspace, 'member@example.com');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getResponse()).toMatchObject({
      error: 'SSO_REQUIRED',
    });
    expect(audit.logs).toHaveLength(1);
  });

  it('4. invalidateAllMemberSessions -> real EventEmitter2 -> listener -> repo row-effect', async () => {
    const audit = new CapturingAuditService();
    const lookup = new FakeMemberLookup();
    const emitter = new EventEmitter2();
    const service = new OrvexEnforceSsoCheckService(lookup, audit, emitter);

    // Owned, stateful fake (not a bare jest.fn spy) — the assertion below
    // checks the ROW-EFFECT (which rows end up revoked), not a call-count
    // (ENG-1432 review #1, finding F2; §4f/§5d row-effect mandate).
    const rows: Array<{ id: string; workspaceId: string; revokedAt: Date | null }> = [
      { id: 's1', workspaceId: 'ws1', revokedAt: null },
      { id: 's2', workspaceId: 'ws2', revokedAt: null },
    ];
    const repo = {
      async revokeByWorkspaceId(workspaceId: string) {
        for (const row of rows) {
          if (row.workspaceId === workspaceId && row.revokedAt === null) {
            row.revokedAt = new Date();
          }
        }
      },
    } as unknown as UserSessionRepo;
    const listener = new OrvexSsoEventsListener(repo);
    emitter.on('orvex.enforce_sso.toggled', (event) =>
      listener.handleEnforceSsoToggled(event),
    );

    await service.invalidateAllMemberSessions('ws1');
    // let the (synchronous, but promise-returning) listener handler settle.
    await new Promise((resolve) => setImmediate(resolve));

    expect(rows[0].revokedAt).not.toBeNull(); // ws1 row revoked
    expect(rows[1].revokedAt).toBeNull(); // ws2 row untouched
  });
});
