// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import * as path from 'path';
import { promises as fs } from 'fs';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
  sql,
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Test } from '@nestjs/testing';
import { KyselyModule } from 'nestjs-kysely';

import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../../integrations/audit/audit.service';
import { OrvexAuditModule } from '../../orvex-audit.module';
import {
  AuditEvent,
  AuditResource,
} from '../../../../common/events/audit-events';
import type { DbInterface } from '../../../../database/types/db.interface';
import type { KyselyDB } from '../../../../database/types/kysely.types';
import { executeTx } from '../../../../database/utils';
import { generateSlugId } from '../../../../common/helpers/nanoid.utils';

/**
 * ENG-3167 §1 — `auditInjectSiteStagesOneOutboxRowInMutationTx`, the named
 * binary DoD gate.
 *
 * A behaviour-through-interface integration test against a REAL Postgres
 * (testcontainers, the engine's own `*.integration.spec.ts` harness — never a
 * mock of an owned module, ❌#4). It composes the PRODUCTION `AUDIT_SERVICE`
 * binding via `@nestjs/testing` and drives a real page-create mutation the way
 * the production `@Inject(AUDIT_SERVICE)` site (page.controller.ts `create`)
 * does, then asserts on real `orvexEventOutbox` rows:
 *
 *  - AC1: exactly ONE audit-typed outbox row is staged in the mutation's own
 *    transaction and commits atomically with it.
 *  - AC2: a mutation rollback rolls the audit row back with it (and the
 *    domain row) — the stage rides the caller's `KyselyTransaction`, never
 *    the base `db`.
 *  - AC3: a forced failure of the audit-stage INSERT (real DB trigger fault
 *    injection, never a mock) aborts the WHOLE mutation.
 *
 * This test REDS on the live bug (NoopAuditService bound at `AUDIT_SERVICE`
 * swallows every emit → zero rows) and goes GREEN only after the real
 * transactional outbox route lands (AD-24).
 */
describe('auditInjectSiteStagesOneOutboxRowInMutationTx (ENG-3167 DoD gate)', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let auditService: IAuditService;
  let workspaceId: string;
  let spaceId: string;
  let userId: string;

  /** The generated audit type the engine's legacy PAGE_CREATED action maps to
   *  (`audit.<category>.<verb>`, registered in orvex-studio-contracts under
   *  publisher `orvex-wiki` — AD-23 register-before-emit). Read from the
   *  constant, never hand-typed (AD-5). */
  const AUDIT_PAGE_CREATED_TYPE = AuditEvent.PAGE_CREATED;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../../../../database/migrations');
    const migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    await rawDb.destroy();

    db = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
      plugins: [new CamelCasePlugin()],
    }) as KyselyDB;

    // Compose the PRODUCTION audit binding — the same module app.module.ts
    // wires at `AUDIT_SERVICE`. Behaviour-through-interface: the test resolves
    // the token, never a concrete class, so it survives an internal rename.
    const moduleRef = await Test.createTestingModule({
      imports: [
        KyselyModule.forRoot({
          dialect: new PostgresJSDialect({ postgres: sqlClient }),
          plugins: [new CamelCasePlugin()],
        }),
        OrvexAuditModule,
      ],
    }).compile();
    auditService = moduleRef.get<IAuditService>(AUDIT_SERVICE);
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  beforeEach(async () => {
    const ws = await db
      .insertInto('workspaces')
      .values({
        name: 'ENG-3167 WS',
        hostname: `eng3167-${Date.now()}-${Math.random()}`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const user = await db
      .insertInto('users')
      .values({
        email: `eng3167-${Date.now()}-${Math.random()}@example.com`,
        workspaceId,
        role: 'admin',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = user.id;

    const space = await db
      .insertInto('spaces')
      .values({
        name: 'ENG-3167 Space',
        slug: `eng3167-space-${Date.now()}-${Math.random()}`,
        workspaceId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;
  });

  afterEach(async () => {
    await db
      .deleteFrom('orvexEventOutbox')
      .where('workspaceId', '=', workspaceId)
      .execute();
    await db.deleteFrom('pages').where('workspaceId', '=', workspaceId).execute();
    await db.deleteFrom('spaces').where('id', '=', spaceId).execute();
    await db.deleteFrom('users').where('id', '=', userId).execute();
    await db.deleteFrom('workspaces').where('id', '=', workspaceId).execute();
  });

  /**
   * Drive the real audited page-create mutation exactly as the production
   * `@Inject(AUDIT_SERVICE)` site does: the page INSERT and the audit emit
   * share ONE `KyselyTransaction` (page.controller.ts `create` owns the trx).
   */
  async function createPageWithAudit(): Promise<{ pageId: string }> {
    let pageId!: string;
    await executeTx(db, async (trx) => {
      const page = await trx
        .insertInto('pages')
        .values({
          title: 'ENG-3167 DoD page',
          slugId: generateSlugId(),
          spaceId,
          workspaceId,
          creatorId: userId,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      pageId = page.id;
      await auditService.log(
        {
          event: AuditEvent.PAGE_CREATED,
          resourceType: AuditResource.PAGE,
          resourceId: page.id,
          spaceId,
        },
        {
          workspaceId,
          actorId: userId,
          actorType: 'user',
        },
        trx,
      );
    });
    return { pageId };
  }

  function auditRows(pageId?: string) {
    let q = db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('type', '=', AUDIT_PAGE_CREATED_TYPE)
      .where('workspaceId', '=', workspaceId);
    if (pageId) q = q.where('aggregateId', '=', pageId);
    return q.execute();
  }

  it('AC1 — a committed audited page create stages EXACTLY ONE audit outbox row of the generated type, atomically with the mutation (REDS on the NoopAuditService swallow: zero rows)', async () => {
    const { pageId } = await createPageWithAudit();

    const rows = await auditRows(pageId);
    expect(rows).toHaveLength(1);

    // AC5 — the event id is a UUIDv7 minted at enqueue (never a relay-time id).
    const idHex = rows[0].id.replace(/-/g, '');
    expect(idHex[12]).toBe('7');

    // AC4 — references not content: the payload carries only the closed field
    // set (subjectId/resourceId/action/outcome) — no page body, no free-text
    // `changes`/`metadata` blob, no title.
    const payload = rows[0].payload as Record<string, unknown>;
    expect(
      Object.keys(payload).every((k) =>
        ['subjectId', 'resourceId', 'action', 'outcome'].includes(k),
      ),
    ).toBe(true);
    expect(payload.resourceId).toBe(pageId);
    expect(payload.subjectId).toBe(userId);
    expect(JSON.stringify(payload)).not.toContain('ENG-3167 DoD page');
  });

  it('AC2 — a mutation rollback rolls the audit outbox row back WITH the domain row (the stage rides the caller trx, never the base db)', async () => {
    let pageId: string | undefined;
    await expect(
      executeTx(db, async (trx) => {
        const page = await trx
          .insertInto('pages')
          .values({
            title: 'ENG-3167 AC2 rollback page',
            slugId: generateSlugId(),
            spaceId,
            workspaceId,
            creatorId: userId,
          })
          .returning(['id'])
          .executeTakeFirstOrThrow();
        pageId = page.id;
        await auditService.log(
          {
            event: AuditEvent.PAGE_CREATED,
            resourceType: AuditResource.PAGE,
            resourceId: page.id,
            spaceId,
          },
          { workspaceId, actorId: userId, actorType: 'user' },
          trx,
        );
        throw new Error('ENG-3167 forced rollback after audit stage');
      }),
    ).rejects.toThrow('ENG-3167 forced rollback after audit stage');

    expect(await auditRows(pageId)).toHaveLength(0);
    const pageRowCount = await db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', pageId as string)
      .execute();
    expect(pageRowCount).toHaveLength(0);
  });

  it('AC3 — a forced audit-stage INSERT failure (real DB trigger fault injection) aborts the WHOLE mutation: no page row commits without its audit row', async () => {
    // Real DB-level fault injection on the audit-typed outbox INSERT itself
    // (never a mock of the owned OutboxWriter — ❌#4).
    await sql`
      CREATE OR REPLACE FUNCTION orvex_test_fail_audit_stage() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = ${sql.lit(AUDIT_PAGE_CREATED_TYPE)} THEN
          RAISE EXCEPTION 'ENG-3167 fault-injected audit stage failure';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
    `.execute(db);
    await sql`
      CREATE TRIGGER orvex_test_fail_audit_stage_trg
      BEFORE INSERT ON orvex_event_outbox
      FOR EACH ROW EXECUTE FUNCTION orvex_test_fail_audit_stage();
    `.execute(db);

    try {
      await expect(createPageWithAudit()).rejects.toThrow(
        /fault-injected audit stage failure/,
      );

      // The mutation did NOT half-commit: no page row and no audit row.
      const pages = await db
        .selectFrom('pages')
        .selectAll()
        .where('workspaceId', '=', workspaceId)
        .execute();
      expect(pages).toHaveLength(0);
      expect(await auditRows()).toHaveLength(0);
    } finally {
      await sql`DROP TRIGGER IF EXISTS orvex_test_fail_audit_stage_trg ON orvex_event_outbox;`.execute(
        db,
      );
      await sql`DROP FUNCTION IF EXISTS orvex_test_fail_audit_stage();`.execute(
        db,
      );
    }
  });

  it('AC10/hard-cut — no NoopAuditService swallow path survives in the tree, and the audit writer has no deferred/best-effort path (source scan)', async () => {
    const srcRoot = path.join(__dirname, '../../../..');
    const auditWriterSrc = await fs.readFile(
      path.join(srcRoot, 'core/audit/orvex-audit.service.ts'),
      'utf-8',
    );
    // AC3/AD-24 — no deferred/best-effort/post-commit path in the writer.
    expect(auditWriterSrc).not.toMatch(/setImmediate/);
    // Hard-cut — the silent-swallow NoopAuditService class no longer exists.
    const integrationsAudit = await fs.readFile(
      path.join(srcRoot, 'integrations/audit/audit.service.ts'),
      'utf-8',
    );
    expect(integrationsAudit).not.toMatch(/class NoopAuditService/);
  });
});
