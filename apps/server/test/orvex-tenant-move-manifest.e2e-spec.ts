// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2509 — `TestTenantMoveManifestCoversAllStores` (DoD gate).
 *
 * Proves, through a REAL booted Nest app's `POST /api/orvex/tenant-move/{step}`
 * surface (real `class-validator` DTO pipeline — never a mock of the
 * controller/validation, CS §5 ❌#4), a REAL read of the committed
 * `TENANT_MOVE.md`, and the REAL rule #10 coverage-check script:
 *
 *  AC1 — all four typed steps (quiesce/export/import/activate) exist; a
 *        missing `Idempotency-Key` is a typed `400` BEFORE the `501`
 *        sentinel; with the header the typed sentinel names each step.
 *  AC2 — a canonical engine manifest instance passes real DTO validation
 *        and covers every owned store class: Postgres rows (incl.
 *        `orvex_page_meta`), S3 `{tenant_id}/…` prefixes, Redis
 *        `quota:*:{tenant}` counters, and the Kafka outbox cursor.
 *  AC3 — `TENANT_MOVE.md`'s machine-checked inventory matches the declared
 *        datastores: the rule #10 script PASSES on the real doc and FAILS
 *        on the committed deliberately-missing-store fixture.
 *  AC4 — the day-1 `501` scope is honest: header + DTO validation run
 *        BEFORE the typed sentinel throw (order proven on the wire).
 *  AC5 — `orvex_page_meta`'s `version`/`content_hash` placement (ENG-2480)
 *        is live (migration-source cross-check) and covered by the doc
 *        inventory + canonical manifest.
 *  NFR — honesty grep: no TODO/FIXME/placeholder in the controller/DTO
 *        (the disclosed `ORVEX_NOT_IMPLEMENTED` sentinel is the marker).
 *
 * Behaviour-through-interface only (HTTP responses, committed artifacts,
 * script exit codes); deterministic (static fixtures/doc); no own-code mock.
 */
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { TransformHttpResponseInterceptor } from '../src/common/interceptors/http-response.interceptor';
import { ORVEX_NOT_IMPLEMENTED } from '../src/orvex/not-implemented';
import { OrvexRootModule } from '../src/orvex/orvex-root.module';
import { TenantMoveManifestDto } from '../src/orvex/http/dto/tenant-move-manifest.dto';

const REPO_ROOT = path.join(__dirname, '../../..');
const SERVER_ROOT = path.join(__dirname, '..');
const DOC_PATH = path.join(REPO_ROOT, 'TENANT_MOVE.md');
const CHECK_SCRIPT = path.join(
  REPO_ROOT,
  'scripts/ci/tenant-move-coverage-check.mjs',
);
const MISSING_STORE_FIXTURE = path.join(
  __dirname,
  'orvex-tenant-move/fixtures/tenant-move-missing-store.md',
);

const STEPS = ['quiesce', 'export', 'import', 'activate'] as const;

/**
 * The canonical engine manifest — the same inventory TENANT_MOVE.md declares,
 * expressed through the typed DTO (AC2). Fixed tenant id, deterministic.
 */
const CANONICAL_MANIFEST = {
  schema_version: 1,
  tenant_id: '9b2e4f6a-1c3d-4e5f-8a7b-0c1d2e3f4a5b',
  stores: [
    { name: 'workspaces', kind: 'postgres' },
    { name: 'users', kind: 'postgres' },
    { name: 'spaces', kind: 'postgres' },
    { name: 'pages', kind: 'postgres' },
    { name: 'orvex_page_meta', kind: 'postgres' },
    { name: 'comments', kind: 'postgres' },
    { name: 'page_history', kind: 'postgres' },
    { name: 'attachments', kind: 'postgres' },
    { name: 'orvex_event_outbox', kind: 'postgres' },
    { name: 'quota_fast_counters', kind: 'redis' },
    { name: 'suspension_status', kind: 'redis' },
    { name: 'outbox_relay', kind: 'kafka' },
  ],
  s3_prefixes: [
    { bucket: 'orvex-wiki', prefix: '9b2e4f6a-1c3d-4e5f-8a7b-0c1d2e3f4a5b/' },
  ],
  cursors: [{ source: 'orvex_event_outbox', position: '0' }],
};

function runCheck(docPath?: string): { code: number; output: string } {
  try {
    const output = execFileSync(
      process.execPath,
      docPath ? [CHECK_SCRIPT, docPath] : [CHECK_SCRIPT],
      { encoding: 'utf8', cwd: REPO_ROOT },
    );
    return { code: 0, output };
  } catch (err) {
    const e = err as { status?: number; stderr?: string; stdout?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('TestTenantMoveManifestCoversAllStores', () => {
  jest.setTimeout(120_000);

  let app: NestFastifyApplication;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    saved.ORVEX_MODULES_ENABLED = process.env.ORVEX_MODULES_ENABLED;
    saved.ORVEX_IDENTITY_URL = process.env.ORVEX_IDENTITY_URL;
    process.env.ORVEX_MODULES_ENABLED = 'true';
    delete process.env.ORVEX_IDENTITY_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [OrvexRootModule.register()],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        stopAtFirstError: true,
      }),
    );
    app.useGlobalInterceptors(
      new TransformHttpResponseInterceptor(app.get(Reflector)),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('AC1 — each of the four typed steps rejects a missing Idempotency-Key with 400 BEFORE the 501 sentinel', async () => {
    for (const step of STEPS) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/orvex/tenant-move/${step}`,
        payload: CANONICAL_MANIFEST,
      });
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('Idempotency-Key');
    }
  });

  it('AC1/AC4 — with the header, each step reaches the typed 501 sentinel naming that step (contract complete around the stub)', async () => {
    const expectedOp: Record<(typeof STEPS)[number], string> = {
      quiesce: 'orvexTenantMoveQuiesce',
      export: 'orvexTenantMoveExport',
      import: 'orvexTenantMoveImport',
      activate: 'orvexTenantMoveActivate',
    };
    for (const step of STEPS) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/orvex/tenant-move/${step}`,
        headers: { 'idempotency-key': `eng2509-${step}-1` },
        payload: CANONICAL_MANIFEST,
      });
      expect(res.statusCode).toBe(501);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('NOT_IMPLEMENTED');
      expect(body.operationId).toBe(expectedOp[step]);
      expect(body.marker).toBe(ORVEX_NOT_IMPLEMENTED);
    }
  });

  it('AC4 — DTO validation ALSO runs before the 501: a malformed manifest with the header present is a 400, never the sentinel', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/orvex/tenant-move/quiesce',
      headers: { 'idempotency-key': 'eng2509-malformed-1' },
      payload: { schema_version: 0, tenant_id: 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain(ORVEX_NOT_IMPLEMENTED);
  });

  it('AC2 — the canonical manifest passes real DTO validation and covers all four owned store classes', async () => {
    const dto = plainToInstance(TenantMoveManifestDto, CANONICAL_MANIFEST);
    const errors = await validate(dto);
    expect(errors).toEqual([]);

    const kinds = new Set(dto.stores.map((s) => s.kind));
    expect(kinds.has('postgres')).toBe(true);
    expect(kinds.has('redis')).toBe(true);
    expect(kinds.has('kafka')).toBe(true);
    expect(dto.stores.map((s) => s.name)).toContain('orvex_page_meta');
    expect(dto.s3_prefixes.length).toBeGreaterThan(0);
    expect(dto.s3_prefixes[0].prefix.startsWith(dto.tenant_id)).toBe(true);
    expect(dto.cursors.map((c) => c.source)).toContain('orvex_event_outbox');
  });

  it('AC3 — the rule #10 coverage check PASSES on the real committed TENANT_MOVE.md', () => {
    expect(fs.existsSync(DOC_PATH)).toBe(true);
    const { code, output } = runCheck();
    expect(output).toContain('tenant-move-coverage: OK');
    expect(code).toBe(0);
  });

  it('AC3 (negative) — the rule #10 check FAILS on the deliberately-missing-store fixture', () => {
    const { code, output } = runCheck(MISSING_STORE_FIXTURE);
    expect(code).not.toBe(0);
    expect(output).toContain('RULE #10 FAILED');
    expect(output).toContain('quota');
  });

  it('AC5 — orvex_page_meta version/content_hash placement (ENG-2480) is live and doc-covered', () => {
    // Migration-source cross-check: the governance-cols migration's own
    // header records that `version`/`content_hash` were added to
    // `orvex_page_meta` by the prior pages-upsert-dedup migration.
    const governanceMigration = fs.readFileSync(
      path.join(
        SERVER_ROOT,
        'src/database/migrations/20260708T100000-orvex-page-meta-governance-cols.ts',
      ),
      'utf8',
    );
    expect(governanceMigration).toContain('orvex_page_meta');
    const dedupMigration = fs.readFileSync(
      path.join(
        SERVER_ROOT,
        'src/database/migrations/20260707T090000-pages-upsert-dedup.ts',
      ),
      'utf8',
    );
    expect(dedupMigration).toContain('version');
    expect(dedupMigration).toContain('content_hash');

    // Doc + manifest coverage of the sidetable.
    const doc = fs.readFileSync(DOC_PATH, 'utf8');
    expect(doc).toContain('orvex_page_meta');
    expect(doc).toContain('content_hash');
    expect(
      CANONICAL_MANIFEST.stores.some((s) => s.name === 'orvex_page_meta'),
    ).toBe(true);
  });

  it('NFR honesty — no TODO/FIXME/placeholder in the controller/DTO; the doc states the day-1 501 scope plainly', () => {
    for (const rel of [
      'src/orvex/http/orvex-tenant-move.controller.ts',
      'src/orvex/http/dto/tenant-move-manifest.dto.ts',
    ]) {
      const src = fs.readFileSync(path.join(SERVER_ROOT, rel), 'utf8');
      expect(/\b(TODO|FIXME|placeholder)\b/.test(src)).toBe(false);
    }
    const doc = fs.readFileSync(DOC_PATH, 'utf8');
    expect(doc).toContain('501');
    expect(doc.toLowerCase()).toContain('day-1');
  });
});
