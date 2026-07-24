// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * ENG-2377 T4 — loads the vendored, pinned snapshot of
 * orvex-studio-contracts' gates/entitlements/ corpus (see gates/PIN for the
 * exact commit SHA). Vendored here as JSON (source-of-truth in
 * orvex-studio-contracts is YAML; this repo introduces no new
 * js-yaml/yaml dependency for this Issue — see gates/manifest.json's own
 * $comment) — same case IDs, same content, JSON-converted losslessly from
 * the committed YAML, never hand-re-authored.
 *
 * Mirrors orvex-studio-lib/pkg/entitlements/gates_loader.go's own
 * vendoring precedent on the Go side.
 */

import * as fs from 'fs';
import * as path from 'path';

const GATES_DIR = path.join(__dirname, 'gates');
const PIN_SHA_RE = /^[0-9a-f]{40}$/;

/** Returns the pinned orvex-studio-contracts commit SHA (gates/PIN). */
export function gatesCorpusPin(): string {
  const raw = fs.readFileSync(path.join(GATES_DIR, 'PIN'), 'utf-8').trim();
  if (!raw) {
    throw new Error('entitlement-gates-loader: gates/PIN is empty');
  }
  if (!PIN_SHA_RE.test(raw)) {
    throw new Error(
      `entitlement-gates-loader: gates/PIN must be a 40-hex-char commit SHA, got ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

export interface GatesManifest {
  cases: string[];
  ac_map: Record<string, string>;
  route: string;
  response_schema: string;
  staleness_bound_seconds: number;
}

export function loadGatesManifest(): GatesManifest {
  const raw = fs.readFileSync(path.join(GATES_DIR, 'manifest.json'), 'utf-8');
  return JSON.parse(raw) as GatesManifest;
}

export interface BillingServerSpec {
  behavior: string;
  response?: unknown;
  assert_request_path?: string;
  assert_request_path_must_not_contain?: string;
}

export interface FixtureStep {
  action: string;
  at_clock_offset_seconds?: number;
  feature?: string;
  expect?: Record<string, unknown>;
}

export interface PrincipalSpec {
  principal_type: 'user' | 'org';
  principal_id: string;
  note?: string;
}

export interface GateCase {
  id: string;
  description: string;
  principal?: PrincipalSpec;
  caller_principal?: PrincipalSpec;
  acting_for_principal?: PrincipalSpec;
  billing_server: BillingServerSpec;
  steps: FixtureStep[];
}

/** Reads and parses one vendored gates/<file>.json fixture case. */
export function loadGateCase(file: string): GateCase {
  const raw = fs.readFileSync(path.join(GATES_DIR, file), 'utf-8');
  return JSON.parse(raw) as GateCase;
}

/** Loads every case listed in the vendored manifest, in manifest order. */
export function loadAllGateCases(): GateCase[] {
  const manifest = loadGatesManifest();
  return manifest.cases.map(loadGateCase);
}
