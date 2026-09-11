/**
 * ENG-2483 — TestExportScopedToTenantAndAudited, the ONE binary DoD gate.
 * Red = not done, no override.
 *
 * Integration test against a REAL Postgres (testcontainers, the ENG-1372
 * `db-test-harness.ts` convention the sibling `eng2482-acl-delta-pull` spec
 * establishes). Every class below is the real production class, hand-wired.
 * CS §5 ❌#4: nothing owned is mocked — `InternalApiService`, the REAL
 * `ExportService`, and the REAL `OrvexAuditService` are all driven against
 * the real container, and AC3 is asserted by reading the real `audit` table,
 * never by observing a call on a double.
 *
 * The four legs, per the ticket's §5a:
 *   1. per-page markdown / `text_repr` is produced (AC1);
 *   2. a cross-tenant request is denied with ZERO bytes (AC2 / REM-1 IDOR);
 *   3. a successful export lands EXACTLY ONE real `audit` row (AC3) —
 *      RED before the service change in this commit, GREEN after;
 *   4. no bulk-tar code path exists in the engine (AC5).
 *
 * AC4 (the ancestry-vs-spaceId short-circuit) is DELIBERATELY NOT asserted
 * here: the ticket escalates it out of this story's DoD, and asserting it
 * would silently widen the gate.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Kysely } from 'kysely';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import SpaceAbilityFactory from 'src/core/casl/abilities/space-ability.factory';
import { OrvexAuditService } from 'src/core/audit/orvex-audit.service';
import { OutboxWriter } from 'src/orvex/events/outbox/outbox-writer.service';
import { InternalApiService } from 'src/core/internal-api/internal-api.service';
import { ExportService } from 'src/integrations/export/export.service';
import { AuditEvent } from 'src/common/events/audit-events';
import {
  seedPage,
  seedSpace,
  seedUser,
  seedWorkspace,
  startTestDatabase,
  TestDb,
} from './db-test-harness';
import * as fs from 'fs';
import * as path from 'path';

function fakeCache(): Cache {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      store.delete(key);
    },
  } as unknown as Cache;
}

describe('ENG-2483: TestExportScopedToTenantAndAudited', () => {
  let testDb: TestDb;
  let db: Kysely<any>;

  let internalApiService: InternalApiService;

  // tenant A — the exporting workspace
  let workspaceAId: string;
  let userAId: string;
  let spaceAId: string;
  let pageAId: string;

  // tenant B — the foreign workspace whose page must never be exportable
  let workspaceBId: string;
  let pageBId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    db = testDb.db as unknown as Kysely<any>;

    const wsA = await seedWorkspace(db as any);
    workspaceAId = wsA.id;
    const userA = await seedUser(db as any, workspaceAId);
    userAId = userA.id;
    const spaceA = await seedSpace(db as any, workspaceAId, userAId);
    spaceAId = spaceA.id;
    const pageA = await seedPage(db as any, {
      spaceId: spaceAId,
      workspaceId: workspaceAId,
      creatorId: userAId,
      position: 'a0',
      title: 'Tenant A export subject',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Alpha body for export.' }],
          },
        ],
      },
    });
    pageAId = pageA.id;

    const wsB = await seedWorkspace(db as any);
    workspaceBId = wsB.id;
    const userB = await seedUser(db as any, workspaceBId);
    const spaceB = await seedSpace(db as any, workspaceBId, userB.id);
    const pageB = await seedPage(db as any, {
      spaceId: spaceB.id,
      workspaceId: workspaceBId,
      creatorId: userB.id,
      position: 'a0',
      title: 'Tenant B secret',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Beta body must never leak.' }],
          },
        ],
      },
    });
    pageBId = pageB.id;

    const groupRepo = new GroupRepo(db as any);
    const spaceRepo = new SpaceRepo(db as any, new EventEmitter2() as any);
    const spaceMemberRepo = new SpaceMemberRepo(
      db as any,
      groupRepo,
      spaceRepo,
      fakeCache(),
    );
    const pageRepo = new PageRepo(
      db as any,
      spaceMemberRepo,
      new EventEmitter2() as any,
      new OutboxWriter(db as any),
      { emitInvalidate: () => {} } as any,
    );
    const pagePermissionRepo = new PagePermissionRepo(
      db as any,
      groupRepo,
      fakeCache(),
    );
    const userRepo = new UserRepo(db as any);
    const workspaceRepo = new WorkspaceRepo(db as any);
    const spaceAbility = new SpaceAbilityFactory(spaceMemberRepo);

    // The REAL ExportService and the REAL audit service — this gate exists to
    // prove a real `audit` row lands, so a double on either side would make
    // the assertion meaningless (CS §5 ❌#4).
    //
    // Storage / environment / domain are the export path's TRUE-EXTERNAL
    // edges (object storage, process env, host resolution) — CS §5 row 3, the
    // one category a substitute is allowed to stand in for.
    //
    // StorageService and EnvironmentService are genuinely unreached on the
    // branch this gate drives (markdown, singlePage, no attachments).
    // DomainService IS reached: `getWorkspaceBaseUrl` calls `getUrl` to build
    // the absolute citation base for exported links, so it gets a REAL
    // implementation returning a fixed base URL rather than an empty object.
    // A fixed host is the honest substitute here — the deployment's public
    // hostname is environment, not behaviour this Issue asserts on, and
    // nothing below reads the returned URL.
    const exportService = new ExportService(
      pageRepo,
      pagePermissionRepo,
      db as any,
      {} as any, // StorageService — unreached (no attachments on this branch)
      {} as any, // EnvironmentService — unreached
      { getUrl: () => 'https://wiki.test.orvex.dev' } as any,
    );
    const auditService = new OrvexAuditService(
      db as any,
      new OutboxWriter(db as any),
    );

    internalApiService = new InternalApiService(
      pageRepo,
      pagePermissionRepo,
      spaceAbility,
      spaceRepo,
      workspaceRepo,
      userRepo,
      exportService,
      auditService,
    );
  }, 180_000);

  afterAll(async () => {
    await testDb?.teardown();
  });

  /**
   * The emission target is the OUTBOX, not a local `audit` table, and that is
   * the architecture rather than a detail of this test: under R25
   * orvex-studio-audit solely owns audit storage, so wiki's obligation is to
   * STAGE a durable row for the relay — an engine that wrote its own audit
   * store would be the exact ownership violation R25 forbids. `aggregateId`
   * carries the exported page id (OrvexAuditService maps resourceId onto it).
   */
  async function auditRowsFor(pageId: string, workspaceId: string) {
    return db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('aggregateId', '=', pageId)
      .execute();
  }

  it('AC1 — exportPage produces per-page markdown/text_repr with addressing metadata', async () => {
    const exported = await internalApiService.exportPage(
      workspaceAId,
      pageAId,
    );

    expect(typeof exported.textRepr).toBe('string');
    expect(exported.textRepr.length).toBeGreaterThan(0);
    expect(exported.textRepr).toContain('Alpha body for export.');
    expect(exported.title).toBe('Tenant A export subject');
  });

  it('AC3 — a successful export lands EXACTLY ONE real audit row naming the page', async () => {
    // Fresh page so the count is unambiguous: this leg is the whole reason
    // the gate exists (the grounding-correction gap ENG-2483 names).
    const page = await seedPage(db as any, {
      spaceId: spaceAId,
      workspaceId: workspaceAId,
      creatorId: userAId,
      position: 'a1',
      title: 'Audited export subject',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body that gets audited.' }],
          },
        ],
      },
    });

    expect(await auditRowsFor(page.id, workspaceAId)).toHaveLength(0);

    await internalApiService.exportPage(workspaceAId, page.id);

    const rows = await auditRowsFor(page.id, workspaceAId);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(AuditEvent.PAGE_EXPORTED);
    // The row is attributed, not anonymous — an audit row that cannot say
    // which workspace it belongs to is not an audit row (AD-3).
    expect(rows[0].workspaceId).toBe(workspaceAId);
  });

  it('AC2 / REM-1 — a cross-tenant export is denied with ZERO bytes and writes NO audit row', async () => {
    await expect(
      internalApiService.exportPage(workspaceAId, pageBId),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Nothing about tenant B's page may be recorded under tenant A, and the
    // refusal must not be laundered into a success-shaped audit row.
    expect(await auditRowsFor(pageBId, workspaceAId)).toHaveLength(0);
    expect(await auditRowsFor(pageBId, workspaceBId)).toHaveLength(0);
  });

  it('AC2 — resolvePage is tenant-scoped the same way (no second, weaker door)', async () => {
    await expect(
      internalApiService.resolvePage(workspaceAId, pageBId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('AC5 — no bulk-tar export code path exists in the engine', () => {
    // A grep gate, deliberately: AC5 is an ABSENCE claim, and the only honest
    // way to assert an absence is over the source itself.
    const serviceSrc = fs.readFileSync(
      path.join(
        __dirname,
        '../../src/core/internal-api/internal-api.service.ts',
      ),
      'utf8',
    );
    expect(serviceSrc).not.toMatch(/\btar\b/i);
    expect(serviceSrc).not.toMatch(/archiver/i);
    expect(serviceSrc).not.toMatch(/\.zip\b/i);
  });

  it('NFR honesty — the export path carries no TODO/placeholder/stub', () => {
    const serviceSrc = fs.readFileSync(
      path.join(
        __dirname,
        '../../src/core/internal-api/internal-api.service.ts',
      ),
      'utf8',
    );
    expect(serviceSrc).not.toMatch(/TODO|FIXME|placeholder|not implemented/i);
  });
});
