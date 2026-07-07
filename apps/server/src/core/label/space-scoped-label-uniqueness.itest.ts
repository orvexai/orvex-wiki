import * as path from 'path';
import { promises as fs } from 'fs';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
  PostgresDialect,
  sql,
} from 'kysely';
import { Pool } from 'pg';
import { ForbiddenException } from '@nestjs/common';
import { OrvexLabelService } from './orvex-label.service';
import { LabelType } from '@docmost/db/repos/label/label.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';

jest.setTimeout(180000);

// Real (no-op) cache-manager stand-in. `SpaceMemberRepo.getUserSpaceRoles`
// wraps its query in `withCache`; a real in-memory Map is enough here --
// this is application-internal caching, not a true external, so a fake
// implementing the same interface (not a mock of our own repo) is fine.
function createNoopCache() {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      store.delete(key);
    },
  } as any;
}

describe('SpaceScopedLabelUniquenessSpec (ENG-1385)', () => {
  let pgContainer: StartedPostgreSqlContainer;
  let db: Kysely<any>;
  let service: OrvexLabelService;
  let spaceMemberRepo: SpaceMemberRepo;

  let workspaceId: string;
  let spaceAId: string;
  let spaceBId: string;
  let memberUserId: string;
  let nonMemberUserId: string;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:17-trixie')
      .withDatabase('orvex_wiki_test')
      .start();

    const pool = new Pool({ connectionString: pgContainer.getConnectionUri() });
    db = new Kysely<any>({
      dialect: new PostgresDialect({ pool }),
      plugins: [new CamelCasePlugin()],
    });

    // Run every real migration (up to and including
    // 20260707T100000-orvex-space-scoped-labels) against a fresh Postgres --
    // no mocked schema, the uniqueness tests must hit the real partial
    // indexes.
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, '../../database/migrations'),
      }),
    });
    const { error, results } = await migrator.migrateToLatest();
    if (error) {
      throw error;
    }
    const failed = results?.filter((r) => r.status === 'Error');
    if (failed && failed.length > 0) {
      throw new Error(
        `Migration(s) failed: ${failed.map((f) => f.migrationName).join(', ')}`,
      );
    }

    const spaceRepo = new SpaceRepo(db as any, { emit: () => {} } as any);
    const groupRepo = new GroupRepo(db as any);
    spaceMemberRepo = new SpaceMemberRepo(
      db as any,
      groupRepo,
      spaceRepo,
      createNoopCache(),
    );
    service = new OrvexLabelService(db as any, spaceMemberRepo);
  }, 180000);

  afterAll(async () => {
    await db?.destroy();
    await pgContainer?.stop();
  });

  beforeEach(async () => {
    workspaceId = crypto.randomUUID();
    memberUserId = crypto.randomUUID();
    nonMemberUserId = crypto.randomUUID();

    await db
      .insertInto('workspaces')
      .values({
        id: workspaceId,
        name: 'ENG-1385 workspace',
        hostname: `eng-1385-${workspaceId}`,
      })
      .execute();

    for (const [userId, email] of [
      [memberUserId, 'member@example.com'],
      [nonMemberUserId, 'nonmember@example.com'],
    ] as const) {
      await db
        .insertInto('users')
        .values({
          id: userId,
          name: 'Test User',
          email: `${userId}-${email}`,
          password: 'x',
          workspaceId,
        })
        .execute();
    }

    spaceAId = crypto.randomUUID();
    spaceBId = crypto.randomUUID();
    for (const spaceId of [spaceAId, spaceBId]) {
      await db
        .insertInto('spaces')
        .values({
          id: spaceId,
          name: `Space ${spaceId}`,
          slug: spaceId,
          workspaceId,
          creatorId: memberUserId,
        })
        .execute();
    }

    // memberUserId is a direct member of space A only.
    await db
      .insertInto('spaceMembers')
      .values({
        id: crypto.randomUUID(),
        spaceId: spaceAId,
        userId: memberUserId,
        role: 'writer',
      })
      .execute();
  });

  afterEach(async () => {
    await db.deleteFrom('spaceMembers').execute();
    await db.deleteFrom('labels').execute();
    await db.deleteFrom('spaces').execute();
    await db.deleteFrom('users').execute();
    await db.deleteFrom('workspaces').execute();
  });

  // AC1
  it('lets two spaces each hold a label of the same name without collision', async () => {
    const labelA = await service.resolveLabelForAttach(
      'Urgent',
      workspaceId,
      spaceAId,
      'space',
    );
    const labelB = await service.resolveLabelForAttach(
      'urgent',
      workspaceId,
      spaceBId,
      'space',
    );

    const rows = await db
      .selectFrom('labels')
      .selectAll()
      .where('name', '=', 'urgent')
      .where('type', '=', LabelType.PAGE)
      .execute();

    expect(rows).toHaveLength(2);
    expect(labelA.spaceId).toBe(spaceAId);
    expect(labelB.spaceId).toBe(spaceBId);
    expect(labelA.spaceId).not.toBe(labelB.spaceId);
  });

  // AC2
  it('rejects a second workspace-scoped label of the same name (labels_workspace_type_name_no_space_uq)', async () => {
    await service.resolveLabelForAttach(
      'urgent',
      workspaceId,
      spaceAId,
      'workspace',
    );

    await expect(
      db
        .insertInto('labels')
        .values({
          name: 'urgent',
          type: LabelType.PAGE,
          workspaceId,
          spaceId: null,
        })
        .execute(),
    ).rejects.toThrow(/duplicate key value violates unique constraint/i);
  });

  // AC3
  it('rejects a second space-scoped label of the same (workspace,type,space,name) (labels_workspace_type_space_name_uq)', async () => {
    await service.resolveLabelForAttach(
      'urgent',
      workspaceId,
      spaceAId,
      'space',
    );

    await expect(
      db
        .insertInto('labels')
        .values({
          name: 'urgent',
          type: LabelType.PAGE,
          workspaceId,
          spaceId: spaceAId,
        })
        .execute(),
    ).rejects.toThrow(/duplicate key value violates unique constraint/i);
  });

  // AC4
  it('resolveLabelForAttach is find-or-create and normalises name (lower-case + trim)', async () => {
    const first = await service.resolveLabelForAttach(
      '  Urgent  ',
      workspaceId,
      spaceAId,
      'space',
    );
    const second = await service.resolveLabelForAttach(
      'urgent',
      workspaceId,
      spaceAId,
      'space',
    );

    expect(first.id).toBe(second.id);
    expect(first.name).toBe('urgent');
  });

  // AC5
  it('assertVisibility forbids a non-member from seeing a space-scoped label; passes for a member; workspace-scoped always visible', async () => {
    const spaceLabel = await service.resolveLabelForAttach(
      'urgent',
      workspaceId,
      spaceAId,
      'space',
    );
    const workspaceLabel = await service.resolveLabelForAttach(
      'general',
      workspaceId,
      spaceAId,
      'workspace',
    );

    await expect(
      service.assertVisibility(spaceLabel, nonMemberUserId),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.assertVisibility(spaceLabel, memberUserId),
    ).resolves.toBeUndefined();

    await expect(
      service.assertVisibility(workspaceLabel, nonMemberUserId),
    ).resolves.toBeUndefined();
  });

  // AC6
  it('reconciles the legacy global unique index away (absent) and both partial indexes are present; the migration is idempotent', async () => {
    const indexRows = await sql<{ indexname: string }>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'labels'
    `.execute(db);
    const names = indexRows.rows.map((r) => r.indexname);

    expect(names).toContain('labels_workspace_type_name_no_space_uq');
    expect(names).toContain('labels_workspace_type_space_name_uq');
    expect(names).not.toContain('labels_workspace_id_type_name_unique');

    // Idempotent reconcile: re-running the migration's up() must not throw.
    const migrationModule = await import(
      '../../database/migrations/20260707T100000-orvex-space-scoped-labels'
    );
    await expect(migrationModule.up(db)).resolves.not.toThrow();
  });

  // AC7
  it('down() dedupes cross-space duplicates and nulls space_id before restoring the global unique constraint', async () => {
    // Two space-scoped rows sharing (workspace,type,name) across different
    // spaces -- allowed today, would collide under the legacy global index.
    await service.resolveLabelForAttach(
      'urgent',
      workspaceId,
      spaceAId,
      'space',
    );
    await service.resolveLabelForAttach(
      'urgent',
      workspaceId,
      spaceBId,
      'space',
    );

    const migrationModule = await import(
      '../../database/migrations/20260707T100000-orvex-space-scoped-labels'
    );

    await expect(migrationModule.down(db)).resolves.not.toThrow();

    const rows = await db
      .selectFrom('labels')
      .selectAll()
      .where('name', '=', 'urgent')
      .where('workspaceId', '=', workspaceId)
      .execute();
    expect(rows).toHaveLength(1);

    const indexRows = await sql<{ indexname: string }>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'labels'
    `.execute(db);
    expect(indexRows.rows.map((r) => r.indexname)).toContain(
      'labels_workspace_id_type_name_unique',
    );

    // Restore forward schema state for subsequent tests in this file.
    await migrationModule.up(db);
  });
});
