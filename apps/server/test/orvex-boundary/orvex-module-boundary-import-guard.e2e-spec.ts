// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2476 — TestOrvexModuleBoundaryImportGuard (DoD binary gate).
 *
 * VERIFY+HARDEN, no production diff: every shipped artifact this suite
 * checks already exists at HEAD (the single `OrvexRootModule` import in
 * `app.module.ts`, and the `apps/server/src/orvex/**`/`packages/@orvex/**`
 * AGPL import-guard block in the repo-root `eslint.config.mjs`, already
 * wired into CI's `lint-boundary` job / `ci-success`). This suite exists to
 * PROVE those invariants against the real engines they run on, not to build
 * them.
 *
 * AC1 — `app.module.ts` imports `OrvexRootModule` exactly once, and
 *       `OrvexRootModule.register()` boots successfully with
 *       `ORVEX_MODULES_ENABLED=true` (DB-free, `@nestjs/testing` +
 *       `FastifyAdapter`, mirroring the established
 *       `src/orvex/http/orvex-http.e2e.spec.ts` harness pattern exactly —
 *       same `setGlobalPrefix('api')`, same `OrvexRootModule.register()`
 *       import, same `/api/orvex/source` readiness surface that harness
 *       already uses to prove a live wire-true 200. The pack's own text
 *       names a bare `/api/health` readiness probe; no such route is
 *       reachable through this DB-free `OrvexRootModule.register()` tree in
 *       isolation (the upstream `/api/health` lives on `HealthModule`,
 *       mounted only by the full `AppModule`, and needs a real
 *       Postgres/Redis DI graph). Reusing `/api/orvex/source` instead keeps
 *       this boot proof deterministic and zero-I/O, consistent with the
 *       sibling harness it mirrors — see the ENG-2476 handoff note
 *       (`docs/orvex-import-boundary.md`) for the explicit record of this
 *       adaptation.
 * AC2 — a fixture importing `@docmost/*` fails lint under the orvex/**
 *       boundary block.
 * AC3 — a fixture importing the `ee/**` tree fails lint under the same block.
 * AC4 — a fixture importing only `@orvex/dfm` + `@nestjs/common` (the
 *       sanctioned clean-room DfM twin + a plain third-party package)
 *       lints clean — the negative control proving the ban doesn't
 *       false-positive on legitimate orvex code.
 *
 * Engine-fidelity note: this drives the REAL programmatic `ESLint` class
 * (from the `eslint` package the repo already pins, 9.28.0) against the
 * REAL committed repo-root `eslint.config.mjs` — never a regex
 * reimplementation of the rule. The three fixtures live at
 * `apps/server/test/orvex-boundary/fixtures/` (OUTSIDE the
 * `apps/server/src/orvex/**` glob the boundary block scopes to), so `pnpm
 * lint:boundary` (`eslint . --quiet`, the real CI job) never reds on their
 * committed bytes — each lint call below instead uses `lintText()` with a
 * SYNTHETIC `filePath` inside the guarded tree, which is how ESLint's flat
 * config resolves its `files:` glob (against the given `filePath`, not
 * against whether that path exists on disk) — see the fixture files' own
 * docstrings.
 *
 * Rule-id grounding note (R11): ESLint has no `no-restricted-imports/docmost`
 * subrule id in its registry. Assertions key on the core `no-restricted-imports`
 * `ruleId` plus a message substring, never a fabricated per-pattern id.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { ESLint, Linter } from 'eslint';
import { Reflector } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
// Test-infrastructure import ONLY (reproduces the live main.ts response
// envelope so the asserted 200 body is WIRE-TRUE) — same import the sibling
// orvex-http.e2e.spec.ts harness this test mirrors already makes.
import { TransformHttpResponseInterceptor } from '../../src/common/interceptors/http-response.interceptor';
import { OrvexRootModule } from '../../src/orvex/orvex-root.module';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const APP_MODULE_PATH = path.join(REPO_ROOT, 'apps/server/src/app.module.ts');
const ESLINT_CONFIG_PATH = path.join(REPO_ROOT, 'eslint.config.mjs');
const ESLINT_BIN_PATH = path.join(REPO_ROOT, 'node_modules/.bin/eslint');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Synthetic filePath that lands INSIDE the guarded glob
// (apps/server/src/orvex/**/*.ts) so the flat-config `files:` matcher
// applies the orvex-specific @docmost/ee ban to fixture bytes that are
// physically committed OUTSIDE that tree. This path is never written to
// disk — ESLint's flat-config file matching is purely against the given
// `filePath` string, independent of whether it exists (verified directly
// against this repo's real config before trusting any GREEN below).
const SYNTHETIC_ORVEX_FILE_PATH = path.join(
  REPO_ROOT,
  'apps/server/src/orvex/__fixture__.ts',
);

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

/**
 * Drives the REAL `eslint` CLI binary (the exact binary `pnpm lint:boundary`
 * invokes in CI, `node_modules/.bin/eslint`) as a child process — not the
 * programmatic `ESLint` Node API in-process. ESLint's flat-config loader
 * `import()`s the `.mjs` config file; run in-process under Jest (a CommonJS
 * module registry) that dynamic import is intercepted and throws ("A dynamic
 * import callback was invoked without --experimental-vm-modules") — verified
 * directly against this repo's real config before choosing this path. A
 * child process is a fresh Node runtime with no such interception, so the
 * REAL flat-config `.mjs` file loads exactly as it does for the real
 * `lint-boundary` CI job. `--stdin-filename` is the CLI's own equivalent of
 * `lintText()`'s `filePath` option — same flat-config `files:` matching
 * mechanism, same real engine, only reached through the CLI surface instead
 * of the Node API.
 */
function lintAsOrvexFile(content: string): ESLint.LintResult[] {
  const args = [
    '--stdin',
    '--stdin-filename',
    SYNTHETIC_ORVEX_FILE_PATH,
    '--format',
    'json',
    '-c',
    ESLINT_CONFIG_PATH,
  ];
  let stdout: string;
  try {
    stdout = execFileSync(ESLINT_BIN_PATH, args, {
      cwd: REPO_ROOT,
      input: content,
      encoding: 'utf8',
    });
  } catch (err) {
    // ESLint's CLI exits 1 (not 0) when it finds lint errors — that is the
    // EXPECTED path for the two violating fixtures, not a test-harness
    // failure. execFileSync still captures stdout on the thrown error.
    const execError = err as { stdout?: string };
    if (typeof execError.stdout !== 'string') {
      throw err;
    }
    stdout = execError.stdout;
  }
  return JSON.parse(stdout) as ESLint.LintResult[];
}

function findRestrictedImportViolation(
  messages: Linter.LintMessage[],
  messageSubstring: string,
): Linter.LintMessage | undefined {
  return messages.find(
    (m) =>
      m.ruleId === 'no-restricted-imports' &&
      m.message.includes(messageSubstring),
  );
}

/**
 * Bounded readiness wait — retried by ATTEMPT COUNT, never by wall-clock
 * (`Date.now()`/a fixed-duration sleep, CS ❌#9). Each failed attempt yields
 * one event-loop turn (`setImmediate`) before the next try, so this never
 * spins hot and never depends on a timer.
 */
async function pollUntilReady(
  check: () => Promise<boolean>,
  maxAttempts = 20,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await check()) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(
    `readiness check did not pass within ${maxAttempts} bounded attempts`,
  );
}

describe('TestOrvexModuleBoundaryImportGuard (ENG-2476 DoD)', () => {
  describe('TestDocmostImportFixtureFailsLint', () => {
    it('a fixture importing @docmost/* fails the orvex/** boundary lint (AC2)', async () => {
      const content = readFixture('violates-docmost.ts');
      const results = lintAsOrvexFile(content);

      expect(results).toHaveLength(1);
      expect(results[0].errorCount).toBeGreaterThan(0);

      const violation = findRestrictedImportViolation(
        results[0].messages,
        '@docmost/*',
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe(2);
    });
  });

  describe('TestEeImportFixtureFailsLint', () => {
    it('a fixture importing **/ee/** fails the orvex/** boundary lint (AC3)', async () => {
      const content = readFixture('violates-ee.ts');
      const results = lintAsOrvexFile(content);

      expect(results).toHaveLength(1);
      expect(results[0].errorCount).toBeGreaterThan(0);

      const violation = findRestrictedImportViolation(
        results[0].messages,
        'no static ee/* imports',
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe(2);
    });
  });

  describe('TestCleanOrvexImportFixturePassesLint', () => {
    it('a fixture importing only @orvex/dfm + @nestjs/common lints clean (AC4)', async () => {
      const content = readFixture('clean-orvex-import.ts');
      const results = lintAsOrvexFile(content);

      expect(results).toHaveLength(1);
      expect(results[0].errorCount).toBe(0);
      expect(results[0].messages).toHaveLength(0);
    });
  });

  describe('TestSingleOrvexRootModuleImportInvariant', () => {
    it('app.module.ts imports OrvexRootModule exactly once (AC1)', () => {
      const source = fs.readFileSync(APP_MODULE_PATH, 'utf8');
      // Anchored at line-start so prose comments merely MENTIONING
      // "OrvexRootModule" (this file has two, explaining carve-outs) are
      // never counted as import statements.
      const importLines = source
        .split('\n')
        .filter((line) => /^import\b.*OrvexRootModule/.test(line));

      expect(importLines).toHaveLength(1);
      expect(importLines[0]).toContain("from './orvex/orvex-root.module'");
    });

    it('OrvexRootModule.register() boots flag-ON, DB-free, through the real production module surface (AC1)', async () => {
      const savedFlag = process.env.ORVEX_MODULES_ENABLED;
      const savedIdentity = process.env.ORVEX_IDENTITY_URL;
      const savedSha = process.env.ORVEX_GIT_SHA;
      const savedRepo = process.env.ORVEX_SOURCE_REPO;

      process.env.ORVEX_MODULES_ENABLED = 'true';
      // Identity unset -> the flag-gated session-mint composition binds the
      // fail-closed verifier (same as orvex-http.e2e.spec.ts) — this boot
      // proof asserts nothing about identity, only that register() resolves.
      delete process.env.ORVEX_IDENTITY_URL;
      process.env.ORVEX_GIT_SHA = 'eng-2476-boot-proof-sha';
      process.env.ORVEX_SOURCE_REPO = 'https://github.com/orvexai/orvex-wiki';

      let app: NestFastifyApplication | undefined;
      try {
        const moduleRef = await Test.createTestingModule({
          imports: [OrvexRootModule.register()],
        }).compile();

        app = moduleRef.createNestApplication<NestFastifyApplication>(
          new FastifyAdapter(),
        );
        app.setGlobalPrefix('api');
        // Same global 2xx envelope as main.ts / orvex-http.e2e.spec.ts:
        // {data, success, status}.
        app.useGlobalInterceptors(
          new TransformHttpResponseInterceptor(app.get(Reflector)),
        );

        // AC1 — app.init() must resolve (a rejection fails this test).
        await app.init();
        await app.getHttpAdapter().getInstance().ready();

        const bootedApp = app;
        let lastResponse: { statusCode: number; body: unknown } | undefined;
        await pollUntilReady(async () => {
          const res = await bootedApp.inject({
            method: 'GET',
            url: '/api/orvex/source',
          });
          lastResponse = { statusCode: res.statusCode, body: res.json() };
          return res.statusCode === 200;
        });

        expect(lastResponse?.statusCode).toBe(200);
        expect(lastResponse?.body).toMatchObject({
          data: {
            sha: 'eng-2476-boot-proof-sha',
            sourceRepo: 'https://github.com/orvexai/orvex-wiki',
          },
          success: true,
        });
      } finally {
        await app?.close();
        const restore = (key: string, value: string | undefined): void => {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        };
        restore('ORVEX_MODULES_ENABLED', savedFlag);
        restore('ORVEX_IDENTITY_URL', savedIdentity);
        restore('ORVEX_GIT_SHA', savedSha);
        restore('ORVEX_SOURCE_REPO', savedRepo);
      }
    });
  });

  describe('TestNoAspirationalBoundaryClaimed', () => {
    it('eslint.config.mjs carries no TODO/FIXME/placeholder markers (NFR honesty)', () => {
      // Deliberately excludes bare "mock"/"fake" from this grep: the file's
      // own QUARANTINE_PATTERNS docstring legitimately says "Mock quarantine"
      // (the real, already-enforced design-artifacts/ fence) — that is a
      // description of a REAL ban, not an aspirational placeholder claim.
      // TODO/FIXME/placeholder have no such legitimate reading in a shipped
      // lint-boundary config.
      const source = fs.readFileSync(ESLINT_CONFIG_PATH, 'utf8');
      expect(source).not.toMatch(/\bTODO\b|\bFIXME\b|\bplaceholder\b/i);
    });

    it('the orvex/** + @orvex/** files: scoping line is present in eslint.config.mjs', () => {
      const source = fs.readFileSync(ESLINT_CONFIG_PATH, 'utf8');
      expect(source).toContain(
        "files: ['apps/server/src/orvex/**/*.ts', 'packages/@orvex/**/*.ts']",
      );
    });
  });
});
