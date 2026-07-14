import { describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// AC6/AC7 static guards: this branding leg must NOT touch the LiteLLM
// `docmost` spend tag (a wire identifier owned by the orvex-studio-ai leg)
// or rename any internal identifier (DB names, config env keys, routes).

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const ORVEX_AI_DIR = join(REPO_ROOT, "packages/orvex-ai");

describe("TestBrandingBoundaryGuards", () => {
  it("AC6: packages/orvex-ai (the LiteLLM docmost spend-tag owner) is out of this repo/leg's scope", () => {
    // The ticket cites packages/orvex-ai/src/services/{ai-provider,litellm-spend}.service.ts
    // as the DO-NOT-TOUCH boundary. It does not exist inside this repo
    // (orvex-wiki) at all — it is owned by the orvex-studio-ai leg, which
    // per ruling 10 lives in its own repo/ticket. If it is ever vendored
    // into this repo, assert its docmost tag literal is present so a
    // stray rename here would fail loudly; otherwise this guard is
    // trivially satisfied — this branding leg cannot touch code that is
    // not present in its own repo.
    if (!existsSync(ORVEX_AI_DIR)) {
      expect(existsSync(ORVEX_AI_DIR)).toBe(false);
      return;
    }
    const producer = readFileSync(
      join(ORVEX_AI_DIR, "src/services/ai-provider.service.ts"),
      "utf8",
    );
    const consumer = readFileSync(
      join(ORVEX_AI_DIR, "src/services/litellm-spend.service.ts"),
      "utf8",
    );
    expect(producer).toMatch(/'docmost'/);
    expect(consumer).toMatch(/'docmost'/);
  });

  it("AC6: this ticket's diff touches no packages/orvex-ai source line (static check against origin/dev)", () => {
    // Best-effort: only meaningful inside a git checkout with the base ref
    // available. Skips quietly (never fails the suite) when it is not,
    // e.g. a shallow clone in an unrelated CI context.
    let diffNames = "";
    try {
      diffNames = execSync("git diff --name-only origin/dev...HEAD", {
        cwd: REPO_ROOT,
        encoding: "utf8",
      });
    } catch {
      return;
    }
    const touched = diffNames
      .split("\n")
      .filter((f) => f.startsWith("packages/orvex-ai/src/"));
    expect(touched).toEqual([]);
  });

  it("AC7: the JWT issuer internal identifier is unchanged", () => {
    const tokenModule = readFileSync(
      join(REPO_ROOT, "apps/server/src/core/auth/token.module.ts"),
      "utf8",
    );
    expect(tokenModule).toMatch(/issuer:\s*'Docmost'/);
  });

  it("AC7: the docmost-export import-format identifier is unchanged", () => {
    const importUtils = readFileSync(
      join(
        REPO_ROOT,
        "apps/server/src/integrations/import/utils/import.utils.ts",
      ),
      "utf8",
    );
    expect(importUtils).toMatch(/readDocmostMetadata/);
  });
});
