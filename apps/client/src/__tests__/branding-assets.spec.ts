import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

// AC3: favicon/logo assets are the Orvex Wiki set (byte-different from the
// Docmost originals); no broken <link rel=icon> references.

const ICONS_DIR = join(__dirname, "..", "..", "public", "icons");

// md5 of the upstream Docmost icons at the pinned fork commit
// (orvexai/docmost@050187676624), recorded so this test fails if anyone
// reverts to (or re-copies) the vanilla assets.
const DOCMOST_ORIGINAL_MD5: Record<string, string> = {
  "favicon-16x16.png": "7d81bd8382666565032b913caf455140",
  "favicon-32x32.png": "dd2cef3ef7d66dde74c6598710f9e713",
  "app-icon-192x192.png": "1cce4c07773e84e4ff29c2fa5f3cab85",
  "app-icon-512x512.png": "09c8339a91beb1da53eccfb8a12abf23",
};

const REFERENCED_ICONS = [
  "favicon-16x16.png",
  "favicon-32x32.png",
  "app-icon-192x192.png",
  "app-icon-512x512.png",
];

describe("TestBrandingAssets", () => {
  it.each(REFERENCED_ICONS)(
    "%s exists, is non-empty, and is byte-different from the Docmost original",
    (filename) => {
      const path = join(ICONS_DIR, filename);
      const buf = readFileSync(path);
      expect(buf.length).toBeGreaterThan(0);

      const md5 = createHash("md5").update(buf).digest("hex");
      expect(md5).not.toBe(DOCMOST_ORIGINAL_MD5[filename]);
    },
  );

  it("index.html only references icons that exist on disk", () => {
    const html = readFileSync(
      join(__dirname, "..", "..", "index.html"),
      "utf8",
    );
    const hrefs = [...html.matchAll(/href="(\/icons\/[^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const filename = href.replace("/icons/", "");
      expect(() =>
        readFileSync(join(ICONS_DIR, filename)),
      ).not.toThrow();
    }
  });
});
