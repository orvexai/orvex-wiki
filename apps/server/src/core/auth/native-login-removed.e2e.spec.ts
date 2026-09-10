import { DynamicModule, Injectable, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PassportStrategy } from '@nestjs/passport';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ThrottlerModule } from '@nestjs/throttler';
import { Strategy } from 'passport-strategy';

import { AuthController } from './auth.controller';
import { AuthModule } from './auth.module';
import { NativeAuthController } from './native-auth.controller';
import { AuthService } from './services/auth.service';
import { SessionService } from '../session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { AUTH_THROTTLER } from '../../orvex/orvex-throttler-names';

class NoopAuditService implements IAuditService {
  log() {}
  logWithContext() {}
  logBatchWithContext() {}
  setActorId() {}
  setActorType() {}
  updateRetention() {}
}

class TestEnvironmentService {
  isCloud() {
    return false;
  }
}

@Injectable()
class RejectJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  authenticate() {
    this.fail(401);
  }

  validate() {
    return undefined;
  }
}

@Module({})
class NativeLoginRemovedTestModule {}

function testModuleWithProductionAuthControllers(): DynamicModule {
  const registeredAuthModule = AuthModule.register();

  return {
    module: NativeLoginRemovedTestModule,
    controllers: registeredAuthModule.controllers,
    providers: [
      {
        provide: AuthService,
        useValue: { verifyUserToken: jest.fn().mockResolvedValue({}) },
      },
      { provide: SessionService, useValue: {} },
      { provide: Reflector, useValue: new Reflector() },
      { provide: EnvironmentService, useClass: TestEnvironmentService },
      { provide: AUDIT_SERVICE, useClass: NoopAuditService },
      RejectJwtStrategy,
    ],
  };
}

describe('TestNativeLoginRemoved — real HTTP route table', () => {
  let app: NestFastifyApplication;
  const originalModuleFlag = process.env.ORVEX_MODULES_ENABLED;
  const originalRemovalFlag = process.env.NATIVE_LOGIN_REMOVED;

  beforeAll(async () => {
    process.env.NATIVE_LOGIN_REMOVED = 'true';

    const registeredAuthModule = AuthModule.register();
    expect(registeredAuthModule.controllers).toEqual([AuthController]);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: AUTH_THROTTLER, ttl: 60_000, limit: 10_000 },
          { ttl: 60_000, limit: 10_000 },
        ]),
        testModuleWithProductionAuthControllers(),
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.use(
      (req: { workspace?: unknown }, _res: unknown, next: () => void) => {
        req.workspace = { id: 'test-workspace' };
        next();
      },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    if (originalModuleFlag === undefined) {
      delete process.env.ORVEX_MODULES_ENABLED;
    } else {
      process.env.ORVEX_MODULES_ENABLED = originalModuleFlag;
    }
    if (originalRemovalFlag === undefined) {
      delete process.env.NATIVE_LOGIN_REMOVED;
    } else {
      process.env.NATIVE_LOGIN_REMOVED = originalRemovalFlag;
    }
  });

  it('keeps the native controller registered when the removal flag is off', () => {
    delete process.env.NATIVE_LOGIN_REMOVED;
    expect(AuthModule.register().controllers).toEqual([
      AuthController,
      NativeAuthController,
    ]);
    process.env.NATIVE_LOGIN_REMOVED = 'true';
  });

  it('TestNativeLoginRemoved — all five native routes are unregistered and return typed 404', async () => {
    const removedRoutes = [
      '/api/auth/login',
      '/api/auth/setup',
      '/api/auth/change-password',
      '/api/auth/forgot-password',
      '/api/auth/password-reset',
    ];

    for (const url of removedRoutes) {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.json()).toEqual(
        expect.objectContaining({ statusCode: 404 }),
      );
    }
  });

  it('preserves the three identity-backed auth routes in the same composition', async () => {
    for (const url of [
      '/api/auth/collab-token',
      '/api/auth/verify-token',
      '/api/auth/logout',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: {},
      });

      expect([200, 401]).toContain(response.statusCode);
    }
  });
});
