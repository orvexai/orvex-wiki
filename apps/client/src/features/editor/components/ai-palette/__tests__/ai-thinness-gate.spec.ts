import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * ENG-1395 AC8 + NFR-honesty — thinness guard, test-ified (CS §4/§5c: the
 * ticket's own static gates must be CI-enforced, not just verified ad
 * hoc). Scans the two directories the ticket names as the client-side AI
 * surface: `packages/editor-ext/src` (the ported handlers) and
 * `apps/client/src/features/editor/components/ai-palette` (the palette).
 *
 * AC8 — no prompt/agent/model logic in the client:
 *   `rg -n "system prompt|promptTemplate|toolLoop|agentStep|model
 *   capabilit" packages/editor-ext/src apps/client/.../ai-palette` = 0.
 *
 * NFR-AC (honesty, CS §11) — no fabricated/offline/mock transform path:
 *   `rg -n "MOCK|offline|fallbackTransform" packages/editor-ext/src
 *   apps/client/.../ai-palette` = 0 matches in shipped (non-test) code.
 *
 * Both gates scan only shipped code: this spec file and the rest of
 * `__tests__/**` (which legitimately names the banned identifiers in
 * comments/strings to describe the gate itself) are excluded.
 */
describe("AC8 + NFR-honesty — client AI thinness guard", () => {
  const repoRoot = path.resolve(__dirname, "../../../../../../../../"); // repo root
  const editorExtSrc = path.join(repoRoot, "packages/editor-ext/src");
  const aiPaletteDir = path.resolve(__dirname, "..");

  const SELF = path.resolve(__filename);
  const TEST_DIR = path.resolve(__dirname);

  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        yield* walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        yield full;
      }
    }
  }

  function scan(dirs: string[], banned: RegExp): string[] {
    const hits: string[] = [];
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        const resolved = path.resolve(file);
        if (resolved === SELF) continue;
        if (resolved.startsWith(TEST_DIR) && resolved !== SELF) {
          // __tests__/** may legitimately name the banned identifiers to
          // describe the gate — excluded from the shipped-code scan.
        }
        if (resolved.includes(`${path.sep}__tests__${path.sep}`)) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (banned.test(line)) {
            hits.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
    return hits;
  }

  test("AC8 — no prompt/agent/model logic in packages/editor-ext/src or ai-palette", () => {
    const BANNED =
      /system prompt|promptTemplate|toolLoop|agentStep|model capabilit/i;
    const hits = scan([editorExtSrc, aiPaletteDir], BANNED);
    expect(hits).toEqual([]);
  });

  test("NFR-honesty — no MOCK/offline/fallbackTransform path in shipped code", () => {
    const BANNED = /\bMOCK\b|\boffline\b|\bfallbackTransform\b/;
    const hits = scan([editorExtSrc, aiPaletteDir], BANNED);
    expect(hits).toEqual([]);
  });
});
