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
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { OrvexPageMetadataService } from './orvex-page-metadata.service';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { ConfirmTokenService } from './confirm-token.service';
import { ForceSupersedeSettingsService } from './force-supersede-settings.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  AuditLogContext,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { ActorType, AuditLogPayload } from '../../common/events/audit-events';
import { IPageLifecycleBroadcaster } from './supersede.types';
import { PageStatus } from '@orvex/extensions';
import type { DbInterface } from '../../database/types/db.interface';
import type { KyselyDB } from '../../database/types/kysely.types';

/**
 * ENG-1434 — the named DoD gate: `TestSupersedeLifecycleAndBreakGlass`.
 *
 * Real Postgres (testcontainers), migrated to HEAD, exercising the real
 * `OrvexPageMetadataService.supersedeAtomic`/`setStatus` chokepoint (AC12)
 * through its exported interface — never mocked (CS §5/❌#4). The
 * `ConfirmTokenService`/`ForceSupersedeSettingsService` governance
 * primitives are REAL (own-package, in-process); only the two genuinely
 * "remote/EE" collaborators are in-memory fakes, per CS §5 4f:
 *  - `IAuditService` -> `CapturingAuditService` (a real class implementing
 *    the interface, capturing rows — never `jest.mock`).
 *  - `IPageLifecycleBroadcaster` -> `CapturingBroadcaster` (the injected
 *    realtime port + in-memory fake CS §5 4f explicitly calls for).
 */
describe('TestSupersedeLifecycleAndBreakGlass — integration', () => {
  jest.setTimeout(180_000);

  let pgContainer: StartedPostgreSqlContainer;
  let sqlClient: ReturnType<typeof postgres>;
  let db: KyselyDB;
  let workspaceId: string;
  let spaceId: string;
  let humanUserId: string;
  let agentUserId: string;

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

  class CapturingBroadcaster implements IPageLifecycleBroadcaster {
    public readonly events: Array<{
      workspaceId: string;
      spaceId: string;
      pageId: string;
      status: string;
    }> = [];

    broadcastLifecycleChange(event: {
      workspaceId: string;
      spaceId: string;
      pageId: string;
      status: string;
    }): void {
      this.events.push(event);
    }
  }

  const fakeEnvironmentService = {
    getAppSecret: () => 'eng-1434-test-app-secret-0123456789-abcdef',
  } as unknown as EnvironmentService;

  function buildService(audit: CapturingAuditService, broadcaster: CapturingBroadcaster) {
    const workspaceRepo = new WorkspaceRepo(db);
    const confirmTokenService = new ConfirmTokenService(fakeEnvironmentService);
    const forceSupersedeSettingsService = new ForceSupersedeSettingsService(
      workspaceRepo,
      audit,
    );
    return new OrvexPageMetadataService(
      db,
      workspaceRepo,
      undefined,
      undefined,
      confirmTokenService,
      forceSupersedeSettingsService,
      audit,
      broadcaster,
    );
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
      .values({ name: 'ENG-1434 Workspace' })
      .returning('id')
      .executeTakeFirstOrThrow();
    workspaceId = ws.id;

    const space = await db
      .insertInto('spaces')
      .values({ name: 'ENG-1434 Space', slug: 'eng-1434-space', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    spaceId = space.id;

    const human = await db
      .insertInto('users')
      .values({ email: 'eng-1434-human@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    humanUserId = human.id;

    const agent = await db
      .insertInto('users')
      .values({ email: 'eng-1434-agent@example.com', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    agentUserId = agent.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await sqlClient?.end({ timeout: 5 });
    await pgContainer?.stop();
  });

  let pageCounter = 0;
  async function createPage(title: string) {
    pageCounter += 1;
    return db
      .insertInto('pages')
      .values({
        title,
        spaceId,
        workspaceId,
        slugId: `eng-1434-${pageCounter}-${Date.now()}`,
        creatorId: humanUserId,
        lastUpdatedById: humanUserId,
      })
      .returning(['id', 'slugId'])
      .executeTakeFirstOrThrow();
  }

  // ---------------------------------------------------------------------
  // AC1 — XOR guard
  // ---------------------------------------------------------------------
  it('AC1: rejects a supersede body with BOTH supersedes and supersededBy — 400 INVALID_SUPERSESSION', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit, new CapturingBroadcaster());
    const target = await createPage('AC1 both');
    const other = await createPage('AC1 other');

    await expect(
      service.supersedeAtomic(
        target.id,
        { supersedes: other.slugId, supersededBy: other.slugId },
        { authMethod: undefined, actorId: humanUserId },
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: 'INVALID_SUPERSESSION' },
    });
  });

  it('AC1: rejects a supersede body with NEITHER supersedes nor supersededBy — 400 INVALID_SUPERSESSION', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit, new CapturingBroadcaster());
    const target = await createPage('AC1 neither');

    await expect(
      service.supersedeAtomic(
        target.id,
        {},
        { authMethod: undefined, actorId: humanUserId },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ---------------------------------------------------------------------
  // AC2 — human happy path
  // ---------------------------------------------------------------------
  it('AC2: a human session supersedes directly — side-table + supersedes[] + lock + PAGE_SUPERSEDED audit (actorType=user)', async () => {
    const audit = new CapturingAuditService();
    const broadcaster = new CapturingBroadcaster();
    const service = buildService(audit, broadcaster);
    const canonical = await createPage('AC2 canonical');
    const target = await createPage('AC2 target');

    const result = await service.supersedeAtomic(
      target.id,
      { supersededBy: canonical.slugId },
      { authMethod: undefined, actorId: humanUserId },
    );

    expect(result.status).toBe(PageStatus.SUPERSEDED);
    expect(result.supersededBy).toBe(canonical.slugId);

    const canonicalMeta = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', canonical.id)
      .executeTakeFirstOrThrow();
    expect(canonicalMeta.supersedes).toEqual([target.slugId]);

    const targetPageRow = await db
      .selectFrom('pages')
      .select(['isLocked'])
      .where('id', '=', target.id)
      .executeTakeFirstOrThrow();
    expect(targetPageRow.isLocked).toBe(true);

    const supersededAudit = audit.logs.find(
      (l) => l.payload.event === 'page.superseded',
    );
    expect(supersededAudit?.context.actorType).toBe('user');

    // AC13 — post-commit broadcast fired exactly once for this write.
    expect(broadcaster.events).toHaveLength(1);
    expect(broadcaster.events[0]).toMatchObject({ pageId: target.id });
  });

  // ---------------------------------------------------------------------
  // AC3/AC4 — CONFIRM_TOKEN gate
  // ---------------------------------------------------------------------
  it('AC3: a non-human (api_key) caller with no confirmToken and no forceSupersede is refused — 403 CONFIRM_TOKEN_REQUIRED, no mutation', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit, new CapturingBroadcaster());
    const canonical = await createPage('AC3 canonical');
    const target = await createPage('AC3 target');

    await expect(
      service.supersedeAtomic(
        target.id,
        { supersededBy: canonical.slugId },
        { authMethod: 'api_key', actorId: agentUserId },
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: { error: 'CONFIRM_TOKEN_REQUIRED' },
    });

    const meta = await db
      .selectFrom('orvexPageMeta')
      .selectAll()
      .where('pageId', '=', target.id)
      .executeTakeFirst();
    expect(meta).toBeUndefined();
  });

  it('AC4: a non-human caller with a valid CONFIRM_TOKEN supersedes — 200, audit actorType=api_key attribution present', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit, new CapturingBroadcaster());
    const confirmTokenService = new ConfirmTokenService(fakeEnvironmentService);
    const canonical = await createPage('AC4 canonical');
    const target = await createPage('AC4 target');

    const { token } = confirmTokenService.issue({
      workspaceId,
      action: 'supersede',
      scopeId: target.id,
      confirmingUserId: agentUserId,
    });

    const result = await service.supersedeAtomic(
      target.id,
      { supersededBy: canonical.slugId },
      {
        authMethod: 'api_key',
        actorId: agentUserId,
        confirmToken: token,
        clientId: 'apikey_eng1434_ac4',
      },
    );

    expect(result.status).toBe(PageStatus.SUPERSEDED);
    const supersededAudit = audit.logs.find(
      (l) => l.payload.event === 'page.superseded',
    );
    expect(supersededAudit?.context.actorType).toBe('api_key');
    expect(supersededAudit?.context.actorId).toBe(agentUserId);
    // review2 F1 — AC4 requires the api_key client's own identity
    // (the api-key id, not just the confirming human) to land on the row.
    expect(supersededAudit?.context.clientId).toBe('apikey_eng1434_ac4');
  });

  // ---------------------------------------------------------------------
  // AC5-AC8 — forced-supersede break-glass
  // ---------------------------------------------------------------------
  it('AC5: forceSupersede is fail-closed by default — 403 SUPERSEDE_FORCE_NOT_ALLOWED', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit, new CapturingBroadcaster());
    const canonical = await createPage('AC5 canonical');
    const target = await createPage('AC5 target');

    await expect(
      service.supersedeAtomic(
        target.id,
        { supersededBy: canonical.slugId },
        {
          authMethod: 'api_key',
          actorId: agentUserId,
          forceSupersede: true,
          forceReason: 'a perfectly long enough forced reason string',
        },
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: { error: 'SUPERSEDE_FORCE_NOT_ALLOWED' },
    });
  });

  it('AC6: forceSupersede enabled but reason < 20 chars — 400 FORCE_REASON_REQUIRED', async () => {
    const audit = new CapturingAuditService();
    const workspaceRepo = new WorkspaceRepo(db);
    await workspaceRepo.updateForceSupersedeSettings(workspaceId, 'enabled', true);
    const service = buildService(audit, new CapturingBroadcaster());
    const canonical = await createPage('AC6 canonical');
    const target = await createPage('AC6 target');

    await expect(
      service.supersedeAtomic(
        target.id,
        { supersededBy: canonical.slugId },
        {
          authMethod: 'api_key',
          actorId: agentUserId,
          forceSupersede: true,
          forceReason: 'too short',
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: 'FORCE_REASON_REQUIRED' },
    });

    // Reset for subsequent tests (each test's workspace setting is shared).
    await workspaceRepo.updateForceSupersedeSettings(workspaceId, 'enabled', false);
  });

  it('AC7: forceSupersede enabled + valid reason succeeds AND emits SUPERSEDE_FORCED_BYPASS', async () => {
    const audit = new CapturingAuditService();
    const workspaceRepo = new WorkspaceRepo(db);
    await workspaceRepo.updateForceSupersedeSettings(workspaceId, 'enabled', true);
    const service = buildService(audit, new CapturingBroadcaster());
    const canonical = await createPage('AC7 canonical');
    const target = await createPage('AC7 target');
    const reason = 'a perfectly long enough forced reason string';

    const result = await service.supersedeAtomic(
      target.id,
      { supersededBy: canonical.slugId },
      {
        authMethod: 'api_key',
        actorId: agentUserId,
        forceSupersede: true,
        forceReason: reason,
      },
    );

    expect(result.status).toBe(PageStatus.SUPERSEDED);
    const bypassAudit = audit.logs.find(
      (l) => l.payload.event === 'page.supersede_forced_bypass',
    );
    expect(bypassAudit).toBeDefined();
    const bypassMetadata = bypassAudit?.payload.metadata as
      | { reason?: string }
      | undefined;
    expect(bypassMetadata?.reason).toBe(reason);

    await workspaceRepo.updateForceSupersedeSettings(workspaceId, 'enabled', false);
  });

  it('AC8: a valid confirmToken wins over forceSupersede — token attribution, NOT a forced-bypass audit row', async () => {
    const audit = new CapturingAuditService();
    const workspaceRepo = new WorkspaceRepo(db);
    await workspaceRepo.updateForceSupersedeSettings(workspaceId, 'enabled', true);
    const service = buildService(audit, new CapturingBroadcaster());
    const confirmTokenService = new ConfirmTokenService(fakeEnvironmentService);
    const canonical = await createPage('AC8 canonical');
    const target = await createPage('AC8 target');

    const { token } = confirmTokenService.issue({
      workspaceId,
      action: 'supersede',
      scopeId: target.id,
      confirmingUserId: agentUserId,
    });

    await service.supersedeAtomic(
      target.id,
      { supersededBy: canonical.slugId },
      {
        authMethod: 'api_key',
        actorId: agentUserId,
        confirmToken: token,
        forceSupersede: true,
        forceReason: 'a perfectly long enough forced reason string',
      },
    );

    const bypassAudit = audit.logs.find(
      (l) => l.payload.event === 'page.supersede_forced_bypass',
    );
    expect(bypassAudit).toBeUndefined();
    const supersededAudit = audit.logs.find(
      (l) => l.payload.event === 'page.superseded',
    );
    expect(supersededAudit?.context.actorType).toBe('api_key');

    await workspaceRepo.updateForceSupersedeSettings(workspaceId, 'enabled', false);
  });

  // ---------------------------------------------------------------------
  // AC9/AC10 — status endpoint contract
  // ---------------------------------------------------------------------
  it('AC9: setStatus with PageStatus.SUPERSEDED is refused by the service-level guard (DTO layer additionally rejects it at the HTTP edge)', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit, new CapturingBroadcaster());
    const page = await createPage('AC9 page');

    // The service accepts any PageStatus enum member structurally, but the
    // real DTO (`StatusPageDto`, AC9) excludes `superseded` from its
    // `@IsIn` set — a request bearing it 400s at validation, before ever
    // reaching this service call. Exercised directly at the DTO layer here
    // (no HTTP bootstrap needed for a pure `class-validator` shape check).
    const { StatusPageDto } = await import('./dto/status-page.dto');
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');

    const dto = plainToInstance(StatusPageDto, {
      pageId: page.id,
      status: PageStatus.SUPERSEDED,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('AC10: archived requires a reason; a live reason clears when leaving archived', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit, new CapturingBroadcaster());
    const page = await createPage('AC10 page');

    await expect(
      service.setStatus(page.id, PageStatus.ARCHIVED),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: 'ARCHIVE_REASON_REQUIRED' },
    });

    const archived = await service.setStatus(page.id, PageStatus.ARCHIVED, {
      archiveReason: 'no longer accurate',
    });
    expect(archived.status).toBe(PageStatus.ARCHIVED);
    expect(archived.archiveReason).toBe('no longer accurate');

    const restored = await service.setStatus(page.id, PageStatus.DRAFT);
    expect(restored.status).toBe(PageStatus.DRAFT);
    expect(restored.archiveReason).toBeNull();
  });

  // ---------------------------------------------------------------------
  // AC12 — single in-repo chokepoint (static check, complements the CI grep gate)
  // ---------------------------------------------------------------------
  it('AC12: unsupersedeAtomic clears supersededBy and unlocks — the paired counterpart of the one supersede chokepoint', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit, new CapturingBroadcaster());
    const canonical = await createPage('AC12 canonical');
    const target = await createPage('AC12 target');

    await service.supersedeAtomic(
      target.id,
      { supersededBy: canonical.slugId },
      { authMethod: undefined, actorId: humanUserId },
    );

    const restored = await service.unsupersedeAtomic(target.id);
    expect(restored.status).toBe(PageStatus.PUBLISHED);
    expect(restored.supersededBy).toBeNull();

    const pageRow = await db
      .selectFrom('pages')
      .select(['isLocked'])
      .where('id', '=', target.id)
      .executeTakeFirstOrThrow();
    expect(pageRow.isLocked).toBe(false);
  });

  // ---------------------------------------------------------------------
  // AC13 — audit-emit failure never fails the request
  // ---------------------------------------------------------------------
  it('AC13: an audit-emit throw is caught and logged, the supersede still succeeds', async () => {
    class ThrowingAuditService implements IAuditService {
      log(): void {}
      async logWithContext(): Promise<void> {
        throw new Error('boom — simulated audit sink outage');
      }
      async logBatchWithContext(): Promise<void> {}
      setActorId(): void {}
      setActorType(): void {}
      async updateRetention(): Promise<void> {}
    }
    const throwingAudit = new ThrowingAuditService();
    const broadcaster = new CapturingBroadcaster();
    const service = buildService(throwingAudit as unknown as CapturingAuditService, broadcaster);
    const canonical = await createPage('AC13 canonical');
    const target = await createPage('AC13 target');

    const result = await service.supersedeAtomic(
      target.id,
      { supersededBy: canonical.slugId },
      { authMethod: undefined, actorId: humanUserId },
    );

    expect(result.status).toBe(PageStatus.SUPERSEDED);
    expect(broadcaster.events).toHaveLength(1);
  });

  it('AC-NotFound: supersedeAtomic 404s for a request page that does not exist', async () => {
    const audit = new CapturingAuditService();
    const service = buildService(audit, new CapturingBroadcaster());

    await expect(
      service.supersedeAtomic(
        '00000000-0000-0000-0000-000000000000',
        { supersededBy: 'no-such-slug' },
        { authMethod: undefined, actorId: humanUserId },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---------------------------------------------------------------------
  // review1 F1 — the resolved TARGET page must be authorized too, not
  // just the requesting page. Global-unique slugId can resolve into
  // another workspace entirely, or another space in the SAME workspace.
  // ---------------------------------------------------------------------
  describe('review1 F1: target-page authorization', () => {
    it('rejects a target slug that resolves to a page in a DIFFERENT workspace — 404 SUPERSESSION_TARGET_NOT_FOUND, no mutation', async () => {
      const otherWs = await db
        .insertInto('workspaces')
        .values({ name: 'ENG-1434 Other Workspace' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const otherSpace = await db
        .insertInto('spaces')
        .values({
          name: 'ENG-1434 Other Space',
          slug: 'eng-1434-other-space',
          workspaceId: otherWs.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const otherUser = await db
        .insertInto('users')
        .values({ email: 'eng-1434-victim@example.com', workspaceId: otherWs.id })
        .returning('id')
        .executeTakeFirstOrThrow();
      const victim = await db
        .insertInto('pages')
        .values({
          title: 'Victim page in other workspace',
          spaceId: otherSpace.id,
          workspaceId: otherWs.id,
          slugId: `eng-1434-victim-${Date.now()}`,
          creatorId: otherUser.id,
          lastUpdatedById: otherUser.id,
        })
        .returning(['id', 'slugId'])
        .executeTakeFirstOrThrow();

      const audit = new CapturingAuditService();
      const service = buildService(audit, new CapturingBroadcaster());
      const attacker = await createPage('F1 attacker page');

      await expect(
        service.supersedeAtomic(
          attacker.id,
          { supersedes: victim.slugId },
          { authMethod: undefined, actorId: humanUserId },
        ),
      ).rejects.toMatchObject({
        status: 404,
        response: { error: 'SUPERSESSION_TARGET_NOT_FOUND' },
      });

      const victimMeta = await db
        .selectFrom('orvexPageMeta')
        .selectAll()
        .where('pageId', '=', victim.id)
        .executeTakeFirst();
      expect(victimMeta).toBeUndefined();

      const victimPageRow = await db
        .selectFrom('pages')
        .select(['isLocked'])
        .where('id', '=', victim.id)
        .executeTakeFirstOrThrow();
      expect(victimPageRow.isLocked).toBe(false);
    });

    it('calls the authorizeTargetSpace callback for the RESOLVED TARGET space, and propagates its refusal with no mutation', async () => {
      const audit = new CapturingAuditService();
      const service = buildService(audit, new CapturingBroadcaster());
      const attacker = await createPage('F1 same-workspace attacker');
      const victim = await createPage('F1 same-workspace victim');

      const seenSpaceIds: string[] = [];
      await expect(
        service.supersedeAtomic(
          attacker.id,
          { supersedes: victim.slugId },
          {
            authMethod: undefined,
            actorId: humanUserId,
            authorizeTargetSpace: async (targetSpaceId: string) => {
              seenSpaceIds.push(targetSpaceId);
              throw new ForbiddenException();
            },
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(seenSpaceIds).toEqual([spaceId]);

      const victimMeta = await db
        .selectFrom('orvexPageMeta')
        .selectAll()
        .where('pageId', '=', victim.id)
        .executeTakeFirst();
      expect(victimMeta).toBeUndefined();
    });

    it('proceeds normally when authorizeTargetSpace resolves (allows)', async () => {
      const audit = new CapturingAuditService();
      const service = buildService(audit, new CapturingBroadcaster());
      const canonical = await createPage('F1 allow canonical');
      const target = await createPage('F1 allow target');

      const result = await service.supersedeAtomic(
        target.id,
        { supersededBy: canonical.slugId },
        {
          authMethod: undefined,
          actorId: humanUserId,
          authorizeTargetSpace: async () => {},
        },
      );

      expect(result.status).toBe(PageStatus.SUPERSEDED);
    });
  });
});
