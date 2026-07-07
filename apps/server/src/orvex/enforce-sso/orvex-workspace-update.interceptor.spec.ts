import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import {
  IAuditService,
  AuditLogContext,
} from '../../integrations/audit/audit.service';
import { AuditEvent, AuditLogPayload } from '../../common/events/audit-events';
import { OrvexWorkspaceUpdateInterceptor } from './orvex-workspace-update.interceptor';

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

function makeContext(beforeWorkspace: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ raw: { workspace: beforeWorkspace } }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler(afterWorkspace: unknown): CallHandler {
  return { handle: () => of(afterWorkspace) } as CallHandler;
}

/** Small async flush so the interceptor's fire-and-forget audit call lands. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('OrvexWorkspaceUpdateInterceptor', () => {
  it('emits OIDC_ENFORCE_SSO_TOGGLED when enforceSso flips false -> true', async () => {
    const audit = new CapturingAuditService();
    const interceptor = new OrvexWorkspaceUpdateInterceptor(audit);

    const before = { id: 'ws1', settings: { oidc: { enforceSso: false } } };
    const after = { id: 'ws1', settings: { oidc: { enforceSso: true } } };

    await interceptor
      .intercept(makeContext(before), makeHandler(after))
      .toPromise();
    await flush();

    expect(audit.logs).toHaveLength(1);
    expect(audit.logs[0].payload.event).toBe(
      AuditEvent.OIDC_ENFORCE_SSO_TOGGLED,
    );
  });

  it('does NOT emit when there is no enforceSso diff', async () => {
    const audit = new CapturingAuditService();
    const interceptor = new OrvexWorkspaceUpdateInterceptor(audit);

    const before = { id: 'ws1', settings: { oidc: { enforceSso: true } } };
    const after = {
      id: 'ws1',
      name: 'renamed',
      settings: { oidc: { enforceSso: true } },
    };

    await interceptor
      .intercept(makeContext(before), makeHandler(after))
      .toPromise();
    await flush();

    expect(audit.logs).toHaveLength(0);
  });

  it('never blocks the response — the handled value passes through unchanged', async () => {
    const audit = new CapturingAuditService();
    const interceptor = new OrvexWorkspaceUpdateInterceptor(audit);
    const before = { id: 'ws1', settings: {} };
    const after = { id: 'ws1', settings: { oidc: { enforceSso: true } } };

    const result = await interceptor
      .intercept(makeContext(before), makeHandler(after))
      .toPromise();

    expect(result).toBe(after);
  });
});
