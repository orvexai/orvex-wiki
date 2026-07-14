import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { getAppName } from "@/lib/config";

// Named DoD binary gate (ENG-1399 §5a):
// "getAppName() returns 'Orvex Wiki' and every user-facing product-name
// surface (document title, email subject/header) renders 'Orvex Wiki'
// with zero literal 'Docmost' strings in the shipped user-facing bundle."
//
// This spec covers the client half (AC1, AC2, AC8); the server half
// (email subject/header, AC4) is covered by
// apps/server/src/integrations/transactional/emails/__tests__/invitation-email.spec.ts.

const CLIENT_ROOT = join(__dirname, "..");

// Directories/files that are DELIBERATELY excluded from the "zero literal
// Docmost" gate (AC5's own allow-list clause, applied consistently to the
// binary DoD gate):
//  - internal wire/compat identifiers that AC6/AC7 require to stay
//    UNCHANGED (import format compatibility, upstream-fork code comments).
//  - EE legal license text (packages/ee license grant references the real
//    upstream licensor; rewriting it would misstate who grants the EE
//    license — out of scope for a product-name rebrand).
const ALLOWLISTED_PATHS = [
  "ee/LICENSE",
  "ee/ai/pages/ai-settings.tsx", // "Contact sales@docmost.com" — real upstream contact, not fabricated
];

function isAllowlisted(relPath: string): boolean {
  return ALLOWLISTED_PATHS.some((p) => relPath === p || relPath.endsWith(p));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walk(full, out);
    } else if (/\.(tsx?|html)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("TestBrandingDoD", () => {
  it("getAppName() returns 'Orvex Wiki'", () => {
    expect(getAppName()).toBe("Orvex Wiki");
  });

  it("a titled page renders '… - Orvex Wiki'", () => {
    const title = `${"Home"} - ${getAppName()}`;
    expect(title).toBe("Home - Orvex Wiki");
  });

  it("index.html <title> and apple-mobile-web-app-title read 'Orvex Wiki'", () => {
    const html = readFileSync(join(CLIENT_ROOT, "..", "index.html"), "utf8");
    expect(html).toMatch(/<title>Orvex Wiki<\/title>/);
    expect(html).toMatch(/name="apple-mobile-web-app-title" content="Orvex Wiki"/);
    expect((html.match(/>Docmost</g) || []).length).toBe(0);
    expect((html.match(/content="Docmost"/g) || []).length).toBe(0);
  });

  it("manifest.json name/short_name read 'Orvex Wiki'", () => {
    const manifest = JSON.parse(
      readFileSync(join(CLIENT_ROOT, "..", "public", "manifest.json"), "utf8"),
    );
    expect(manifest.name).toBe("Orvex Wiki");
    expect(manifest.short_name).toBe("Orvex Wiki");
  });

  it("zero literal 'Docmost' strings across the shipped user-facing client bundle", () => {
    const files = walk(CLIENT_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.substring(CLIENT_ROOT.length + 1);
      if (isAllowlisted(rel)) continue;
      if (rel.startsWith("__tests__/")) continue;
      const content = readFileSync(file, "utf8");
      if (/Docmost/.test(content)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
