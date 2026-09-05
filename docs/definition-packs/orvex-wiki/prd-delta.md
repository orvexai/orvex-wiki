---
ticket: ENG-2103
slug: orvex-wiki-prd-delta
space: orvexwiki
doc_type: prd
status: draft
---

# PRD delta — orvex-wiki Wave 3

## 1. Purpose and authority

This delta reconciles the Wave-3 brief and concept-to-service allocation with
the historical PRD `EPsdD7uK8e`, architecture `twQ3BBzpTE`, the local
`project-context.md`, and the live repository. The live repository wins over a
stale maturity claim. The historical PRD is superseded by the 2026-07-15
delta evidence, so it remains a cited baseline, not a license to reopen settled
engine seams.

Added requirements are cited in every row below. No uncited requirement is
introduced by this mirror.

| Delta requirement | Reconciliation and owner | Evidence |
| --- | --- | --- |
| Thin UI AI affordances remain UI-only SSE readers | Keep the engine free of prompting, model, MCP, and composition logic; satellite owner is `orvex-studio-ai` or `orvex-wiki-api` as applicable | Brief `rgBOQh31p3`; PRD `EPsdD7uK8e` FR-W18c; architecture A-THIN |
| Quota enforcement and usage read | Engine owns the write chokepoint and the `402 QUOTA_EXCEEDED` vocabulary; billing owns entitlement values | Brief `rgBOQh31p3`; architecture A-QUOTA; local `entitlement/` implementation |
| Tenant move | Freeze the typed four-step contract as a day-1 501 surface; implementation ownership remains a later wave | Evidence `orvexwiki.md` §4; architecture A-MOVE |
| Source availability | Canonical wire shape is one `GET /api/orvex/source` returning `{sha, sourceRepo}` from build configuration; URL and mirror authority remain a launch gate | PRD `EPsdD7uK8e` FR-W19; evidence `orvexwiki.md` §6; local source controller |
| Event publication | Domain mutations write the Postgres transactional outbox; the relay publishes CloudEvents directly to Kafka `studio-spine` | `project-context.md` D-S12/D-S13; local outbox writer and relay |
| DfM interchange | The AGPL TypeScript serializer is engine-only. Closed satellites use the Go twin or call `orvex-wiki-api` | Architecture A-SEAMS; ADR-0035 `QbEBPuKcGR`; local import guard |

## 2. Thin-engine scope

The engine fork is limited to the frozen upstream inline-edit ledger plus
additive `apps/server/src/orvex/*` modules. Composition, verb grammar, cited
asks, search, and orchestration belong to `orvex-wiki-api` or their named
satellite owners. The build prompt must not add a second engine write path.

The local ledger at `fr30/allowlist.json` has the original 13-row class and
later named hardening/signature entries. Its current row count is therefore a
reconciliation item, not evidence that the Wave-3 pack may edit arbitrary
upstream files. The FR-30 owner must confirm the exact post-activation ledger
before contract freeze.

## 3. Live baseline folded into the delta

- `orvexApplyOps` is a real atomic write primitive when modules are enabled.
- `orvexGetQuota` is a real usage-vs-cap read and never fabricates zero usage.
- `orvexSessionExchange` and `orvexSourceOffer` are real routes.
- Registry cell move is a real extension; bulk quiesce/export/import/activate
  remain typed 501s.
- The outbox writer and Kafka relay are implemented locally.
- Transaction-scoped RLS and the physical page-meta migration remain open and
  must not be reported as complete.

These statements are code observations, not a percentage-complete claim.

## 4. Must-resolve before freeze

- [ ] **Source-offer authority:** the delivery orchestrator and contracts owner
  must ratify the single public repository URL and SHA provenance. The local
  endpoint shape is fixed; this mirror does not choose between conflicting
  external URLs.
- [ ] **Contract freeze:** `orvex-studio-contracts` owner must pin the M8
  operations, CloudEvents, and golden fixtures under ADR-0008.
- [ ] **DfM boundary:** contracts review must encode engine-only AGPL import
  and the Go-twin/wiki-api alternatives.
- [ ] **Session exchange fold-in:** the engine owner must keep the current
  identity introspection and provisioning behavior as the contract is tagged.
- [ ] **Allow-list reconciliation:** FR-30 owner must confirm the 13-row
  stability class versus later named ledger additions.

No unresolved item is silently selected by this draft.
