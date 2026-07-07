import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException, Logger } from '@nestjs/common';
import {
  IAuditService,
  AuditLogContext,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditLogPayload } from '../../common/events/audit-events';
import {
  isExemptFromSso,
  OrvexEnforceSsoCheckService,
  OrvexMemberLookup,
} from './orvex-enforce-sso-check.service';

/**
 * A real, in-process capturing audit sink (CS §5 / ❌#4 — never jest.mock an
 * owned package; assert via a real sink capturing rows).
 */
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

  logBatchWithContext() {
    // not used by this service
  }

  setActorId() {}
  setActorType() {}
  updateRetention() {}
}

/** Thin typed fake for the confined member-role lookup (CS §4f). */
class FakeMemberLookup implements OrvexMemberLookup {
  constructor(private readonly member?: { id: string; role: string }) {}

  async findMemberRole() {
    return this.member;
  }
}

describe('isExemptFromSso', () => {
  it('AC8 — owner and admin are exempt; member is not', () => {
    expect(isExemptFromSso('owner')).toBe(true);
    expect(isExemptFromSso('admin')).toBe(true);
    expect(isExemptFromSso('member')).toBe(false);
  });
});

describe('OrvexEnforceSsoCheckService.checkOrThrow', () => {
  it('AC7 — refuses a non-exempt member with SSO_REQUIRED and audits once', async () => {
    const audit = new CapturingAuditService();
    const lookup = new FakeMemberLookup({ id: 'u1', role: 'member' });
    const service = new OrvexEnforceSsoCheckService(lookup, audit);

    const workspace = { id: 'ws1', settings: { oidc: { enforceSso: true } } };

    let caught: ForbiddenException | undefined;
    try {
      await service.checkOrThrow(workspace, 'member@example.com');
    } catch (err) {
      caught = err as ForbiddenException;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect(caught!.getResponse()).toMatchObject({ error: 'SSO_REQUIRED' });

    expect(audit.logs).toHaveLength(1);
    expect(audit.logs[0].payload.event).toBe(
      AuditEvent.OIDC_LOGIN_BLOCKED_BY_ENFORCE_SSO,
    );
  });

  it('rejects with a real ForbiddenException', async () => {
    const audit = new CapturingAuditService();
    const lookup = new FakeMemberLookup({ id: 'u1', role: 'member' });
    const service = new OrvexEnforceSsoCheckService(lookup, audit);
    const workspace = { id: 'ws1', settings: { oidc: { enforceSso: true } } };

    await expect(
      service.checkOrThrow(workspace, 'member@example.com'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('AC8 — admin/owner exempt: resolves without throwing', async () => {
    const audit = new CapturingAuditService();
    const lookup = new FakeMemberLookup({ id: 'u2', role: 'admin' });
    const service = new OrvexEnforceSsoCheckService(lookup, audit);
    const workspace = { id: 'ws1', settings: { oidc: { enforceSso: true } } };

    await expect(
      service.checkOrThrow(workspace, 'admin@example.com'),
    ).resolves.toBeUndefined();
    expect(audit.logs).toHaveLength(0);
  });

  it('does not check when enforceSso is not enabled', async () => {
    const audit = new CapturingAuditService();
    const lookup = new FakeMemberLookup({ id: 'u1', role: 'member' });
    const service = new OrvexEnforceSsoCheckService(lookup, audit);
    const workspace = { id: 'ws1', settings: {} };

    await expect(
      service.checkOrThrow(workspace, 'member@example.com'),
    ).resolves.toBeUndefined();
  });
});

describe('OrvexEnforceSsoCheckService.invalidateAllMemberSessions', () => {
  it('AC9 — emits orvex.enforce_sso.toggled with { workspaceId } on a real EventEmitter2', async () => {
    const audit = new CapturingAuditService();
    const lookup = new FakeMemberLookup();
    const emitter = new EventEmitter2();
    const service = new OrvexEnforceSsoCheckService(lookup, audit, emitter);

    const seen: Array<{ workspaceId: string }> = [];
    emitter.on('orvex.enforce_sso.toggled', (payload) => seen.push(payload));

    await service.invalidateAllMemberSessions('ws1');

    expect(seen).toEqual([{ workspaceId: 'ws1' }]);
  });

  it('AC11 — missing EventEmitter2 logs a warning and resolves without throwing', async () => {
    const audit = new CapturingAuditService();
    const lookup = new FakeMemberLookup();
    const service = new OrvexEnforceSsoCheckService(lookup, audit);
    const warnSpy = jest
      .spyOn((service as unknown as { logger: Logger }).logger, 'warn')
      .mockImplementation(() => undefined);

    await expect(
      service.invalidateAllMemberSessions('ws1'),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
