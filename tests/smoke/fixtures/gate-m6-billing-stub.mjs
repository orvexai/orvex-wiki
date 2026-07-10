#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.
//
// ENG-1572 gate-m6-e2e — SANCTIONED cross-service seam fixture for
// `orvex-studio-billing`'s `GET /v1/entitlements/{principal_type}/{principal_id}`
// (ENG-1431; contract: orvex-studio-contracts/billing/entitlements.schema.json,
// wire shape mirrored field-for-field in
// apps/server/src/orvex/entitlement/entitlement.types.ts).
//
// WHY A STUB, NOT THE REAL `orvex-studio-billing` SERVICE (doctrine: billing
// is an internal sibling, not a true-external — real infra is preferred):
// this job runs on `public-runners` — orvex-wiki's dedicated, deliberately
// UNPRIVILEGED runner group (see .github/workflows/ci.yml's header comment).
// public-runners have NO OpenBao/cluster reach BY DESIGN, because orvex-wiki
// is the family's only PUBLIC repo and untrusted public/fork PRs must never
// touch org secrets. Booting real billing needs its own Postgres + Stripe
// test-mode keys minted via OIDC->OpenBao — exactly the reach this runner
// group is walled off from. That wall is a deliberate security boundary,
// not an incidental gap, so running real billing IN THIS JOB would mean
// punching a hole in it. The sanctioned seam here is therefore a fixture
// double confined to the one read endpoint the chokepoint calls, never a
// live sibling.
//
// NOT FABRICATED DATA: this is the SAME committed-catalog-replay shape and
// cap value already ratified in this repo for exactly this scenario —
// `apps/server/src/orvex/entitlement/entitlement-write-chokepoint.integration.spec.ts`'s
// `REPLAYED_PAGE_CAP = 2` / `replayedCatalog()`, which that spec's own
// doc comment records as "a committed replay of a real
// `GET /v1/entitlements/{principal_type}/{principal_id}` catalog response
// shape ... the billing HTTP seam is the true-external being replaced by
// the committed fixture (CS §5 true-external)". This file reuses that same
// pinned shape and cap over real HTTP, for the E2E gate's real running
// engine to call.
//
// Serves the SAME catalog for every {principal_type}/{principal_id} — AC3
// only needs a small, deterministic page quota to trip 402 quickly; it
// asserts nothing about plan differentiation (that is ENG-1431's contract,
// not this gate's).

import http from 'node:http';

const PORT = process.env.GATE_M6_BILLING_STUB_PORT
  ? Number(process.env.GATE_M6_BILLING_STUB_PORT)
  : 18080;

// Field-for-field mirror of entitlement.types.ts's EntitlementCheckResponse,
// pinned to entitlement-write-chokepoint.integration.spec.ts's
// REPLAYED_PAGE_CAP (never a value invented for this file).
const REPLAYED_PAGE_CAP = 2;

function catalog() {
  return {
    plan: 'free',
    plan_version: 'v1',
    features: ['ask_wiki'],
    caps: {
      ai_monthly_budget_gbp: 0,
      embedding_monthly_budget_gbp: 0,
      curator_distillation_monthly: 0,
      trial_weekly_actions_advisory: 0,
      trial_weekly_actions_throttle: 0,
      demo_ai_actions: 20,
      wiki_max_pages: REPLAYED_PAGE_CAP,
      wiki_storage_bytes_aggregate: 1_000_000_000,
      wiki_max_file_bytes: 10_000_000,
      wiki_max_files: 2000,
      wiki_max_members: 25,
      wiki_history_retention_versions: 10,
      wiki_history_retention_days: 180,
    },
    trial: { state: 'none' },
    throttle: { state: 'none' },
    version: 'entitlement-v1',
    evaluatedAt: new Date().toISOString(),
  };
}

const ENTITLEMENT_RE = /^\/v1\/entitlements\/[^/]+\/[^/]+$/;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && ENTITLEMENT_RE.test(req.url ?? '')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(catalog()));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`gate-m6-billing-stub listening on 127.0.0.1:${PORT}`);
});
