// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as path from 'path';
import { promises as fs } from 'fs';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
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

import { EntitlementService } from './entitlement.service';
import { InMemoryEntitlementCache } from './entitlement-cache';
import { BillingEntitlementPort } from './entitlement-billing.port';
import {
  EntitlementCaps,
  EntitlementCheckResponse,
  JIT_MEMBER_OVERAGE_MULTIPLIER,
  Principal,
} from './entitlement.types';
import { QuotaExceededException } from './quota.exception';
import { OrvexConfigService } from '../config/orvex-config.service';
import { AttachmentRepo } from '../../database/repos/attachment/attachment.repo';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import { KyselyDB } from '../../database/types/kysely.types';
import type { DB } from '../../database/types/db';

/**
 * ENG-2491 — `TestQuotaVerdictIsDomainFunction` (the named DoD gate).
 *
 * Unit + integration: the verdict (entitlement-vs-usage comparison) is
 * exercised ONLY through `EntitlementService`'s exported methods (never a
 * private helper — CS §4.2); the largest-files clause round-trips against a
 * REAL testcontainers Postgres via the real `AttachmentRepo` (CS §5
 * local-substitutable, never mocked — ❌#4); the billing seam is the
 * committed-replay-shaped stub the sibling chokepoint specs use.
 *
 * Asserts:
 *  - AC2: the comparison lives in the domain — call sites and controllers
 *    only marshal (static call-graph gates over the REAL sources);
 *  - AC1: a 402 carries a workspace-scoped, env-sourced `upgradeUrl` (and
 *    omits it — never fabricates — when no base is configured);
 *  - AC3: a storage-shaped 402 carries a REAL `largestFiles` list matching
 *    Postgres rows, sorted by `fileSize` descending; a failing largest-files
 *    read degrades to `[]`, never a 500 (NFR never-white-screen);
 *  - AC4: JIT provisioning is allowed through 110% of the member cap via
 *    `assertWithinQuotaAllowingOverage` while the manual-invite boundary
 *    (`assertWithinQuota`) still rejects at 100%;
 *  - AC5: no quota assertion exists on any read/export/delete path (static
 *    call-graph gate: the chokepoint callers are EXACTLY the named write
 *    sites).
 */
describe('TestQuotaVerdictIsDomainFunction (ENG-2491 DoD)', () => {
  jest.setTimeout(180_000);

  const REPLAYED_MEMBER_CAP = 25; // fixture literal ONLY (❌#10)
  const REPLAYED_STORAGE_CAP = 1_000; // bytes; fixture literal ONLY

  function replayedCatalog(): EntitlementCheckResponse {
    const caps: EntitlementCaps = {
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 0,
      wiki_max_pages: 2,
      wiki_storage_bytes_aggregate: REPLAYED_STORAGE_CAP,
      wiki_max_file_bytes: 100,
      wiki_max_files: 2,
      wiki_max_members: REPLAYED_MEMBER_CAP,
      wiki_history_retention_versions: 10,
      wiki_history_retention_days: 180,
    };
    return {
      plan: 'free',
      plan_version: 'v1',
      features: [],
      caps,
      trial: { state: 'none' },
      throttle: { state: 'none' },
      version: 'entitlement-v1',
      evaluatedAt: '2026-07-01T00:00:00.000Z',
    };
  }

  class StubBillingEntitlementPort implements BillingEntitlementPort {
    async checkEntitlement(_p: Principal): Promise<EntitlementCheckResponse> {
      return replayedCatalog();
    }
  }

  const UPGRADE_BASE = 'https://billing.example.test/upgrade';

  function buildService(opts?: {
    withUpgradeUrl?: boolean;
    attachmentRepo?: AttachmentRepo;
  }): EntitlementService {
    const env: NodeJS.ProcessEnv = {};
    if (opts?.withUpgradeUrl) {
      env.ORVEX_BILLING_UPGRADE_URL = UPGRADE_BASE;
    }
    return new EntitlementService(
      new StubBillingEntitlementPort(),
      new InMemoryEntitlementCache(),
      new OrvexConfigService(env),
      opts?.attachmentRepo,
    );
  }

  async function catch402(fn: () => Promise<void>): Promise<QuotaExceededException> {
    let caught: unknown;
    try {
      await fn();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(QuotaExceededException);
    expect((caught as QuotaExceededException).getStatus()).toBe(402);
    return caught as QuotaExceededException;
  }

  // ── AC1 — upgrade deep-link ────────────────────────────────────────────

  it('AC1 — an over-cap 402 carries a workspace-scoped, env-sourced upgradeUrl over the frozen core', async () => {
    const service = buildService({ withUpgradeUrl: true });

    const err = await catch402(() =>
      service.assertWithinQuota('ws-upgrade', 'pages', 2),
    );

    const body = err.getResponse() as Record<string, unknown>;
    expect(body.error).toBe('QUOTA_EXCEEDED');
    expect(body.resource).toBe('pages');
    expect(body.limit).toBe(2);
    expect(typeof body.upgradeUrl).toBe('string');
    expect(body.upgradeUrl as string).toContain(UPGRADE_BASE);
    expect(body.upgradeUrl as string).toContain('ws-upgrade'); // workspace-scoped
  });

  it('AC1 (honesty) — no configured base means NO upgradeUrl field, never a fabricated URL; frozen core intact', async () => {
    const service = buildService();

    const err = await catch402(() =>
      service.assertWithinQuota('ws-nourl', 'pages', 2),
    );

    const body = err.getResponse() as Record<string, unknown>;
    expect(body).toEqual({ error: 'QUOTA_EXCEEDED', resource: 'pages', limit: 2 });
    expect('upgradeUrl' in body).toBe(false);
  });

  // ── AC2 — the verdict is a domain function ─────────────────────────────

  it('AC2 — the domain boundary math: under cap allows, at cap rejects (exercised through the exported interface only)', async () => {
    const service = buildService();

    await expect(
      service.assertWithinQuota('ws-a', 'members', REPLAYED_MEMBER_CAP - 1),
    ).resolves.toBeUndefined();

    await catch402(() =>
      service.assertWithinQuota('ws-a', 'members', REPLAYED_MEMBER_CAP),
    );
  });

  const serverSrcRoot = join(__dirname, '../..');

  function readSource(relPath: string): string {
    return readFileSync(join(serverSrcRoot, relPath), 'utf8');
  }

  function walkTsSources(root: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(root)) {
      const full = join(root, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        out.push(...walkTsSources(full));
      } else if (
        entry.endsWith('.ts') &&
        !entry.endsWith('.spec.ts') &&
        !entry.endsWith('.d.ts')
      ) {
        out.push(full);
      }
    }
    return out;
  }

  it('AC2 (call-graph gate) — QuotaExceededException is CONSTRUCTED only inside the entitlement domain; controllers hold no comparison', () => {
    const offenders: string[] = [];
    for (const file of walkTsSources(serverSrcRoot)) {
      if (file.includes(join('orvex', 'entitlement'))) continue;
      const src = readFileSync(file, 'utf8');
      if (src.includes('new QuotaExceededException(')) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);

    // The three wire-facing controllers named by the AC carry no
    // usage-vs-limit arithmetic of their own.
    for (const controller of [
      'core/page/page.controller.ts',
      'core/attachment/attachment.controller.ts',
    ]) {
      const src = readSource(controller);
      expect(src).not.toMatch(/currentUsage/);
      expect(src).not.toMatch(/assertWithinQuota/);
      expect(src).not.toMatch(/QuotaExceeded/);
    }
  });

  it('AC5 (call-graph gate) — quota assertions exist ONLY at the named write chokepoints, never on a read/export/delete path', () => {
    const allowedCallers = new Set([
      join(serverSrcRoot, 'core/page/services/page.service.ts'),
      join(serverSrcRoot, 'core/attachment/services/attachment.service.ts'),
      join(serverSrcRoot, 'core/workspace/services/workspace-invitation.service.ts'),
      join(serverSrcRoot, 'core/internal-api/principal-provisioning.service.ts'),
      join(serverSrcRoot, 'integrations/import/services/import.service.ts'),
      join(serverSrcRoot, 'collaboration/extensions/persistence.extension.ts'),
    ]);

    const callers: string[] = [];
    for (const file of walkTsSources(serverSrcRoot)) {
      // The domain module itself (definitions, ports, doc comments) is not
      // a "caller" in the chokepoint sense.
      if (file.includes(join('orvex', 'entitlement'))) continue;
      const src = readFileSync(file, 'utf8');
      if (/\.assertWithinQuota|\.assertIncrementWithinQuota|\.assertWithinQuotaAllowingOverage/.test(src)) {
        callers.push(file);
      }
    }

    const unexpected = callers.filter((c) => !allowedCallers.has(c));
    expect(unexpected).toEqual([]);

    // Export/download surfaces are quota-free by construction (FR-W13).
    const exportDir = join(serverSrcRoot, 'integrations/export');
    for (const file of walkTsSources(exportDir)) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/assertWithinQuota|assertIncrementWithinQuota|QuotaFastCounter/);
    }
  });

  // ── AC4 — 110% JIT allowance vs the 100% manual boundary ───────────────

  it('AC4 — JIT provisioning is allowed through 110% of the member cap; the manual-invite boundary still rejects at 100%', async () => {
    const service = buildService();

    // floor(25 * 1.1) = 27: the 26th and 27th member may JIT-provision…
    await expect(
      service.assertWithinQuotaAllowingOverage(
        'ws-jit',
        'members',
        REPLAYED_MEMBER_CAP, // 25/25 — the 26th member logging in
        JIT_MEMBER_OVERAGE_MULTIPLIER,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.assertWithinQuotaAllowingOverage(
        'ws-jit',
        'members',
        REPLAYED_MEMBER_CAP + 1, // 26/25 — the 27th member
        JIT_MEMBER_OVERAGE_MULTIPLIER,
      ),
    ).resolves.toBeUndefined();

    // …and the 28th (27/25 = at the 110% bound) is rejected, reporting the
    // REAL cap in the frozen body, never the internal overage bound.
    const err = await catch402(() =>
      service.assertWithinQuotaAllowingOverage(
        'ws-jit',
        'members',
        REPLAYED_MEMBER_CAP + 2,
        JIT_MEMBER_OVERAGE_MULTIPLIER,
      ),
    );
    expect((err.getResponse() as Record<string, unknown>).limit).toBe(
      REPLAYED_MEMBER_CAP,
    );

    // The manual boundary at the same 25/25 state: rejected immediately.
    await catch402(() =>
      service.assertWithinQuota('ws-jit', 'members', REPLAYED_MEMBER_CAP),
    );
  });

  it('AC4 (call-site gate) — the JIT path calls the overage variant with the domain-owned multiplier; the invite path is untouched at 100%', () => {
    const provisioning = readSource(
      'core/internal-api/principal-provisioning.service.ts',
    );
    expect(provisioning).toContain('assertWithinQuotaAllowingOverage');
    expect(provisioning).toContain('JIT_MEMBER_OVERAGE_MULTIPLIER');
    // No inline overage arithmetic at the call site (❌#1).
    expect(provisioning).not.toMatch(/\*\s*1\.1|Math\.floor/);

    const invitation = readSource(
      'core/workspace/services/workspace-invitation.service.ts',
    );
    expect(invitation).toContain('.assertWithinQuota(');
    expect(invitation).not.toContain('AllowingOverage');
  });

  // ── AC3 — the largest-files list (real Postgres round trip) ────────────

  describe('AC3 — storage-shaped 402 carries a REAL largestFiles list (testcontainers Postgres)', () => {
    let pgContainer: StartedPostgreSqlContainer;
    let sqlClient: ReturnType<typeof postgres>;
    let db: Kysely<DB>;
    let attachmentRepo: AttachmentRepo;
    let workspaceId: string;

    const SEEDED_SIZES = [700, 150, 90, 40, 10, 5]; // 6 rows > LIMIT 5

    beforeAll(async () => {
      pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
      sqlClient = postgres(pgContainer.getConnectionUri());

      const rawDb = new Kysely<Record<string, unknown>>({
        dialect: new PostgresJSDialect({ postgres: sqlClient }),
      });
      const migrationFolder = path.join(__dirname, '../../database/migrations');
      const migrator = new Migrator({
        db: rawDb,
        provider: new FileMigrationProvider({ fs, path, migrationFolder }),
      });
      const { error } = await migrator.migrateToLatest();
      if (error) throw error;

      db = new Kysely<DB>({
        dialect: new PostgresJSDialect({ postgres: sqlClient }),
        plugins: [new CamelCasePlugin()],
      });
      attachmentRepo = new AttachmentRepo(db as unknown as KyselyDB);

      const ws = await db
        .insertInto('workspaces')
        .values({ name: 'ENG-2491 Workspace' })
        .returning('id')
        .executeTakeFirstOrThrow();
      workspaceId = ws.id;

      const user = await db
        .insertInto('users')
        .values({ email: 'eng2491@example.com', workspaceId })
        .returning('id')
        .executeTakeFirstOrThrow();

      for (let i = 0; i < SEEDED_SIZES.length; i++) {
        await db
          .insertInto('attachments')
          .values({
            type: AttachmentType.File,
            filePath: `eng2491/file-${i}`,
            fileName: `file-${i}.bin`,
            fileSize: SEEDED_SIZES[i],
            fileExt: '.bin',
            mimeType: 'application/octet-stream',
            creatorId: user.id,
            workspaceId,
          })
          .execute();
      }

      // A soft-deleted attachment must never appear in the list.
      await db
        .insertInto('attachments')
        .values({
          type: AttachmentType.File,
          filePath: 'eng2491/deleted',
          fileName: 'deleted-huge.bin',
          fileSize: 999_999,
          fileExt: '.bin',
          mimeType: 'application/octet-stream',
          creatorId: user.id,
          workspaceId,
          deletedAt: new Date(),
        })
        .execute();
    });

    afterAll(async () => {
      await db?.destroy();
      await sqlClient?.end({ timeout: 5 });
      await pgContainer?.stop();
    });

    it('carries the top-N live attachments, sorted by fileSize descending, round-tripped from real rows', async () => {
      const service = buildService({
        withUpgradeUrl: true,
        attachmentRepo,
      });

      const err = await catch402(() =>
        service.assertIncrementWithinQuota(
          workspaceId,
          'storage',
          REPLAYED_STORAGE_CAP, // already at the byte cap
          1,
        ),
      );

      const body = err.getResponse() as {
        error: string;
        largestFiles: Array<{ id: string; name: string; fileSize: number }>;
        upgradeUrl: string;
      };
      expect(body.error).toBe('QUOTA_EXCEEDED');
      expect(Array.isArray(body.largestFiles)).toBe(true);
      expect(body.largestFiles).toHaveLength(5); // bounded LIMIT N
      expect(body.largestFiles.map((f) => f.fileSize)).toEqual(
        [...SEEDED_SIZES].sort((a, b) => b - a).slice(0, 5),
      );
      expect(body.largestFiles[0].name).toBe('file-0.bin'); // the 700-byte row
      for (const entry of body.largestFiles) {
        expect(typeof entry.id).toBe('string');
        expect(entry.name).not.toBe('deleted-huge.bin'); // soft-deleted excluded
      }
    });

    it('a pages (non-storage) rejection carries NO largestFiles field', async () => {
      const service = buildService({ attachmentRepo });

      const err = await catch402(() =>
        service.assertWithinQuota(workspaceId, 'pages', 2),
      );
      expect('largestFiles' in (err.getResponse() as object)).toBe(false);
    });

    it('NFR — a failing largest-files read degrades to [], the 402 still returns (never a 500)', async () => {
      // A real repo pointed at a connection-refused Postgres endpoint (port
      // 1 listens nowhere) — a genuine query failure, not a mock of own
      // logic. `connect_timeout` bounds the failure, keeping the test fast.
      const deadClient = postgres('postgres://nobody:nothing@127.0.0.1:1/none', {
        connect_timeout: 2,
        max: 1,
      });
      const deadDb = new Kysely<DB>({
        dialect: new PostgresJSDialect({ postgres: deadClient }),
        plugins: [new CamelCasePlugin()],
      });
      const failingRepo = new AttachmentRepo(deadDb as unknown as KyselyDB);

      const service = buildService({
        withUpgradeUrl: true,
        attachmentRepo: failingRepo,
      });

      const err = await catch402(() =>
        service.assertIncrementWithinQuota(
          workspaceId,
          'storage',
          REPLAYED_STORAGE_CAP,
          1,
        ),
      );

      const body = err.getResponse() as Record<string, unknown>;
      expect(body.error).toBe('QUOTA_EXCEEDED');
      expect(body.largestFiles).toEqual([]);
    });
  });
});
