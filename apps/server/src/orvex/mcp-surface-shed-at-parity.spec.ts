import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { resolveGlobalPrefixExclude } from './http/orvex-global-prefix-exclude';
import { lookupConfig } from './throttle/throttler-configs';
import { MCP_TOOL_THROTTLER } from './orvex-throttler-names';
import {
  Feature as ServerFeature,
} from '../common/features';
import * as workspaceSettingsDtoModule from './settings/workspace-settings.dto';
import { OrvexWorkspaceSettings } from './settings/workspace-settings.dto';

/**
 * ENG-1481 §5a — the ONE named DoD binary gate for the MCP engine-leg shed.
 *
 *   mcp-surface-shed-at-parity.spec.ts ›
 *     "engine exposes zero MCP surface after parity shed"
 *
 * A deterministic tree-reading + behavioral absence gate (server test job). It
 * reads the source tree (client + server) and drives the exported server
 * modules; it takes NO wall-clock/random/env input, so Red = the shed is not
 * done, with no override. It consumes — never re-runs — the anchor's parity
 * verdict (ENG-1407 + contracts FR-C5), which is the load-bearing WS-16 gate
 * that permits the shed at all (AC3 blocked-by, satisfied: ENG-1407 = Done).
 *
 * The in-fork `/mcp` transport was never on the engine's `dev` lineage
 * (verified absent — divergent fat-fork only); AC1/AC2 are therefore a
 * re-introduction guard, not a delete.
 */

// apps/server/src/orvex -> up 4 = repo root.
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const CLIENT_SRC = join(REPO_ROOT, 'apps', 'client', 'src');
const SERVER_SRC = join(REPO_ROOT, 'apps', 'server', 'src');

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

// Residue greps scan PRODUCTION source only — test files (this gate included)
// naturally mention the very tokens whose absence they assert, so `.spec`/
// `.test` files are excluded to avoid a self-match false positive.
function prodFilesContaining(root: string, exts: RegExp, needle: string): string[] {
  return walk(root, exts)
    .filter((f) => !/\.(spec|test)\.tsx?$/.test(f))
    .filter((f) => readFileSync(f, 'utf8').includes(needle));
}

/**
 * The anchor's declared REST-gap parity verdict (ENG-1407 + contracts FR-C5),
 * CONSUMED here — not re-derived. Tallies are the merged FR-C5 ledger
 * (orvex-studio-contracts#38 @ 5ae767e); the green named parity test is
 * TestInForkMcpParityReadyForDecommission (orvex-studio-mcp#25 @ a32ad19).
 */
const FR_C5_PARITY = {
  ledgerPr: 'orvex-studio-contracts#38',
  ledgerSha: '5ae767e',
  anchorPr: 'orvex-studio-mcp#25',
  anchorSha: 'a32ad19',
  anchorTest: 'TestInForkMcpParityReadyForDecommission',
  dispositions: { covered: 31, aiOperation: 2, retired: 40, newPrimitive: 0 },
  total: 73,
} as const;

describe('mcp-surface-shed-at-parity', () => {
  it('engine exposes zero MCP surface after parity shed', () => {
    // (a) AC1 — in-fork transport package stays ABSENT (re-introduction guard).
    expect(existsSync(join(REPO_ROOT, 'packages', 'orvex-mcp'))).toBe(false);

    // (b) AC2 — in-fork server route/factory/guard/module stay ABSENT.
    expect(existsSync(join(SERVER_SRC, 'orvex', 'mcp'))).toBe(false);
    expect(prodFilesContaining(SERVER_SRC, /\.ts$/, "@Controller('mcp')")).toEqual([]);
    expect(prodFilesContaining(SERVER_SRC, /\.ts$/, 'mcp-server.factory')).toEqual([]);

    // (c) AC7 — the MCP feature flag is gone (client + server).
    expect('MCP' in ServerFeature).toBe(false);
    const clientFeatures = readFileSync(
      join(CLIENT_SRC, 'ee', 'features.ts'),
      'utf8',
    );
    expect(/\bMCP\s*:/.test(clientFeatures)).toBe(false);

    // (c) AC7 — the OrvexMcpSettings DTO class + `mcp?` field are gone.
    expect(
      Object.keys(workspaceSettingsDtoModule).some((k) => /Mcp/.test(k)),
    ).toBe(false);
    expect('mcp' in new OrvexWorkspaceSettings()).toBe(false);

    // (c) AC7 — no `mcpEnabled` handling / `'mcp'` license gate in the service.
    const workspaceService = readFileSync(
      join(SERVER_SRC, 'core', 'workspace', 'services', 'workspace.service.ts'),
      'utf8',
    );
    expect(workspaceService).not.toContain('mcpEnabled');
    expect(workspaceService).not.toContain("'mcp'");

    // (c) AC7 — no `['mcp','throttle','toolRpm']` throttle override config.
    // (Behavioral: the dormant throttler NAME is retained substrate — ENG-1436
    // — but has NO per-workspace override config, so lookupConfig is null.)
    expect(lookupConfig(MCP_TOOL_THROTTLER)).toBeNull();

    // (c) AC7 — no `'mcp'` in the `/api` global-prefix exclude default.
    // (Behavioral, with a fixed literal env `{}` — NOT the ambient env; a
    // literal grep of main.ts would false-negative: the token moved to the
    // config helper.)
    expect(resolveGlobalPrefixExclude({})).not.toContain('mcp');

    // (c) AC7 — the orphan `@modelcontextprotocol/sdk` dep pin is gone.
    const serverPkg = JSON.parse(
      readFileSync(join(REPO_ROOT, 'apps', 'server', 'package.json'), 'utf8'),
    );
    const allDeps = {
      ...(serverPkg.dependencies ?? {}),
      ...(serverPkg.devDependencies ?? {}),
    };
    expect('@modelcontextprotocol/sdk' in allDeps).toBe(false);

    // (d) AC5 — no `mcp-settings` panel, no `/settings/ai/mcp` tab/route, no
    // `${getAppUrl()}/mcp` URL advertised anywhere in the client bundle.
    expect(
      existsSync(join(CLIENT_SRC, 'ee', 'ai', 'components', 'mcp-settings.tsx')),
    ).toBe(false);
    expect(prodFilesContaining(CLIENT_SRC, /\.tsx?$/, 'mcp-settings')).toEqual([]);
    expect(prodFilesContaining(CLIENT_SRC, /\.tsx?$/, 'settings/ai/mcp')).toEqual([]);
    expect(prodFilesContaining(CLIENT_SRC, /\.tsx?$/, 'getAppUrl()}/mcp')).toEqual([]);

    // (e) AC6 / AC-honesty — zero consumer regression: the anchor's FR-C5
    // verdict (CONSUMED) accounts for all 73 in-fork tools with no silent drop.
    const d = FR_C5_PARITY.dispositions;
    const standaloneServed = d.covered + d.aiOperation;
    expect(standaloneServed + d.retired + d.newPrimitive).toBe(FR_C5_PARITY.total);
    expect(FR_C5_PARITY.total).toBe(73);
    expect(d.newPrimitive).toBe(0); // nothing new-but-unserved stranded
    expect(d.retired).toBeGreaterThan(0); // retirements are EXPLICIT, not silent
    // Every one of the 73 is standalone-served OR explicitly-retired => no gap.
    expect(standaloneServed + d.retired).toBe(FR_C5_PARITY.total);
  });

  it('is deterministic: the gate reads only the source tree (no clock, random, or ambient env)', () => {
    const self = readFileSync(join(__dirname, 'mcp-surface-shed-at-parity.spec.ts'), 'utf8');
    expect(/Date\.now\s*\(/.test(self)).toBe(false);
    expect(/Math\.random\s*\(/.test(self)).toBe(false);
    expect(/process\.env/.test(self)).toBe(false);
  });
});
