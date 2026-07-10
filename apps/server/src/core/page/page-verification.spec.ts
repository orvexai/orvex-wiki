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
import { NotFoundException } from '@nestjs/common';
import { v7 as uuid7 } from 'uuid';

import { PageVerificationRepo } from './page-verification.repo';
import { PageVerificationService } from './page-verification.service';
import { PageVerificationEntitlementGuard } from './page-verification-entitlement.guard';
import type { DbInterface } from '@docmost/db/types/db.interface';
import type { KyselyDB } from '@docmost/db/types/kysely.types';

/**
 * ENG-1459 — `QmsEntitlementGatedSpec`, the named binary DoD gate.
 *
 * Real Kysely against a testcontainers Postgres (RED->GREEN, no mocking of
 * the store under test), exercising `PageVerificationService`/
 * `PageVerificationRepo` through their exported interfaces, plus a unit
 * pass on `PageVerificationEntitlementGuard` with a stubbed
 * `LicenseCheckService` (the entitlement engine is a true external policy
 * decision for this leg — per CS §5 4f — never the DB under test). Part
 * (d) — the badge reflects verification status — is asserted at the field
 * the badge actually projects (`getVerificationInfo(...).status` never
 * reads "verified" once `expiresAt` has passed, CS §11 honesty); the
 * client-side status→visual mapping itself is unit-tested in
 * `apps/client/src/ee/page-verification/components/__tests__/
 * verification-status.spec.ts`, and the badge's mount point is locked by
 * `full-editor-provenance-wiring.spec.tsx`.
 */
describe('QmsEntitlementGatedSpec', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let repo: PageVerificationRepo;
  let service: PageVerificationService;

  let workspaceAId: string;
  let workspaceBId: string;
  let spaceAId: string;
  let spaceBId: string;
  let userAId: string;
  let userBId: string;
  let pageAId: string;
  let pageBId: string;

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

    repo = new PageVerificationRepo(db as any);
    service = new PageVerificationService(db as any, repo);

    const wsA = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1459 Workspace A' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceAId = wsA.id;

    const wsB = await db
      .insertInto('workspaces')
      .values({ name: 'ENG-1459 Workspace B' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceBId = wsB.id;

    const userA = await db
      .insertInto('users')
      .values({ email: 'eng-1459-a@example.com', workspaceId: workspaceAId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userAId = userA.id;

    const userB = await db
      .insertInto('users')
      .values({ email: 'eng-1459-b@example.com', workspaceId: workspaceBId })
      .returning('id')
      .executeTakeFirstOrThrow();
    userBId = userB.id;

    const spaceA = await db
      .insertInto('spaces')
      .values({ name: 'Space A', slug: 'eng-1459-space-a', workspaceId: workspaceAId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceAId = spaceA.id;

    const spaceB = await db
      .insertInto('spaces')
      .values({ name: 'Space B', slug: 'eng-1459-space-b', workspaceId: workspaceBId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceBId = spaceB.id;

    const pageA = await db
      .insertInto('pages')
      .values({
        title: 'Page A',
        slugId: uuid7(),
        spaceId: spaceAId,
        workspaceId: workspaceAId,
        creatorId: userAId,
        lastUpdatedById: userAId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    pageAId = pageA.id;

    const pageB = await db
      .insertInto('pages')
      .values({
        title: 'Page B',
        slugId: uuid7(),
        spaceId: spaceBId,
        workspaceId: workspaceBId,
        creatorId: userBId,
        lastUpdatedById: userBId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    pageBId = pageB.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  it('(a) persists a verification (type/verifiers/mode/expiry) and reads it back per-page', async () => {
    const created = await service.createVerification(
      {
        pageId: pageAId,
        type: 'expiring',
        mode: 'period',
        periodAmount: 30,
        periodUnit: 'day',
        verifierIds: [userAId],
      } as any,
      userAId,
      workspaceAId,
      spaceAId,
    );

    expect(created.type).toBe('expiring');
    expect(created.mode).toBe('period');
    expect(created.periodAmount).toBe(30);
    expect(created.periodUnit).toBe('day');
    expect(created.status).toBe('verified');
    expect(created.expiresAt).toBeTruthy();
    expect(created.verifiers).toHaveLength(1);
    expect(created.verifiers?.[0].id).toBe(userAId);

    const readBack = await service.getVerificationInfo(pageAId, workspaceAId);
    expect(readBack.id).toBe(created.id);
    expect(readBack.type).toBe('expiring');
    expect(readBack.mode).toBe('period');
    expect(readBack.periodAmount).toBe(30);
    expect(readBack.periodUnit).toBe('day');
    expect(readBack.verifiedAt).toBeTruthy();
    expect(readBack.expiresAt).toBeTruthy();
    expect(readBack.verifiers).toHaveLength(1);

    const row = await db
      .selectFrom('pageVerifications')
      .selectAll()
      .where('pageId', '=', pageAId)
      .executeTakeFirstOrThrow();
    expect(row.type).toBe('expiring');
    expect(row.status).toBe('verified');
    expect(row.mode).toBe('period');
    expect(row.periodAmount).toBe(30);
    expect(row.periodUnit).toBe('day');
    expect(row.verifiedAt).toBeTruthy();
    expect(row.expiresAt).toBeTruthy();

    const verifierRows = await db
      .selectFrom('pageVerifiers')
      .selectAll()
      .where('pageVerificationId', '=', row.id)
      .execute();
    expect(verifierRows).toHaveLength(1);
    expect(verifierRows[0].userId).toBe(userAId);
  });

  it('(b) verification queries are workspace+space scoped — workspace B never reads workspace A rows', async () => {
    // Page A's verification was created in test (a); page B has none.
    const crossWorkspaceRead = await service.getVerificationInfo(
      pageAId,
      workspaceBId,
    );
    expect(crossWorkspaceRead.status).toBe('none');

    const crossWorkspaceRepoRead = await repo.findByPageId(pageAId, workspaceBId);
    expect(crossWorkspaceRepoRead).toBeUndefined();

    // Sanity: the SAME page, scoped by its OWN workspace, is still readable.
    const sameWorkspaceRead = await service.getVerificationInfo(
      pageAId,
      workspaceAId,
    );
    expect(sameWorkspaceRead.status).not.toBe('none');

    await expect(
      service.updateVerification(
        { pageId: pageAId, periodAmount: 60 } as any,
        userBId,
        workspaceBId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('(c) entitlement flag OFF returns a plain 404; ON passes through', () => {
    const workspace = { id: workspaceAId, licenseKey: 'k', plan: 'free' };
    const ctxFor = (ws: unknown) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ raw: { workspace: ws } }),
        }),
      }) as any;

    const flagOff = new PageVerificationEntitlementGuard({
      hasFeature: () => false,
    } as any);
    expect(() => flagOff.canActivate(ctxFor(workspace))).toThrow(
      NotFoundException,
    );

    const flagOn = new PageVerificationEntitlementGuard({
      hasFeature: () => true,
    } as any);
    expect(flagOn.canActivate(ctxFor(workspace))).toBe(true);

    // No workspace on the request at all (never happens post-JwtAuthGuard
    // in production, but the guard must not leak a 500/undefined crash).
    const flagOnNoWorkspace = new PageVerificationEntitlementGuard({
      hasFeature: () => true,
    } as any);
    expect(() => flagOnNoWorkspace.canActivate(ctxFor(undefined))).toThrow(
      NotFoundException,
    );
  });

  it('(d) the status the badge projects never reports "verified" for an expired page', async () => {
    // Server-side honesty: an expiresAt in the past reads back as expired,
    // never verified, even though the stored `status` column is still
    // "verified" (no background sweep has run yet).
    await service.createVerification(
      {
        pageId: pageBId,
        type: 'expiring',
        mode: 'fixed',
        fixedExpiresAt: new Date(Date.now() - 1000 * 60).toISOString(),
        verifierIds: [userBId],
      } as any,
      userBId,
      workspaceBId,
      spaceBId,
    );

    const info = await service.getVerificationInfo(pageBId, workspaceBId);
    expect(info.status).toBe('expired');

    const rawRow = await db
      .selectFrom('pageVerifications')
      .select(['status'])
      .where('pageId', '=', pageBId)
      .executeTakeFirstOrThrow();
    // The stored column is untouched by the read-time projection (no
    // scheduler/write lives in this leg — AC5).
    expect(rawRow.status).toBe('verified');
  });

  it('AC6 — same-DB cascade: deleting a page deletes its verification row (no orphan sweep needed here)', async () => {
    const page = await db
      .insertInto('pages')
      .values({
        title: 'Cascade Page',
        slugId: uuid7(),
        spaceId: spaceAId,
        workspaceId: workspaceAId,
        creatorId: userAId,
        lastUpdatedById: userAId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await service.createVerification(
      { pageId: page.id, type: 'expiring', mode: 'indefinite', verifierIds: [] } as any,
      userAId,
      workspaceAId,
      spaceAId,
    );

    await db.deleteFrom('pages').where('id', '=', page.id).execute();

    const orphanCount = await repo.countOrphans(workspaceAId);
    expect(orphanCount).toBe(0);
  });
});
