#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
//
// ENG-2509 — cell-lint rule #10: TENANT_MOVE.md's store inventory is
// machine-checked against the engine's declared datastores and the manifest
// DTO's own shape. A store declared in one place and missing from the other
// REDS this check. CI-time only — never imported from src/** (a contract
// check, not runtime code).
//
// Usage: node scripts/ci/tenant-move-coverage-check.mjs [path-to-doc]
//   (the optional path lets the DoD test drive a deliberately-incomplete
//   fixture doc and assert the check fails — rule #10's own RED proof).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const docPath = resolve(process.argv[2] ?? resolve(repoRoot, 'TENANT_MOVE.md'));
const dtoPath = resolve(
  repoRoot,
  'apps/server/src/orvex/http/dto/tenant-move-manifest.dto.ts',
);

const failures = [];

// ---------------------------------------------------------------------------
// 1. Parse the doc's machine-checked inventory table (between the markers).
// ---------------------------------------------------------------------------
let doc;
try {
  doc = readFileSync(docPath, 'utf8');
} catch {
  console.error(`tenant-move-coverage: cannot read ${docPath}`);
  process.exit(1);
}

const begin = doc.indexOf('<!-- tenant-move-inventory:begin -->');
const end = doc.indexOf('<!-- tenant-move-inventory:end -->');
if (begin === -1 || end === -1 || end <= begin) {
  console.error(
    'tenant-move-coverage: TENANT_MOVE.md is missing the machine-checked inventory markers (tenant-move-inventory:begin/end)',
  );
  process.exit(1);
}

const rows = doc
  .slice(begin, end)
  .split('\n')
  .filter((line) => line.trim().startsWith('|'))
  .slice(2) // header + separator
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .filter((cells) => cells.length >= 4)
  .map((cells) => ({ name: cells[1], kind: cells[2], pattern: cells[3] }));

if (rows.length === 0) {
  console.error('tenant-move-coverage: the inventory table has no rows');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. The DTO's own declared store kinds (parsed from the committed source so
//    the doc and the DTO cannot silently drift).
// ---------------------------------------------------------------------------
const dtoSource = readFileSync(dtoPath, 'utf8');
const kindsMatch = dtoSource.match(/@IsIn\(\[([^\]]+)\]\)/);
if (!kindsMatch) {
  console.error(
    `tenant-move-coverage: cannot find the store-kind @IsIn list in ${dtoPath}`,
  );
  process.exit(1);
}
const dtoKinds = new Set(
  kindsMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
);

for (const row of rows) {
  if (!dtoKinds.has(row.kind)) {
    failures.push(
      `doc row '${row.name}' declares kind '${row.kind}' which the manifest DTO does not accept (DTO kinds: ${[...dtoKinds].join(', ')})`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. The engine's declared datastores — every one of the four owned store
//    classes MUST be covered, and the specifically-named stores must appear.
//    (Informationally these mirror the health-probe connection set:
//    Postgres / Redis / Storage(S3) / Kafka.)
// ---------------------------------------------------------------------------
const requiredKinds = ['postgres', 'redis', 's3', 'kafka'];
for (const kind of requiredKinds) {
  if (!rows.some((r) => r.kind === kind)) {
    failures.push(`no '${kind}' store is declared in the doc inventory`);
  }
}

const requiredNamedStores = [
  { label: 'pages (postgres)', test: (r) => r.kind === 'postgres' && r.name === 'pages' },
  { label: 'orvex_page_meta (postgres)', test: (r) => r.kind === 'postgres' && r.name === 'orvex_page_meta' },
  { label: 'comments (postgres)', test: (r) => r.kind === 'postgres' && r.name === 'comments' },
  { label: 'attachments metadata (postgres)', test: (r) => r.kind === 'postgres' && r.name.startsWith('attachments') },
  { label: 'tenant-prefixed attachment blobs (s3, {tenant_id}/… prefix)', test: (r) => r.kind === 's3' && r.pattern.includes('{tenant_id}/') },
  { label: 'quota fast-counters (redis, quota:*)', test: (r) => r.kind === 'redis' && r.pattern.includes('quota:') },
  { label: 'outbox relay cursor (kafka, orvex_event_outbox)', test: (r) => r.kind === 'kafka' && (r.pattern.includes('orvex_event_outbox') || r.name.includes('outbox')) },
];
for (const req of requiredNamedStores) {
  if (!rows.some(req.test)) {
    failures.push(`required store missing from the doc inventory: ${req.label}`);
  }
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error('tenant-move-coverage: RULE #10 FAILED');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log(
  `tenant-move-coverage: OK — ${rows.length} declared stores cover all four owned store classes (postgres/redis/s3/kafka) and every required named store.`,
);
