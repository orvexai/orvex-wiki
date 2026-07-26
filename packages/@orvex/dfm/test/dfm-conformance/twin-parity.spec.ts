import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { pmToDfm, dfmToJson, reattachOpaqueRefs } from '../../src/index';
import type { PmDoc } from '../../src/index';

/**
 * ENG-2488 DoD gate — `TestDfmTwinsConformToGoldenFixtures`.
 *
 * TS↔Go twin conformance flows ONLY through the contracts-repo-owned golden
 * fixture corpus (D-CON-8: equivalence through fixtures, never shared code).
 * This suite drives the REAL `@orvex/dfm` package (CS §5 ❌#4 — never a mock
 * of its own registry) against the VENDORED corpus snapshot
 * (test/fixtures/dfm/, pinned to the same contracts commit the Go twin's own
 * corpus tracks) and asserts:
 *
 *  - AC1: byte-identical forward serialization + faithful reverse
 *    reconstruction for every fixture pair in all five corpus directories;
 *  - AC5: a divergent fixture fails LOUDLY, naming the fixture id;
 *  - AC2/AC3/AC4: the DfM-specific AGPL import-boundary guard
 *    (scripts/ci/dfm-import-guard.sh) reds a closed-satellite import and
 *    passes the engine's own;
 *  - the Go twin's corpus manifest and the contracts corpus manifest declare
 *    the SAME fixture set (structural cross-check, no Go build dependency);
 *  - the contracts parity script is invoked BLOCKINGLY from this repo
 *    (report-only → blocking flip at the call site).
 *
 * Everything asserts on the fixture-pair bytes and script exit codes only —
 * never on internal symbol names of either twin — so it survives any
 * internal rename of the TS dispatch table or the Go parse internals.
 * Deterministic: fixed, committed fixture files; zero network access.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PKG_TEST_DIR = resolve(HERE, '..');
const CORPUS_DIR = join(PKG_TEST_DIR, 'fixtures', 'dfm');
const GO_TWIN_DIR = join(PKG_TEST_DIR, 'fixtures', 'go-twin-corpus');
const REPO_ROOT = resolve(HERE, '../../../../..');
const IMPORT_GUARD = join(REPO_ROOT, 'scripts', 'ci', 'dfm-import-guard.sh');
const PARITY_GATE = join(REPO_ROOT, 'scripts', 'ci', 'dfm-parity-gate.sh');
const CI_WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');

/** The five corpus directories and how each is asserted. */
const ROUNDTRIP_DIRS = ['nodes', 'marks', 'mentions'] as const;
const OPAQUE_DIRS = ['opaque', 'embeds'] as const;
const ALL_DIRS = [...ROUNDTRIP_DIRS, ...OPAQUE_DIRS];

/** Minimal typed shape of the corpus manifest (❌#12 — never `any`). */
interface CorpusManifest {
  nodes: string[];
  extra_cases: Record<string, string[]>;
  marks: string[];
  opaque_exemplars: string[];
  internal: string[];
  catalog_embed_types_first_class: string[];
  catalog_embed_types_opaque: string[];
  mentions: string[];
  $catalog_count: number;
}

function readManifest(file: string): CorpusManifest {
  return JSON.parse(readFileSync(file, 'utf8')) as CorpusManifest;
}

/** Stable stringify (sorted keys, recursive) for byte-identity assertions. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return (
      '{' +
      entries
        .map(([k, v]) => JSON.stringify(k) + ':' + stableStringify(v))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

/** Case names (pair basenames) in a corpus dir, from the LIVE listing. */
function listCases(corpusRoot: string, dir: string): string[] {
  return readdirSync(join(corpusRoot, dir))
    .filter((f) => f.endsWith('.pm.json'))
    .map((f) => f.slice(0, -'.pm.json'.length))
    .sort();
}

/**
 * Assert one fixture pair conforms. Throws an Error NAMING the fixture id
 * (`<dir>/<case>`) on any divergence — AC5's loud-failure contract lives
 * here, shared by every walk below.
 */
function assertFixtureConforms(
  corpusRoot: string,
  dir: string,
  caseName: string,
): void {
  const id = `${dir}/${caseName}`;
  const pmRaw = readFileSync(join(corpusRoot, dir, `${caseName}.pm.json`), 'utf8');
  const expectedDfm = readFileSync(join(corpusRoot, dir, `${caseName}.dfm.md`), 'utf8');
  const pmDoc = JSON.parse(pmRaw) as PmDoc;

  // Forward: byte-for-byte against the corpus oracle (AC1).
  const forward = pmToDfm(pmDoc);
  if (forward !== expectedDfm) {
    throw new Error(
      `fixture ${id}: forward byte-equality failed — pmToDfm produced ${JSON.stringify(
        forward,
      )}, corpus expects ${JSON.stringify(expectedDfm)}`,
    );
  }

  const parsed = dfmToJson(expectedDfm);

  if ((OPAQUE_DIRS as readonly string[]).includes(dir)) {
    // Opaque/embed pairs: the fence is a REFERENCE — reattaching against the
    // fixture's own doc must restore the original node set byte-identically.
    const restored = reattachOpaqueRefs(parsed, pmDoc);
    if (stableStringify(restored) !== stableStringify(pmDoc)) {
      throw new Error(
        `fixture ${id}: opaque reattach did not restore the original doc byte-for-byte`,
      );
    }
  } else {
    // nodes/marks/mentions: plain reverse reconstruction.
    if (stableStringify(parsed) !== stableStringify(pmDoc)) {
      throw new Error(
        `fixture ${id}: reverse reconstruction diverged — dfmToJson gave ${stableStringify(
          parsed,
        )}, corpus pm.json is ${stableStringify(pmDoc)}`,
      );
    }
  }
}

/** Walk every pair in every corpus dir; throws (naming the fixture) on the
 * first divergence. Returns the number of pairs checked. */
function conformCorpus(corpusRoot: string): number {
  let checked = 0;
  for (const dir of ALL_DIRS) {
    for (const caseName of listCases(corpusRoot, dir)) {
      assertFixtureConforms(corpusRoot, dir, caseName);
      checked += 1;
    }
  }
  return checked;
}

function runScript(script: string, args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const res = spawnSync('bash', [script, ...args], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

// ---------------------------------------------------------------------------
// The DoD gate
// ---------------------------------------------------------------------------

describe('TestDfmTwinsConformToGoldenFixtures', () => {
  it('AC1 — every fixture pair in all 5 corpus dirs round-trips byte-identically through @orvex/dfm', () => {
    const checked = conformCorpus(CORPUS_DIR);
    // 16 nodes + 12 marks + 2 mentions + 2 opaque + 22 embeds = 54 pairs.
    expect(checked).toBe(54);
  });

  it('AC1 — the manifest-declared fixture set matches the LIVE file listing (no stale count trusted)', () => {
    const manifest = readManifest(join(CORPUS_DIR, 'manifest.json'));

    const declaredNodes = [
      ...manifest.nodes,
      ...Object.values(manifest.extra_cases).flat(),
    ].sort();
    expect(listCases(CORPUS_DIR, 'nodes')).toEqual(declaredNodes);
    expect(listCases(CORPUS_DIR, 'marks')).toEqual([...manifest.marks].sort());
    expect(listCases(CORPUS_DIR, 'mentions')).toEqual([...manifest.mentions].sort());
    expect(listCases(CORPUS_DIR, 'opaque')).toEqual(
      [...manifest.opaque_exemplars].sort(),
    );
    expect(listCases(CORPUS_DIR, 'embeds')).toEqual(
      [...manifest.catalog_embed_types_opaque].sort(),
    );

    // The manifest's own declared catalog count cross-checked live.
    expect(
      manifest.catalog_embed_types_first_class.length +
        manifest.catalog_embed_types_opaque.length,
    ).toBe(manifest.$catalog_count);

    // The vendored corpus is the full 110-file snapshot: 54 pairs + the
    // manifest + the corpus README.
    const allFiles = ALL_DIRS.flatMap((d) => readdirSync(join(CORPUS_DIR, d)));
    expect(allFiles.length + 2).toBe(110);
  });

  it('AC5 — a deliberately-divergent fixture fails LOUDLY, naming the fixture id', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dfm-divergent-'));
    try {
      cpSync(CORPUS_DIR, join(tmp, 'dfm'), { recursive: true });
      // Forge ONE oracle in the throwaway copy (the committed corpus is
      // never edited — that is forbidden by the vendoring rule).
      writeFileSync(
        join(tmp, 'dfm', 'nodes', 'heading.dfm.md'),
        'this is not the heading serialization\n',
      );
      expect(() => conformCorpus(join(tmp, 'dfm'))).toThrowError(
        /nodes\/heading/,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('AC2/AC3 — the DfM import guard REDS a closed-satellite import of @orvex/dfm (exit != 0, offender named)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dfm-satellite-'));
    try {
      // A tree standing in for a closed satellite vendored into the repo —
      // the import the guard must make mechanically impossible (AGPL
      // relicensing, A-SEAMS F8). Satellites reach DfM only via the Go twin
      // or a wiki-api network call.
      mkdirSync(join(tmp, 'services', 'closed-satellite'), { recursive: true });
      writeFileSync(
        join(tmp, 'services', 'closed-satellite', 'index.ts'),
        "import { pmToDfm } from '@orvex/dfm';\n",
      );
      const res = runScript(IMPORT_GUARD, [tmp]);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('services/closed-satellite/index.ts');
      expect(res.stderr).toContain('@orvex/dfm');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('AC4 — the engine tree itself PASSES the guard (permitted importer, exit 0)', () => {
    const res = runScript(IMPORT_GUARD, [REPO_ROOT]);
    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Go-twin structural cross-check (no cross-repo build dependency)
// ---------------------------------------------------------------------------

describe('TestGoAndTsCorpusManifestsAgree', () => {
  it('the Go twin corpus manifest and the contracts corpus manifest declare the SAME fixture set', () => {
    const contracts = readManifest(join(CORPUS_DIR, 'manifest.json'));
    const goTwin = readManifest(join(GO_TWIN_DIR, 'manifest.json'));
    // Full structural equality — a silently-diverged second copy fails here.
    expect(stableStringify(goTwin)).toBe(stableStringify(contracts));
  });

  it('the Go twin pins its corpus to a concrete commit (PIN present and well-formed)', () => {
    const pin = readFileSync(join(GO_TWIN_DIR, 'PIN'), 'utf8').trim();
    expect(pin).toMatch(/^[0-9a-f]{40}$/);
  });
});

// ---------------------------------------------------------------------------
// The report-only → blocking flip (contracts parity script, this repo's CI)
// ---------------------------------------------------------------------------

describe('TestContractsParityScriptRunsBlockingNotReportOnly', () => {
  it('the parity gate passes the real vendored corpus (exit 0)', () => {
    const res = runScript(PARITY_GATE, [REPO_ROOT]);
    expect(res.stdout).toContain('blocking mode');
    expect(res.status).toBe(0);
  });

  it('the parity gate FAILS (exit != 0) on a corpus with a FAIL line — the report-only exit-0 override does not survive this repo', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dfm-broken-corpus-'));
    try {
      cpSync(join(PKG_TEST_DIR, 'fixtures'), join(tmp, 'fixtures'), {
        recursive: true,
      });
      // Break one pair: a pm.json with no dfm.md sibling — the vendored
      // contracts script prints FAIL but still exits 0 (report-only); the
      // gate must convert that into a hard failure.
      rmSync(join(tmp, 'fixtures', 'dfm', 'nodes', 'heading.dfm.md'));
      const res = runScript(PARITY_GATE, [REPO_ROOT, tmp]);
      expect(res.status).not.toBe(0);
      expect(res.stdout).toContain('FAIL');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('this repo CI wires both DfM gates as blocking steps (no report-only wrapper)', () => {
    const ci = readFileSync(CI_WORKFLOW, 'utf8');
    expect(ci).toContain('scripts/ci/dfm-parity-gate.sh');
    expect(ci).toContain('scripts/ci/dfm-import-guard.sh');

    // Neither invocation line is soft-failed at the call site.
    for (const line of ci.split('\n')) {
      if (line.includes('dfm-parity-gate.sh') || line.includes('dfm-import-guard.sh')) {
        expect(line).not.toMatch(/\|\|\s*true/);
      }
    }

    // Neither dfm job carries a continue-on-error override.
    const jobBlock = (name: string): string => {
      const start = ci.indexOf(`  ${name}:`);
      expect(start).toBeGreaterThan(-1);
      const rest = ci.slice(start + 2 + name.length + 1);
      const next = rest.search(/\n {2}[A-Za-z0-9_-]+:\n/);
      return next === -1 ? rest : rest.slice(0, next);
    };
    expect(jobBlock('dfm-parity')).not.toContain('continue-on-error');
    expect(jobBlock('dfm-import-guard')).not.toContain('continue-on-error');

    // Both jobs are part of the required ci-success fan-in.
    const successBlock = jobBlock('ci-success');
    expect(successBlock).toContain('- dfm-parity');
    expect(successBlock).toContain('- dfm-import-guard');
  });
});

// ---------------------------------------------------------------------------
// Honesty grep-gate (NFR — CS §11 ALL-REAL)
// ---------------------------------------------------------------------------

describe('TestNoFixtureResultFabricated', () => {
  it('no unresolved-work marker in the conformance test directory', () => {
    // Composed so this file's own source never matches its own gate.
    const markers = [
      'TO' + 'DO',
      'FIX' + 'ME',
      'place' + 'holder',
      'HACK' + ':',
    ];
    const files = readdirSync(HERE).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(HERE, file), 'utf8');
      for (const marker of markers) {
        expect(source.includes(marker), `${file} contains ${marker}`).toBe(false);
      }
    }
  });

  it('the vendored corpus itself is byte-real: existsSync sanity on every asserted path', () => {
    for (const dir of ALL_DIRS) {
      expect(existsSync(join(CORPUS_DIR, dir))).toBe(true);
    }
    expect(existsSync(join(CORPUS_DIR, 'manifest.json'))).toBe(true);
  });
});
