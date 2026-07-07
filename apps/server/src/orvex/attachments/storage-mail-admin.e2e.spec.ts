import { createHash } from 'crypto';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';

import { TransformHttpResponseInterceptor } from '../../common/interceptors/http-response.interceptor';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { UserRole } from '../../common/helpers/types/permission';
import { LocalDriver } from '../../integrations/storage/drivers/local.driver';

import { OrvexStorageAdminController } from './orvex-storage-admin.controller';
import { ORVEX_S3_PROBE_CLIENT_FACTORY } from './orvex-s3-probe-client.factory';
import {
  OrvexAuthedUser,
  OrvexAuthedWorkspace,
} from './orvex-workspace-auth';
import { OrvexMailAdminController } from '../mail/orvex-mail-admin.controller';
import { ORVEX_SMTP_PROBE_TRANSPORT_FACTORY } from '../mail/orvex-smtp-probe-transport.factory';

/**
 * TestStorageMailAdminSurfaces — the named DoD gate (ENG-1433 §5a).
 *
 * Exercises the exported HTTP handlers of both admin surfaces plus the
 * engine binary chokepoint's byte-equality invariant. Deterministic: no live
 * network, no `Date.now`; S3/SMTP are true-external and replayed via
 * injected factories (CS §4f) — `EnvironmentService` and
 * `WorkspaceAbilityFactory` are REAL, in-process instances (never mocked,
 * ❌4).
 */
describe('TestStorageMailAdminSurfaces', () => {
  // ---- fake config-backed EnvironmentService (in-process, owned; §4f) ----
  const envValues: Record<string, string> = {
    STORAGE_DRIVER: 's3',
    AWS_S3_ACCESS_KEY_ID: 'AKIA_REAL_LOOKING_KEY',
    AWS_S3_SECRET_ACCESS_KEY: 'super-secret-value-1234',
    AWS_S3_REGION: 'eu-central-1',
    AWS_S3_BUCKET: 'orvex-wiki-attachments',
    AWS_S3_ENDPOINT: 'https://s3.example.com',
    AWS_S3_FORCE_PATH_STYLE: 'true',
    MAIL_DRIVER: 'smtp',
    MAIL_FROM_ADDRESS: 'noreply@orvex.ai',
    MAIL_FROM_NAME: 'Orvex Wiki',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USERNAME: 'smtp-user',
    SMTP_PASSWORD: 'smtp-secret-pw',
  };
  const fakeConfigService = {
    get: (key: string, def?: unknown) => envValues[key] ?? def,
  } as unknown as ConfigService;
  const environmentService = new EnvironmentService(fakeConfigService);

  const workspaceAbility = new WorkspaceAbilityFactory();
  const workspace = { id: 'workspace-1' } as unknown as OrvexAuthedWorkspace;
  const adminUser = {
    id: 'user-admin',
    role: UserRole.ADMIN,
  } as unknown as OrvexAuthedUser;
  const memberUser = {
    id: 'user-member',
    role: UserRole.MEMBER,
  } as unknown as OrvexAuthedUser;

  // Mutable holder so the overridden guard can attach whichever user a given
  // test needs, while still exercising the REAL WorkspaceAbilityFactory /
  // CASL check inside the controller.
  let currentUser = adminUser;

  const fakeAuthGuard = {
    canActivate: (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = { user: currentUser, workspace };
      req.raw = { workspace };
      return true;
    },
  };

  let app: NestFastifyApplication;
  let fakeS3Factory: { create: jest.Mock };
  let fakeSmtpFactory: { create: jest.Mock };

  beforeAll(async () => {
    fakeS3Factory = { create: jest.fn() };
    fakeSmtpFactory = { create: jest.fn() };

    // NOTE: constructs the REAL exported controllers directly (rather than
    // via OrvexAttachmentsHostModule/OrvexMailModule) so the test stays
    // infra-free — those two modules are thin declarative @Module wiring
    // (T6) that additionally pull in the app-global EnvironmentModule/
    // CaslModule at runtime; here we supply the same REAL, in-process
    // EnvironmentService/WorkspaceAbilityFactory instances directly as
    // providers instead of booting full ConfigModule env validation.
    const moduleRef = await Test.createTestingModule({
      controllers: [OrvexStorageAdminController, OrvexMailAdminController],
      providers: [
        { provide: EnvironmentService, useValue: environmentService },
        { provide: WorkspaceAbilityFactory, useValue: workspaceAbility },
        { provide: ORVEX_S3_PROBE_CLIENT_FACTORY, useValue: fakeS3Factory },
        {
          provide: ORVEX_SMTP_PROBE_TRANSPORT_FACTORY,
          useValue: fakeSmtpFactory,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeAuthGuard)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, stopAtFirstError: true }),
    );
    app.useGlobalInterceptors(
      new TransformHttpResponseInterceptor(app.get(Reflector)),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => {
    currentUser = adminUser;
    jest.clearAllMocks();
  });

  // ---- AC1: storage masked read ----
  it('AC1 — storage settings masked read', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/integrations/storage/settings',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.driver).toBe('s3');
    expect(body.bucket).toBe('orvex-wiki-attachments');
    expect(body.secretAccessKey).toMatch(/^.{0,4}•+.{0,4}$/);
    expect(body.secretAccessKey).not.toBe(envValues.AWS_S3_SECRET_ACCESS_KEY);
    expect(body.accessKeyId).toMatch(/^.{0,4}•+.{0,4}$/);
    expect(body.accessKeyId).not.toBe(envValues.AWS_S3_ACCESS_KEY_ID);
  });

  // ---- AC2: storage non-admin 403 ----
  it('AC2 — storage settings non-admin rejected', async () => {
    currentUser = memberUser;
    const res = await app.inject({
      method: 'GET',
      url: '/api/integrations/storage/settings',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'INSUFFICIENT_PERMISSIONS' });
  });

  // ---- AC3 + AC10: S3 test HeadBucket probe ----
  it('AC3 — S3 test probes with HeadBucket, reachable -> {ok:true}', async () => {
    fakeS3Factory.create.mockReturnValue({
      send: jest.fn().mockResolvedValue({ $metadata: { httpStatusCode: 200 } }),
      destroy: jest.fn(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/storage/test',
      payload: {
        accessKeyId: 'a',
        secretAccessKey: 'b',
        region: 'eu-central-1',
        bucket: 'orvex-wiki-attachments',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ ok: true });
  });

  it('AC3/AC10 — S3 test unreachable -> typed {ok:false}, never 500', async () => {
    const notFound = new Error('UnknownError');
    notFound.name = 'NotFound';
    fakeS3Factory.create.mockReturnValue({
      send: jest.fn().mockRejectedValue(notFound),
      destroy: jest.fn(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/storage/test',
      payload: {
        accessKeyId: 'a',
        secretAccessKey: 'b',
        region: 'eu-central-1',
        bucket: 'nonexistent-bucket',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(res.statusCode).not.toBe(500);
  });

  it('AC10 — S3 test bounded timeout -> typed {ok:false, error:"timeout"}', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    fakeS3Factory.create.mockReturnValue({
      send: (_cmd: unknown, opts: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.abortSignal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
      destroy: jest.fn(),
    });

    const controller = app.get(OrvexStorageAdminController);
    const resultPromise = controller.testStorage(
      {
        accessKeyId: 'a',
        secretAccessKey: 'b',
        region: 'eu-central-1',
        bucket: 'unreachable-host',
      },
      adminUser,
      workspace,
    );

    await jest.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;
    expect(result).toEqual({ ok: false, error: 'timeout' });
    jest.useRealTimers();
  });

  // ---- AC4: mail masked read ----
  it('AC4 — mail settings masked read', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/integrations/mail/settings',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.host).toBe('smtp.example.com');
    expect(body.hasUsername).toBe(true);
    expect(body.usernameMasked).toMatch(/^.{0,4}•+.{0,4}$/);
    expect(JSON.stringify(body)).not.toContain('smtp-secret-pw');
    expect(body.password).toBeUndefined();
  });

  // ---- AC5: mail non-admin 403 ----
  it('AC5 — mail settings non-admin rejected', async () => {
    currentUser = memberUser;
    const res = await app.inject({
      method: 'GET',
      url: '/api/integrations/mail/settings',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'INSUFFICIENT_PERMISSIONS' });
  });

  // ---- AC6: mail test transient send, no persisted mutation ----
  it('AC6 — mail test sends via a transient transport, no config write', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
    fakeSmtpFactory.create.mockReturnValue({ sendMail });

    const beforeUsername = environmentService.getSmtpUsername();
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/mail/test',
      payload: { recipient: 'admin@example.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ ok: true });
    expect(fakeSmtpFactory.create).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('admin@example.com');
    // no persisted config mutation:
    expect(environmentService.getSmtpUsername()).toBe(beforeUsername);
  });

  // ---- AC7: mail test invalid recipient 400 ----
  it('AC7 — mail test invalid recipient rejected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/mail/test',
      payload: { recipient: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    const messages: string[] = Array.isArray(body.message)
      ? body.message
      : [body.message];
    expect(messages.some((m) => m.includes('recipient'))).toBe(true);
  });

  // ---- AC8: binary attachment up/download byte-equality ----
  it('AC8 — binary round-trip through the engine storage chokepoint is byte-equal', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orvex-attach-'));
    try {
      const driver = new LocalDriver({ storagePath: tmpDir });
      const uploaded = Buffer.from(
        Array.from({ length: 4096 }, (_, i) => i % 256),
      );
      const filePath = 'workspace-1/attachments/binary-fixture.bin';

      await driver.upload(filePath, uploaded);
      const downloaded = await driver.read(filePath);

      const sha256 = (buf: Buffer) =>
        createHash('sha256').update(buf).digest('hex');
      expect(sha256(downloaded)).toBe(sha256(uploaded));
      expect(Buffer.compare(downloaded, uploaded)).toBe(0);
    } finally {
      await fs.remove(tmpDir);
    }
  });

  // ---- AC9: engine attachment controller is the single binary chokepoint ----
  it('AC9 — the engine attachment controller remains the only binary read/write chokepoint', () => {
    const serverSrc = path.resolve(__dirname, '..', '..');
    const binaryRouteRe = /@(Get|Post)\(\s*['"`][^'"`]*files[^'"`]*['"`]/;
    const storageIoRe = /storageService\.(readStream|readRangeStream|read|upload|uploadStream)\(/;

    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.controller.ts')) continue;
        if (full.endsWith('attachment.controller.ts')) continue;
        const content = fs.readFileSync(full, 'utf8');
        if (binaryRouteRe.test(content) || storageIoRe.test(content)) {
          offenders.push(full);
        }
      }
    };
    walk(serverSrc);

    expect(offenders).toEqual([]);
  });
});
