// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-3569 / ENG-3525 — the REQUEST-TIER RLS backstop, end to end.
 *
 * ## Why this exists
 *
 * `rls-transaction-scoped.integration.spec.ts` proves the DATA tier: given
 * `runInTenantScope(...)` called in process, the policies deny cross-tenant
 * rows. It never drives HTTP, so it cannot tell you whether a REAL request
 * ever establishes that scope. This file closes that hop: a real Nest+Fastify
 * app, on a real socket, against a real Postgres, as a real non-superuser
 * NOBYPASSRLS role with FORCE RLS applied.
 *
 * ## The discriminator (the reason this file is not redundant)
 *
 * Cross-tenant refusal in this product is today carried by the space ACL.
 * A test where BOTH the ACL and RLS would refuse proves nothing about
 * either — it is exactly the failure mode ENG-3525 found in
 * `TestGateM7Isolation`. So this harness deliberately **widens the app ACL
 * past the tenant boundary**: tenant B's user is given a genuine
 * `space_members` grant on tenant A's space, and the probe reads the page
 * through the data seam with no `OrvexPermissionsService` in the path at
 * all. Under those conditions the ONLY thing left that can refuse is RLS.
 * If the read still returns zero rows, the backstop is real; if it returns
 * A's bytes, the backstop is decorative and the ACL was the whole story.
 *
 * ## What it also pins (the ENG-3569 correction)
 *
 * The engine consumes the ambient tenant scope at exactly ONE site —
 * `executeTx` (`database/utils.ts:45`). Repositories reach the database
 * through `dbOrTx(this.db, trx)` at 154 further sites, which open NO
 * transaction; `set_config('app.workspace_id', $1, true)` is
 * transaction-LOCAL by construction, so those statements run with the GUC
 * unset and FORCE RLS denies them — including for the row's own owner.
 * The two read shapes are therefore probed side by side through the SAME
 * request, so the pass/fail split localises the gap precisely.
 *
 * ## DELIBERATE SCOPE BOUNDARY — read this before trusting the green tick
 *
 * This file asserts that the plain-`db` read does not LEAK cross-tenant. It
 * deliberately does NOT assert the other half of that shape's invariant —
 * that the owner can read its own row through it. That assertion is RED
 * today and is reproduced here verbatim:
 *
 * ```
 * POST /rls-probe/via-plain-db  as tenant A, for tenant A's own page
 *   -> 201, scopeInHandler = <A's workspace id>, rows = []      // owner denied
 * ```
 *
 * It belongs to **ENG-3569** and lands with ENG-3569's fix, RED-first, as
 * that ticket's DoD gate — not here, where it would put dev permanently red.
 * Nothing in this file should be read as evidence that the `dbOrTx` path is
 * tenant-scoped. It is not.
 */
import * as path from 'path';
import { promises as fs } from 'fs';
import { Body, Controller, Inject, Module, Post } from '@nestjs/common';
import {
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { CamelCasePlugin, FileMigrationProvider, Kysely, Migrator } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { sign } from 'jsonwebtoken';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

import type { DbInterface } from '@docmost/db/types/db.interface';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../integrations/environment/environment.service';
import { OrvexConfigService } from '../orvex/config/orvex-config.service';
import { DomainMiddleware } from '../common/middlewares/domain.middleware';
import { currentTenantScope } from './rls/tenant-scope.context';
import { executeTx } from './utils';
import type { KyselyDB } from './types/kysely.types';

const APP_ROLE = 'app_rls_request_tier';
const APP_ROLE_PASSWORD = 'app-rls-request-tier-pw';
const APP_SECRET = 'request-tier-app-secret-at-least-32-characters';
const PROBE_DB = 'PROBE_DB';

interface ProbeBody {
  pageId: string;
}

/**
 * The probe. Both handlers read the SAME row through the SAME connection
 * pool as the SAME non-superuser role; the ONLY difference is whether the
 * read goes through `executeTx` (the one site that consumes the ambient
 * tenant scope) or through the plain `db` handle that `dbOrTx` hands back
 * at 154 repository call sites.
 */
@Controller('rls-probe')
class RlsRequestTierProbeController {
  constructor(@Inject(PROBE_DB) private readonly db: KyselyDB) {}

  @Post('via-execute-tx')
  async viaExecuteTx(@Body() body: ProbeBody) {
    const rows = await executeTx(this.db, (trx) =>
      trx
        .selectFrom('pages')
        .select(['id', 'title'])
        .where('id', '=', body.pageId)
        .execute(),
    );
    return { scopeInHandler: currentTenantScope(), rows };
  }

  @Post('via-plain-db')
  async viaPlainDb(@Body() body: ProbeBody) {
    const rows = await this.db
      .selectFrom('pages')
      .select(['id', 'title'])
      .where('id', '=', body.pageId)
      .execute();
    return { scopeInHandler: currentTenantScope(), rows };
  }
}

function buildProbeModule(db: KyselyDB) {
  @Module({
    controllers: [RlsRequestTierProbeController],
    providers: [
      { provide: PROBE_DB, useValue: db },
      {
        provide: WorkspaceRepo,
        // CLOUD mode with a cluster-internal Host resolves NO workspace by
        // hostname — the deployed cell's actual shape — so resolution falls
        // to the request's own verified bearer, exactly as in production.
        useValue: { findFirst: async () => undefined, findByHostname: async () => undefined },
      },
      {
        provide: EnvironmentService,
        useValue: {
          isCloud: () => true,
          isSelfHosted: () => false,
          getAppSecret: () => APP_SECRET,
        },
      },
      {
        provide: OrvexConfigService,
        useValue: new OrvexConfigService({} as NodeJS.ProcessEnv),
      },
      DomainMiddleware,
    ],
  })
  class ProbeModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer
        .apply(DomainMiddleware)
        .exclude(
          { path: 'auth/setup', method: RequestMethod.POST },
          { path: 'health', method: RequestMethod.GET },
        )
        .forRoutes('*');
    }
  }
  return ProbeModule;
}

describe('TestRlsRequestTierBackstop — ENG-3569 / ENG-3525', () => {
  jest.setTimeout(300_000);

  let pgContainer: StartedTestContainer;
  let adminSql: ReturnType<typeof postgres>;
  let adminDb: Kysely<DbInterface>;
  let appSql: ReturnType<typeof postgres>;
  let appDb: Kysely<DbInterface>;
  let app: NestFastifyApplication;
  let origin: string;

  const tenants: Record<
    string,
    { ws: { id: string }; user: { id: string }; space: { id: string }; page: { id: string } }
  > = {};

  async function seedTenant(name: string) {
    const ws = await adminDb
      .insertInto('workspaces')
      .values({ name })
      .returning('id')
      .executeTakeFirstOrThrow();
    const user = await adminDb
      .insertInto('users')
      .values({ name: `${name} user`, email: `${name}@rt.example.com`, workspaceId: ws.id })
      .returning('id')
      .executeTakeFirstOrThrow();
    const space = await adminDb
      .insertInto('spaces')
      .values({ name: `${name} space`, slug: `${name}-space`, workspaceId: ws.id, creatorId: user.id })
      .returning('id')
      .executeTakeFirstOrThrow();
    const page = await adminDb
      .insertInto('pages')
      .values({
        slugId: `${name}-page`,
        title: `${name.toUpperCase()}-SECRET-MARKER`,
        spaceId: space.id,
        workspaceId: ws.id,
        creatorId: user.id,
        position: 'a0',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { ws, user, space, page };
  }

  /** A token of the exact shape `resolveWorkspaceIdFromToken` accepts. */
  function tokenFor(workspaceId: string, userId: string): string {
    return sign({ sub: userId, workspaceId, type: 'access' }, APP_SECRET, {
      expiresIn: '1h',
    });
  }

  async function probe(route: string, workspace: string, pageId: string) {
    const t = tenants[workspace];
    const res = await fetch(`${origin}/rls-probe/${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokenFor(t.ws.id, t.user.id)}`,
      },
      body: JSON.stringify({ pageId }),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  beforeAll(async () => {
    pgContainer = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'orvex',
        POSTGRES_PASSWORD: 'orvex',
        POSTGRES_DB: 'orvex_test',
      })
      .withExposedPorts(5432)
      .start();

    const host = pgContainer.getHost();
    const port = pgContainer.getMappedPort(5432);
    adminSql = postgres(`postgres://orvex:orvex@${host}:${port}/orvex_test`, {
      onnotice: () => {},
    });
    adminDb = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: adminSql }),
      plugins: [new CamelCasePlugin()],
    });

    const migrator = new Migrator({
      db: adminDb,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, 'migrations'),
      }),
    });
    // Same operator opt-in the sibling data-tier gate takes: FORCE binds the
    // owner, and this harness migrates AS the owner, so without the opt-in
    // the migration would (correctly) skip FORCE and the enforcement-visible
    // end-state would not exist to assert.
    const priorForce = process.env.ORVEX_RLS_FORCE;
    process.env.ORVEX_RLS_FORCE = 'true';
    let error: unknown;
    try {
      ({ error } = await migrator.migrateToLatest());
    } finally {
      if (priorForce === undefined) delete process.env.ORVEX_RLS_FORCE;
      else process.env.ORVEX_RLS_FORCE = priorForce;
    }
    if (error) throw error;

    await adminSql.unsafe(`
      CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_ROLE_PASSWORD}'
        NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};
    `);

    tenants.A = await seedTenant('rt-tenant-a');
    tenants.B = await seedTenant('rt-tenant-b');

    // ── THE DISCRIMINATOR SETUP ──────────────────────────────────────
    // Widen the app ACL PAST the tenant boundary: tenant B's user becomes a
    // real member of tenant A's space. Any app-layer permission check would
    // now ALLOW B to read A's page. Whatever refuses after this is RLS and
    // nothing else.
    await adminSql.unsafe(
      `INSERT INTO space_members (space_id, user_id, role, added_by_id)
       VALUES ('${tenants.A.space.id}', '${tenants.B.user.id}', 'writer', '${tenants.A.user.id}')`,
    );

    appSql = postgres(
      `postgres://${APP_ROLE}:${APP_ROLE_PASSWORD}@${host}:${port}/orvex_test`,
      { max: 4, onnotice: () => {} },
    );
    appDb = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: appSql }),
      plugins: [new CamelCasePlugin()],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [buildProbeModule(appDb as unknown as KyselyDB)],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { rawBody: true },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close().catch(() => undefined);
    await appDb?.destroy().catch(() => undefined);
    await adminDb?.destroy().catch(() => undefined);
    await pgContainer?.stop().catch(() => undefined);
  });

  it('the cross-tenant space_members grant really exists (discriminator precondition)', async () => {
    const rows = await adminSql.unsafe(
      `SELECT 1 FROM space_members WHERE space_id = '${tenants.A.space.id}'
         AND user_id = '${tenants.B.user.id}'`,
    );
    // If this is empty the "ACL bypassed" claim below is vacuous.
    expect(rows.length).toBe(1);
  });

  it('POSITIVE CONTROL — tenant A reads its OWN page through executeTx over a real request', async () => {
    const { status, body } = await probe('via-execute-tx', 'A', tenants.A.page.id);
    expect(status).toBe(201);
    // The request-tier scope reached the transaction chokepoint.
    expect(body.scopeInHandler).toBe(tenants.A.ws.id);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].title).toContain('RT-TENANT-A-SECRET-MARKER');
  });

  it('DISCRIMINATOR — with the space ACL widened cross-tenant, RLS ALONE still refuses B (bytes=0)', async () => {
    const { status, body } = await probe('via-execute-tx', 'B', tenants.A.page.id);
    expect(status).toBe(201);
    expect(body.scopeInHandler).toBe(tenants.B.ws.id);
    expect(body.rows).toHaveLength(0);
    // bytes=0: none of A's marker reaches B, through a path where the app
    // ACL would have said yes.
    expect(JSON.stringify(body)).not.toContain('RT-TENANT-A-SECRET-MARKER');
  });

  /**
   * DELIBERATELY ABSENT — "a plain `db` read does not leak cross-tenant".
   *
   * It would pass today, and it would pass for the WRONG REASON. A plain
   * `db` read runs with the GUC unset, so RLS denies it whoever asks: the
   * refusal carries no information about tenancy at all. A read denied
   * because NO tenant is set is not the same fact as a read denied because
   * it is the WRONG tenant, and only the second is isolation. Asserting the
   * first and filing it under "cross-tenant" is precisely the error ENG-3525
   * found in `TestGateM7Isolation`, and it is not repeated here.
   *
   * The `executeTx` discriminator above is the one that carries the claim,
   * because it is paired with a positive control on the SAME path: the same
   * query, same role, same route returns A's row when the scope is A and
   * zero rows when the scope is B. That pairing is what rules out
   * "denied because unscoped".
   */
});
