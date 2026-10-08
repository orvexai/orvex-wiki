#!/usr/bin/env node
// Prove the temporary braces OSV exception remains confined to server dev tools.
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const TARGET = "braces@3.0.3";
const ALLOWED_INTRODUCERS = [
  "jest-message-util@",
  "kysely-codegen@",
  "ts-loader@",
];
const MAX_DEPTH = 80;

function ref(name, version, importerName) {
  if (!version || version.startsWith("file:")) return null;
  if (version.startsWith("link:")) {
    const workspacePath = path.posix.normalize(
      path.posix.join(importerName, version.slice("link:".length)),
    );
    return `workspace:${workspacePath}`;
  }
  return `${name}@${version}`;
}

function dependencyRefs(dependencies = {}, importerName = "") {
  return Object.entries(dependencies)
    .map(([name, item]) =>
      ref(name, typeof item === "string" ? item : item.version, importerName),
    )
    .filter(Boolean);
}

function findPaths(start, snapshots, importers, target, prefix = []) {
  if (prefix.length >= MAX_DEPTH || prefix.includes(start)) return [];
  const path = [...prefix, start];
  if (start === target) return [path];
  if (start.startsWith("workspace:")) {
    const importerName = start.slice("workspace:".length);
    const importer = importers[importerName];
    if (!importer) return [];
    const next = [
      ...dependencyRefs(importer.dependencies, importerName),
      ...dependencyRefs(importer.optionalDependencies, importerName),
    ];
    return next.flatMap((child) =>
      findPaths(child, snapshots, importers, target, path),
    );
  }
  const snapshot = snapshots[start];
  if (!snapshot) return [];
  const next = [
    ...dependencyRefs(snapshot.dependencies),
    ...dependencyRefs(snapshot.optionalDependencies),
  ];
  return next.flatMap((child) =>
    findPaths(child, snapshots, importers, target, path),
  );
}

export function checkBracesScope(lock) {
  const snapshots = lock.snapshots ?? {};
  const targetCount = Object.keys(snapshots).filter(
    (key) => key === TARGET,
  ).length;
  if (targetCount !== 1) {
    return {
      ok: false,
      reason: `expected one ${TARGET} snapshot, found ${targetCount}`,
    };
  }

  const productionPaths = [];
  const developmentPaths = [];
  for (const [importerName, importer] of Object.entries(lock.importers ?? {})) {
    for (const section of ["dependencies", "optionalDependencies"]) {
      for (const start of dependencyRefs(importer[section], importerName)) {
        productionPaths.push(
          ...findPaths(start, snapshots, lock.importers ?? {}, TARGET).map(
            (path) => ({
              importerName,
              section,
              path,
            }),
          ),
        );
      }
    }
    for (const start of dependencyRefs(
      importer.devDependencies,
      importerName,
    )) {
      developmentPaths.push(
        ...findPaths(start, snapshots, lock.importers ?? {}, TARGET).map(
          (path) => ({
            importerName,
            path,
          }),
        ),
      );
    }
  }

  if (productionPaths.length) {
    const path = productionPaths[0];
    return {
      ok: false,
      reason: `production dependency reaches ${TARGET}: ${path.importerName} ${path.section} > ${path.path.join(" > ")}`,
    };
  }
  if (!developmentPaths.length) {
    return {
      ok: false,
      reason: `no development dependency path reaches ${TARGET}`,
    };
  }
  for (const { importerName, path } of developmentPaths) {
    const allowed = ALLOWED_INTRODUCERS.some((prefix) =>
      path.some((entry) => entry.startsWith(prefix)),
    );
    if (
      importerName !== "apps/server" ||
      !allowed ||
      !path.includes("micromatch@4.0.8")
    ) {
      return {
        ok: false,
        reason: `development path is outside the approved tools: ${importerName} > ${path.join(" > ")}`,
      };
    }
  }
  return {
    ok: true,
    paths: developmentPaths.map(
      ({ importerName, path }) => `${importerName} > ${path.join(" > ")}`,
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const lockPath = process.argv[2];
  if (!lockPath) {
    console.error("Usage: check-osv-braces-scope.mjs <pnpm-lock.yaml>");
    process.exit(2);
  }
  const result = checkBracesScope(parse(fs.readFileSync(lockPath, "utf8")));
  if (!result.ok) {
    console.error(`SECURITY FAILED: braces exception scope: ${result.reason}`);
    process.exit(1);
  }
  console.log(
    "braces exception scope verified: dev-only paths through micromatch@4.0.8",
  );
  for (const path of result.paths) console.log(`  ${path}`);
}
