import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aiAuthoredMarkClass } from "@docmost/editor-ext";

/**
 * ENG-1460 fix pass 1 (review finding F2) — `AiAuthoredWashStyleSpec`.
 *
 * The `AiAuthored` mark renders a global `class="ai-authored-wash"` span
 * (`packages/editor-ext/src/lib/ai-authored/ai-authored.ts`), but the only
 * style rule that existed pointed at a CSS-module-scoped `.aiAuthoredWash`
 * (compiles to a hashed class name), which can never match the literal
 * global class — the wash highlight was a silent no-op. This locks a real
 * *global* stylesheet rule targeting the mark's actual output class, wired
 * into the editor's global stylesheet index the same way every other mark
 * style (e.g. `highlight.css`) is.
 *
 * CSS custom-property/rule matching isn't exercised by jsdom's computed
 * styles for `light-dark()` in this toolchain, so this is a static-content
 * assertion on the source stylesheet — consistent with how the module CSS
 * itself was authored (a plain source file, not a runtime behavior).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

function readCss(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

describe("AiAuthoredWashStyleSpec", () => {
  test("a global stylesheet rule targets the mark's actual rendered class", () => {
    expect(aiAuthoredMarkClass).toBe("ai-authored-wash");

    const css = readCss(
      "../../../features/editor/styles/ai-authored-wash.css",
    );

    // Must be a real global selector on the literal class the mark renders
    // (not a CSS-module class, which would compile to a hashed name).
    expect(css).toMatch(
      new RegExp(`\\.${aiAuthoredMarkClass}\\s*\\{`),
    );
  });

  test("the wash stylesheet is wired into the editor's global stylesheet index", () => {
    const index = readCss("../../../features/editor/styles/index.css");
    expect(index).toMatch(/@import\s+["']\.\/ai-authored-wash\.css["'];/);
  });
});
