import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ENG-1395 AC4 — bubble is true composition, one flush timer, test-ified
 * (CS §4/§5c: the ticket's own static gate must be CI-enforced, not just
 * verified ad hoc).
 *
 * Assertion (static gate): `rg -n "setInterval\(.*50|flushTimer"
 * packages/editor-ext/src` finds exactly one 50ms flush-timer
 * CONSTRUCTION (`setInterval(...)` call) across the inline + bubble
 * handler files; the bubble wrapper delegates to the inner handler
 * instead of starting a second timer.
 */
describe("AC4 — exactly one 50ms flush-timer construction", () => {
  const editorExtLib = path.resolve(
    __dirname,
    "../../../../../../../../packages/editor-ext/src/lib",
  );

  test("only ai-inline-handler.ts constructs a setInterval flush timer; ai-bubble-handler.ts does not", () => {
    const inline = readFileSync(
      path.join(editorExtLib, "ai-inline-handler.ts"),
      "utf8",
    );
    const bubble = readFileSync(
      path.join(editorExtLib, "ai-bubble-handler.ts"),
      "utf8",
    );

    const constructions = (src: string) =>
      (src.match(/setInterval\s*\(/g) ?? []).length;

    expect(constructions(inline)).toBe(1);
    expect(constructions(bubble)).toBe(0);

    // The bubble handler must not name its own flush cadence either —
    // it delegates entirely to the inner handler's canonical timer.
    expect(/flushTimer\s*[:=]/.test(bubble)).toBe(false);
  });
});
