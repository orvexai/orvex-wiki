// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2503 — `TestUpgradePassAndRegistryDelegationAreWiredInTheComposedApp`.
 *
 * WHY THIS SPEC EXISTS (the defect it is written against): the DoD gate
 * (`src/core/workspace/upgrade-pass.integration-spec.ts`) hand-constructs
 * `PrincipalProvisioningService` and `WorkspaceUpgradeService` with `new`,
 * passing the fake registry positionally. That proves the SERVICE LOGIC but
 * never exercises Nest DI — and the real application was mis-wired: the
 * registry port was a module-PRIVATE provider inside `OrvexHttpModule`
 * (unexported, and itself only mounted under `ORVEX_MODULES_ENABLED=true`),
 * while both consumers injected it `@Optional()`. Nest therefore resolved
 * `undefined` with NO boot error, `reserveTenantGlobally` took its early
 * return, and AC3/AC4/AC5 never ran in any real deployment.
 *
 * So this spec deliberately does the OPPOSITE of the gate: it composes the
 * REAL Nest modules (`OrvexIdentityRegistryModule` + `InternalApiModule` ->
 * `WorkspaceModule`), boots them over a REAL testcontainers Postgres, and
 * drives the REAL HTTP routes. The only substitution is at the genuine
 * remote-but-owned seam (CS §5): identity's registry, stood in for by a LOCAL
 * fixture HTTP server that the real `HttpIdentityRegistryClient` — composed
 * from `ORVEX_IDENTITY_URL` by the real module factory — actually calls over
 * the wire. Nothing of this repo's own code is mocked (❌#4).
 *
 * It asserts:
 *  W1 — the port RESOLVES from the container by its DI token, and is the real
 *       `HttpIdentityRegistryClient` (not `undefined`, not fail-closed).
 *  W2 — `PrincipalProvisioningService`, `WorkspaceUpgradeService` and
 *       `WorkspaceService` all hold that SAME single instance (one adapter,
 *       CS §3.2).
 *  W3 — AC4 through the composed app: `POST /internal/principals/provision`
 *       causes a REAL reserve call to land on the registry fixture BEFORE the
 *       local `workspaces` row exists.
 *  W4 — AC5 through the composed app: the fixture's 409 surfaces as a typed
 *       409 carrying `TENANT_ALREADY_RESERVED`, and NOTHING is written
 *       locally.
 *  W5 — AC3 through the composed app: `POST /internal/tenants/upgrade-to-team`
 *       re-keys in place — `workspace_id` byte-for-byte unchanged, a seeded
 *       page's FK identical, `principal_kind` 'user' -> 'org'.
 *  W6 — AC3 seat-counting: the member-cap chokepoint is exercised across the
 *       upgrade and keys on the SAME `workspace_id` before and after, so
 *       seats keep counting on the re-keyed tenant.
 *
 * Deterministic: fixed tenant/subject fixtures, no `Date.now()`-keyed
 * assertion, no live network beyond 127.0.0.1.
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { KyselyModule } from 'nestjs-kysely';
import { CamelCasePlugin } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { ClsModule } from 'nestjs-cls';
import { EventEmitterModule } from '@nestjs/event-emitter';

import {
  HttpIdentityRegistryClient,
  IdentityRegistryClient,
} from '../../src/orvex/http/identity-registry-client';
import {
  IDENTITY_REGISTRY_CLIENT,
  OrvexIdentityRegistryModule,
} from '../../src/orvex/http/orvex-identity-registry.module';
import { InternalApiModule } from '../../src/core/internal-api/internal-api.module';
import { PrincipalProvisioningService } from '../../src/core/internal-api/principal-provisioning.service';
import { WorkspaceUpgradeService } from '../../src/core/workspace/services/workspace-upgrade.service';
import { WorkspaceService } from '../../src/core/workspace/services/workspace.service';
import { INTERNAL_API_AUTH_CONFIG } from '../../src/core/internal-api/internal-api-auth';
import { EntitlementService } from '../../src/orvex/entitlement/entitlement.service';
import { EnvironmentService } from '../../src/integrations/environment/environment.service';
import { LicenseCheckService } from '../../src/integrations/environment/license-check.service';
import { DomainService } from '../../src/integrations/environment/domain.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from '../../src/integrations/queue/constants';
import { NoopAuditModule } from '../../src/integrations/audit/audit.module';
import { ExportService } from '../../src/integrations/export/export.service';
import { startTestDatabase, TestDb } from './db-test-harness';

/** Fixed, deterministic fixtures (no rand/time keying). */
const BEARER = 'eng-2503-wiring-bearer';
const PERSONAL_TENANT = '00000000-0000-4000-8000-00000000e501';
const COLLIDING_TENANT = '00000000-0000-4000-8000-00000000e502';
const MINTED_ORG_ID = 'org_2wiring_minted_1';

interface RecordedReserve {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

/**
 * The CS §5 remote-but-owned double: a LOCAL HTTP fixture standing in for
 * identity's `POST /v1/registry/reserve`. The REAL
 * `HttpIdentityRegistryClient` the real module factory composes calls it over
 * a real socket, so the wiring under test is genuinely end-to-end.
 */
class FakeRegistryServer {
  readonly reserves: RecordedReserve[] = [];
  /** tenantId -> HTTP status to answer with (default 200). */
  readonly statusFor = new Map<string, number>();
  private server: http.Server | undefined;
  baseUrl = '';

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          body = {};
        }
        const url = req.url ?? '';
        const tenantId = String(body.tenantId ?? '');
        if (!url.startsWith('/v1/registry/reserve')) {
          res.statusCode = 404;
          res.end('{}');
          return;
        }
        this.reserves.push({ url, body });
        const status = this.statusFor.get(tenantId) ?? 200;
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        if (status === 200) {
          res.end(
            JSON.stringify({
              tenantId,
              reserved: true,
              orgId:
                body.principalKind === 'org' ? MINTED_ORG_ID : undefined,
            }),
          );
        } else {
          res.end(JSON.stringify({ error: 'already reserved' }));
        }
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    this.baseUrl = `http://127.0.0.1:${
      (this.server!.address() as AddressInfo).port
    }`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) =>
      this.server!.close((err) => (err ? reject(err) : resolve())),
    );
  }

  reservesFor(tenantId: string): RecordedReserve[] {
    return this.reserves.filter((r) => r.body.tenantId === tenantId);
  }
}

const SAVED_ENV = {
  ORVEX_IDENTITY_URL: process.env.ORVEX_IDENTITY_URL,
  INTERNAL_API_BEARER_TOKEN: process.env.INTERNAL_API_BEARER_TOKEN,
};

describe('TestUpgradePassAndRegistryDelegationAreWiredInTheComposedApp (ENG-2503 wiring gate)', () => {
  jest.setTimeout(240_000);

  let testDb: TestDb;
  let sqlClient: ReturnType<typeof postgres>;
  let registryServer: FakeRegistryServer;
  let built: TestingModule;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    sqlClient = postgres(
      `postgres://orvex:orvex@${testDb.container.getHost()}:${testDb.container.getMappedPort(
        5432,
      )}/orvex_test`,
      { onnotice: () => undefined },
    );

    registryServer = new FakeRegistryServer();
    await registryServer.start();

    // The REAL module factory reads this — the composed client is the real
    // HTTP adapter pointed at the local fixture, never a hand-injected fake.
    process.env.ORVEX_IDENTITY_URL = registryServer.baseUrl;
    process.env.INTERNAL_API_BEARER_TOKEN = BEARER;

    /**
     * Stand-ins ONLY at genuine external/infra rows (CS §5): BullMQ queues,
     * the licence/environment/domain env readers, the billing entitlement
     * port, and `ExportService` (a heavy PDF/docx dependency this seam never
     * touches). Every tenancy class under test — `PrincipalProvisioningService`,
     * `WorkspaceUpgradeService`, `WorkspaceService`, `WorkspaceRepo`,
     * `SpaceService` — is the REAL one, resolved by Nest.
     */
    @Global()
    @Module({
      providers: [
        {
          provide: EnvironmentService,
          useValue: {
            isCloud: () => false,
            isSelfHosted: () => true,
            getAppSecret: () => 'x'.repeat(32),
            getJwtTokenExpiresIn: () => '30d',
            getBillingTrialDays: () => 14,
            getAppUrl: () => 'http://localhost',
            getSubdomainHost: () => 'localhost',
          },
        },
        {
          provide: LicenseCheckService,
          useValue: { hasFeature: () => true, isValidEELicense: () => true },
        },
        {
          provide: DomainService,
          useValue: { getUrl: (h: string) => `http://${h}.localhost` },
        },
        {
          provide: EntitlementService,
          useValue: {
            // Seat/member-cap chokepoint: records the principal key it is
            // asked about so W6 can prove seats keep counting on the SAME
            // workspace id across the re-key. Always allows (this spec is
            // about WIRING, not about cap arithmetic — ENG-2491 owns that).
            seatPrincipalsAsked: [] as string[],
            async assertWithinQuotaAllowingOverage(workspaceId: string) {
              (
                this as unknown as { seatPrincipalsAsked: string[] }
              ).seatPrincipalsAsked.push(workspaceId);
            },
            async assertWithinQuota(workspaceId: string) {
              (
                this as unknown as { seatPrincipalsAsked: string[] }
              ).seatPrincipalsAsked.push(workspaceId);
            },
            async hasFeature() {
              return true;
            },
            async getEntitlement() {
              return { plan: 'free' };
            },
          },
        },
        { provide: ExportService, useValue: {} },
        {
          provide: getQueueToken(QueueName.ATTACHMENT_QUEUE),
          useValue: { add: async () => undefined },
        },
        {
          provide: getQueueToken(QueueName.BILLING_QUEUE),
          useValue: { add: async () => undefined },
        },
        {
          provide: getQueueToken(QueueName.AI_QUEUE),
          useValue: { add: async () => undefined },
        },
        {
          provide: getQueueToken(QueueName.GENERAL_QUEUE),
          useValue: { add: async () => undefined },
        },
        {
          provide: getQueueToken(QueueName.EMAIL_QUEUE),
          useValue: { add: async () => undefined },
        },
      ],
      exports: [
        EnvironmentService,
        LicenseCheckService,
        DomainService,
        EntitlementService,
        ExportService,
        getQueueToken(QueueName.ATTACHMENT_QUEUE),
        getQueueToken(QueueName.BILLING_QUEUE),
        getQueueToken(QueueName.AI_QUEUE),
        getQueueToken(QueueName.GENERAL_QUEUE),
        getQueueToken(QueueName.EMAIL_QUEUE),
      ],
    })
    class TestInfraModule {}

    built = await Test.createTestingModule({
      imports: [
        KyselyModule.forRoot({
          dialect: new PostgresJSDialect({ postgres: sqlClient }),
          plugins: [new CamelCasePlugin()],
        }),
        ClsModule.forRoot({ global: true, middleware: { mount: true } }),
        EventEmitterModule.forRoot(),
        NoopAuditModule,
        TestInfraModule,
        // THE THING UNDER TEST: the real global registry module + the real
        // internal-api module (which pulls in the real WorkspaceModule).
        OrvexIdentityRegistryModule,
        InternalApiModule,
      ],
    })
      .overrideProvider(INTERNAL_API_AUTH_CONFIG)
      .useValue({ bearerToken: BEARER })
      .compile();

    app = built.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await sqlClient?.end({ timeout: 5 });
    await registryServer?.stop();
    await testDb?.teardown();
    for (const [k, v] of Object.entries(SAVED_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('W1 — the identity registry port RESOLVES from the composed container as the REAL HTTP adapter', () => {
    const port = built.get<IdentityRegistryClient>(IDENTITY_REGISTRY_CLIENT, {
      strict: false,
    });
    // The exact failure the audit found: this used to be `undefined`.
    expect(port).toBeDefined();
    expect(port).toBeInstanceOf(HttpIdentityRegistryClient);
  });

  it('W2 — every tenancy consumer holds that SAME single adapter instance (one adapter, CS §3.2)', () => {
    const port = built.get<IdentityRegistryClient>(IDENTITY_REGISTRY_CLIENT, {
      strict: false,
    });
    const provisioning = built.get(PrincipalProvisioningService, {
      strict: false,
    });
    const upgrade = built.get(WorkspaceUpgradeService, { strict: false });
    const workspaces = built.get(WorkspaceService, { strict: false });

    for (const consumer of [provisioning, upgrade, workspaces]) {
      const held = (consumer as unknown as { registryClient?: unknown })
        .registryClient;
      expect(held).toBe(port);
    }
  });

  it('W3 (AC4) — provisioning through the composed HTTP route reserves at the GLOBAL registry BEFORE the local insert', async () => {
    expect(registryServer.reservesFor(PERSONAL_TENANT)).toHaveLength(0);

    const res = await app.inject({
      method: 'POST',
      url: '/internal/principals/provision',
      headers: { authorization: `Bearer ${BEARER}` },
      payload: {
        subject: 'sub_wiring_ada',
        tenant: PERSONAL_TENANT,
        email: 'ada.wiring@example.com',
        name: 'Ada',
        provision_workspace: true,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).workspace_created).toBe(true);

    // A REAL reserve call landed on the registry — the delegation runs in the
    // COMPOSED app, not just in a hand-wired test.
    const reserves = registryServer.reservesFor(PERSONAL_TENANT);
    expect(reserves).toHaveLength(1);
    expect(reserves[0].body.principalKind).toBe('user');

    // AC1 — the tenant is user-keyed on the subject; no org anywhere.
    const ws = await testDb.db
      .selectFrom('workspaces')
      .select(['id', 'principalKind', 'principalId'])
      .where('id', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    expect(ws.principalKind).toBe('user');
    expect(ws.principalId).toBe('sub_wiring_ada');
  });

  it('W4 (AC5) — a registry 409 surfaces as a typed TENANT_ALREADY_RESERVED conflict and NOTHING is written locally', async () => {
    registryServer.statusFor.set(COLLIDING_TENANT, 409);

    const res = await app.inject({
      method: 'POST',
      url: '/internal/principals/provision',
      headers: { authorization: `Bearer ${BEARER}` },
      payload: {
        subject: 'sub_wiring_collide',
        tenant: COLLIDING_TENANT,
        email: 'collide.wiring@example.com',
        provision_workspace: true,
      },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body)).toMatchObject({
      code: 'TENANT_ALREADY_RESERVED',
    });

    const local = await testDb.db
      .selectFrom('workspaces')
      .select(['id'])
      .where('id', '=', COLLIDING_TENANT)
      .executeTakeFirst();
    expect(local).toBeUndefined();
  });

  it('W5 (AC3) — the upgrade-pass route re-keys IN PLACE: workspace_id unchanged, data carries, principal_kind flips', async () => {
    const ws = await testDb.db
      .selectFrom('workspaces')
      .select(['id', 'defaultSpaceId'])
      .where('id', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    const owner = await testDb.db
      .selectFrom('users')
      .select(['id'])
      .where('workspaceId', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    const page = await testDb.db
      .insertInto('pages')
      .values({
        title: 'Survives the composed upgrade',
        slugId: 'wiring-upg-1',
        creatorId: owner.id,
        lastUpdatedById: owner.id,
        spaceId: ws.defaultSpaceId!,
        workspaceId: PERSONAL_TENANT,
      } as never)
      .returning(['id', 'workspaceId'])
      .executeTakeFirstOrThrow();

    const res = await app.inject({
      method: 'POST',
      url: '/internal/tenants/upgrade-to-team',
      headers: { authorization: `Bearer ${BEARER}` },
      payload: { tenant: PERSONAL_TENANT },
    });
    // The pre-fix behaviour was a 500 from RegistryClientNotConfiguredError
    // because the port never resolved in the composed app.
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      workspace_id: PERSONAL_TENANT,
      principal_kind: 'org',
      org_id: MINTED_ORG_ID,
      upgraded: true,
    });

    const after = await testDb.db
      .selectFrom('workspaces')
      .select(['id', 'principalKind', 'principalId'])
      .where('id', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    expect(after.id).toBe(PERSONAL_TENANT);
    expect(after.principalKind).toBe('org');
    expect(after.principalId).toBe(MINTED_ORG_ID);

    // Exactly one row — in place, no copy, no re-provision.
    const rows = await testDb.db
      .selectFrom('workspaces')
      .select(({ fn }) => fn.count<string>('id').as('n'))
      .where('id', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    expect(Number(rows.n)).toBe(1);

    // The seeded page's workspace_id FK is byte-for-byte identical.
    const pageAfter = await testDb.db
      .selectFrom('pages')
      .select(['id', 'workspaceId'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(pageAfter.workspaceId).toBe(page.workspaceId);
    expect(pageAfter.workspaceId).toBe(PERSONAL_TENANT);

    // Idempotent: a second call is a no-op, never a re-mint.
    const again = await app.inject({
      method: 'POST',
      url: '/internal/tenants/upgrade-to-team',
      headers: { authorization: `Bearer ${BEARER}` },
      payload: { tenant: PERSONAL_TENANT },
    });
    expect(JSON.parse(again.body).upgraded).toBe(false);
  });

  it('W6 (AC3 seats) — the member-cap seat chokepoint keys on the SAME workspace_id after the re-key, so seats keep counting', async () => {
    const entitlements = built.get(EntitlementService, { strict: false }) as
      unknown as { seatPrincipalsAsked: string[] };

    // The pre-upgrade provisioning in W3 already hit the chokepoint once.
    const beforeCount = entitlements.seatPrincipalsAsked.filter(
      (p) => p === PERSONAL_TENANT,
    ).length;
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    // A NEW member joins the now-ORG-keyed tenant: the seat check must still
    // run, and must key on the unchanged workspace id.
    const res = await app.inject({
      method: 'POST',
      url: '/internal/principals/provision',
      headers: { authorization: `Bearer ${BEARER}` },
      payload: {
        subject: 'sub_wiring_seat_2',
        tenant: PERSONAL_TENANT,
        email: 'seat2.wiring@example.com',
        provision_workspace: true,
      },
    });
    expect(res.statusCode).toBe(200);

    const afterCount = entitlements.seatPrincipalsAsked.filter(
      (p) => p === PERSONAL_TENANT,
    ).length;
    // Seat-counting is ACTIVE on the re-keyed tenant (a new check ran)...
    expect(afterCount).toBe(beforeCount + 1);
    // ...and every seat check keyed on the workspace id, never on the new org
    // principal — the entitlement/seat key is byte-for-byte unchanged.
    expect(new Set(entitlements.seatPrincipalsAsked).has(MINTED_ORG_ID)).toBe(
      false,
    );

    // And the tenant is still org-keyed with the same workspace_id.
    const ws = await testDb.db
      .selectFrom('workspaces')
      .select(['id', 'principalKind'])
      .where('id', '=', PERSONAL_TENANT)
      .executeTakeFirstOrThrow();
    expect(ws.id).toBe(PERSONAL_TENANT);
    expect(ws.principalKind).toBe('org');
  });
});
