# Evidence map — orvex-wiki-api wiki canon (space `orvexwikiapi`)

Compiled 2026-07-17. Source: `docmost-cli cache sync --space orvexwikiapi` (8 pages, 0 updated —
cache was already warm) + `docmost-cli page get <slug> --no-daemon` per page + a live reality-probe
against `/home/daniel/repos/orvex-wiki-api` and `/home/daniel/repos/orvex-studio-contracts` (both
present as local clones on this machine).

**Bottom line up front:** the wiki canon for orvex-wiki-api is unusually rigorous — three of the
eight pages (PRD-delta, Contract Summary, SDD dated 2026-07-15, plus a Build Prompt) are themselves
adversarial evidence-audits that already correct earlier stale claims and catalogue 7 explicit
**Must-Resolve (MR-A1..A7)** blockers. But even this canon has a live drift gap: **the wiki-api repo
and the contracts repo both shipped material changes on 2026-07-16 that none of the 8 wiki pages
reflect**, even though two pages (Architecture, SDD) show `updated_at` timestamps *later* the same
day. See §4.

---

## 1. Page inventory

| Slug | Title | Status | doc_type | Parent | Updated (UTC) |
|---|---|---|---|---|---|
| `pG9s9OjqZA` | Architecture: orvex-wiki-api | **canonical** | architecture | (root) | 2026-07-16T22:07:51Z |
| `yB3U1Ui0Zc` | Architecture Audit — SE-Arch review (2026-07-05) | canonical | retrospective | pG9s9OjqZA | 2026-07-12T16:16:17Z |
| `8jAiCBifDW` | PRD: orvex-wiki-api | **superseded** (by `RPduIa4x9Y`) | prd | (root) | 2026-07-15T21:20:52Z |
| `RPduIa4x9Y` | orvex-wiki-api — PRD-delta (Wave 3) | draft | prd | (root) | 2026-07-15T21:20:53Z |
| `fJogMGcbBb` | orvex-wiki-api — Contract Summary (Wave 3) | draft | technical-spec | (root) | 2026-07-15T18:37:31Z |
| `5NTAkEn8KZ` | orvex-wiki-api — Build Prompt (Wave 3) | draft | technical-spec | (root) | 2026-07-15T18:37:30Z |
| `XS7DetLXAH` | orvex-wiki-api — Service Done Definition / SDD (Wave 3) | draft | technical-spec | (root) | 2026-07-16T20:52:08Z |
| `fwHouFgtIh` | orvex-wiki-api — Test Plan (Wave 3) | draft | technical-spec | (root) | 2026-07-15T18:37:34Z |

Note on `--include-superseded`: the default `page list` (no flag) returns only 7 pages — it silently
drops `8jAiCBifDW` (status=superseded, `superseded_by: RPduIa4x9Y`). The initial `cache sync` log
said "8 pages listed" (correct); the default `page list --output json` under-reports to 7. Use
`--include-superseded` to see the full set, which is what this map is built from.

**Important nuance on "canonical" vs "draft":** despite `8jAiCBifDW` (old PRD) carrying
`status: canonical`... actually it is `superseded`, and `pG9s9OjqZA` (Architecture) and `yB3U1Ui0Zc`
(the SE-Arch audit) are the only two pages genuinely `status: canonical`. The four Wave-3 pack
artifacts (PRD-delta, Contract Summary, Build Prompt, SDD, Test Plan — 5 pages) are **all
`status: draft`, never ratified by an agent**, despite being extremely detailed and current
(2026-07-15/16). Anyone treating them as settled canon without running doc-ratify is over-trusting
draft material — but anyone ignoring them because they're "just draft" is under-using the freshest,
most evidence-grounded pages in the space.

---

## 2. Per-page substantive commitments

### 2.1 `pG9s9OjqZA` — Architecture: orvex-wiki-api (canonical)

- **Stack decision (D-A11, USER 2026-07-03):** Go, not TypeScript — TS was chosen only for
  `@docmost/editor-ext` serializer reuse, which is an AGPL contamination path; rejected. Serializer
  is a clean-room Go reimplementation, `orvex-studio-lib/pkg/dfm`, built from the PM schema +
  engine's block-schema catalog + contracts golden fixtures, never by reading `@docmost/editor-ext`.
- **A-STRANGLER (D-A3/D-A9):** dual-surface facade — (a) byte-compatible reverse proxy over the
  engine's live `/api/orvex/*` so MCP's deployed typed client repoints via base-URL change only; (b)
  new `/v1` verb grammar, draft until contracts freeze. Phases 1–3 re-home composition (serializer →
  block-patch/shaping → engine deletion), each gated by golden-corpus parity, each reversible.
- **A-VERBS:** `search/get/save/edit/list` over `{resource_type, locator}` (wiki-only, D-A5). **No
  `ask` verb** — ai owns the full cited-ask loop (D-A12), wiki-api only serves ai's writes through
  the standard chokepoint. Engine retains exactly ONE atomic `apply-ops` primitive; wiki-api never
  decomposes a multi-op batch into multiple engine calls (the single easiest invariant to break).
- **A-GOVERNANCE (D-S8):** living-wiki drift verifier + wiki-first spec-gate move OUT of the AGPL
  fork into wiki-api; engine keeps only the `orvex_page_meta` stamp fields
  (`verified_against`/`verified_at`/`spec_confirmed`). **De-Linearized (D-S11):** the
  `contentHasLinearIssue` ProseMirror-node scan is deleted; text-only story-id path only.
- **A-TOKEN:** pass-through, no elevated credential; wiki-api forwards the caller's identity-minted
  scoped token on every upstream call. **Phase-0 interim:** engine only verifies its own HS256/
  APP_SECRET api-keys (K4) — the "engine accepts identity-minted tokens" enabler is a **named
  Phase-0-exit blocker**.
- **A-STATE (D-A10):** stateless; Redis caches ONLY principal-independent artifacts (descriptor,
  block-schema catalog, authoring guide). Shaped-read body caching is explicitly DROPPED — the
  security argument: a body cache keyed on scope-hash has no principal, so a hit could serve
  ACL-gated bytes without consulting the engine (a cached allow decision by proxy).
- **A-DESCRIPTOR (D-A7):** contract authored in orvex-studio-contracts (`openapi/wiki-api.yaml`);
  the served `/v1/openapi.json` is a conformance input CI-diffed against it, never the codegen
  source.
- **API surface (§3):** Phase-0 surface (a) = byte-compatible proxy of the engine's `/api/orvex/*`.
  Surface (b) = draft `/v1` verb grammar: `GET /v1/search`, `GET /v1/{resource}/{locator}` (+
  outline/blocks/ranged reads), `POST /v1/{resource}`, `PATCH /v1/{resource}/{locator}/blocks`,
  `GET /v1/list/*`, nav, conversion, doc-governance, `POST /v1/audit`, `GET /v1/openapi.json`,
  `GET /healthz`, `POST /internal/events/evict`.
- **§5 Risks:** double-implementation drift (engine AGPL TS serializer vs clean-room Go pkg/dfm) is
  *permanent by design*, kept honest only by a continuously-running CI parity test. R8c redaction
  must survive the Phase-2/3 relocation line (black-box parity test required). Batch atomicity
  "cannot be recomposed over the network."
- **"Review tightening — SE-Arch adversarial review (2026-07-05)" addendum (§A–E):** a DRAFT
  addendum appended to the canonical page, not yet folded into the body. It records 6 canon
  reconciliations (A1–A6), 5 design gaps (B1–B5), 3 Phase-0 drift/honest-state notes, what holds up
  (D), and 8 open decisions (OD-1..OD-8). **OD-7 (audit-sink ownership) is separately marked
  RESOLVED** via ADR-0037 (ratified 2026-07-16, orvexstudioarch/Z6WrJjZDAO): the sink is the shared
  service `orvex-studio-audit`, not the engine — but "authorized-but-unscheduled": no code has been
  re-pointed yet.
- **Embed-drop note:** the page body contains two collapsed opaque nodes that plain `page get`
  cannot render fully — a `:::info{id=iekslfjxdcjc}` mention/embed placeholder (§2, A-SERIALIZER
  discussion) and a `:::dfm-opaque type=excalidraw id=9ba29cb8-7bdb-44ef-a313-cf717c42d30a` block
  right after the 2026-07-05 change log (almost certainly an architecture diagram). Neither is
  reconstructable from this evidence pass; `page get --prosemirror` or `page mirror pull` would be
  needed to see the diagram content.

### 2.2 `yB3U1Ui0Zc` — Architecture Audit: SE-Arch review (2026-07-05) (canonical)

Independent adversarial review of the Architecture page under the SE Architect — Review Agent
doctrine. **Verdict: needs-tightening.** 14 findings (1 HIGH, 8 MEDIUM, 4 LOW/LOW-MED, 1 LOW), all
already folded as "fixed-in-draft" proposals into the Architecture page's own addendum (§2.1 above)
— this child page is the source-of-record for the findings table; the parent page carries the
dispositions. Headline finding: a non-existent "Redis→Kafka bridge" cited as the cache-evict
mechanism (canon: engine transactional-outbox → relay → studio-spine Kafka, no bridge, no Redis
Streams, D-S13) — flagged HIGH, and (per §2.4/§2.5 below) **still not fully scrubbed from the
Architecture page's own change-log recap lines** even though the addendum's own finding says it's
wrong.

### 2.3 `8jAiCBifDW` — PRD: orvex-wiki-api (superseded, but NOT thin — read it live)

The PRD-delta (§2.4) explicitly warns not to treat this as a thin baseline: it carries FR-A1..A24
(+ 3 draft amendments), NFR-A1..A7 (+A1a/A1b/A2a), D-A1..A13 + D-WF-1, and OQ-A1..A13 (4 closed).
Key commitments:

- **FR-A1–A3 (serialization):** clean-room Go `pkg/dfm`; opaque-node discipline (diagrams/embeds
  never serialized to editable text); in-process conversion for wiki-api + docmost-cli (removes the
  `/convert` HTTP hop from the edit hot path).
- **FR-A4–A5 (verb grammar):** `search/get/save/edit/list`; **no `ask` verb**; read ladder
  `info → outline (token_estimate) → blocks/:id?format=dfm` + ranged sub-page reads.
- **FR-A6–A8 (block-patch):** one write chokepoint, atomic multi-op batches; engine retains exactly
  one atomic `apply-ops` primitive; CAS `ifVersion` → 409 `VERSION_MISMATCH`; every write returns
  the full receipt `{url,id,version,persisted:true}` — **block-authoring writes also get the full
  receipt, not the legacy `{block_id,status}`** (closes CLI contract-gap G4); human-gated actions
  (RATIFY/CONFIRM) are transport-only, minted at the engine (D-A8).
- **FR-A9–A11 (ask boundary):** wiki-api owns NO cited-ask; ai owns the full loop end-to-end
  (D-A12); wiki-api's only role is serving ai's writes. `search/related/duplicates` front to
  knowledge; coverage-parity vs the old engine unified search is OQ-A4, gating retirement.
- **FR-A12–A13 (shaping):** one shared shaping layer (field projection, concise/detailed, cursor
  pagination); body-offload via `resource_link` handles + token estimates.
- **FR-A14 (descriptor):** contract authored in orvex-studio-contracts; MCP/CLI codegen from the
  **contracts tag**, never from wiki-api's served `/v1/openapi.json`.
- **FR-A15–A17 (strangler + auth):** dual-surface Phase 0 (D-A9); token pass-through, no elevated
  credential (FR-A16), with the Phase-0 K4 api-key interim explicitly named as a blocking
  cross-repo dependency; no authorization decisions ever made by wiki-api (FR-A17).
- **FR-A18–A19 (ops):** stateless, event-evicted Redis holding only principal-independent artifacts;
  shaped-read body caching explicitly dropped with reintroduction conditions enumerated; health/
  readiness, OTel/Prometheus, facade-overhead SLI.
- **FR-A20–A23 (doc-governance fold-in, D-S8/D-S11):** drift verifier + wiki-first spec-gate
  re-homed here; engine keeps only stamp fields; de-Linearized trigger; `QUOTA_EXCEEDED` 402
  propagated verbatim, batch-fails-whole; external-agent audit-write endpoint (sink stays
  engine-side per this PRD's text — later superseded in decision by ADR-0037, unscheduled in code).
- **NFR-A1–A7:** facade overhead p95 ≤20ms in-cell (provisional, "targets pending Phase-0
  measurement"); statelessness; security (no shared APP_SECRET, R8c redaction stays engine-side);
  fidelity (golden corpus); degradation matrix per upstream; contract stability (additive-only,
  frozen error vocabulary); **AGPL boundary (NFR-A7)** — CI-guarded, no `@docmost/*` import
  anywhere in the closed program.
- **§7 Rollout:** 4 phases (facade → serializer → composition re-homing incl. doc-governance →
  engine thinning), each independently shippable/reversible, no external contract change at any
  step.
- **§8 OQ table:** 13 open questions, 4 closed (serializer packaging, ask contract, license
  posture, lib/auth binding). The rest (relocation pace, rename, knowledge-coverage gap,
  single-upstream purity, CAS `ifVersion` representation, comment/attachments/image-block homes,
  audit-sink ownership) are still open per this PRD's own text — largely re-surfaced as MR-A2/A7 in
  the delta.
- **Three DRAFT amendments appended after the 2026-07-05 change log, none ratified:**
  FR-A24 (milestone dashboard graphs via the generic `orvex_dashboard` block, NOT `linear_graph` —
  blocked-by ENG-1465), NFR-A1a (bulk per-item facade-overhead threshold, provisional, reuses the
  base 20ms figure conservatively), NFR-A1b/A2a (warm-cache read + rebuild-on-miss budgets, backed
  by measured facade-dispatch benchmarks: p95 5.571µs / per-item 2ns — real numbers, but the
  Redis-warm path itself is still unexercised since the live Redis client is a TODO).
- **Embed-drop note:** FR-A2's opaque-node discussion (line ~40-44) contains a collapsed
  `:::info{id=gipmpqgjmrng}` mention placeholder — ironically inside the very paragraph explaining
  that opaque nodes render as typed handles. Content not recoverable from plain `page get`.

### 2.4 `RPduIa4x9Y` — PRD-delta (Wave 3, ENG-2104), draft, 2026-07-15 — the richest page in the space

This is an adversarial reconciliation pack, not a fresh PRD. It explicitly refuses to duplicate the
live PRD and instead: (a) states what the ticket/brief ADD (FR-WA-D1..D6, mostly RATIFIES-not-new),
(b) issues 4 explicit CORRECTIONS to stale claims circulating in the program (map/ticket), and (c)
surfaces 7 contested seams as MUST-RESOLVE (MR-A1..A7), none decided by this pack.

**Corrections (§2):**
- **C1:** ENG-2104 AC3 / the map's claim "contracts has ZERO wiki-api entries" is **FALSE** —
  `openapi/wiki-api.yaml` exists at every contracts tag (v0.1.0..v0.1.3) and HEAD; SEAMS.md carries
  a wiki-api row. It's present but shallow (8 ops, all `x-status:draft`) and structurally diverges
  from the served grammar — that's MR-A1, not a missing file.
- **C2:** the "Redis→Kafka bridge" is a phantom (same finding as the SE-Arch audit); real mechanism
  = engine transactional outbox → relay → studio-spine Kafka → Trigger → evict. The Architecture
  page's own body already says this correctly; only its addendum recap lines (§75/78/79) still say
  "bridge" — a self-contradiction this delta records but does not fix (not this pack's canonical
  page to edit).
- **C3:** the map's "prod is vanilla Docmost, modules off" is STALE — `ORVEX_MODULES_ENABLED=true`
  flipped in prod 2026-07-14 (commit 725090bd, PR #113); 4 wiki-api ArgoCD apps Synced
  (prod/main, dev, crew-daniel, ci).
- **C4:** the map's "5 still-501 endpoints (orvexGetQuota + 4 orvexTenantMove sub-steps)" **do not
  exist** — exhaustive grep = 0 hits. Real 501 surface = 3 stub-wrapped endpoints + 1 gateway leg
  (see SDD §2a below). `/v1/tenant-move/{step}` exists as a typed contract stub only, not served.

**Reconciliation against the deployed artifact (§3) — "MATURE-DEPLOYED, not a Phase-0 stub":**
the README and deployment manifest header are stale (still describe Phase-0 `/v1/* → 501`); the
real code has a full live `/v1` verb grammar (search/get/list/save/edit + read ladder, drift,
content-health, import, audit, bulk, real DfM↔PM convert, whoami/capabilities/instructions/
openapi.json, the byte-compatible `/api/*` proxy, evict consumer) at `origin/dev @ 57a69ba`
(2026-07-14). Exactly 3 stub-wrapped 501s + 1 gateway 501 leg remain, and 2 of the 3 (`v1RatifyGate`,
`v1SpecGate`) **compute real results** internally but wrap them in a 501 envelope pending a frozen
transport shape — a contract-shape gap, not a logic gap.

**The 7 Must-Resolves (§4) — none decided by this pack, "no implementer may decide one":**

| MR | What | Blocks |
|---|---|---|
| MR-A1 | Contract's flat verb grammar (`/v1/get`, `/v1/save`...) vs the server's RESTful `{resource}/{locator}` grammar; all 8 contract ops `x-status:draft`; 2 contract-only ops (`/v1/export`, `/v1/tenant-move/{step}`) unserved | the whole 33-story spine's dispatch gate |
| MR-A2 | Whether wiki-api's search/related/duplicates fronting SUPERSEDES ratified knowledge-direct paths (OQ-A7) — ask *ownership* is already resolved (ai's, D-A12) | ENG-2526 |
| MR-A3 | Host-routing FORM (flat `wiki-api.orvex.{tld}` vs `api.wiki.orvex.{tld}`, cell-segment or not) — canon UNPINNED, shipped HTTPRoute uses flat form, Architecture page asserts a form as decided | ENG-2541, deploy host assertion |
| MR-A4 | `/v1/tenant-move/{step}` contract-declared (rule-10 typed stub), server-absent — does stateless wiki-api even own a move surface? | rule-10 Done row |
| MR-A5 | ratify-gate/spec-gate 501 envelope pending frozen transport shape | ENG-2536/2537 |
| MR-A6 | MCP "vendors but bypasses" wiki-api today — does it repoint onto the byte-compatible proxy? | ENG-2512 having a real consumer |
| MR-A7 | CAS `ifVersion` representation (timestamp vs monotonic int vs etag) — engine now exposes an integer `meta.version`, which is evidence, not a decision | ENG-2528 receipt schema |

**Story census (§0c/§2):** 33 Linear stories, `[wiki-api]` title-prefix census (never substring),
ENG-2511..ENG-2543, all status Todo, 7 milestones. This delta files none, elevates all 33.

### 2.5 `fJogMGcbBb` — Contract Summary (Wave 3), draft, 2026-07-15

Companion to the PRD-delta, contract-focused. Key evidence:

- Contract file: present at every tag + HEAD (1 wiki-api hit each via `git ls-tree`); 8 operations,
  ALL `x-status: draft`. Grammar table shows the flat-vs-RESTful divergence mechanically
  (`/v1/get` → `GET /v1/{resource}/{locator}` etc.), plus ~25 served routes the contract doesn't
  mention at all, and 2 contract ops (`/v1/export`, `/v1/tenant-move/{step}`) the server doesn't
  serve.
- Error vocabulary: observed live in `gen/errors.go` — `CodeNotImplemented`, `CodeValidationError`,
  `CodeVersionMismatch` (409), `CodeQuotaExceeded` (402), `CodeForbidden`, `CodePageNotFound`,
  `CodeEngineUnavailable`, `CodeUpstreamUnavailable` (502), plus the human-gate transport codes
  (`needs_human_publish`/`RATIFY_*`/`GATE_UNSATISFIED`/`FORCE_TOKEN_REQUIRED`). Hand-authored in
  `gen/`, not yet codegen'd — but `gen/doc.go` **discloses** this rather than falsely claiming
  codegen provenance.
- CloudEvents: wiki-api is a **consumer only** — mints no `studio.wiki-api.*` event. Consumes
  `wiki.page.*` (via outbox→relay→spine→Trigger, cell-fail-closed) and
  `billing.entitlement.changed`.
- Generated clients: Go stubs hand-authored (honestly disclosed); **TS clients absent** — ADR-0035
  requires them for TS satellites (mcp, cli tooling); this is OWED and blocked behind MR-A1.
- **§6 Freeze posture, stated bluntly:** "NOT FROZEN... A pack that reported 'contract frozen' here
  would be the fake-done vector."

### 2.6 `5NTAkEn8KZ` — Per-agent Build Prompt (Wave 3), draft, 2026-07-15

A dispatch-safety document for build agents, opening with "6 traps that have already misled someone
on this service" (README staleness, the false "zero contract entries" claim, the phantom quota/
tenant-move endpoints, the Redis→Kafka-bridge phantom, ArgoCD-Healthy-proves-nothing, main≠dev
divergence). Restates the 33-story census by milestone, names which of them are "~DONE already, do
NOT rebuild" (most of foundation/serializer/verbs/write/drift/evict-cache are real), and the "narrow
real delta" that remains: the 3 stub-wrapped 501s, the gateway auth-translation leg, `/readyz`
round-trip verification, cell-lint rule gates, and the contract-vs-server reconciliation (explicitly
called out as "NOT a code task — a contracts action you're blocked on"). Restates all 7 MRs with
explicit "you may not decide any of them" language, flags MR-A5 and MR-A2 as "the ones you will get
wrong by being helpful," gives CS §5 category assignments, ADR triggers, a seam map, tier placement,
pinned versions, and a deterministic Done gate. Self-audits H1–H17 honestly, explicitly refusing to
mark H4 ("zero architecture decisions left to the agent") and H7 ("versions named") as clean YES
because of the open MRs.

### 2.7 `XS7DetLXAH` — SDD: the total service-level Done list, draft, 2026-07-16

The most exhaustive page: a mechanically-verified totality check (`ls internal/` = 22 packages,
`grep`-verified each is mentioned in the doc — "ZERO ABSENT," re-run twice, at start and end of the
document). Per-package census table names tier (CS §6), role, PRD ref for all 22 `internal/*`
packages + `cmd/wikiapi` + `gen/`. The "Done list" (§2) is organized as:

- **§2a full API surface:** ~13 `[x]` REAL+LIVE groups; 3 `[ ]` stub-wrapped-501 rows (MR-A5); 1
  scaffolded seam (gateway auth-translation); 2 contract-declared/server-absent rows (tenant-move,
  export — MR-A4/OQ-A7); 6 later-wave rows (comment CRUD, attachments, image_from_prompt block,
  dashboard-graph block, body-offload, second resource_type).
- **§2b events:** produces NONE (verified — no wiki-api producer source in contracts); consumes
  `wiki.page.*` + `billing.entitlement.changed` via the outbox→relay→spine→Trigger mechanism,
  cell-fail-closed.
- **§2c entitlement/quota:** `QUOTA_EXCEEDED` 402 relayed verbatim, wiki-api makes NO cap decision.
- **§2d cell-lint, all 14 rules individually assessed:** 1 evidenced-partial (rule 4, CELL_ID +
  CLUSTER_NAME echo — "PARTIAL, do not tick blindly"), 10 not-yet, 3 N/A/soft (rules 7/8 N/A —
  stateless, no tables/S3; rule 13 not-yet-a-hard-gate program-wide). **Rule 9 tension flagged:**
  wiki-api ships a *public* HTTPRoute (flat `wiki-api.orvex.ai`) while rule 9 says flat services
  should expose no public HTTPRoute post-migration — unreconciled, tied to MR-A3.
- **§2e observability:** OTel/Prometheus owed; facade-overhead SLI has real measured evidence
  (TestFacadeOverhead p95 5.571µs); SLOs explicitly marked PROVISIONAL pending live-Redis
  measurement, not to be treated as ratified.
- **§2f degradation posture,** §2g config contract, §2h AGPL boundary, §2i family-E2E participation
  (per-sibling table), §2j the 13 open questions (OQ-A13 marked RESOLVED via ADR-0037, ratified
  2026-07-16 — but unscheduled in code), §2k runbook (owed, doesn't exist).
- **§4 "THE ANTI-FAKE-DONE CLAUSE":** explicitly states CI-green, ArgoCD-Synced/Healthy, and "the 33
  stories close" are each **not evidence of Done**, and names its own likely fake-done misreading
  risk (a reader seeing `[x]` rows and concluding the service is finished).
- **Honest baseline stated program-wide:** "1 PASS / 5 FAIL / 1 BLOCKED, defects ENG-2039..2054
  real and filed" — this SDD is written against that, not the green board.

### 2.8 `fwHouFgtIh` — Test Plan (Wave 3), draft, 2026-07-15

CS §5 category assignments (fixed, not implementer's choice): all 6 real dependencies (engine,
knowledge, ai, identity, Redis, Kafka) are Row 3 (remote-but-owned port + fixture); explicitly
**no Row 2** (no Postgres — wiki-api is stateless) and **no Row 4** (Clerk/Stripe/etc. belong to
other services — "if you are wiring a Row-4 harness here, you are building the wrong service").
Tier 1 unit tests named per package with RED-before/GREEN-after anchor tests (e.g.
`TestVerbDispatch_SearchGetSaveEditList_NoAskVerb`, `TestApplyOps_AtomicMultiOpBatch_NeverPartial`).
Store tier explicitly N/A with reasoning. Tier 3 contract tests flagged **blocked by MR-A1** (a
golden round-trip for the RESTful grammar can't be frozen until the grammar decision lands). Tier 4
crew-slot and Tier 5 family-E2E scoped per sibling. §7 names 3 fragile/high-value tests explicitly
(batch-atomicity, R8c redaction-parity, byte-parity fixture). Restates the "NOT EVIDENCE OF DONE"
list and the 1-PASS/5-FAIL/1-BLOCKED baseline verbatim.

---

## 3. Cross-page consistency check

- The **7 Must-Resolves (MR-A1..A7)** are named identically and consistently across the PRD-delta,
  Contract Summary, SDD, and Build Prompt — a genuinely coherent evidence chain, not four
  independent guesses.
- The **"Redis→Kafka bridge" phantom** is independently caught by both the SE-Arch audit (2026-07-05)
  and the PRD-delta (2026-07-15, CORRECTION-C2) — and both note it survives, uncorrected, in the
  Architecture page's own change-log recap lines even though the same page's body and the audit's
  own finding both say it's wrong. **This is still true as of this evidence pass** — the Architecture
  page (`updated_at` 2026-07-16T22:07Z, the most recently touched page in the space) was edited
  *after* both corrections existed and still carries the phantom in §1/§5 recap wording (only the
  "Review tightening" addendum's finding A1 flags it; the body prose and the change-log lines were
  not fixed).
- The **"contracts has zero wiki-api entries"** claim (from ENG-2104 AC3 / the map) is independently
  refuted by both the PRD-delta and the Contract Summary using the same measured evidence
  (`git ls-tree` counts). Consistent.
- The **OQ-A13 / audit-sink ownership** resolution (ADR-0037, ratified 2026-07-16) is recorded
  identically in both the Architecture page addendum and the SDD §2j, both correctly noting
  "authorized-but-unscheduled" (no code re-pointed yet). Consistent.

---

## 4. STALENESS vs the live deployed state (2026-07-17 reality probe)

The task brief states the known live-state facts: **the `/v1` cutover happened, and 5 new verbs
were added 2026-07-16.** I verified this directly against the local clones of
`/home/daniel/repos/orvex-wiki-api` and `/home/daniel/repos/orvex-studio-contracts` (both present on
this machine) rather than trusting the wiki.

### 4.1 orvex-wiki-api repo: a newer commit exists that no wiki page reflects

Every Go/route figure in all 5 Wave-3 pages is explicitly ref-tagged to `origin/dev @ 57a69ba`
(2026-07-14). But `origin/dev` HEAD today is:

```
b651e89  2026-07-16 18:31:11 +0200
feat(v1): expose amazing-MCP whole-doc/string-replace/{loc}-batch/changes/spaces verbs (#41)
```

`git diff --stat 57a69ba b651e89` touches `gen/verbs.go`, `internal/blockpatch/`,
`internal/clients/`, `internal/server/{server,whoami_handler,wikiv1_handler,pageblocks_handler}.go`,
`internal/verbs/verbs.go` — 12 files, +1557/-41 lines. Confirmed new routes in `server.go`:

- `PUT /v1/{resource}/{locator}` — whole-doc update (`v1Update`)
- `POST /v1/{resource}/{locator}/blocks:batch` — `{loc}`-addressed atomic multi-block batch
  (`v1WikiBlocksBatch`)
- `GET /v1/changes` — `v1Changes`
- a `spaces[]` field added to `GET /v1/whoami` (writable-spaces exposure, per-space `can_edit`)
- plus a string-replace op folded into `PATCH /v1/{resource}/{locator}/blocks` (per
  `internal/blockpatch/blockpatch.go`'s +211 lines and the new `wholedoc_test.go`)

This is exactly the "5 new verbs" the task brief flags as live. **None of the 8 wiki pages mention
whole-doc update, string-replace, `{loc}`-batch, `/v1/changes`, or the `spaces[]` whoami field.**
The Architecture page (updated 2026-07-16T22:07Z) and SDD (updated 2026-07-16T20:52Z) were BOTH
edited chronologically *after* this commit landed (16:31 UTC) — but their content additions that day
were only the OQ-A13/ADR-0037 audit-sink note, not this. The SDD's own §2a "full API surface" table
and its mechanical totality check (§0, re-run at the end) would need `PUT /v1/{resource}/{locator}`,
the `:batch` route, and `/v1/changes` added to stay accurate — they aren't there.

### 4.2 orvex-studio-contracts repo: MR-A1 (the #1 blocking must-resolve) appears to have been
### substantially addressed on 2026-07-16, one hour before the code change above — also unreflected

```
0e63018  2026-07-16 17:35:19 +0200
feat(wiki-api): re-ratify the SoT to the LIVE /v1/wiki resource grammar
```

Commit message: *"Re-authors openapi/wiki-api.yaml from the flat POST /v1/{verb} grammar (ADR-0001,
superseded) to the LIVE /v1/wiki RESOURCE grammar actually served by wiki-api.orvex.dev (34-route
probe)... where canon and the live probe disagreed, the live probe won."* The contract's path list at
`origin/dev` today is the RESTful `/v1/wiki`, `/v1/wiki/{loc}`, `/v1/wiki/{loc}/blocks`,
`/v1/wiki/{loc}/blocks:batch`, etc. — i.e. it now matches the served grammar's shape, not the flat
`/v1/get`/`/v1/save` grammar the Wave-3 pages describe as the current contract state. Remaining
`x-status: draft` ops dropped from 8 (all-draft) to 8 draft-of-34 (most routes are now
`x-status: pinned`, probed live-200; drafts are specifically `PUT /v1/wiki/{loc}` whole-doc-update,
the string-replace op, and the other not-yet-live additions — i.e. exactly the surface added in
§4.1).

**This means MR-A1 — described in the PRD-delta/Contract Summary/SDD/Build Prompt as blocking "the
whole 33-story spine at the dispatch-gate level" — was materially moved forward by a same-day commit
that predates the Architecture/SDD page edits by roughly 1–5 hours, and none of the wiki pages
record it.** Whether MR-A1 is now fully CLOSED (vs. narrowed) is not something I can certify from a
single commit message — a doc-drift pass against the current `openapi/wiki-api.yaml` is the right
next step — but the wiki canon's framing of MR-A1 as fully open and blocking is now stale on its
face.

### 4.3 What this means for the task's other flags

- The **"stale vs live" gap is real and dated precisely**: the drift window is roughly
  2026-07-16 17:35–18:31 CEST (contracts re-ratify, then wiki-api verb additions) vs. the wiki
  pages' last substantive edits earlier that day (the ADR-0037 audit-sink note was added
  20:52–22:07Z but nothing else was refreshed).
- Per the "Certified ≠ current" standing lesson: this is a textbook instance — the wiki artifacts
  are extremely well-audited (adversarial, evidence-cited, self-correcting) for everything up to
  their measurement point, but the deployed artifact has moved past that point and no page in the
  space has re-measured since.
- Recommended next action (not performed here — this is an evidence-mapping pass, not a fix): a
  `doc-drift` pass on `pG9s9OjqZA` (Architecture, since it's the REFERRER of the SDD/Contract
  Summary/Build Prompt content and canonical) and a fresh census re-run of the SDD's §0 mechanical
  totality check against `b651e89`, plus a fresh MR-A1 status check against
  `orvex-studio-contracts@0e63018`.

---

## 5. Embed-drop inventory (task caveat: plain `page get` drops embeds)

Two confirmed real embed-drops (opaque nodes, not just formatting):

1. `pG9s9OjqZA` (Architecture), platform-decisions mention on line 5: a base64 `{dfm:...}` mention
   token pointing at `orvex-studio-platform-decisions` — resolves to a page title via the encoded
   attrs, so not fully opaque, but the live page's context/preview is lost.
2. `pG9s9OjqZA`, line 26-30: `:::info{id=iekslfjxdcjc}` — an inline opaque-node placeholder inside
   the A-SERIALIZER decision prose (illustrating the very invariant it's describing).
3. `pG9s9OjqZA`, line 81-82: `:::dfm-opaque type=excalidraw id=9ba29cb8-7bdb-44ef-a313-cf717c42d30a`
   — a real Excalidraw diagram embedded right after the 2026-07-05 change log, completely
   inaccessible via plain `page get`. Given Daniel's stated preference for Excalidraw diagrams
   (memory: docmost-diagram-bake), this is very likely a real architecture diagram that this
   evidence pass has NOT seen the content of.
4. `8jAiCBifDW` (old PRD), line ~40-44: `:::info{id=gipmpqgjmrng}` inside the FR-A2 opaque-node
   discipline text.

All 4 would require `docmost-cli page get <slug> --no-daemon --prosemirror` (or `page mirror pull`)
to resolve. Not attempted in this pass — flagged per the task's explicit instruction not to guess at
dropped content.

Note: an earlier automated scan for "empty `##` sections" (a heuristic embed-drop signal) flagged 4
sections across `8jAiCBifDW`, `fJogMGcbBb`, `RPduIa4x9Y`, `XS7DetLXAH` — all 4 turned out to be
**false positives**: in every case the `##` header is immediately followed by `###` subsections that
carry the real content, not a dropped embed. Only the excalidraw/`:::info` markers above are genuine
embed-drops.

---

## 6. Commands run (for reproducibility)

```
docmost-cli cache sync --space orvexwikiapi --no-daemon
docmost-cli page list --space orvexwikiapi --output json --no-daemon --include-superseded
docmost-cli page get <slug> --no-daemon --output json   # x8, slugs listed in §1

# reality probe (not part of the wiki, cross-checked against it)
cd /home/daniel/repos/orvex-wiki-api && git log --oneline -5 origin/dev
cd /home/daniel/repos/orvex-wiki-api && git diff --stat 57a69ba b651e89 -- internal/ cmd/ gen/
cd /home/daniel/repos/orvex-wiki-api && grep -nE '"(GET|POST|PATCH|PUT|DELETE) /v1/' internal/server/server.go
cd /home/daniel/repos/orvex-studio-contracts && git log --oneline -5 origin/dev -- openapi/wiki-api.yaml
cd /home/daniel/repos/orvex-studio-contracts && git show origin/dev:openapi/wiki-api.yaml | grep -E '^\s{2}/'
```
