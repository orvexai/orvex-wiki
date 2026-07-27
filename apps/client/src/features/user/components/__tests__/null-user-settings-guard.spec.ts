import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Regression for the white screen found by the live browser sweep
 * (apps/client/e2e/full-feature-sweep.spec.ts).
 *
 * `userAtom` is null until the user query resolves. On a COLD load of
 * /settings/account/preferences it IS null on first render, and components
 * that wrote `user.settings?...` — optional-chaining the second hop but not
 * the first — threw:
 *
 *     Cannot read properties of null (reading 'settings')
 *
 * That throw is uncaught, so React unmounts the tree and `#root` is left
 * EMPTY: a total white screen, not a degraded pane. Verified live before the
 * fix (body text length 0) and after (the page renders).
 *
 * The same shape was latent in `full-editor.tsx` — the page editor, a far
 * higher-traffic surface than the preferences screen.
 *
 * This is a source-level guard rather than a render test because the trigger
 * is a specific atom state during hydration, which a component test would
 * have to fake — and faking it is exactly how the defect survived unit
 * coverage in the first place.
 */

const CLIENT_SRC = join(process.cwd(), "src");

/** Files that read user/workspace settings during render. */
const GUARDED_FILES = [
  "features/user/components/page-width-pref.tsx",
  "features/user/components/fixed-toolbar-pref.tsx",
  "features/user/components/notification-pref.tsx",
  "features/user/components/page-state-pref.tsx",
  "features/editor/full-editor.tsx",
];

describe("null-user guard on settings reads", () => {
  for (const rel of GUARDED_FILES) {
    it(`${rel} never dereferences \`user.\` without optional chaining`, () => {
      const src = readFileSync(join(CLIENT_SRC, rel), "utf8");

      // Strip comments so the explanatory notes (which quote the bad pattern)
      // do not trip the scan.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

      // `user.` immediately after a non-identifier char is a hard deref of the
      // atom; `user?.` and `currentUser.user.` are fine.
      const offenders = code
        .split("\n")
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => /(^|[^.\w])user\.(settings|name|email|role)\b/.test(line));

      expect(
        offenders,
        `hard \`user.\` deref would throw when the atom is null (cold load): ${JSON.stringify(offenders)}`,
      ).toEqual([]);
    });
  }

  it("proves the OLD pattern threw — the defect this pins", () => {
    const user: { settings?: { preferences?: unknown } } | null = null;
    // The pre-fix expression, verbatim in shape: user.settings?.preferences
    expect(() => (user as never as { settings: unknown }).settings).toThrow(
      /Cannot read properties of null/,
    );
    // The fixed expression degrades instead of throwing.
    expect(() => user?.settings?.preferences).not.toThrow();
    expect(user?.settings?.preferences).toBeUndefined();
  });
});
