import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { checkBracesScope } from "../ci/check-osv-braces-scope.mjs";

const repoRoot = new URL("../../", import.meta.url);

test("committed lockfile keeps braces only in approved server dev tools", () => {
  const lock = parse(
    fs.readFileSync(new URL("pnpm-lock.yaml", repoRoot), "utf8"),
  );
  const result = checkBracesScope(lock);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.paths.length, 3);
  assert.ok(result.paths.every((path) => path.includes("micromatch@4.0.8")));
});

test("a production dependency path to braces fails the scope check", () => {
  const lock = {
    importers: {
      "apps/server": {
        dependencies: { "runtime-tool": { version: "1.0.0" } },
        devDependencies: { "ts-loader": { version: "9.5.7" } },
      },
    },
    snapshots: {
      "runtime-tool@1.0.0": { dependencies: { braces: "3.0.3" } },
      "ts-loader@9.5.7": { dependencies: { micromatch: "4.0.8" } },
      "micromatch@4.0.8": { dependencies: { braces: "3.0.3" } },
      "braces@3.0.3": {},
    },
  };
  const result = checkBracesScope(lock);
  assert.equal(result.ok, false);
  assert.match(result.reason, /production dependency reaches braces@3\.0\.3/);
});

test("a production path through a workspace importer also fails", () => {
  const lock = {
    importers: {
      "apps/server": {
        dependencies: {
          "@workspace/helper": { version: "link:../../packages/helper" },
        },
      },
      "packages/helper": {
        dependencies: { "runtime-tool": { version: "1.0.0" } },
      },
      "apps/server-dev": {
        devDependencies: { "ts-loader": { version: "9.5.7" } },
      },
    },
    snapshots: {
      "runtime-tool@1.0.0": { dependencies: { braces: "3.0.3" } },
      "ts-loader@9.5.7": { dependencies: { micromatch: "4.0.8" } },
      "micromatch@4.0.8": { dependencies: { braces: "3.0.3" } },
      "braces@3.0.3": {},
    },
  };
  const result = checkBracesScope(lock);
  assert.equal(result.ok, false);
  assert.match(result.reason, /production dependency reaches braces@3\.0\.3/);
  assert.match(result.reason, /workspace:packages\/helper/);
});

test("an unapproved development path to braces fails the scope check", () => {
  const lock = {
    importers: {
      "apps/server": {
        devDependencies: { "other-tool": { version: "1.0.0" } },
      },
    },
    snapshots: {
      "other-tool@1.0.0": { dependencies: { braces: "3.0.3" } },
      "braces@3.0.3": {},
    },
  };
  const result = checkBracesScope(lock);
  assert.equal(result.ok, false);
  assert.match(result.reason, /outside the approved tools/);
});
