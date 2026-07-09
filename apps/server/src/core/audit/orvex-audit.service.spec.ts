import * as path from 'path';
import { promises as fs } from 'fs';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { v4 as uuid } from 'uuid';

import { OrvexAuditService } from './orvex-audit.service';
import type { KyselyDB } from '@docmost/db/types/kysely.types';
import type { DbInterface } from '@docmost/db/types/db.interface';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

/**
 * ENG-1396 — `audit.service.spec.ts` named binary DoD gate:
 * "logAndCommit writes a real audit row; critical events join the caller
 * tx (roll back together), non-critical events are isolated (never roll
 * back the business op); actor pairing is validated" — behaviour-through-
 * interface on `OrvexAuditService` against a real (testcontainers)
 * PostgreSQL `audit` table.
 *
 * Per CS §5d: no mock of `OrvexAuditService` or `@docmost/db` — the store
 * under test is real Postgres.
 */
describe('OrvexAuditService — logAndCommit (ENG-1396 DoD)', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let service: OrvexAuditService;
  let workspaceId: string;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(__dirname, '../../database/migrations');
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
    });

    service = new OrvexAuditService(db);

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1396 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  function payload(overrides: Record<string, any> = {}) {
    return {
      workspaceId,
      actorId: uuid(),
      actorType: 'user' as const,
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      ...overrides,
    };
  }

  async function auditCount(event: string): Promise<number> {
    const row = await db
      .selectFrom('audit')
      .select(db.fn.countAll().as('n'))
      .where('event', '=', event)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  // AC1
  it('critical events join the caller tx: a caller-tx rollback rolls the audit row back with it', async () => {
    const event = `test.critical.${uuid()}`;
    await db
      .transaction()
      .execute(async (tx) => {
        await service.logAndCommit(tx, payload({ event, critical: true }));
        throw new Error('force rollback');
      })
      .catch((err) => {
        if (err.message !== 'force rollback') throw err;
      });

    expect(await auditCount(event)).toBe(0);
  });

  // AC2
  it('non-critical events are isolated: a caller-tx rollback does NOT take the audit row with it', async () => {
    const event = `test.noncritical.${uuid()}`;
    await db
      .transaction()
      .execute(async (tx) => {
        await service.logAndCommit(tx, payload({ event, critical: false }));
        throw new Error('force rollback');
      })
      .catch((err) => {
        if (err.message !== 'force rollback') throw err;
      });

    // non-critical is deferred (setImmediate) precisely so it never
    // contends with the caller's still-open tx connection (see
    // OrvexAuditService#logAndCommit) — flush the deferred write before
    // asserting, same as the AC3 no-tx fire-and-forget case below.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));
    expect(await auditCount(event)).toBe(1);
  });

  // AC3
  it('no-tx fire-and-forget: resolves without blocking, and a write failure is caught and logged, never thrown', async () => {
    const event = `test.notx.${uuid()}`;

    // happy path: resolves promptly, row eventually lands.
    await expect(
      service.logAndCommit(undefined, payload({ event })),
    ).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
    expect(await auditCount(event)).toBe(1);

    // forced-failure path: an invalid workspaceId FK-violates on insert;
    // the rejection must be caught internally, never surfaced.
    const badEvent = `test.notx.fail.${uuid()}`;
    await expect(
      service.logAndCommit(
        undefined,
        payload({ event: badEvent, workspaceId: uuid() }),
      ),
    ).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
    // never inserted (FK violation), but also never an unhandled rejection.
    expect(await auditCount(badEvent)).toBe(0);
  });

  // AC4
  it('invalid actor pairing throws before any insert: system with non-null actorId', async () => {
    const event = `test.actorbad.system.${uuid()}`;
    await expect(
      service.logAndCommit(
        undefined,
        payload({ event, actorType: 'system', actorId: uuid() }),
      ),
    ).rejects.toThrow();
    expect(await auditCount(event)).toBe(0);
  });

  it('invalid actor pairing throws before any insert: user with null actorId', async () => {
    const event = `test.actorbad.user.${uuid()}`;
    await expect(
      service.logAndCommit(
        undefined,
        payload({ event, actorType: 'user', actorId: undefined }),
      ),
    ).rejects.toThrow();
    expect(await auditCount(event)).toBe(0);
  });

  // AC7
  it('client_id round-trips for a resolved external_agent actor', async () => {
    const event = `test.clientid.${uuid()}`;
    const clientId = uuid();
    await db.transaction().execute(async (tx) => {
      await service.logAndCommit(
        tx,
        payload({
          event,
          actorType: 'external_agent',
          critical: true,
          clientId,
        }),
      );
    });

    const row = await db
      .selectFrom('audit')
      .select('clientId')
      .where('event', '=', event)
      .executeTakeFirstOrThrow();
    expect(row.clientId).toBe(clientId);
  });
});
