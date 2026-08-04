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
import { OutboxWriter } from '../../orvex/events/outbox/outbox-writer.service';
import type { KyselyDB } from '@docmost/db/types/kysely.types';
import type { DbInterface } from '@docmost/db/types/db.interface';
import type { AuditEventType } from '../../common/events/audit-events';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

/**
 * ENG-1396 (adapted by ENG-3167) — behaviour-through-interface on
 * `OrvexAuditService` against a real (testcontainers) PostgreSQL.
 *
 * ENG-3167 hard-cut semantics (AD-24): EVERY write rides the caller's own
 * runner synchronously — the former `critical`-falsy `setImmediate` deferred
 * mode is deleted, so a caller-tx rollback always rolls the audit row back
 * with the mutation, and a write failure throws loudly (no
 * catch-and-swallow). Every emitted type must be a generated
 * `audit.<category>.<verb>` constant (AD-5/AD-23) and the writer ALSO stages
 * an `orvexEventOutbox` row (the family-sink route) on the same runner.
 *
 * Per CS §5d: no mock of `OrvexAuditService`, `OutboxWriter` or
 * `@docmost/db` — the store under test is real Postgres.
 */
describe('OrvexAuditService — logAndCommit (ENG-1396, ENG-3167 hard-cut)', () => {
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

    service = new OrvexAuditService(db, new OutboxWriter(db));

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
      resourceId: uuid(),
      ...overrides,
    };
  }

  async function auditCount(resourceId: string): Promise<number> {
    const row = await db
      .selectFrom('audit')
      .select(db.fn.countAll().as('n'))
      .where('resourceId', '=', resourceId)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async function outboxRows(resourceId: string) {
    return db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('aggregateId', '=', resourceId)
      .execute();
  }

  // ENG-3167 AC2 — every write joins the caller tx (no critical/deferred split).
  it('a caller-tx rollback rolls the audit row AND its outbox row back with it', async () => {
    const resourceId = uuid();
    await db
      .transaction()
      .execute(async (tx) => {
        await service.logAndCommit(tx, payload({ resourceId, critical: true }));
        throw new Error('force rollback');
      })
      .catch((err) => {
        if (err.message !== 'force rollback') throw err;
      });

    expect(await auditCount(resourceId)).toBe(0);
    expect(await outboxRows(resourceId)).toHaveLength(0);
  });

  // ENG-3167 hard-cut — the ENG-1396 `critical`-falsy deferred mode is DELETED:
  // a non-critical write now ALSO rides the caller tx and rolls back with it
  // (AD-24: no post-commit emit, no best-effort emit).
  it('a `critical: false` write also joins the caller tx: rollback removes it (deferred mode deleted)', async () => {
    const resourceId = uuid();
    await db
      .transaction()
      .execute(async (tx) => {
        await service.logAndCommit(
          tx,
          payload({ resourceId, critical: false }),
        );
        throw new Error('force rollback');
      })
      .catch((err) => {
        if (err.message !== 'force rollback') throw err;
      });

    expect(await auditCount(resourceId)).toBe(0);
    expect(await outboxRows(resourceId)).toHaveLength(0);
  });

  it('a committed logAndCommit stages the audit row AND exactly one outbox row of the generated audit type', async () => {
    const resourceId = uuid();
    await db.transaction().execute(async (tx) => {
      await service.logAndCommit(tx, payload({ resourceId }));
    });

    expect(await auditCount(resourceId)).toBe(1);
    const rows = await outboxRows(resourceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(AuditEvent.USER_LOGIN);
    // AD-20 — a UUIDv7 minted at enqueue.
    expect(rows[0].id.replace(/-/g, '')[12]).toBe('7');
  });

  // ENG-3167 (AD-3) — the no-tx path writes synchronously and a failure
  // REJECTS loudly (the former catch-and-log swallow is deleted).
  it('no-tx write: resolves with the row landed synchronously; a write failure rejects loudly', async () => {
    const resourceId = uuid();
    await expect(
      service.logAndCommit(undefined, payload({ resourceId })),
    ).resolves.toBeUndefined();
    expect(await auditCount(resourceId)).toBe(1);

    // forced-failure path: an invalid workspaceId FK-violates on insert —
    // the failure surfaces (loud, AD-3), never a success-shaped no-op.
    const badResourceId = uuid();
    await expect(
      service.logAndCommit(
        undefined,
        payload({ resourceId: badResourceId, workspaceId: uuid() }),
      ),
    ).rejects.toThrow();
    expect(await auditCount(badResourceId)).toBe(0);
  });

  // ENG-3167 (AD-5/AD-23) — an unregistered/hand-typed audit type is refused
  // BEFORE any write (neither the local row nor an outbox row lands).
  it('an audit type that is not a generated contracts constant is refused loudly (register-before-emit)', async () => {
    const resourceId = uuid();
    await expect(
      service.logAndCommit(
        undefined,
        payload({
          resourceId,
          event: 'page.created' as unknown as AuditEventType,
        }),
      ),
    ).rejects.toThrow(/not a generated orvex-studio-contracts constant/);
    expect(await auditCount(resourceId)).toBe(0);
    expect(await outboxRows(resourceId)).toHaveLength(0);
  });

  // AC4
  it('invalid actor pairing throws before any insert: system with non-null actorId', async () => {
    const resourceId = uuid();
    await expect(
      service.logAndCommit(
        undefined,
        payload({ resourceId, actorType: 'system', actorId: uuid() }),
      ),
    ).rejects.toThrow();
    expect(await auditCount(resourceId)).toBe(0);
  });

  it('invalid actor pairing throws before any insert: user with null actorId', async () => {
    const resourceId = uuid();
    await expect(
      service.logAndCommit(
        undefined,
        payload({ resourceId, actorType: 'user', actorId: undefined }),
      ),
    ).rejects.toThrow();
    expect(await auditCount(resourceId)).toBe(0);
  });

  // AC7
  it('client_id round-trips for a resolved external_agent actor', async () => {
    const resourceId = uuid();
    const clientId = uuid();
    await db.transaction().execute(async (tx) => {
      await service.logAndCommit(
        tx,
        payload({
          resourceId,
          actorType: 'external_agent',
          critical: true,
          clientId,
        }),
      );
    });

    const row = await db
      .selectFrom('audit')
      .select('clientId')
      .where('resourceId', '=', resourceId)
      .executeTakeFirstOrThrow();
    expect(row.clientId).toBe(clientId);
  });
});
