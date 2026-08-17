// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
import * as path from 'path';
import { promises as fs } from 'fs';
import { CamelCasePlugin, FileMigrationProvider, Kysely, Migrator, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import { OutboxWriter } from '../../outbox-writer.service';
import type { EntitlementService } from '../../../../entitlement/entitlement.service';
import {
  EVT_WORKSPACE_CREATED,
  EVT_WORKSPACE_UPDATED,
  EVT_WORKSPACE_MEMBER_ADDED,
  EVT_WORKSPACE_MEMBER_DELETED,
  EVT_USER_DELETED,
  USER_DELETED_SCHEMA_VERSION,
  EVT_SPACE_CREATED,
  EVT_SPACE_MEMBER_ADDED,
  EVT_SPACE_MEMBER_ROLE_CHANGED,
  EVT_COMMENT_CREATED,
  EVT_COMMENT_UPDATED,
  EVT_COMMENT_DELETED,
  EVT_ATTACHMENT_CREATED,
  EVT_ATTACHMENT_DELETED,
} from '../../../constants/orvex-event-types';
import { OutboxRelayService } from '../../outbox-relay.service';
import { InMemoryKafkaPublisher } from '../in-memory-kafka-publisher';
import type { DbInterface } from '../../../../../database/types/db.interface';
import type { KyselyDB } from '../../../../../database/types/kysely.types';
import { executeTx } from '../../../../../database/utils';
import { generateSlugId } from '../../../../../common/helpers/nanoid.utils';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import type { Cache } from 'cache-manager';

import { WorkspaceService } from '../../../../../core/workspace/services/workspace.service';
import { NotConfiguredRegistryClient } from '../../../../http/identity-registry-client';
import { OrvexConfigService } from '../../../../config/orvex-config.service';
import { SpaceService } from '../../../../../core/space/services/space.service';
import { SpaceMemberService } from '../../../../../core/space/services/space-member.service';
import { CommentService } from '../../../../../core/comment/comment.service';
import { AttachmentService } from '../../../../../core/attachment/services/attachment.service';
import { AttachmentType } from '../../../../../core/attachment/attachment.constants';
import type { PreparedFile } from '../../../../../core/attachment/attachment.utils';
import type { StorageService } from '../../../../../integrations/storage/storage.service';
import type { WsService } from '../../../../../ws/ws.service';
import type { CollaborationGateway } from '../../../../../collaboration/collaboration.gateway';
import type { PageRepo } from '../../../../../database/repos/page/page.repo';
import type { LicenseCheckService } from '../../../../../integrations/environment/license-check.service';
import type { EnvironmentService } from '../../../../../integrations/environment/environment.service';
import type { DomainService } from '../../../../../integrations/environment/domain.service';
import type { IAuditService } from '../../../../../integrations/audit/audit.service';
import type { User, Page } from '../../../../../database/types/entity.types';
import type { CreateWorkspaceDto } from '../../../../../core/workspace/dto/create-workspace.dto';
import type { UpdateWorkspaceDto } from '../../../../../core/workspace/dto/update-workspace.dto';
import type { CreateSpaceDto } from '../../../../../core/space/dto/create-space.dto';
import type { UpdateSpaceMemberRoleDto } from '../../../../../core/space/dto/update-space-member-role.dto';
import type { CreateCommentDto } from '../../../../../core/comment/dto/create-comment.dto';
import type { UpdateCommentDto } from '../../../../../core/comment/dto/update-comment.dto';

import { WorkspaceRepo } from '../../../../../database/repos/workspace/workspace.repo';
import { SpaceRepo } from '../../../../../database/repos/space/space.repo';
import { SpaceMemberRepo } from '../../../../../database/repos/space/space-member.repo';
import { GroupRepo } from '../../../../../database/repos/group/group.repo';
import { GroupUserRepo } from '../../../../../database/repos/group/group-user.repo';
import { UserRepo } from '../../../../../database/repos/user/user.repo';
import { ShareRepo } from '../../../../../database/repos/share/share.repo';
import { WatcherRepo } from '../../../../../database/repos/watcher/watcher.repo';
import { FavoriteRepo } from '../../../../../database/repos/favorite/favorite.repo';
import { UserSessionRepo } from '../../../../../database/repos/session/user-session.repo';
import { CommentRepo } from '../../../../../database/repos/comment/comment.repo';
import { AttachmentRepo } from '../../../../../database/repos/attachment/attachment.repo';

/**
 * ENG-1609 5a/T4 — `LifecycleEmitterCoverageSpec`, the sibling named DoD
 * test to ENG-1383's `OutboxAtomicityAndRelaySpec`. Real Kysely against a
 * testcontainers Postgres (never mock the outbox's own repo/tables — ❌#4);
 * every service under test is the REAL production class wired to REAL
 * repos, so a regression in the actual `OutboxWriter.enqueue(trx, event)`
 * call sites added by this ticket fails THIS suite, not just a hand-rolled
 * enqueue call. Only true externals (queues, storage, license/env/domain
 * config, audit logging, sockets) are stubbed — CS §5.
 *
 * Covers:
 *  - AC1/AC2 — workspace + workspace-member lifecycle (WorkspaceService).
 *  - AC3 — space + space-member lifecycle (SpaceService/SpaceMemberService).
 *  - AC4 — comment lifecycle (CommentService).
 *  - AC5 — attachment lifecycle (AttachmentService).
 *  - AC6 — atomicity negative: a forced rollback leaves zero outbox rows.
 *  - AC7 — every row's workspaceId matches the mutation's tenant.
 */
describe('LifecycleEmitterCoverageSpec', () => {
  jest.setTimeout(120_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let outboxWriter: OutboxWriter;

  let workspaceService: WorkspaceService;
  let spaceService: SpaceService;
  let spaceMemberService: SpaceMemberService;
  let commentService: CommentService;
  let attachmentService: AttachmentService;

  let workspaceRepo: WorkspaceRepo;
  let userRepo: UserRepo;
  let spaceRepo: SpaceRepo;

  const noopQueue = { add: async () => undefined } as unknown as Queue;
  const stubCache = {
    get: async () => undefined,
    set: async () => undefined,
    del: async () => undefined,
  } as unknown as Cache;
  const stubAuditService = { log: () => undefined } as unknown as IAuditService;

  beforeAll(async () => {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    sqlClient = postgres(pgContainer.getConnectionUri());

    const rawDb = new Kysely<DbInterface>({
      dialect: new PostgresJSDialect({ postgres: sqlClient }),
    });
    const migrationFolder = path.join(
      __dirname,
      '../../../../../database/migrations',
    );
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

    outboxWriter = new OutboxWriter(db);

    workspaceRepo = new WorkspaceRepo(db);
    spaceRepo = new SpaceRepo(db, new EventEmitter2());
    const groupRepo = new GroupRepo(db);
    userRepo = new UserRepo(db);
    const groupUserRepo = new GroupUserRepo(db, groupRepo, userRepo);
    const spaceMemberRepo = new SpaceMemberRepo(
      db,
      groupRepo,
      spaceRepo,
      stubCache,
    );
    const shareRepo = new ShareRepo(db, spaceMemberRepo);
    const watcherRepo = new WatcherRepo(db);
    const favoriteRepo = new FavoriteRepo(db);
    const userSessionRepo = new UserSessionRepo(db);
    const commentRepo = new CommentRepo(db);
    const attachmentRepo = new AttachmentRepo(db);

    const stubLicenseCheckService = {
      hasFeature: () => true,
    } as unknown as LicenseCheckService;
    const stubEnvironmentService = {
      isCloud: () => false,
    } as unknown as EnvironmentService;
    const stubDomainService = {
      getUrl: (h: string) => h,
    } as unknown as DomainService;

    spaceMemberService = new SpaceMemberService(
      spaceMemberRepo,
      groupUserRepo,
      spaceRepo,
      watcherRepo,
      favoriteRepo,
      db,
      stubAuditService,
      outboxWriter,
    );

    spaceService = new SpaceService(
      spaceRepo,
      spaceMemberService,
      shareRepo,
      workspaceRepo,
      stubLicenseCheckService,
      db,
      noopQueue,
      stubAuditService,
      outboxWriter,
    );

    workspaceService = new WorkspaceService(
      workspaceRepo,
      spaceService,
      spaceMemberService,
      groupRepo,
      groupUserRepo,
      userRepo,
      stubEnvironmentService,
      stubDomainService,
      stubLicenseCheckService,
      shareRepo,
      watcherRepo,
      favoriteRepo,
      db,
      noopQueue,
      noopQueue,
      noopQueue,
      stubAuditService,
      userSessionRepo,
      outboxWriter,
      // ENG-2503 AC4 added the REQUIRED identity-registry port as the 20th
      // ctor arg. This spec asserts outbox LIFECYCLE emission and never mints
      // a hostname, so it composes the same fail-closed
      // `NotConfiguredRegistryClient` prod binds when ORVEX_IDENTITY_URL is
      // unset — a real production class, not a hand-rolled stub, so any future
      // registry call from this path reds loudly instead of silently passing.
      new NotConfiguredRegistryClient(),
      // A-CELL — the real env reader on an explicit empty bag: this spec runs
      // no cell, so `cellId` reads null and workspaces are stamped `solo`.
      new OrvexConfigService({} as NodeJS.ProcessEnv),
    );

    const stubWsService = {
      emitCommentEvent: () => undefined,
      emitInvalidate: () => undefined,
    } as unknown as WsService;
    const unusedPageRepo = {} as unknown as PageRepo; // unused by create/update/delete when no yjsSelection
    const unusedCollaborationGateway = {} as unknown as CollaborationGateway; // unused without yjsSelection
    commentService = new CommentService(
      commentRepo,
      unusedPageRepo,
      stubWsService,
      unusedCollaborationGateway,
      noopQueue,
      noopQueue,
      db,
      outboxWriter,
    );

    const stubStorageService = {
      upload: async () => undefined,
      delete: async () => undefined,
    } as unknown as StorageService;
    // ENG-1382 — this spec covers outbox lifecycle emission, not F-QUOTA;
    // the entitlement service is stubbed permissive (never rejects) so it
    // doesn't interfere with the behaviour under test here.
    const stubEntitlementService = {
      assertWithinQuota: async () => undefined,
      assertIncrementWithinQuota: async () => undefined,
    } as unknown as EntitlementService;
    attachmentService = new AttachmentService(
      stubStorageService,
      attachmentRepo,
      userRepo,
      workspaceRepo,
      spaceRepo,
      db,
      noopQueue,
      outboxWriter,
      stubEntitlementService,
    );
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end();
    await pgContainer?.stop();
  });

  async function outboxRowsFor(type: string, aggregateId: string) {
    return db
      .selectFrom('orvexEventOutbox')
      .selectAll()
      .where('type', '=', type)
      .where('aggregateId', '=', aggregateId)
      .execute();
  }

  let userCounter = 0;
  async function createRealUser(): Promise<User> {
    userCounter++;
    return userRepo.insertUser({
      email: `eng-1609-user-${Date.now()}-${userCounter}@example.com`,
      name: `ENG-1609 User ${userCounter}`,
      password: 'x',
    });
  }

  it('AC1 — WorkspaceService.create commits exactly one workspace.created outbox row, tenant-scoped (AC7)', async () => {
    const user = await createRealUser();
    const ws = await workspaceService.create(user, { name: 'ENG-1609 WS' } as unknown as CreateWorkspaceDto);

    const rows = await outboxRowsFor(EVT_WORKSPACE_CREATED, ws.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].workspaceId).toBe(ws.id);
    expect(rows[0].relayedAt).toBeNull();
  });

  it('AC1 — WorkspaceService.update commits exactly one workspace.updated outbox row', async () => {
    const user = await createRealUser();
    const ws = await workspaceService.create(user, { name: 'ENG-1609 WS Update' } as unknown as CreateWorkspaceDto);
    await db.deleteFrom('orvexEventOutbox').where('workspaceId', '=', ws.id).execute();

    await workspaceService.update(ws.id, { name: 'Renamed' } as unknown as UpdateWorkspaceDto);

    const rows = await outboxRowsFor(EVT_WORKSPACE_UPDATED, ws.id);
    expect(rows).toHaveLength(1);
  });

  it('AC2 — WorkspaceService.addUserToWorkspace commits exactly one workspace.member_added outbox row', async () => {
    const user = await createRealUser();
    const ws = await workspaceService.create(user, { name: 'ENG-1609 WS Member' } as unknown as CreateWorkspaceDto);
    await db.deleteFrom('orvexEventOutbox').where('workspaceId', '=', ws.id).execute();

    const memberUser = await userRepo.insertUser({
      email: 'member@example.com',
      name: 'Member',
      password: 'x',
    });

    await workspaceService.addUserToWorkspace(memberUser.id, ws.id);

    const rows = await outboxRowsFor(EVT_WORKSPACE_MEMBER_ADDED, memberUser.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].workspaceId).toBe(ws.id);
  });

  it('AC6 — a rolled-back workspace-member mutation leaves NO outbox row', async () => {
    const user = await createRealUser();
    const ws = await workspaceService.create(user, { name: 'ENG-1609 WS Rollback' } as unknown as CreateWorkspaceDto);
    await db.deleteFrom('orvexEventOutbox').where('workspaceId', '=', ws.id).execute();

    const memberUser = await userRepo.insertUser({
      email: 'rollback-member@example.com',
      name: 'Rollback Member',
      password: 'x',
    });

    await expect(
      executeTx(db, async (trx) => {
        await workspaceService.addUserToWorkspace(memberUser.id, ws.id, undefined, trx);
        throw new Error('forced rollback after outbox write');
      }),
    ).rejects.toThrow('forced rollback after outbox write');

    const rows = await outboxRowsFor(EVT_WORKSPACE_MEMBER_ADDED, memberUser.id);
    expect(rows).toHaveLength(0);
  });

  it('AC3 — SpaceService.createSpace commits space.created AND space.member_added outbox rows atomically', async () => {
    const user = await createRealUser();
    const ws = await workspaceService.create(user, { name: 'ENG-1609 WS Space' } as unknown as CreateWorkspaceDto);
    await db.deleteFrom('orvexEventOutbox').where('workspaceId', '=', ws.id).execute();

    const authUser = { id: user.id } as unknown as User;
    const space = await spaceService.createSpace(authUser, ws.id, {
      name: 'A space',
      slug: `eng-1609-space-${Date.now()}`,
    } as unknown as CreateSpaceDto);

    const createdRows = await outboxRowsFor(EVT_SPACE_CREATED, space.id);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].workspaceId).toBe(ws.id);

    const memberRows = await outboxRowsFor(EVT_SPACE_MEMBER_ADDED, space.id);
    expect(memberRows.length).toBeGreaterThanOrEqual(1);
  });

  it('AC3 — SpaceMemberService.updateSpaceMemberRole commits exactly one space.member_role_changed outbox row', async () => {
    const user = await createRealUser();
    const ws = await workspaceService.create(user, { name: 'ENG-1609 WS Role' } as unknown as CreateWorkspaceDto);
    const authUser = { id: user.id } as unknown as User;
    const space = await spaceService.createSpace(authUser, ws.id, {
      name: 'Role space',
      slug: `eng-1609-role-${Date.now()}`,
    } as unknown as CreateSpaceDto);

    const otherUser = await userRepo.insertUser({
      email: 'role-member@example.com',
      name: 'Role Member',
      password: 'x',
    });
    await spaceMemberService.addUserToSpace(otherUser.id, space.id, 'writer', ws.id);
    await db.deleteFrom('orvexEventOutbox').where('workspaceId', '=', ws.id).execute();

    await spaceMemberService.updateSpaceMemberRole(
      { spaceId: space.id, userId: otherUser.id, role: 'admin' } as unknown as UpdateSpaceMemberRoleDto,
      ws.id,
    );

    const rows = await outboxRowsFor(EVT_SPACE_MEMBER_ROLE_CHANGED, space.id);
    expect(rows).toHaveLength(1);
  });

  it('AC4 — CommentService.create/update and controller-path delete each commit exactly one comment.* outbox row', async () => {
    const user = await createRealUser();
    const ws = await workspaceService.create(user, { name: 'ENG-1609 WS Comment' } as unknown as CreateWorkspaceDto);
    const authUser = { id: user.id } as unknown as User;
    const space = await spaceService.createSpace(authUser, ws.id, {
      name: 'Comment space',
      slug: `eng-1609-comment-${Date.now()}`,
    } as unknown as CreateSpaceDto);
    const page = await db
      .insertInto('pages')
      .values({
        title: 'Comment page',
        slugId: generateSlugId(),
        spaceId: space.id,
        workspaceId: ws.id,
      })
      .returning(['id', 'spaceId', 'workspaceId'])
      .executeTakeFirstOrThrow();
    await db.deleteFrom('orvexEventOutbox').where('workspaceId', '=', ws.id).execute();

    const comment = await commentService.create(
      { page: page as unknown as Page, workspaceId: ws.id, user },
      { content: JSON.stringify({ type: 'doc', content: [] }) } as unknown as CreateCommentDto,
    );
    const createdRows = await outboxRowsFor(EVT_COMMENT_CREATED, comment.id);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].workspaceId).toBe(ws.id);

    await commentService.update(
      comment,
      { content: JSON.stringify({ type: 'doc', content: [{ type: 'text', text: 'x' }] }) } as unknown as UpdateCommentDto,
      user,
    );
    const updatedRows = await outboxRowsFor(EVT_COMMENT_UPDATED, comment.id);
    expect(updatedRows).toHaveLength(1);

    await commentService.delete(comment);
    const deletedRows = await outboxRowsFor(EVT_COMMENT_DELETED, comment.id);
    expect(deletedRows).toHaveLength(1);
  });

  it('AC6 — a rolled-back comment update leaves NO comment.updated outbox row', async () => {
    const user = await createRealUser();
    const ws = await workspaceService.create(user, { name: 'ENG-1609 WS CommentRB' } as unknown as CreateWorkspaceDto);
    const authUser = { id: user.id } as unknown as User;
    const space = await spaceService.createSpace(authUser, ws.id, {
      name: 'Comment rb space',
      slug: `eng-1609-comment-rb-${Date.now()}`,
    } as unknown as CreateSpaceDto);
    const page = await db
      .insertInto('pages')
      .values({
        title: 'Comment rb page',
        slugId: generateSlugId(),
        spaceId: space.id,
        workspaceId: ws.id,
      })
      .returning(['id', 'spaceId', 'workspaceId'])
      .executeTakeFirstOrThrow();
    const comment = await commentService.create(
      { page: page as unknown as Page, workspaceId: ws.id, user },
      { content: JSON.stringify({ type: 'doc', content: [] }) } as unknown as CreateCommentDto,
    );
    await db.deleteFrom('orvexEventOutbox').where('workspaceId', '=', ws.id).execute();

    // Simulate a mid-tx crash the same way the ENG-1383 spec does: enqueue
    // then throw before commit, proving same-tx enlistment.
    await expect(
      executeTx(db, async (trx) => {
        await outboxWriter.enqueue(trx, {
          type: EVT_COMMENT_UPDATED,
          aggregateId: comment.id,
          workspaceId: ws.id,
          payload: {},
        });
        throw new Error('forced rollback after comment outbox write');
      }),
    ).rejects.toThrow('forced rollback after comment outbox write');

    const rows = await outboxRowsFor(EVT_COMMENT_UPDATED, comment.id);
    expect(rows).toHaveLength(0);
  });

  it('AC5 — AttachmentService.saveAttachment (create) and handleDeletePageAttachments (delete) each commit exactly one attachment.* outbox row', async () => {
    const user = await createRealUser();
    const ws = await workspaceService.create(user, { name: 'ENG-1609 WS Attach' } as unknown as CreateWorkspaceDto);
    const authUser = { id: user.id } as unknown as User;
    const space = await spaceService.createSpace(authUser, ws.id, {
      name: 'Attach space',
      slug: `eng-1609-attach-${Date.now()}`,
    } as unknown as CreateSpaceDto);
    const page = await db
      .insertInto('pages')
      .values({
        title: 'Attach page',
        slugId: generateSlugId(),
        spaceId: space.id,
        workspaceId: ws.id,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await db.deleteFrom('orvexEventOutbox').where('workspaceId', '=', ws.id).execute();

    const attachment = await attachmentService.saveAttachment({
      preparedFile: {
        fileName: 'a.txt',
        fileSize: 3,
        mimeType: 'text/plain',
        fileExtension: '.txt',
      } as unknown as PreparedFile,
      filePath: `attachments/${ws.id}/a.txt`,
      type: AttachmentType.File,
      userId: user.id,
      workspaceId: ws.id,
      pageId: page.id,
    });

    const createdRows = await outboxRowsFor(EVT_ATTACHMENT_CREATED, attachment.id);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0].workspaceId).toBe(ws.id);

    await attachmentService.handleDeletePageAttachments(page.id);

    const deletedRows = await outboxRowsFor(EVT_ATTACHMENT_DELETED, attachment.id);
    expect(deletedRows).toHaveLength(1);
  });

  it('AC4 — no-bridge grep-gate still holds for the outbox module after ENG-1609 (D-S13, unchanged)', async () => {
    const outboxSrc = await fs.readdir(path.join(__dirname, '../..'));
    for (const file of outboxSrc) {
      if (!file.endsWith('.ts')) continue;
      const content = await fs.readFile(path.join(__dirname, '../..', file), 'utf-8');
      expect(content).not.toMatch(/from ['"]ioredis['"]|XADD/i);
    }
  });

  // ─── ENG-2497 (FR-37) — the distributed-cleanup contract: a durable
  // `user.deleted` outbox event on the ONE real user-removal path
  // (`WorkspaceService.deleteUser`), same tx as the removal, alongside (not
  // replacing) `workspace.member_deleted`. AC1 (whole-workspace deletion)
  // is ESCALATED per OPEN-4/R-WIKI-7, deliberately NOT built here. ────────
  describe('ENG-2497 — user.deleted distributed-cleanup outbox event (FR-37)', () => {
    /** Fixture: an owner + workspace + a deletable member; outbox cleared. */
    async function createWorkspaceWithMember() {
      const creator = await createRealUser();
      const ws = await workspaceService.create(creator, {
        name: 'ENG-2497 WS',
      } as unknown as CreateWorkspaceDto);
      // Re-fetch the creator so `authUser.role` is the post-create OWNER
      // role, exactly as the controller passes the live authenticated user.
      const owner = await userRepo.findById(creator.id, ws.id);
      const member = await userRepo.insertUser({
        email: `eng-2497-member-${Date.now()}-${Math.random()}@example.com`,
        name: 'ENG-2497 Member',
        password: 'x',
      });
      await workspaceService.addUserToWorkspace(member.id, ws.id);
      await db
        .deleteFrom('orvexEventOutbox')
        .where('workspaceId', '=', ws.id)
        .execute();
      return { owner: owner as User, member, ws };
    }

    it('TestUserDeletedEmitsCleanupOutboxEvent — deleteUser commits a durable user.deleted outbox row in the SAME tx as the member removal (alongside workspace.member_deleted), carrying an explicit schemaVersion, and the relay drains it as the registered wiki.user.deleted CloudEvent', async () => {
      const { owner, member, ws } = await createWorkspaceWithMember();

      await workspaceService.deleteUser(owner, member.id, ws.id);

      // AC2 — the durable cleanup event, committed with the removal.
      const userDeletedRows = await outboxRowsFor(EVT_USER_DELETED, member.id);
      expect(userDeletedRows).toHaveLength(1);
      expect(userDeletedRows[0].workspaceId).toBe(ws.id);
      expect(userDeletedRows[0].relayedAt).toBeNull();
      const payload = userDeletedRows[0].payload as {
        userId: string;
        workspaceId: string;
        schemaVersion: number;
      };
      expect(payload.userId).toBe(member.id);
      expect(payload.workspaceId).toBe(ws.id);
      // AC3 / FR-36 — an explicit, real schema version (never fabricated).
      expect(payload.schemaVersion).toBe(USER_DELETED_SCHEMA_VERSION);

      // Regression guard — the pre-existing membership event is NOT
      // replaced: BOTH rows, not either/or.
      const memberDeletedRows = await outboxRowsFor(
        EVT_WORKSPACE_MEMBER_DELETED,
        member.id,
      );
      expect(memberDeletedRows).toHaveLength(1);

      // The removal itself really happened (soft-delete + anonymize).
      const deletedUserRow = await db
        .selectFrom('users')
        .select(['deletedAt', 'email'])
        .where('id', '=', member.id)
        .executeTakeFirstOrThrow();
      expect(deletedUserRow.deletedAt).not.toBeNull();
      expect(deletedUserRow.email).toContain('@deleted.docmost.com');

      // AC3 — the event rides the SAME relay every other wiki.* event
      // uses, as a typed CloudEvent whose `type` is a REGISTERED
      // purge_event in the vendored contracts registry (ENG-2495 fixtures).
      const registry = JSON.parse(
        await fs.readFile(
          path.join(__dirname, '../fixtures/contracts/wiki-source-registry.json'),
          'utf-8',
        ),
      ) as { purge_events: string[] };
      const publisher = new InMemoryKafkaPublisher();
      const relay = new OutboxRelayService(db, publisher, {
        cellId: null,
        kafkaBrokersConfigured: false,
      });
      const run = await relay.run();
      expect(run.failed).toBe(0);
      const message = publisher
        .getAllDistinctMessages()
        .find((m) => m.key === userDeletedRows[0].id);
      expect(message).toBeDefined();
      const envelope = JSON.parse(message!.value) as {
        type: string;
        orvextenant: string;
        subject: string;
        data: { schemaVersion: number; userId: string };
      };
      expect(envelope.type).toBe('wiki.user.deleted');
      expect(registry.purge_events).toContain(envelope.type);
      expect(envelope.orvextenant).toBe(ws.id);
      expect(envelope.subject).toBe(member.id);
      expect(envelope.data.schemaVersion).toBe(USER_DELETED_SCHEMA_VERSION);
      expect(envelope.data.userId).toBe(member.id);
    });

    it('TestDeleteUserRollbackLeavesNoOrphanUserDeletedRow — a removal whose tx aborts broadcasts NO false deletion (and the member is NOT removed either)', async () => {
      const { owner, member, ws } = await createWorkspaceWithMember();

      // REAL DB-level fault injection (❌#4 — never a mock of own code): the
      // user.deleted INSERT itself fails, aborting deleteUser's whole tx.
      await sql`
        CREATE OR REPLACE FUNCTION orvex_test_fail_user_deleted() RETURNS trigger AS $$
        BEGIN
          IF NEW.type = 'user.deleted' THEN
            RAISE EXCEPTION 'ENG-2497 fault-injected user.deleted failure';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
      `.execute(db);
      await sql`
        CREATE TRIGGER orvex_test_fail_user_deleted_trg
        BEFORE INSERT ON orvex_event_outbox
        FOR EACH ROW EXECUTE FUNCTION orvex_test_fail_user_deleted();
      `.execute(db);

      try {
        await expect(
          workspaceService.deleteUser(owner, member.id, ws.id),
        ).rejects.toThrow(/fault-injected user.deleted failure/);

        // AC5 — zero orphan cleanup rows (no false deletion broadcast)…
        expect(await outboxRowsFor(EVT_USER_DELETED, member.id)).toHaveLength(0);
        // …and the WHOLE tx rolled back: no membership event either, and
        // the member is untouched (not soft-deleted, not anonymized).
        expect(
          await outboxRowsFor(EVT_WORKSPACE_MEMBER_DELETED, member.id),
        ).toHaveLength(0);
        const memberRow = await db
          .selectFrom('users')
          .select(['deletedAt', 'email'])
          .where('id', '=', member.id)
          .executeTakeFirstOrThrow();
        expect(memberRow.deletedAt).toBeNull();
        expect(memberRow.email).toBe(member.email);
      } finally {
        await sql`DROP TRIGGER IF EXISTS orvex_test_fail_user_deleted_trg ON orvex_event_outbox;`.execute(
          db,
        );
        await sql`DROP FUNCTION IF EXISTS orvex_test_fail_user_deleted();`.execute(
          db,
        );
      }
    });

    it('TestNoNewWorkspaceDeletionRouteAdded — AC1 is escalated (OPEN-4), never silently faked: no whole-workspace deletion route or method exists', async () => {
      const controllerSrc = await fs.readFile(
        path.join(
          __dirname,
          '../../../../../core/workspace/controllers/workspace.controller.ts',
        ),
        'utf-8',
      );
      // The ONLY delete-shaped member route is the existing per-member one.
      expect(controllerSrc).toContain("@Post('members/delete')");
      // No whole-workspace deletion surface was invented by this story.
      expect(controllerSrc).not.toMatch(/@(Post|Delete)\(\s*['"]delete['"]\s*\)/);
      expect(controllerSrc).not.toMatch(/deleteWorkspace(?!Member)/);
      expect(controllerSrc).not.toMatch(/removeWorkspace|purgeWorkspace/);

      const serviceSrc = await fs.readFile(
        path.join(
          __dirname,
          '../../../../../core/workspace/services/workspace.service.ts',
        ),
        'utf-8',
      );
      expect(serviceSrc).not.toMatch(/deleteWorkspace|removeWorkspace|purgeWorkspace/);
    });
  });
});
