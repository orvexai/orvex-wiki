import { describe, test, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * ENG-1395 AC9 — reconciliation: exactly one AI-editor affordance is live
 * (the AiPalette); the superseded preview-menu `EditorAiMenu` +
 * `showAiMenuAtom` are removed (not left as a live duplicate).
 *
 * Test-ifies the ticket's own static assertion (§ AC9): `rg -n
 * "EditorAiMenu|showAiMenuAtom" apps/client/src` returns zero live mounts,
 * and `page-editor.tsx` mounts exactly one AI affordance (`AiPalette`).
 *
 * Scans real CODE lines only — comment lines (which legitimately name the
 * superseded identifiers for historical/provenance context, e.g. in this
 * file's own docstring and the AiPalette module's "supersedes" comment)
 * are not a live mount and are excluded from the scan.
 */
describe("AC9 — preview-menu reconciliation", () => {
  const clientSrc = path.resolve(__dirname, "../../../../../"); // apps/client/src
  const OLD_IDENTIFIERS = /\b(EditorAiMenu|showAiMenuAtom)\b/;
  const COMMENT_LINE = /^\s*(\*|\/\/|\/\*)/;

  const SELF = path.resolve(__filename);

  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        yield* walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && path.resolve(full) !== SELF) {
        yield full;
      }
    }
  }

  test("the old EditorAiMenu component directory no longer exists", () => {
    const oldMenuDir = path.join(clientSrc, "ee/ai/components/editor/ai-menu");
    expect(existsSync(oldMenuDir)).toBe(false);
  });

  test("no live (non-comment) references to EditorAiMenu or showAiMenuAtom remain in apps/client/src", () => {
    const liveHits: string[] = [];
    for (const file of walk(clientSrc)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (OLD_IDENTIFIERS.test(line) && !COMMENT_LINE.test(line)) {
          liveHits.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(liveHits).toEqual([]);
  });

  test("page-editor.tsx mounts exactly one AI affordance (AiPalette)", () => {
    const pageEditorSrc = readFileSync(
      path.join(clientSrc, "features/editor/page-editor.tsx"),
      "utf8",
    );
    const mounts = pageEditorSrc.match(/<AiPalette\b/g) ?? [];
    expect(mounts).toHaveLength(1);
  });
});
