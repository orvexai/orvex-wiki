# Phase-0 Program Status — Orvex Studio Delivery Program

**Date:** 2026-07-13 · **Compiled from:** `rebaseline/` (6 surfaces + cross-cutting), `adrs/`, `amendments/`
**Scope tickets:** ENG-2033 (six-surface acceptance re-baseline), ENG-2035 (P0 ADR set), ENG-2036 (billing/ai pricing supersessions)

## TL;DR

- **Re-baseline verdict: 1 PASS / 5 FAIL / 1 BLOCKED (7 surfaces).** Only `api` is a clean end-to-end pass. The program's "94%-Done" tracking state is **not** proven-working.
- **Dominant root cause = a single engine-instability cluster** (D1) plus a **split-engine environment fault** (D16): the surfaces are not even all pointing at the same engine build. Most FAILs are downstream of these two.
- **Two engine builds in play.** `api/mcp/ai/rag/knowledge-sync` exercise the **modules engine** (`orvex-wiki-dev`, `ENGINE_URL`), which flaps/hangs. `cli/cross-cutting` reach the **legacy CLERK_TENANCY monolith** (`docmost-dev`, `dev-docmost…/api/*`) with `ORVEX_MODULES_ENABLED` off cluster-wide — so quota, session-exchange seam, and single-host fan-out are structurally un-exercisable there.
- **ADRs 0033/0034/0035 authored, reviewed (REVISE/SOUND), fixes applied** — all three still **draft, pending human doc-ratify.**
- **ENG-2036 pricing amendments landed** in the two draft PRDs; contracts-shape update + human ratify remain.

---

## 1. Re-baseline verdict table

| Surface | Status | One-line finding | Evidence file |
|---|---|---|---|
| **api** (`/v1` verb grammar) | **PASS** | save/get/block-patch edit + ifVersion CAS (409-on-stale, receipt-on-fresh)/list all exercised end-to-end through the engine chokepoint on a fresh tenant with a real token. | `rebaseline/api.md` C0–C5 |
| **mcp** (`/mcp` Streamable-HTTP) | **FAIL** | Mandated mission passes (init + real token + `save_page create` + read-back), but **modify-existing writes (`save_page update`, `edit`) 502 on a healthy engine** and tool parity is **19/73 (26%)**. | `rebaseline/mcp.md` Checks F/G, DEFECT-1/2/3 |
| **cli** (`docmost-cli` DfM) | **FAIL** | DfM markdown write is **not** byte-faithful: **all list-item text silently dropped**, table cells truncated at unescaped `\|`. CLI talks to the **legacy `/api` engine, not `/v1`**. (nested-bold+code corruption **disproven**.) | `rebaseline/cli.md` Checks A–D, DEFECT-1/2/3 |
| **ai** (cited-ask + inline) | **FAIL** | Contract mechanics (edge-auth, K5 envelope, delegation, no-leak) work, but **zero citations** (empty corpus) and **inline writeback unconfirmed** (flapping chokepoint). 2 ai-side error-mapping defects. | `rebaseline/ai.md` Checks B/D/E, DEFECT-ENG-1/KNOW-1/AI-1/AI-2 |
| **rag** (Turbopuffer hybrid) | **FAIL** | Tenant-isolation + ACL∩scope filtering **verified PASS** on real data (2 callers → different hits), but `/v1/query` **leaks each hit's raw 1024-dim embedding** (27× bloat) and keeps `TestM5KnowledgeE2E` RED. | `rebaseline/rag.md` Checks 1–5, DEFECT-RAG-1 |
| **knowledge-sync** (outbox→Kafka→index) | **FAIL** | Create path traced end-to-end (~33.6 s, needle embedded), but **content_updated write hangs**, failed events **don't self-heal**, **BM25 leg disabled** (vector-only), closing gate **RED in CI + absent from main**. | `rebaseline/knowledge-sync.md` Checks D–H, DEFECT-1..5 |
| **cross-cutting** (identity/quota/ingress) | **FAIL** (1 seam PASS, 1 BLOCKED, 1 FAIL) | identity exchange **fail-closed PASS** (on `/api/clerk/exchange` lineage); **quota 402 BLOCKED** (modules off, billing unwired → unbounded writes); **single-host ingress FAIL** (`/api/ai`+`/mcp` served by monolith, satellites on separate subdomains). | `rebaseline/cross-cutting.md` Seams 1–3, DEFECT-1/2/3 |

---

## 2. Deduplicated defect list (ready to file)

Root-cause clusters are merged across surfaces. IDs are local to this report.

| ID | Title | Evidence pointer | Suspected owner service | Priority |
|---|---|---|---|---|
| **D1** | **Engine dev-cell instability cluster** — `/api` router wedges, readiness `/api/health` hangs → endpoint-less Service (502 UPSTREAM_UNAVAILABLE); replicas bind `127.0.0.1:3000` only; log `Cannot find module './ee/ee.module'`; continuous ReplicaSet churn (~10-min re-rolls). Dominant root cause behind ai/knowledge-sync FAIL and api/mcp transients. | api §Obs1 / DEFECT-api-obs-1; mcp DEFECT-3; ai DEFECT-ENG-1; knowledge-sync DEFECT-1 | **orvex-wiki engine** (liveness/bind/`ee.module`) + **platform GitOps/image-updater** (churn) | **P0 / blocker** |
| **D2** | Engine DfM→PM **update/block-patch path 502s** on modify-existing writes (`/api/pages/update`, `/blocks/patch-string`); log "Unknown node type: undefined / Stripping unknown node types". Create path works. | mcp DEFECT-2 | orvex-wiki engine (DfM→PM coercion); 2nd: orvex-studio-mcp serialization | P0 / high |
| **D3** | Engine **apply-ops content-replace hangs indefinitely** (`/api/pages/update {replace,format:json}` → HTTP 000 @30 s, no log); blocks `wiki.page.content_updated`. (Related to D2 — engine update-path fragility.) | knowledge-sync DEFECT-3 | orvex-wiki engine (`orvex/page-blocks/apply-ops`) | P1 |
| **D4** | Engine **DfM ingestion drops ALL list-item text** on create/update (bullet+ordered → empty listItems); sibling converter `/api/markdown/to-prosemirror` is correct → two divergent converters. | cli DEFECT-1 | orvex-wiki engine (DfM markdown ingestion) | P1 |
| **D5** | DfM/markdown **table cell truncated at unescaped `\|`** (incl. inside code span); overflow + code mark dropped. Present in **both** converters. | cli DEFECT-2 | orvex-wiki engine (GFM table tokenizer) | P2 |
| **D6** | CLI `create/update --content @md` **does not trip the EMBED_DEGRADATION guard** that `page patch` trips → silent-corruption path. | cli DEFECT-3 | docmost-cli (client-side pre-send guard) | P3 |
| **D7** | `/v1/query` **leaks each hit's raw 1024-dim embedding vector** (over-exposure + 27× bloat: 26 KB vs 981 B for 2 hits); truncates the M5 gate body mid-number → gate RED. | rag DEFECT-RAG-1 | orvex-studio-knowledge (hero search path) | P1 / high |
| **D8** | **Hybrid BM25/keyword leg disabled** — Turbopuffer namespace `text` attribute not FTS-indexed → BM25 returns 400; "hybrid" is vector-only. | knowledge-sync DEFECT-4 | orvex-studio-knowledge (Turbopuffer namespace schema/upsert) | P1 |
| **D9** | **Knowledge corpus = 112 un-extracted registry stubs** (0 chunks/titles across 58 tenants) → cited-ask can never cite. Root: engine ResolveBody refused (D1) + several event pipelines "not implemented (scaffold)". | ai DEFECT-KNOW-1 | orvex-studio-knowledge (indexer) + engine dependency (D1) | P0 (ai surface) |
| **D10** | **Index-ingest failures not recovered** — indexer drops page events that fail body-resolve; no redelivery/DLQ self-heal after engine recovers (one doc permanently absent). | knowledge-sync DEFECT-2 | orvex-studio-knowledge (indexer offset-commit/retry) | P1 |
| **D11** | **`TestM5KnowledgeE2E` RED in CI (12/12) and ABSENT from `main`** (dev 73 commits ahead). RED root = D7 query-decode; masked by a 4096-byte `LimitReader` in the harness. | knowledge-sync DEFECT-5 + rag "observed" note | orvex-studio-knowledge (gate green-path + merge-to-main coverage gap) | P1 |
| **D12** | ai `/api/ai/ask` returns **500 INTERNAL for an authenticated token with no `workspace` claim** (empty principal → billing 404 masked); should be 400/403 or free-tier degrade. | ai DEFECT-AI-1 | orvex-studio-ai | P2 |
| **D13** | ai `/api/ai/inline` **maps a permission DENIAL (can-edit 404) to HTTP 500 UPSTREAM_ERROR** instead of clean 403/404. | ai DEFECT-AI-2 | orvex-studio-ai | P2 |
| **D14** | **Quota 402 QUOTA_EXCEEDED chokepoint inert** on dev cell — `ORVEX_MODULES_ENABLED` off cluster-wide + billing unwired → unbounded writes; the frozen 402 contract is un-exercisable. | cross-cutting DEFECT-1 | orvex-wiki engine deploy overlay (enable modules + wire `ORVEX_BILLING_API_URL`) + orvex-studio-billing | P1 |
| **D15** | **Single-host ingress does not hide the split** — client host serves `/api/ai` + `/mcp` from the monolith; satellites only on separate subdomains; no path fan-out. | cross-cutting DEFECT-2 | ingress/gateway + orvex-wiki-api (single-host router) | P1 |
| **D16** | **Dev cell runs the CLERK_TENANCY monolith fork, not the thin-AGPL + orvex-modules build** — `/api/orvex/session/exchange` seam module 404s; CLI also binds this legacy `/api` engine, not `/v1`. Blocks a faithful re-baseline of the session-mint/quota/ingress seams **and** the cli `/v1` acceptance. | cross-cutting DEFECT-3 + cli program-observation | platform/deploy (which engine image + flags the dev cell should run) | P1 (environment meta-blocker) |

**Filing note:** D1 and D16 are the two environment/config meta-blockers; several code defects (D9, D14, D15, and the ai/knowledge FAILs) cannot be re-tested to green until they clear. File D1 + D16 first.

---

## 3. ADR status (ENG-2035)

All three authored as **draft**, `doc_type: adr`, space `orvexstudioarch`, under "Decision Records — Orvex Studio" (`32Huug8U4B`). Adversarially reviewed (`review-findings.md`); every confirmed finding applied in place via `--if-version` CAS (`fixes-applied.md`).

| ADR | Title | Wiki slug / URL | Review verdict | Fixes applied |
|---|---|---|---|---|
| **ADR-0033** | Work-claim arbiter — ratify Linear-status-as-claim under G1–G4 guardrails + Temporal-CAS trip-wire | `yNFx3YyNap` · https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/yNFx3YyNap | **REVISE** | F33-1: mid-run lease rekeyed on a concrete engine-owned live-handle table (not `updatedAt`), reclaim gated on 3 conditions; dropped the contradictory `claimedIds` backstop. F33-2: G2 reworded to "single **authoritative** writer" (GitHub auto-close = known non-authoritative, P1-reverted). |
| **ADR-0034** | Credential lanes — deny-by-default per-lane allow-list, mint-scoped-ephemeral | `12aDkq4iOd` · https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/12aDkq4iOd | **REVISE** | F34-1: added **interim rule** (scoped short-TTL raw key legal until the `orvex-studio-ai` broker ships); reframed as **partial reversal** of the 2026-07-07 amendment; ADR now explicitly supersedes orchestrator-prompt §2.3 refuse-gate. F34-2: fixed Houston-vs-Studio ADR-0009 mis-citation. F34-3: softened §2 "never blocked" → never-block-the-run. |
| **ADR-0035** | Go↔TS contract/client bridge — per-repo codegen from pinned seams | `QbEBPuKcGR` · https://docs.eu-central-1.myidp.cloud/s/orvexstudioarch/p/QbEBPuKcGR | **SOUND** (revise notes) | F35-1: consumer regen diff reframed as **downstream** confirmation of a break classified at the contracts repo (not the §9 gate). F35-2: §6 cross-references §3 draft/pinned rule. F35-3: dropped license-collision strawman. F35-4: ADR-0029 relabeled "canonical"→"draft". |

**Cross-cutting fix:** ADR-0029 (`WZWmazrlS0`) relabeled canonical→**draft** wherever cited (0034/0035).

### Reconciliation state (drift-correction revisions — prepared, NOT applied)

| Target | State | Note |
|---|---|---|
| Orchestrator Prompt — Delivery (`gkkUDzn277`) §2 | **Revision prepared**, not applied (canonical page) | `reconcile-orchestrator-prompt.md`. **Conflict flagged:** its §2.3 restatement still carries the **old hard refuse-gate**, which ADR-0034 reverses. ADR-0034 now explicitly supersedes it, but the reconcile doc text must be corrected to the allow-list model **before** any co-ratify or canon self-contradicts. |
| Contracts canon (`o2waDNw3ix`) §T1 | **Revision prepared**, not applied (canonical page) | `reconcile-contracts-canon.md`. Replaces "OPEN DECISION #1 / draft position, pending ADR-0001" with "settled by ADR-0008"; rollup rows still cite the never-filed `ADR-0001`. Residual follow-up: name the human ratifier (`OQ-C1`). |
| Registry index + ratify the 3 ADRs | **Not done** | All three ADRs remain draft; promotion is human-gated doc-ratify. |
| lib MultiIssuerVerifier build plan | Out of scope here | Carried by ENG-2037 lib definition pack (mini-ADR only if the pack review demands one). |

---

## 4. Pricing amendments status (ENG-2036)

Both target PRDs were **draft**, so amended **in place** (section-scoped, PM-JSON surgery, `--if-version` CAS); no status changed; no canonical page in scope → no revision files. Source: `amendments/summary.md`.

| Page | Space / status | State | Passages amended |
|---|---|---|---|
| billing PRD `Blcvui4UIn` | `orvexstudiobilling` / **draft** (unchanged) | **Amended in place** | In-short, FR-B7, FR-B8, FR-B10, FR-B13, FR-B14, FR-B16, OQ-B11, D-B7, new D-B13, Change-log |
| ai PRD `pbKI3BpQmY` | `orvexstudioai` / **draft** (unchanged) | **Amended in place** | G1, FR-AI12, FR-AI13, FR-AI16, FR-AI23, NFR-AI4, Rollout step 1, billing-dependency row, OQ-AI2, D-AI11, new D-AI12, Change-log |

**Rulings applied:** (1) Free 10-lifetime-action AI trial → SUPERSEDED by free-tier cost doctrine (~zero-cost AI free forever, no frontier in Free, no action count; frontier-taster reopened for PRD); (2) card-required 7-day trial → SUPERSEDED (no card; standard free month that downgrades to Free at month-end). GBP7/GBP70/Free caps unchanged.

**Verification:** both pages re-fetched server-side; full text byte-identical to intent; mark inventories match; table node counts unchanged (2→2). ai `EMBED_DEGRADATION` warning confirmed false-positive (run-coalescing).

**Pages amended vs revisions-prepared-for-ratify:** 2 pages **amended in place** (draft); **0 canonical-page revision files** prepared (none in scope). Human ratification of both draft PRDs is still pending.

**Remaining ENG-2036 DoD:** update billing/ai entitlement + cap contract shapes (Definition Factory pack); human-ratify both drafts (draft→canonical).

---

## 5. DoD tick recommendations

### ENG-2033 — six-surface acceptance (8 boxes)

| DoD checkbox | Recommendation | Evidence line |
|---|---|---|
| **api** — /v1 save→get→block-patch edit w/ ifVersion (409 on stale; receipts; write via chokepoint) | ✅ **TICK** | `api.md`: C1 save receipt `{url,id,version,persisted:true}`; C3 fresh→v3 / stale→409 VERSION_MISMATCH; C5 read-back via engine `/internal/pages/{id}/export` + `orvex_page_meta.version=3`. |
| **mcp** — real page mutation via a tool over /mcp, fan-out to REST clients | ❌ **STAY UNTICKED** | Create works (`mcp.md` Check F) but modify-existing writes 502 (Check G, D2) and fan-out is 19/73 tools (Check D, D1-mcp). Core write verb `edit` non-functional. |
| **cli** — byte-faithful DfM round-trip through /v1 (edit-path corruption disproven) | ❌ **STAY UNTICKED** | `cli.md` A/B: list-item text 100% dropped (D4); C3 table truncation (D5); path is legacy `/api`, not `/v1` (D16). Two independent failures + wrong engine. |
| **ai** — cited-ask returns real citations w/ delegated token; inline writeback via chokepoint; ACL respected | ❌ **STAY UNTICKED** | `ai.md` B/D: 0 citations (empty corpus D9); E: inline writeback UNCONFIRMED (flapping chokepoint D1). Only the abstention/no-leak posture is proven. |
| **rag** — hybrid query returns tenant-namespaced, ACL∩scope filtered results (two callers → different hits) | ⚠️ **STAY UNTICKED** (sub-claim genuinely proven — see note) | The **isolation+ACL-differential sub-claim IS proven**: `rag.md` Check 2 (ownerA 2 hits / ownerB 1 hit / no cross-leak) + Check 3 (scopedA 0 hits, same tenant). **But** the endpoint fails integrity (D7 embedding leak) and "hybrid" is vector-only (D8), and the canonical gate is RED — so the surface is not a clean pass. Recommend tick **only** once D7/D8 clear; record the ACL sub-claim as independently verified. |
| **knowledge-sync** — mutation→outbox→Kafka→indexed→searchable w/ trace; TestM5KnowledgeE2E green on merged code | ❌ **STAY UNTICKED** | Create path traced (`knowledge-sync.md` Check D, offset 863, needle embedded) — but content_updated hangs (D3), no self-heal (D10), BM25 disabled (D8), and the gate is RED in CI + **absent from main** (D11). "green on merged code" is impossible today. |
| **cross-cutting** — identity fail-closed on wrong key/iss/aud; 402 on REST+collab; single-host = zero client URL change | ❌ **STAY UNTICKED** | identity fail-closed PASS (`cross-cutting.md` Seam 1) but on the Clerk-tenancy `/api/clerk/exchange`, not the split seam module (D16); quota 402 BLOCKED (D14); single-host FAIL (D15). 2 of 3 seams not demonstrable. |
| **one defect ticket per failure; evidence report attached; PO observed + signed off** | ❌ **STAY UNTICKED** | Evidence reports exist (`rebaseline/*.md`); defect stubs drafted (this §2) but **not yet filed as tickets**, and PO observation/sign-off not recorded. |

**ENG-2033 genuinely tickable now: 1 of 8 (api).** The rest are gated on D1/D16 (environment) plus surface-specific code defects.

### ENG-2035 — P0 ADR set (7 boxes)

| DoD checkbox | Recommendation | Evidence line |
|---|---|---|
| **ADR-0033** authored | ✅ **TICK** | Draft `yNFx3YyNap`, full Context/Decision/Consequences/References, reviewed REVISE → F33-1/F33-2 applied (`fixes-applied.md`). |
| **ADR-0034** authored | ✅ **TICK** | Draft `12aDkq4iOd`, reviewed REVISE → F34-1/2/3 applied. |
| **ADR-0035** authored | ✅ **TICK** | Draft `QbEBPuKcGR`, reviewed SOUND → F35-1/2/3/4 applied. |
| Orchestrator Prompt §2 reconciliation (revision + comment) | ❌ **STAY UNTICKED** | Revision prepared (`reconcile-orchestrator-prompt.md`) but its §2.3 still carries the old refuse-gate that ADR-0034 reverses — must be corrected before ratify; canonical page not yet updated. |
| Contracts-space canon cites ADR-0008 | ❌ **STAY UNTICKED** | Revision prepared (`reconcile-contracts-canon.md`) but not applied; canonical page still cites the never-filed ADR-0001 in its rollup. |
| lib MultiIssuerVerifier build plan | ➖ **N/A here** | Explicitly carried by ENG-2037; no artifact produced in this pass. |
| Registry index updated; new ADRs ratified | ❌ **STAY UNTICKED** | All three ADRs remain draft; doc-ratify is human-gated and not done. |

**ENG-2035 genuinely tickable now: 3 of 7 (the three ADR-authored boxes).**

### ENG-2036 — pricing supersessions (4 boxes)

| DoD checkbox | Recommendation | Evidence line |
|---|---|---|
| billing canon pages amended (draft revisions) | ✅ **TICK** | `Blcvui4UIn` amended in place — FR-B7/B8/B10/B13/B14/B16, D-B7, new D-B13; server PM re-verified byte-identical (`amendments/summary.md`). |
| ai PRD FR-AI12 amended (draft revision) | ✅ **TICK** | `pbKI3BpQmY` FR-AI12 rewritten to model-class allowlist (frontier 402/paid-only, zero-cost uncounted); `ai:calls:{tenant}` counter retired; verified. |
| contracts entitlement/cap shapes updated to match | ❌ **STAY UNTICKED** | Explicitly out of scope of the amendment task; still owed to the Definition Factory contracts pack. |
| all amendments human-ratified | ❌ **STAY UNTICKED** | Both pages remain draft; ratification is human-gated and not performed. |

**ENG-2036 genuinely tickable now: 2 of 4 (both amend boxes).**

---

## 6. Next actions (ordered)

1. **File the two environment meta-blockers first — D1 (engine instability) + D16 (wrong engine build on the dev cell).** These gate re-testing of ai, knowledge-sync, cross-cutting, cli and the api/mcp transients. D16 in particular means the dev cell must run the thin-AGPL + `ORVEX_MODULES_ENABLED=true` build for the seams to exist at all.
2. **File the remaining 14 defect stubs** (§2 D2–D15) from the surface reports, most-severe first (D2, D7, D9, D14, D15 next), one ticket per failure — closing the last ENG-2033 DoD box's "one defect ticket per failure" requirement.
3. **Tick the genuinely-satisfiable boxes now:** ENG-2033 api (1); ENG-2035 ADR-0033/0034/0035 authored (3); ENG-2036 both amend boxes (2). Leave all others unticked per §5.
4. **Correct `reconcile-orchestrator-prompt.md` §2.3** to the ADR-0034 allow-list model **before** any doc-ratify pass, so canon does not self-contradict; then run **human doc-ratify** for ADR-0033/0034/0035 + the two reconciliation revisions + the two ENG-2036 draft PRDs in one gated pass.
5. **Wire the dev cell for quota (D14):** enable `ORVEX_MODULES_ENABLED` + `ORVEX_BILLING_API_URL` on the engine overlay so the 402 QUOTA_EXCEEDED contract becomes exercisable; then re-run cross-cutting Seam 2.
6. **Land the M5 gate green path (D7 + D11):** strip `Hit.Vector` from the hero `/v1/query` response (and/or gate on `IncludeVectors`), bump the harness `LimitReader`, then get `TestM5KnowledgeE2E` green **and merged to main** (currently dev-only, 73 commits ahead).
7. **Re-run the failed surfaces (mcp/ai/rag/knowledge-sync/cli/cross-cutting) against a stable, correctly-built engine**, human-observed, to convert them from FAIL to a real acceptance pass — the actual bar for ENG-2033 sign-off.
8. **ENG-2036 residual:** update the billing/ai entitlement + cap contract shapes to match the ratified pricing before the Definition Factory contracts pack freezes.
