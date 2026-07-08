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
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { BadRequestException } from '@nestjs/common';

import { OrvexTransclusionSafeguardService } from './orvex-transclusion-safeguard.service';
import { PageTransclusionReferencesRepo } from '../../database/repos/page-transclusions/page-transclusion-references.repo';
import {
  AuditLogContext,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { ActorType, AuditLogPayload } from '../../common/events/audit-events';
import { TransclusionReferencesActiveException } from './exceptions/transclusion-references-active.exception';
import type { DbInterface } from '../../database/types/db.interface';
import type { KyselyDB } from '../../database/types/kysely.types';

/**
 * ENG-1470 — the named DoD gate: `TransclusionSafeguardBlockAndUnsyncSpec`.
 *
 * Real Postgres (testcontainers), migrated to HEAD, exercising the real
 * `OrvexTransclusionSafeguardService.computeImpact`/`enforceOrUnsync`
 * through their exported interface — never mocked (CS §5/❌#4). Only the
 * genuinely remote/EE collaborator (`IAuditService`) is an in-memory fake
 * (a real class implementing the interface, capturing rows).
 */
describe('TransclusionSafeguardBlockAndUnsyncSpec', () => {
  jest.setTimeout(180_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let workspaceId: string;
  let spaceId: string;
  let userId: string;

  class CapturingAuditService implements IAuditService {
    public readonly logs: Array<{
      payload: AuditLogPayload;
      context: AuditLogContext;
    }> = [];

    log(_payload: AuditLogPayload): void {}

    async logWithContext(
      payload: AuditLogPayload,
      context: AuditLogContext,
    ): Promise<void> {
      this.logs.push({ payload, context });
    }

    async logBatchWithContext(
      payloads: AuditLogPayload[],
      context: AuditLogContext,
    ): Promise<void> {
      for (const payload of payloads) this.logs.push({ payload, context });
    }

    setActorId(_actorId: string): void {}
    setActorType(_actorType: ActorType): void {}
    async updateRetention(): Promise<void> {}
  }

  function buildService(audit: CapturingAuditService) {
    const repo = new PageTransclusionReferencesRepo(db);
    return new OrvexTransclusionSafeguardService(db, repo, audit);
  }

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<DbInterface>({
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

    const ws = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1470 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const space = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1470 Space', slug: 'eng-1470-space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;

    const user = await db
      .insertInto('users')
      .values({ email: 'eng-1470-user@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userId = user.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  let pageCounter = 0;
  async function createPage(title: string, opts?: { deletedAt?: Date }) {
    pageCounter += 1;
    return db
      .insertInto('pages')
      .values({
        title,
        spaceId,
        workspaceId,
        slugId: `eng-1470-${pageCounter}-${Date.now()}`,
        creatorId: userId,
        lastUpdatedById: userId,
        deletedAt: opts?.deletedAt ?? null,
      })
      .returning(['id', 'slugId'])
      .executeTakeFirstOrThrow();
  }

  async function addReference(
    sourcePageId: string,
    referencePageId: string,
    transclusionId: string,
  ) {
    await db
      .insertInto('pageTransclusionReferences')
      .values({ workspaceId, sourcePageId, referencePageId, transclusionId })
      .execute();
  }

  async function countReferenceRows(sourcePageId: string): Promise<number> {
    const rows = await db
      .selectFrom('pageTransclusionReferences')
      .select('id')
      .where('sourcePageId', '=', sourcePageId)
      .execute();
    return rows.length;
  }

  // ---------------------------------------------------------------------
  // AC1 — impact read counts only live references
  // ---------------------------------------------------------------------
  it('AC1: computeImpact counts only live reference pages, excluding a soft-deleted one', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit);
    const source = await createPage('AC1 source');
    const liveRef1 = await createPage('AC1 live ref 1');
    const liveRef2 = await createPage('AC1 live ref 2');
    const deletedRef = await createPage('AC1 deleted ref', {
      deletedAt: new Date(),
    });

    await addReference(source.id, liveRef1.id, 'tx-1');
    await addReference(source.id, liveRef2.id, 'tx-2');
    await addReference(source.id, deletedRef.id, 'tx-3');

    const impact = await service.computeImpact(source.id, 'delete');

    expect(impact.activeReferenceCount).toBe(2);
    expect(impact.references).toHaveLength(2);
    expect(impact.references.map((r) => r.referencePageId).sort()).toEqual(
      [liveRef1.id, liveRef2.id].sort(),
    );
    expect(impact.canForce).toBe(false);
  });

  it('AC1: canForce is true only for permanent-delete', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit);
    const source = await createPage('AC1 canForce source');

    const impact = await service.computeImpact(source.id, 'permanent-delete');
    expect(impact.canForce).toBe(true);
  });

  // ---------------------------------------------------------------------
  // (a) block mode throws 409 and mutates nothing (AC2)
  // ---------------------------------------------------------------------
  it('(a)/AC2: block mode throws TransclusionReferencesActiveException (409) and deletes nothing', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit);
    const source = await createPage('AC2 source');
    const ref = await createPage('AC2 ref');
    await addReference(source.id, ref.id, 'tx-block');

    await expect(
      service.enforceOrUnsync(source.id, 'delete', 'block', { workspaceId }),
    ).rejects.toBeInstanceOf(TransclusionReferencesActiveException);

    try {
      await service.enforceOrUnsync(source.id, 'delete', 'block', {
        workspaceId,
      });
      fail('expected enforceOrUnsync to throw');
    } catch (err) {
      const exception = err as TransclusionReferencesActiveException;
      expect(exception.getStatus()).toBe(409);
      expect(exception.getResponse()).toMatchObject({
        errorCode: 'TRANSCLUSION_REFERENCES_ACTIVE',
        impact: { activeReferenceCount: 1 },
      });
    }

    expect(await countReferenceRows(source.id)).toBe(1);
  });

  it('block mode is the default when no mode is passed', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit);
    const source = await createPage('AC2 default-mode source');
    const ref = await createPage('AC2 default-mode ref');
    await addReference(source.id, ref.id, 'tx-default');

    await expect(
      service.enforceOrUnsync(
        source.id,
        'delete',
        undefined as unknown as 'block',
        { workspaceId },
      ),
    ).rejects.toBeInstanceOf(TransclusionReferencesActiveException);
  });

  // ---------------------------------------------------------------------
  // (b) unsync mode deletes exactly the live rows in one tx + K audits (AC3)
  // ---------------------------------------------------------------------
  it('(b)/AC3: unsync mode deletes exactly the K live reference rows and emits K TRANSCLUSION_REFERENCE_UNSYNCED audits', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit);
    const source = await createPage('AC3 source');
    const ref1 = await createPage('AC3 ref 1');
    const ref2 = await createPage('AC3 ref 2');
    await addReference(source.id, ref1.id, 'tx-a');
    await addReference(source.id, ref2.id, 'tx-b');

    const impact = await service.enforceOrUnsync(source.id, 'archive', 'unsync', {
      workspaceId,
      actorId: userId,
    });

    expect(impact.activeReferenceCount).toBe(2);
    expect(await countReferenceRows(source.id)).toBe(0);

    const unsyncLogs = audit.logs.filter(
      (l) => l.payload.event === 'transclusion.reference_unsynced',
    );
    expect(unsyncLogs).toHaveLength(2);
    expect(unsyncLogs.map((l) => l.payload.resourceId).sort()).toEqual(
      [ref1.id, ref2.id].sort(),
    );
    for (const log of unsyncLogs) {
      expect(log.payload.metadata).toMatchObject({
        sourcePageId: source.id,
        reason: 'archive',
      });
      expect(log.context.workspaceId).toBe(workspaceId);
    }
  });

  // ---------------------------------------------------------------------
  // (c) zero-reference fast path (AC5)
  // ---------------------------------------------------------------------
  it.each(['block', 'unsync', 'force'] as const)(
    '(c)/AC5: mode=%s returns fast with no throw, no delete, no audit when activeReferenceCount is 0',
    async (mode) => {
      const audit = new CapturingAuditService();
      const service = buildService(audit);
      const source = await createPage(`AC5 source ${mode}`);

      const impact = await service.enforceOrUnsync(
        source.id,
        mode === 'force' ? 'permanent-delete' : 'delete',
        mode,
        { workspaceId },
      );

      expect(impact.activeReferenceCount).toBe(0);
      expect(audit.logs).toHaveLength(0);
    },
  );

  // ---------------------------------------------------------------------
  // AC4 — force mode is permanent-delete-only
  // ---------------------------------------------------------------------
  it('AC4: force mode rejects a non-permanent-delete operation with 400', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit);
    const source = await createPage('AC4 reject source');
    const ref = await createPage('AC4 reject ref');
    await addReference(source.id, ref.id, 'tx-reject');

    await expect(
      service.enforceOrUnsync(source.id, 'delete', 'force', { workspaceId }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await countReferenceRows(source.id)).toBe(1);
  });

  it('AC4: force mode on permanent-delete logs one critical TRANSCLUSION_FORCE_DELETE audit and preserves reference rows', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit);
    const source = await createPage('AC4 force source');
    const ref = await createPage('AC4 force ref');
    await addReference(source.id, ref.id, 'tx-force');

    const impact = await service.enforceOrUnsync(
      source.id,
      'permanent-delete',
      'force',
      { workspaceId, actorId: userId },
    );

    expect(impact.activeReferenceCount).toBe(1);
    expect(await countReferenceRows(source.id)).toBe(1);

    const forceLogs = audit.logs.filter(
      (l) => l.payload.event === 'transclusion.force_delete',
    );
    expect(forceLogs).toHaveLength(1);
    expect(forceLogs[0].payload.metadata).toMatchObject({
      critical: true,
      impactedSlugIds: [ref.slugId],
    });
  });
});
