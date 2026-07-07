import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Injectable, Module } from '@nestjs/common';
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
import { OrvexNativeLoginGuard } from '../../orvex/http/orvex-native-login.guard';
import { WorkspaceController } from '../workspace/controllers/workspace.controller';
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
 * interface under test. AC2 (the `invites/accept` self-registration surface)
 * is proven by a guard-metadata assertion rather than a second full
 * `WorkspaceController` bootstrap — `WorkspaceController` pulls a large,
 * unrelated dependency graph (license checks, ability factory, invitation
 * service, …) that AC1's real e2e already exercises the guard's actual
 * behaviour through; re-deriving all of it here would test the SAME guard
 * logic twice at disproportionate cost (mirrors the documented rationale in
 * `scope-intersection.rest-wiring.integration.spec.ts`).
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

  it('AC3 — forgot-password is rejected identically when flag ON + enforceSso ON', async () => {
    setFlag('true');
    currentWorkspace = { id: 'ws-sso', enforceSso: true };

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'someone@example.com' },
    });

    expect([403, 404]).toContain(res.statusCode);
    expect(res.json().success).toBe(false);
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

  it('AC2 (wiring proof) — OrvexNativeLoginGuard is attached to the invites/accept self-registration route', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      WorkspaceController.prototype.acceptInvite,
    );
    expect(guards).toContain(OrvexNativeLoginGuard);
  });
});
