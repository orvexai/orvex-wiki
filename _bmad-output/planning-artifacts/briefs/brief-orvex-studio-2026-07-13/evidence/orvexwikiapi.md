# orvexwikiapi — evidence digest

## 1. Mandate

orvex-wiki-api is the wiki's **composition/heavy tier**: a stateless **Go** service giving agents/programmatic clients (orvex-studio-mcp, docmost-cli/orvex-cli, future agents — **never** the human React client) one stable DfM-speaking surface over the wiki (`search/get/save/edit/list` over `{resource_type, locator}`). It owns DfM↔ProseMirror serialization (clean-room Go, `orvex-studio-lib/pkg/dfm`), block-patch orchestration with CAS, response shaping, and the served OpenAPI surface. It is explicitly an **extraction, not a construction**: everything heavy already runs live in the engine's `/api/orvex/*`; wiki-api starts as a byte-compatible facade and the composition behavior is re-homed out of the AGPL fork behind it (strangler pattern, no big-bang rewrite). Cited-ask is NOT here — that's orvex-studio-ai.

## 2. Inventory

- PRD: orvex-wiki-api (draft) — includes a further nested DRAFT amendment (FR-A24, dashboard graphs, appended 2026-07-09, unratified)
- Architecture: orvex-wiki-api (canonical) — but carries its own "Review tightening" addendum marked DRAFT/unratified
- Architecture Audit — SE-Arch review (2026-07-05) (canonical, but content is an unresolved review verdict "needs-tightening")

## 3. Decided vs draft

**Locked/canonical decisions (D-A1…D-A13, D-S8, D-S11, D-WF-1):**
- Go stack, stateless, no DB (D-A1/D-A11) — TS rejected because it existed only to reuse AGPL `@docmost/editor-ext`
- Consumers = agents only; React client stays on engine API (D-A2)
- Extraction/strangler, not rewrite (D-A3)
- Ask loop moved fully to orvex-studio-ai; wiki-api has no `ask` verb, is a write-only downstream of ai (D-A4→superseded by D-A12)
- Contract authored in orvex-studio-contracts, not wiki-api's served descriptor (D-A7)
- RATIFY/CONFIRM tokens stay engine-minted; wiki-api transports only (D-A8)
- Dual-surface Phase 0: byte-compatible `/api/orvex/*` proxy + draft `/v1` grammar (D-A9)
- No shaped-read body caching — "a cached allow decision by proxy" (D-A10)
- Clean-room Go serializer boundary, AGPL network-boundary-only reuse (D-A11) — "not legal advice... to be confirmed with counsel before prod"
- Doc-governance (drift + spec-gate) folds in from the fork, Linear-free grammar (D-S8/D-S11)

**Still draft / unresolved:**
- The Architecture page itself is `status: canonical` but contains an appended, explicitly unratified "Review tightening" section — i.e. the canonical page has known errors pending a human fold-in
- PRD's FR-A24 dashboard-graph amendment: draft, "Do NOT treat as canonical until ratified"
- 13 open questions (OQ-A2 through OQ-A13) including relocation pace, host form, CAS `ifVersion` representation, comment/attachment/audit-sink homes — all owner "Daniel," unresolved
- SE-Arch audit is itself status "canonical" but its verdict is "needs-tightening" (not a closed state)

## 4. API/contract surface

- Verb grammar: `search/get/save/edit/list` over `{resource_type, locator}`, wiki-only for now (`resource_type` vestigial for future types)
- Contract **authored** in orvex-studio-contracts (`openapi/wiki-api.yaml`); wiki-api's served `/v1/openapi.json` is a conformance/drift-gate input only, never codegen source
- Phase-0 surface (a): byte-compatible reverse proxy of engine's 322-path `/api/orvex/*` (base-URL repoint only, no regen)
- Phase-0 surface (b): draft `/v1` grammar served alongside, marked draft until contracts freeze
- CAS via `ifVersion` → `409 VERSION_MISMATCH`; verified read-after-write receipt `{url,id,version,persisted:true}` — even block-authoring writes, closing a prior contract-gap G4
- Error vocabulary frozen in contracts: `VERSION_MISMATCH`, `needs_human_*`, `QUOTA_EXCEEDED` (402), `RATIFY_*`/`GATE_UNSATISFIED`
- Contracts currently has **zero wiki-api entries** — "wiki-api is absent from the contracts seam inventory today (no wiki-api FR, no SEAMS.md entry)," blocking on contracts NFR-C4
- No ADR pages exist in the orvexwikiapi space at all despite several decisions meeting the ADR-worthy bar (finding B5)

## 5. Delivery state

- Real, tested Phase-0 code exists: "read-only clone... reviewed... 7 passing tests, full deploy tree, Tekton pipeline, Dockerfile" — a working transparent reverse proxy plus `internal/config`
- Phases 1–3 (verb grammar, block-patch, clean-room serializer, drift/spec-gate, response shaping) are **"designed but unbuilt"**
- Known Phase-0 architecture-vs-implementation drift, self-flagged as honest-state gaps:
  - Cache-evict subscriber and `/internal/events/evict` presented as live but the Trigger manifest is commented out and there's no handler ("falls to 404")
  - Redis is provisioned (`redis-claim.yaml`) but `config.RedisURL` is unread on the Phase-0 request path
  - `/healthz` backs both liveness and readiness with no dependency round-trips — "a degraded engine reads green"
  - Tekton pipeline builds/pushes the image **without running existing tests** — no go test/vet/lint/no-AGPL-import/parity gate in CI
  - `/healthz` only echoes `cell`, missing required `CLUSTER_NAME` per day-1 cell contract
  - Evict Trigger has no `orvexcell` cell-fail-closed guard
- Two named Phase-0 **exit blockers**: (1) engine must accept identity-minted tokens end-to-end (currently only HS256/APP_SECRET K4 keys); (2) contracts must author the wiki-api OpenAPI/grammar/schemas
- SE-Arch review verdict: "needs-tightening" — one HIGH finding (a "Redis→Kafka bridge" cited in the canonical arch page that canon says doesn't exist — actual mechanism is engine transactional-outbox → relay → studio-spine)

## 6. Gaps & tensions

- HIGH: architecture page asserts a non-existent "Redis→Kafka bridge"; contradicts family canon's outbox→relay mechanism (Principle 2) — fix drafted but not yet folded into the canonical body
- Host-form unpinned: architecture asserts `api.wiki.{cell}.orvex.dev` "per D-S5," but canon marks the form UNPINNED and the *actually shipped* HTTPRoute uses a different flat form (`wiki-api.orvex.ai`) — doc, canon, and deployed manifest all disagree
- Naming drift: arch page still says "orvex-studio-control" (renamed to "orvex-studio-console"); still names "docmost-cli" as the pkg/dfm embedder where canonical family CLI is "orvex-cli"
- No internal/ tier decomposition mapped to house CS §6 six-tier model
- Batch-atomicity invariant flagged as fragile: "decomposing batches into N engine calls would silently regress to partial-batch writes, which the golden corpus would not catch"
- R8c redaction relocation risk: if redaction lives in the composition layer being deleted in Phase 3, raw-primitive reads could resurrect unredacted paths — gated by a not-yet-run black-box redaction parity test
- AGPL boundary posture explicitly caveated: "Not legal advice — network-boundary posture to be confirmed with counsel before prod"
- Local in-repo architecture copy is stale (2026-07-03 revision) vs the 2026-07-05 wiki canonical — flagged as expected/wont-fix under wiki-first policy
- Contracts NFR-C4 threatens to block cutover forever absent the deltas being filed for wiki-api
