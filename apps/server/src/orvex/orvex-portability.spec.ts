import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { OrvexRootModule } from './orvex-root.module';
import { DbFreeAuditKyselyStubModule } from './__fixtures__/db-free-root-module-testing';

/**
 * ENG-2508 §5a — TestEngineHasNoSwaggerAndDegradesGracefully, the ONE named
 * DoD binary gate for "engine API internal-only / configured platform
 * endpoints / graceful degrade".
 *
 * VERIFY + harden (the ticket's own scope line): the behaviours proven here
 * already ship — this gate pins them against regression:
 *
 *  AC1  — the engine ships NO `/docs`/Swagger surface: source-level (zero
 *         SwaggerModule/DocumentBuilder in production source) AND behavioral
 *         (a REAL booted Nest app's route table carries no docs/swagger
 *         path).
 *  AC2  — wiki-api fronts all programmatic access; the engine carries no
 *         agent-facing residual — CONSUMED from the ENG-1481 shed gate
 *         (mcp-surface-shed-at-parity.spec.ts), not re-derived.
 *  AC3  — every platform dependency is a deploy-CONFIGURED URL: all seven
 *         `ORVEX_*_URL` keys present in the committed manifest as
 *         cluster-local DNS (never a literal IP), no `studio`-hardcoded URL
 *         in production code, and the engine's own getter surface honours
 *         MINIMIZE-SURFACE (the five unwired keys have ZERO production
 *         consumer — deliberately; a getter lands with its first real
 *         consumer, never speculatively, ❌#6).
 *  AC4  — core read/write degrades cleanly under a knowledge/ai outage BY
 *         STRUCTURAL ABSENCE: no production code path reads
 *         ORVEX_KNOWLEDGE_URL/ORVEX_AI_URL at all, so an outage of either
 *         cannot reach the core CRUD chokepoint. (The client-side degrade of
 *         affordances that DO call ai/knowledge is ENG-2507's scope.)
 *  AC5  — no Studio-owner assumption: every platform seam is a generic
 *         configured URL a non-Studio deployer could repoint.
 *
 * The never-white-screen NFR (GET /health/orvex HTTP-200-unconditional,
 * ADR-0020) is owned by orvex-health's own suite and is not re-proven here
 * (§5d: do not re-test a sibling's own contract).
 *
 * Deterministic: reads the committed tree + boots an in-process app with a
 * fixed env fixture; no wall-clock, no random, no network.
 */

// apps/server/src/orvex -> up 4 = repo root.
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SERVER_SRC = join(REPO_ROOT, 'apps', 'server', 'src');
const MANIFEST = join(
  REPO_ROOT,
  'deploy',
  'kustomize',
  'app-manifests',
  'configmap-env.yaml',
);

const SEVEN_PLATFORM_URL_KEYS = [
  'ORVEX_IDENTITY_URL',
  'ORVEX_KNOWLEDGE_URL',
  'ORVEX_AI_URL',
  'ORVEX_BILLING_API_URL',
  'ORVEX_MCP_URL',
  'ORVEX_CONSOLE_URL',
  'ORVEX_WIKI_API_URL',
] as const;

// The five keys with deliberately NO engine-side consumer yet
// (MINIMIZE-SURFACE — each getter is added together with its first real
// consumer at that consumer's own delivery, never speculatively).
const FIVE_UNWIRED_KEYS = [
  'ORVEX_KNOWLEDGE_URL',
  'ORVEX_AI_URL',
  'ORVEX_MCP_URL',
  'ORVEX_CONSOLE_URL',
  'ORVEX_WIKI_API_URL',
] as const;

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, exts, out);
    } else if (exts.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Production source only — test files (this gate included) naturally mention
// the very tokens whose absence they assert.
function prodFiles(root: string): string[] {
  return walk(root, /\.ts$/).filter((f) => !/\.(spec|test)\.tsx?$/.test(f));
}

function prodFilesContaining(root: string, needle: string): string[] {
  return prodFiles(root).filter((f) =>
    readFileSync(f, 'utf8').includes(needle),
  );
}

/**
 * Strip comments so a documented prod-default URL in a JSDoc block (e.g.
 * orvex-config.service.ts's edgeJwksUrl doc) is not mistaken for a hardcoded
 * coupling. Line comments are stripped only when `//` is NOT preceded by `:`
 * so `http://…` string literals in real code survive and still trip the gate.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function bootRealApp(): Promise<{
  app: NestFastifyApplication;
  routes: string[];
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [OrvexRootModule.register(), DbFreeAuditKyselyStubModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, stopAtFirstError: true }),
  );
  const routes: string[] = [];
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRoute', (route) => {
      routes.push(route.url);
    });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, routes };
}

describe('TestEngineHasNoSwaggerAndDegradesGracefully (ENG-2508)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    saved.ORVEX_MODULES_ENABLED = process.env.ORVEX_MODULES_ENABLED;
    process.env.ORVEX_MODULES_ENABLED = 'true';
  });

  afterAll(() => {
    if (saved.ORVEX_MODULES_ENABLED === undefined) {
      delete process.env.ORVEX_MODULES_ENABLED;
    } else {
      process.env.ORVEX_MODULES_ENABLED = saved.ORVEX_MODULES_ENABLED;
    }
  });

  it('AC1 (source) — zero SwaggerModule/DocumentBuilder anywhere in production source', () => {
    expect(prodFilesContaining(SERVER_SRC, 'SwaggerModule')).toEqual([]);
    expect(prodFilesContaining(SERVER_SRC, 'DocumentBuilder')).toEqual([]);
    expect(prodFilesContaining(SERVER_SRC, '@nestjs/swagger')).toEqual([]);
  });

  // SCOPE NOTE (ENG-2508 AC1): this boots ONLY `OrvexRootModule.register()`
  // — the additive orvex subtree, ~17 of the engine's ~50 controllers — so a
  // `/docs` route mounted in the upstream Docmost core would NOT be caught
  // here. The full-app route table is asserted by the integration-tier
  // sibling `test/integration/eng2508-portability-full-app.integration-spec.ts`
  // (which needs Postgres + Redis to boot AppModule). Both must stay green.
  it('AC1 (behavioral, orvex subtree) — a REAL booted app route table carries no /docs|/api-docs|swagger path', async () => {
    const { app, routes } = await bootRealApp();
    try {
      // non-vacuous: the boot registered real routes
      expect(routes.length).toBeGreaterThan(0);
      const offenders = routes.filter((url) =>
        /docs|swagger|openapi/i.test(url),
      );
      expect(offenders).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('AC2 — zero engine-direct agent surface, CONSUMED from the ENG-1481 shed gate (not re-derived)', () => {
    // The shed gate is the load-bearing proof; this gate consumes its
    // presence + re-asserts the two cheapest residual greps.
    expect(
      existsSync(join(SERVER_SRC, 'orvex', 'mcp-surface-shed-at-parity.spec.ts')),
    ).toBe(true);
    expect(prodFilesContaining(SERVER_SRC, "@Controller('mcp')")).toEqual([]);
    expect(prodFilesContaining(SERVER_SRC, "@Controller('docs')")).toEqual([]);
  });

  it('AC3 (deploy side) — all seven platform-URL keys are committed as cluster-local DNS, never a literal IP', () => {
    const manifest = readFileSync(MANIFEST, 'utf8');
    for (const key of SEVEN_PLATFORM_URL_KEYS) {
      const match = manifest.match(
        new RegExp(`^\\s*${key}:\\s*"([^"]+)"`, 'm'),
      );
      expect(match).not.toBeNull();
      const value = match![1];
      expect(value).toMatch(/^http:\/\//);
      expect(value).toContain('.svc.cluster.local');
      expect(value).not.toMatch(/\d+\.\d+\.\d+\.\d+/); // no literal IP
    }
  });

  it('AC3/AC5 — no studio-hardcoded URL in production code (comment-stripped); platform seams stay repointable', () => {
    const offenders = prodFiles(SERVER_SRC).filter((f) =>
      /https?:\/\/[a-z0-9.-]*studio/i.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  it('AC3 (MINIMIZE-SURFACE) — the five unwired platform-URL keys have ZERO production consumer (no speculative getter, ❌#6)', () => {
    for (const key of FIVE_UNWIRED_KEYS) {
      expect(prodFilesContaining(SERVER_SRC, key)).toEqual([]);
    }
  });

  it('AC4 — core CRUD degrades under a knowledge/ai outage BY STRUCTURAL ABSENCE: no code path reads either URL', () => {
    // Repo-server-wide (subsumes core/ and the write chokepoint): nothing
    // reads ORVEX_KNOWLEDGE_URL or ORVEX_AI_URL, so a total outage of both
    // services cannot reach page read/save/edit/list at all.
    expect(prodFilesContaining(SERVER_SRC, 'ORVEX_KNOWLEDGE_URL')).toEqual([]);
    expect(prodFilesContaining(SERVER_SRC, 'ORVEX_AI_URL')).toEqual([]);
    // and specifically: core/ never mentions the knowledge/ai seams even
    // under any other name of their env keys.
    const core = join(SERVER_SRC, 'core');
    expect(prodFilesContaining(core, 'ORVEX_KNOWLEDGE')).toEqual([]);
    expect(prodFilesContaining(core, 'ORVEX_AI_')).toEqual([]);
  });

  it('NFR honesty — the config service documents MINIMIZE-SURFACE with no TODO/FIXME/placeholder', () => {
    const configService = readFileSync(
      join(SERVER_SRC, 'orvex', 'config', 'orvex-config.service.ts'),
      'utf8',
    );
    // The file's own doc comments STATE the anti-placeholder contract
    // ("NEVER as a fabricated placeholder") — that phrasing is the honesty
    // guarantee itself, not a marker; only that exact negative usage is
    // exempt. Any other TODO/FIXME/placeholder occurrence trips the gate.
    const withoutContractPhrasing = configService.replace(
      /fabricated placeholder/gi,
      '',
    );
    expect(/TODO|FIXME|placeholder/i.test(withoutContractPhrasing)).toBe(false);
  });

  it('is deterministic: no clock or random input in this gate', () => {
    const self = readFileSync(join(__dirname, 'orvex-portability.spec.ts'), 'utf8');
    expect(/Date\.now\s*\(/.test(self)).toBe(false);
    expect(/Math\.random\s*\(/.test(self)).toBe(false);
  });
});
