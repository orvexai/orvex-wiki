import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { LoginDto } from './dto/login.dto';
import {
  IAuditService,
  AuditLogContext,
} from '../../integrations/audit/audit.service';
import { AuditLogPayload } from '../../common/events/audit-events';
import {
  OrvexEnforceSsoCheckService,
  OrvexMemberLookup,
} from '../../orvex/enforce-sso/orvex-enforce-sso-check.service';

/**
 * CapturingAuditService — real, in-process audit sink (CS ❌#4: never
 * jest.mock an owned package). Shared shape with the enforce-sso specs.
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

function buildController(opts: {
  member?: { id: string; role: string };
  authServiceLogin?: jest.Mock;
}) {
  const audit = new CapturingAuditService();
  const enforceSso = new OrvexEnforceSsoCheckService(
    new FakeMemberLookup(opts.member),
    audit,
  );
  const authService = {
    login: opts.authServiceLogin ?? jest.fn().mockResolvedValue('a-real-jwt'),
  };
  const environmentService = {
    getCookieExpiresIn: jest.fn().mockReturnValue(new Date('2030-01-01')),
    isHttps: jest.fn().mockReturnValue(true),
  };
  const sessionService = {};
  const moduleRef = { get: jest.fn() };
  const controller = new AuthController(
    authService as any,
    sessionService as any,
    environmentService as any,
    moduleRef as any,
    audit,
    enforceSso,
  );
  return { controller, audit, authService };
}

describe('AuthController.login — enforce-SSO gate (ENG-1409)', () => {
  const workspace: any = { id: 'ws1', enforceSso: true };
  const loginInput: LoginDto = {
    email: 'member@example.com',
    password: 'irrelevant',
  };
  const res: any = { setCookie: jest.fn() };
  const req: any = { ip: '10.0.0.1', headers: { 'user-agent': 'jest' } };

  it('AC2 — blocks a MEMBER with SSO_REQUIRED BEFORE credential verification', async () => {
    const authServiceLogin = jest.fn();
    const { controller, audit } = buildController({
      member: { id: 'u1', role: 'member' },
      authServiceLogin,
    });

    await expect(
      controller.login(workspace, res, loginInput, req),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Gate runs BEFORE credential verification: authService.login never called.
    expect(authServiceLogin).not.toHaveBeenCalled();
    expect(audit.logs).toHaveLength(1);
  });

  it('AC3 — allows an ADMIN through to credential verification (no throw)', async () => {
    const authServiceLogin = jest.fn().mockResolvedValue('signed-jwt');
    const { controller, audit } = buildController({
      member: { id: 'u2', role: 'admin' },
      authServiceLogin,
    });

    await controller.login(workspace, res, loginInput, req);

    expect(authServiceLogin).toHaveBeenCalledWith(loginInput, workspace.id);
    expect(audit.logs).toHaveLength(0);
    expect(res.setCookie).toHaveBeenCalledWith(
      'authToken',
      'signed-jwt',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
  });

  it('does not gate when enforceSso is off (fast path)', async () => {
    const authServiceLogin = jest.fn().mockResolvedValue('signed-jwt');
    const { controller, audit } = buildController({
      member: { id: 'u1', role: 'member' },
      authServiceLogin,
    });

    await controller.login(
      { id: 'ws2', enforceSso: false } as any,
      res,
      loginInput,
      req,
    );

    expect(authServiceLogin).toHaveBeenCalled();
    expect(audit.logs).toHaveLength(0);
  });
});
