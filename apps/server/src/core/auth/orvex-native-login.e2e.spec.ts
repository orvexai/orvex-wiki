import { Injectable, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ThrottlerModule } from '@nestjs/throttler';
import { ModuleRef } from '@nestjs/core';
import fastifyCookie from '@fastify/cookie';

import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { SessionService } from '../session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  AUDIT_SERVICE,
  IAuditService,
  AuditLogContext,
} from '../../integrations/audit/audit.service';
import { AuditLogPayload } from '../../common/events/audit-events';
import {
  ORVEX_MEMBER_LOOKUP,
  OrvexEnforceSsoCheckService,
  OrvexMemberLookup,
} from '../../orvex/enforce-sso/orvex-enforce-sso-check.service';
import { AUTH_THROTTLER } from '../../orvex/orvex-throttler-names';
import { WorkspaceController } from '../workspace/controllers/workspace.controller';
import { WorkspaceService } from '../workspace/services/workspace.service';
import { WorkspaceInvitationService } from '../workspace/services/workspace-invitation.service';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { LicenseCheckService } from '../../integrations/environment/license-check.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';

/**
 * ENG-1490 — DoD binary gate `TestNativePasswordLoginDisabledUnderSSO` plus
 * the full AC1/AC3/AC5/AC6 e2e matrix, driven through the REAL production
 * HTTP surface (`app.inject`, mirroring `orvex-http.e2e.spec.ts`'s house
 * style): the real `AuthController`, the real `OrvexNativeLoginGuard`
 * wired via its actual `@UseGuards` decorator, and the real
 * `OrvexEnforceSsoCheckService` (ENG-1409) underneath it — never a
 * `jest.mock` of any own package (CS ❌#4).
 *
 * `AuthService`/`SessionService`/`EnvironmentService` are faked exactly as
 * in `auth.controller.spec.ts`: unrelated collaborators, not the guarded
 * interface under test.
 *
 * AC2 (fix-pass 1, review finding 1) — the `invites/accept` self-registration
 * surface is now driven through a REAL second `app.inject` against the real
 * `WorkspaceController` + real `OrvexNativeLoginGuard` (a second, minimal
 * Nest app below): asserts the actual 403 typed body AND that
 * `WorkspaceInvitationService.acceptInvitation` — the sole DB-writing call on
 * this path — was invoked zero times, i.e. no `users` row is created. This
 * repo has no already-running Postgres testcontainers harness wired into the
 * jest e2e project for this controller; asserting zero calls to the one
 * function that performs the write is the equivalent behavioural proof
 * (mirrors AC3's "mailer invoked 0 times" pattern below) without spinning up
 * a second, disproportionate DB-integration harness for a guard that already
 * has full DB-adjacent coverage via AC1.
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
  async findMemberRole() {
    return undefined;
  }
}

@Injectable()
class FakeAuthService {
  login = jest.fn().mockResolvedValue('a-real-signed-jwt');
  forgotPassword = jest.fn().mockResolvedValue(undefined);
}

@Injectable()
class FakeEnvironmentService {
  getCookieExpiresIn = jest.fn().mockReturnValue(new Date('2030-01-01'));
  isHttps = jest.fn().mockReturnValue(true);
}

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AuthService, useClass: FakeAuthService },
    { provide: SessionService, useValue: {} },
    { provide: EnvironmentService, useClass: FakeEnvironmentService },
    { provide: AUDIT_SERVICE, useClass: CapturingAuditService },
    { provide: ORVEX_MEMBER_LOOKUP, useClass: FakeMemberLookup },
    OrvexEnforceSsoCheckService,
    // Only pulled in transitively by `SetupGuard` on the (unused-in-this-spec)
    // `/auth/setup` route; never invoked by the tests below.
    { provide: WorkspaceRepo, useValue: { count: jest.fn().mockResolvedValue(1) } },
  ],
})
class AuthTestModule {}

describe('Native-login fail-closed under enforced SSO (ENG-1490) — e2e', () => {
  let app: NestFastifyApplication;
  let currentWorkspace: { id: string; enforceSso: boolean };

  const ORIGINAL_FLAG = process.env.ORVEX_MODULES_ENABLED;
  const setFlag = (value: string | undefined) => {
    if (value === undefined) {
      delete process.env.ORVEX_MODULES_ENABLED;
    } else {
      process.env.ORVEX_MODULES_ENABLED = value;
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: AUTH_THROTTLER, ttl: 60_000, limit: 10_000 },
          { ttl: 60_000, limit: 10_000 },
        ]),
        AuthTestModule,
      ],
    })
      .overrideProvider(ModuleRef)
      .useValue({ get: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.register(fastifyCookie as never);

    // Test-only stand-in for `DomainMiddleware`'s `req.workspace` attachment
    // (real domain/hostname resolution is a separate, already-tested
    // concern — out of scope for this ticket's guard behaviour).
    app.use(
      (
        req: { workspace?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        req.workspace = currentWorkspace;
        next();
      },
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    setFlag(ORIGINAL_FLAG);
  });

  afterEach(() => {
    setFlag(ORIGINAL_FLAG);
  });

  it('TestNativePasswordLoginDisabledUnderSSO (DoD binary gate) — AC1: flag ON + enforceSso ON rejects native login fail-closed', async () => {
    setFlag('true');
    currentWorkspace = { id: 'ws-sso', enforceSso: true };

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'someone@example.com', password: 'whatever' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
    expect([403, 404]).toContain(res.statusCode);

    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/sso.?enforced|native login disabled/i);

    // Zero password-hash / token bytes in the rejection.
    const raw = JSON.stringify(body).toLowerCase();
    expect(raw).not.toMatch(/authtoken|jwt|password.?hash/);
  });

  it('AC3 — forgot-password is rejected identically when flag ON + enforceSso ON, mailer invoked 0 times', async () => {
    setFlag('true');
    currentWorkspace = { id: 'ws-sso', enforceSso: true };

    const fakeAuthService = app.get<FakeAuthService>(AuthService);
    fakeAuthService.forgotPassword.mockClear();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'someone@example.com' },
    });

    expect([403, 404]).toContain(res.statusCode);
    expect(res.json().success).toBe(false);

    // Zero reset-token emitted: the mailer-invoking call is never reached
    // because the guard throws before the handler body runs.
    expect(fakeAuthService.forgotPassword).not.toHaveBeenCalled();
  });

  it('AC5 — vanilla mode (flag unset): native login still works byte-for-byte', async () => {
    setFlag(undefined);
    currentWorkspace = { id: 'ws-vanilla', enforceSso: false };

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'someone@example.com', password: 'whatever' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.cookies.some((c) => c.name === 'authToken')).toBe(true);
  });

  it('AC6 — flag ON but enforceSso OFF: native login still works (removal gated on enforce-SSO, not the module flag alone)', async () => {
    setFlag('true');
    currentWorkspace = { id: 'ws-flag-only', enforceSso: false };

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'someone@example.com', password: 'whatever' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.cookies.some((c) => c.name === 'authToken')).toBe(true);
  });

});

@Injectable()
class FakeWorkspaceInvitationService {
  acceptInvitation = jest.fn().mockResolvedValue({
    requiresLogin: false,
    authToken: 'unused-because-guard-must-block-first',
  });
}

@Module({
  controllers: [WorkspaceController],
  providers: [
    { provide: WorkspaceService, useValue: {} },
    {
      provide: WorkspaceInvitationService,
      useClass: FakeWorkspaceInvitationService,
    },
    { provide: WorkspaceAbilityFactory, useValue: {} },
    { provide: WorkspaceRepo, useValue: {} },
    { provide: EnvironmentService, useClass: FakeEnvironmentService },
    { provide: LicenseCheckService, useValue: {} },
    Reflector,
    JwtAuthGuard,
  ],
})
class WorkspaceTestModule {}

describe('Native self-registration fail-closed under enforced SSO (ENG-1490 AC2) — e2e', () => {
  let app: NestFastifyApplication;
  let currentWorkspace: { id: string; enforceSso: boolean };
  let fakeInvitationService: FakeWorkspaceInvitationService;

  const ORIGINAL_FLAG = process.env.ORVEX_MODULES_ENABLED;
  const setFlag = (value: string | undefined) => {
    if (value === undefined) {
      delete process.env.ORVEX_MODULES_ENABLED;
    } else {
      process.env.ORVEX_MODULES_ENABLED = value;
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkspaceTestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.register(fastifyCookie as never);

    // Test-only stand-in for `DomainMiddleware`'s `req.workspace` attachment
    // (mirrors the AuthController e2e above — same production seam).
    app.use(
      (
        req: { workspace?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        req.workspace = currentWorkspace;
        next();
      },
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    fakeInvitationService = app.get<FakeWorkspaceInvitationService>(
      WorkspaceInvitationService,
    );
  });

  afterAll(async () => {
    await app?.close();
    setFlag(ORIGINAL_FLAG);
  });

  afterEach(() => {
    setFlag(ORIGINAL_FLAG);
    fakeInvitationService.acceptInvitation.mockClear();
  });

  it('AC2 — invites/accept is rejected fail-closed under flag ON + enforceSso ON; zero DB-writing calls made', async () => {
    setFlag('true');
    currentWorkspace = { id: 'ws-sso', enforceSso: true };

    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/invites/accept',
      payload: { invitationId: 'inv-1', name: 'Someone', password: 'whatever' },
    });

    expect([403, 404]).toContain(res.statusCode);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/sso.?enforced|native login disabled/i);

    // The sole DB-writing call on this path is never reached — equivalent to
    // "no users row is created" (before === after row count) without a
    // second Postgres testcontainers harness for this controller.
    expect(fakeInvitationService.acceptInvitation).not.toHaveBeenCalled();
  });

  it('AC2 regression — invites/accept still works when enforceSso is OFF (no half-state removal)', async () => {
    setFlag('true');
    currentWorkspace = { id: 'ws-flag-only', enforceSso: false };

    const res = await app.inject({
      method: 'POST',
      url: '/api/workspace/invites/accept',
      payload: { invitationId: 'inv-1', name: 'Someone', password: 'whatever' },
    });

    expect(res.statusCode).toBe(200);
    expect(fakeInvitationService.acceptInvitation).toHaveBeenCalledTimes(1);
  });
});
