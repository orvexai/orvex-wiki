# Evidence Map — `orvex-studio-mcp` canon (wiki space `orvexstudiomcp`)

Compiled 2026-07-17. Source: `docmost-cli cache sync --space orvexstudiomcp` (fresh sync, `triggered_at: 2026-07-17T15:12:00Z`) + `docmost-cli page list --space orvexstudiomcp --output json` (19 pages, `truncated: false`) + `docmost-cli page get <slug> --no-daemon` for all 19 pages.

**Headline finding — the 19-tool surface is STALE.** The Memory-index entries "R21 MCP streaming folded into 19-tool surface … binding on amazing-MCP Layer 3" and "Amazing MCP delivered live … 19/19 on dev" describe the **2026-07-16 state** (the "amazing-MCP" self-rebuild, commit `07e2687`). On **2026-07-17** the PO ran a from-scratch WDS re-baseline and **ratified** a replacement architecture: **hero-13** namespaced intent verbs (`wiki_*`/`knowledge_*`/`ai_*`/`memory_*`/`staging_*`/`workgraph_*` + `whoami`/`list_tools`) with everything else on-demand via progressive disclosure — R-WDS-1. The 19-verb frozen surface, the un-namespaced tool names (`ask`, `search`, `get_page`, `save_page`, `edit`…), and the dark-by-default write-gate model are **all superseded**. Waves 1–2 of this re-baseline (namespaced hero-13, writes-ON-by-default + hard `READ_ONLY` ceiling) are **already merged to `dev` and live on `mcp.orvex.dev`** as of the same day, with a first-ever 6/6 green three-repo E2E. Any downstream plan (Track 1 parity mapping, Track 2 redesign) that cites "19 tools" or un-namespaced verb names for this service is working from stale canon — cite `ZGjLctEnGH` for current state instead.

**Caveat honored throughout:** `docmost-cli page get` (plain) drops lossy node types — several pages below carry `⚠️ drops lossy node types [table]` or `[excalidraw, table]` banners at fetch time (noted per-page; content of dropped tables/diagrams was **not** guessed at, only prose actually returned is reported).

---

## 1. Full page inventory (19 pages, `orvexstudiomcp`)

| Slug | Title | `status` (metadata) | `doc_type` | Updated | Currency verdict |
| --- | --- | --- | --- | --- | --- |
| `ZGjLctEnGH` | WDS Re-baseline 2026-07-17 — Rulings & Spec Set | draft (field stale — see below) | adr | 2026-07-17T13:19Z | **LIVE / CURRENT** — PO-ratified en bloc 2026-07-17; the authoritative anchor for everything else |
| `O6o61ov2e7` | orvex-studio-mcp — Live State & Operations Runbook | draft | runbook | 2026-07-17T13:17Z | **LIVE / CURRENT** — operator ground truth for what's deployed right now |
| `BE0jTNoweS` | Architecture: orvex-studio-mcp (post-split) | canonical | architecture | 2026-07-17T08:50Z | **CANONICAL, PATCHED** — top-of-page correction banner (2026-07-17) reconciles it to the re-baseline; body prose below the banner is pre-ruling and explicitly flagged not-yet-walked |
| `k1sWjtJq3x` | PRD: orvex-studio-mcp (post-split repoint) | canonical | prd | 2026-07-17T08:50Z | **CANONICAL, PATCHED** — same pattern: ratification banner + additive "Re-baseline" delta section; body FR-M text below is pre-ruling, not struck |
| `BZldxVAmdR` | Architecture Audit — SE-Arch review (2026-07-05) | canonical | retrospective | 2026-07-12T16:16Z | Canonical evidence record, dated (2026-07-05 audit) — describes the **pre-repoint** build state; still valid as historical audit evidence, not current-state |
| `lR3kpc0Ra2` | ADR 0001 — MCP /v1 client regeneration + ask→ai upstream | draft | adr | 2026-07-17T07:51Z | **PARTIALLY STALE** — banner: "still governing for /v1 codegen provenance; tool NAMES herein superseded by … R-WDS-1" |
| `ok9tiXDCjB` | ADR 0002 — MCP streaming relay for ask + edit verbs (R21) | draft | adr | 2026-07-16T21:57Z | **STALE framing, live mechanism** — see §5 below; frozen-at-19 framing superseded, but the shipped streaming behavior itself is current and unaffected |
| `koIvfpnSbX` | Contract Summary: orvex-studio-mcp (Wave-3) | canonical | technical-spec | 2026-07-17T07:51Z | **STALE BASELINE** (explicit banner) — authored 2026-07-15 against pre-rebuild code, superseded by commit `07e2687` + the 07-17 re-baseline |
| `ppYIXBL4Cp` | Build Prompt: orvex-studio-mcp (Wave-3) | canonical | technical-spec | 2026-07-17T07:51Z | **STALE BASELINE** (same banner as above) |
| `RcvZDU2Sds` | Test Plan: orvex-studio-mcp (Wave-3) | canonical | technical-spec | 2026-07-17T07:51Z | **STALE BASELINE** (same banner) |
| `8nngxUpOXY` | PRD-delta: orvex-studio-mcp (Wave-3, ENG-2102) | draft | prd | 2026-07-17T07:51Z | **STALE BASELINE** (same banner) — dated 2026-07-15 |
| `tQcQ01U2iy` | SDD: orvex-studio-mcp (Wave-3) | canonical | technical-spec | 2026-07-17T07:51Z | **STALE BASELINE** (same banner) — dated 2026-07-15 |
| `2hPabxB7Fh` | Docmost Server Requirements for the Orvex Studio MCP | draft | technical-spec | 2026-07-17T07:51Z | **HISTORICAL (Era-1, pre-split)** — retained as founding-intent evidence only |
| `986V0taYy5` | Orvex Studio MCP — Brainstorm Canon | draft | brainstorm | 2026-07-17T07:51Z | **HISTORICAL (Era-1, pre-split)** — retained as founding-intent evidence only |
| `J8nvlh1ctw` | Wiki & Knowledge-Base MCP Servers — Technical Research | draft | research | 2026-07-17T07:51Z | **HISTORICAL (Era-1, pre-split)** — retained as founding-intent evidence only |
| `6e2jqBdknZ` | Thin Orvex Studio MCP — Build Plan | draft | technical-spec | 2026-07-17T07:51Z | **HISTORICAL (Era-1, pre-split)** — retained as founding-intent evidence only |
| `CjaHVTg8Id` | Studio ↔ MCP Contract | draft | contract | 2026-07-17T07:51Z | **HISTORICAL (Era-2, act-as-user model)** — retired by FR-M11; do not use for current auth/deploy state |
| `lRERyG7Zpj` | Orvex Studio MCP — Deploy & Secret-Wiring Runbook (act-as-user model) | draft | runbook | 2026-07-17T07:51Z | **HISTORICAL (Era-2)** — same retirement banner |
| `CIemV9m0eb` | Orvex Studio MCP — Three-Repo System Runbook | draft | runbook | 2026-07-17T07:51Z | **HISTORICAL (Era-2)** — same retirement banner; superseded operationally by `O6o61ov2e7` |

**Pattern:** every page in the space carries an explicit machine-readable staleness/currency banner except `BZldxVAmdR` (a dated audit, valid as a point-in-time record) and the two 07-17 anchor pages themselves. This is unusually well-curated canon hygiene — no silent staleness found.

---

## 2. The current-state anchor pair (read these two first)

### 2.1 `ZGjLctEnGH` — WDS Re-baseline 2026-07-17 — Rulings & Spec Set

- **Status field:** `draft`, but the top-of-page note is explicit: **"✅ RATIFIED 2026-07-17 by the PO (en bloc, live session)."** The `draft` metadata is residual bookkeeping — draft→canonical requires a human-minted server `RATIFY_TOKEN` an API-key caller cannot self-mint (per `docmost-cli-ratify-token-guard` memory); the ratification *decision* itself already stands.
- **What happened:** Daniel (PO) ran a from-scratch WDS greenfield re-examination, treating the 2026-07-16 self-rebuild (commit `07e2687`, which deleted the prior architecture) as reference reality, not inherited canon. He personally ruled 3 architecture decisions (R-WDS-1/2/3) and 10 open seams (R-SEAM-1..10) in one live session.
- **R-WDS-1 — tool surface: Architecture B, domain-namespaced hero-13.** `wiki_*`, `knowledge_*`, `ai_*`, `memory_*`, `staging_*`, `workgraph_*` verbs, ~13 always-visible hero tools (12 intent verbs + `list_tools`), long-tail on-demand via progressive disclosure, writes gated, upstream seams kept **C-ready** (future code-mode `execute()` if tool count crosses ~15–20). Product role = **bidirectional-lite** (reads first-class, writes guarded).
- **R-WDS-2 — MCP is THE MAIN ROUTE** to `orvex-studio-staging` and `orvex-studio-workgraph`, not a side-channel. Reopens/overrides the earlier wiki-only cut.
- **R-WDS-3 — writes ON by default everywhere**, all 4 governance layers active, with a hard `READ_ONLY` override flag (GitHub/Supabase ceiling pattern) — not a dark-by-default save door.
- **Hero-13 catalog (verbatim):** cross-cutting `whoami` · `list_tools`; `wiki_get` (outline→section→full DfM read ladder) · `wiki_save` (gated-write upsert, CAS `ifVersion`→409); `knowledge_search` (multi-corpus, snippets+citations, never bodies); `ai_ask` (cited fail-loud semantic ask — the marquee differentiator); `memory_recall` (read-only hero); `staging_propose` (gated-write); `workgraph_prime`/`ready`/`claim` (atomic CAS)/`save`/`handoff`.
- **On-demand additions ruled in 2026-07-17** (long-tail, hero-13 unchanged): `wiki_comment_post` (re-homed from `comment_post`), `wiki_attachment_get`/`_save`, `memory_propose` + direct-write mode, `marketplace_search`/`skill_get` (kept separate — reverses the earlier ENG-2470 fold into knowledge), marketplace publish/install/rate + `workgraph_grant`/sharing, reviewer verbs `staging_review_queue`/`_decide`/`_apply`, KG-interop + Claude-memory adapters, `ai_models`/`billing_plan`/`billing_usage`, `audit_query`, pre-registered-only `workgraph_gate_check`/`_template_apply`.
- **Tenant Governance Profile (new concept):** per-tenant policy object, 3 knobs — memory-write mode (`staged`|`direct`), sharing grants (`console-only`|`agent-enabled`), publish path (`ratify-required`|`scoped-key`) — all default to human/Librarian-gated. Sits *inside* the R-WDS-3 write-on floor; never widens what a `READ_ONLY` tenant can do.
- **Seam-ruling table (R-SEAM-1..10)** — full verbatim ruling table captured in this session's raw fetch; highlights: #2 memory write-leg BOTH modes in (staged+direct, default staged); #3 marketplace/skill stay separate (reverses prior fold); #5 self-service authz (marketplace publish/install/rate + workgraph sharing) enabled NOW, publish additionally elicitation-gated; #10 "build everything, nothing deferred" — staging/workgraph substrate builds are commissioned parallel work, not external blockers.
- **Register item 3 (RESOLVED 2026-07-17) — MCP↔knowledge is DIRECT for search/RAG.** Confirms PO ruling 9 / D-M8 / ENG-1403 (Done): `search`/`related_pages`/semantic-neighbor/RAG retrieval go **MCP→knowledge directly**; `ask` routes via **ai**; wiki verbs (get/save/edit/list/changes) route via **wiki-api**. Explicitly corrects a misreading that ADR-0013 "corrected the roster to knowledge-via-wiki-api-only" — ADR-0013's charter is OD-6 (revocation-event consumption), not the search dataflow; its OD-7 side-note is stale and disclaimed. **Flags an unresolved canon bug:** family canon root `CxjFpIVUZY` still reads "routes knowledge via wiki-api + ai (not directly)" in two places — contradicts ruling 9, follow-up ticket posted to ENG-2800, out of this pass's scope.
- **Ratification queue / PO review items on this page:**
  - `workgraph_save` hero-seat evidence memo — zero trigger-map force citations; recommendation is to **hold the seat provisionally** through the workgraph substrate build, re-evaluate post-cutover on real usage telemetry (filed against ENG-2868).
  - ADR-0029 (`WZWmazrlS0`, MCP identity edge-verifier cutover) — ratification package posted to ENG-2878.
  - Frontmatter/body status conflict (frontmatter `canonical` vs body "Draft — pending PO doc-ratify") flagged, pending PO yes/no.
- **Implementation record (same day, 2026-07-17):** Waves 1–2 merged to `dev`. Wave 1 commit `1fa63d3` (9 commits) — namespaced hero-13 catalog with `wiki_save` upsert merge, typed error taxonomy (`NOT_AVAILABLE_YET`/`READ_ONLY` + recovery hints), `structuredContent` + `response_format` envelopes, writes-ON default + hard `READ_ONLY` ceiling + tenant governance profile + publish gate, dual-IdP Keycloak leg, hero-13 scaffold stubs, fixture-based golden-tape KPI harness as a **required CI gate**. Wave 2 commit `f6bba39` — elicitation seam, Kafka + day-1 cell wiring, `TaskHandle` async-poll seam, `audit_query` stub, `list_tools` discovery moment, request-timing + revocation-lag SLIs + `/metrics`, three-repo E2E harness + CI-job repoint. Current dev HEAD: **`8076395`**.
- **Gates:** hermetic tests 417/417 green; kpi-golden-tape 12/12 (required CI gate); typecheck/lint clean; connect-schema token budget in range (**5,303 tokens**, inside the ~4.5–5.5k target).
- **🟢 THREE-REPO E2E 6/6 GREEN (first ever)** — 2026-07-17T12:48Z on live dev cell (evidence: ENG-2886 comment `4bffbe1b`). Real headless-minted bearer → `initialize`/`whoami` → `knowledge_search` (real Kafka→indexer pipeline, LAG 0) → `wiki_get` → cited `ai_ask` (confidence 0.95) → `wiki_save` verified `persisted:true`. Stability 6/7 runs; one flake is a knowledge cold-start race (ENG-2906, not an MCP defect).
- **Linear:** 19 evidence comments posted; 16 tickets moved to **In Review** (none self-closed — owner Done-gate honored). Production deployment held on owner sign-off.

### 2.2 `O6o61ov2e7` — orvex-studio-mcp — Live State & Operations Runbook

- **Status:** draft (AI-authored, never self-promoted); anchored to `ZGjLctEnGH`; explicitly supersedes the retired Era-2 `CIemV9m0eb` runbook on any host/deploy-step disagreement.
- **dev (auto-deployed):** branch `dev` @ `8076395`; Tekton auto-build + reloader digest-verified rollout; `kpi-golden-tape` is a **required CI gate**; hero-13 catalog live (`whoami`, `list_tools`, `wiki_get`, `wiki_save`, `knowledge_search`, `ai_ask`, `memory_recall`, `staging_propose`, `workgraph_prime`, `workgraph_ready`, `workgraph_claim`, `workgraph_save`, `workgraph_handoff`); governance = writes-ON + hard `READ_ONLY` ceiling, dev overlay sets `WRITE_ALLOWED_SPACES` to only the e2e persona space (base = deny-all).
- **crew-daniel:** same `dev` code, manual rollout, healthy on `crew-daniel-mcp.studio.orvex.ai`; stale-deps trap permanently fixed (lockfile-hash-aware `npm ci`).
- **production: NOT deployed. Held by the owner.** No prod MCP host exists; explicitly do not create one as a side effect of any dev/crew change.
- **Hosts:** dev door `https://mcp.orvex.dev`; identity/exchange `https://auth.orvex.dev`; wiki upstream `https://wiki-api.orvex.dev`; crew `https://crew-daniel-mcp.studio.orvex.ai`. **⚠ DEAD HOST:** `dev-mcp.studio.orvex.ai` is retired (Era-2) — any doc/script/env pointing at it is stale.
- **Headless E2E token-mint recipe** (4-step, no browser): Clerk sign-in token → FAPI ticket redemption (JWT template `orvex-cell-exchange`) → cell exchange `POST https://auth.orvex.dev/v1/exchange` → opaque bearer presented to `mcp.orvex.dev`. Secret paths (names only): `apps/orvex-workflows/clerk`, `apps/orvex-studio-mcp-dev/e2e`. `E2E_IDENTITY_TOKEN` short-circuits steps 1–3.
- **Known operational notes:** knowledge cold-start ~38s warm-up can flake the first E2E run post scale-from-zero (ENG-2906, isolated, not an MCP defect); revocation consumer idle-with-LAG-0 on `identity-events.dev` is the healthy steady state by design (ADR-0021) — not a stalled worker.

---

## 3. The five explicitly-requested slugs — detailed per-page summary

### 3.1 `986V0taYy5` — Orvex Studio MCP — Brainstorm Canon

- **status:** draft · **doc_type:** brainstorm · updated 2026-07-17T07:51Z (re-synced, but content itself is founding-era)
- **Currency:** ⚠ **HISTORICAL (Era-1, pre-split).** Banner: superseded for current state by the PRD/Architecture re-baseline (`ZGjLctEnGH`); retained as founding-intent evidence.
- **Substantive commitments (historical intent, still influential):** reframes the MCP from a Docmost-API wrapper into a "Markdown-speaking, intent-level interpreter"; three hero tools (`ask`, `search`, `save`/`edit`); context-light + agent-ergonomic as the two axes to win; the silent-write-on-`format=markdown` correctness trap and the import-API-only write path (later REFINED by the technical research page, see §3.2); candidate builds α (thin subprocess wrapper, chosen POC) → β (native hybrid) → γ (code-mode); KPI target ≤2 calls / ≤~1k tokens per common task (this KPI **survives** into current canon as NFR-M6 / the golden-tape gate).
- **Read note:** plain `page get` on this page reported no table/embed drop warning.

### 3.2 `J8nvlh1ctw` — Wiki & Knowledge-Base MCP Servers — Technical Research

- **status:** draft · **doc_type:** research · updated 2026-07-17T07:51Z
- **Currency:** ⚠ **HISTORICAL (Era-1, pre-split).** Same supersession banner as above.
- **Substantive commitments (historical, several since absorbed into shipped design):** ~50-server survey (AFFiNE, Outline, XWiki, Notion, Coda, Rovo, GitBook, etc.) via six Opus subagents. **Upgrades** the brainstorm's core claim: Docmost's `format=markdown` write is a **format-handling gap, not a write-permission limit** — the same endpoint reliably persists ProseMirror/TipTap JSON, so the correct design is MCP-owned MD↔ProseMirror conversion writing JSON, with the import API reserved for create/bulk. Top 5 recommendations: (1) own MD↔PM conversion, write JSON; (2) surgical `edit_page(old→new)` (triple-industry convergence: XWiki, Wiki.js, Outline); (3) verified+idempotent writes (read-after-write, version token, content-hash upsert) + lossy-node sentinel protocol; (4) search-then-fetch + cited `ask` (Glean: 43k vs 83k tokens, 2.5× preference; "no enterprise wiki MCP ships semantic ask-with-citations" — named as the leapfrog moat); (5) ~4–8 always-on tools + progressive disclosure + 4-layer write governance off-by-default + `man`/`help` self-onboarding. **Note:** the "4-layer write governance off-by-default" recommendation here is explicitly **reversed** by the live 2026-07-17 ruling R-WDS-3 (writes ON by default + hard `READ_ONLY` ceiling) — a case of a Wave-1 research recommendation being deliberately overridden by the PO, not a staleness bug.
- **Read note:** no table/embed drop warning reported at fetch.

### 3.3 `8nngxUpOXY` — PRD-delta: orvex-studio-mcp (Wave-3, ENG-2102)

- **status:** draft · **doc_type:** prd · dated 2026-07-15 (page metadata updated 2026-07-17T07:51Z — re-synced, not re-authored)
- **Currency:** ⚠ **STALE BASELINE** — explicit banner: authored 2026-07-15 against pre-rebuild code, superseded by commit `07e2687` and the 2026-07-17 WDS re-baseline.
- **What it is:** a reconciliation delta against the (then-)canonical PRD `k1sWjtJq3x` / Architecture `BE0jTNoweS` / Audit `BZldxVAmdR`, produced by a Wave-3 pack agent (adversarial reviewer≠author discipline). Declares itself NOT the wave slice, and explicitly does not re-derive or supersede the exhaustive baseline PRD (FR-M1..M19).
- **Substantive commitments recorded (2026-07-15 snapshot — now superseded by hero-13):**
  - **19 tools live** at that time: 11 hero (`whoami ask search get_page save_page edit get_neighborhood get_space_tree get_changes related_pages list_tools`) + 8 `studio_*`. In-fork embedded `packages/orvex-mcp` = 73 tools (decommission target, FR-M16) — do not conflate 19 vs 73.
  - **Live-repo-wins corrections at the time:** the repoint had "substantially LANDED" (three-upstream env split real in code) though ENG-2102's own body and the arch page's honesty ledger both claimed pre-repoint — both stale self-reports, corrected by this pack.
  - **Contested seams (MR-M1..M4), surfaced not decided:** MR-M1 `studio_*` six-tool contract home unpinned (cutover-blocking); MR-M2 R2 `/v1` cutover blocked (consumed surfaces draft x-status, 501-upstream); MR-M3 TS verifier packaging + audience model undecided; MR-M4 flat-host vs per-cell routing — arch says open, but ADR-0020 + live code (`src/routing/`) already answer it, flagged as a canon-reconciliation gap not yet closed as of 07-15.
  - **Already-ruled seams recorded so no wave re-opens them:** OD-5 (`ask`→ai, D-M7) resolved; OD-6 (revocation mechanism, ADR-0013) resolved; OD-7 (knowledge-direct roster line) resolved via PO-ruling-9; OD-1 (revocation transport, D-S13) resolved; OQ-M3/M4/M7 closed.
  - **Non-goals reaffirmed:** no business logic, no direct engine coupling post-cutover, no auth minting, no `resource_type`, no persistence/worker, no Go rewrite, no browser UI.
- **Note for current readers:** the 07-15 "19 tools" figure, the un-namespaced tool names, and the MR-M1..M4 seam framing are all **now folded into or superseded by** `ZGjLctEnGH`'s R-WDS-1/2/3 + R-SEAM-1..10 — e.g. MR-M1 (`studio_*` contract home) is resolved by R-SEAM-1/3 (contract-pinned against studio-api, marketplace/skill kept separate); MR-M2 status should be re-checked against the 07-17 "Waves 1–2 merged" implementation record.
- **Read note:** no table/embed drop warning reported at fetch (page rendered fully as prose/code-fence).

### 3.4 `tQcQ01U2iy` — SDD: orvex-studio-mcp (Wave-3, ENG-2102)

- **status:** canonical (metadata) · **doc_type:** technical-spec · dated 2026-07-15
- **Currency:** ⚠ **STALE BASELINE** — same explicit banner as the PRD-delta, pointing to `ZGjLctEnGH`.
- **What it is:** "the total service-level Done list" — a mechanically-verified totality checklist (not the wave slice) covering the full tool surface, all three upstreams, auth/quota, consumed events, cell-lint (all 14 rules), observability/SLOs, statelessness/decommission, ADR triggers, and family-E2E participation. Built as an "anti-fake-done ratchet."
- **Substantive commitments (2026-07-15 snapshot):**
  - **Full tool-surface Done-list** (all boxes unticked as authored): 11 hero wiki tools, 6 `studio_*` product tools (blocked on MR-M1 contract-home), 2 re-homed search tools, later-wave `staging_*`/`workgraph_*`/chat-inline-generate/Claude-memory-parity tools (no story coverage at the time), 1 static resource `orvex://authoring-guide`.
  - **Src-tree census** (mechanical totality check): 10 `src/*` packages + `src/index.ts`, ~9,879 LOC total at the time (`auth` 865, `backstage` 2857, `config` 173, `events` 340, `health` 56, `routing` 403, `server` 3732 — `tools.ts` alone 2802 LOC, flagged CS §8 smell — `tools` 497, `transport` 615, `upstreams` 341). 35 test files.
  - **Cell-lint 14-rule pass:** only Rule 4 (CELL_ID/CLUSTER_NAME echo) checked off (`[x]`) as landed at authoring time; rules 7/8/13 marked N/A (stateless, no S3, no KEDA); rest unticked pending verification.
  - **Anti-fake-done clause (verbatim doctrine, still binding as a pattern):** CI-green, ArgoCD-Healthy, and "28 stories closed" are each explicitly named as **NOT** evidence of Done — a silently-dead revocation consumer reads Healthy while serving revoked tokens; the 28 `[mcp]` stories are "VERIFY + harden" closeable without the first three-repo E2E ever running. Done requires a **human-verified** first three-repo E2E, not a Healthy pod.
- **Note for current readers:** the 2026-07-17 re-baseline's implementation record (417/417 hermetic tests, kpi-golden-tape 12/12 required gate, connect-schema 5,303 tokens, **6/6 green three-repo E2E** on 2026-07-17T12:48Z) is direct, dated evidence that several of this SDD's Done-list boxes have since been ticked for real — but this SDD itself has not been re-walked/updated to reflect it; treat its checklist as a template/structure that is still useful, its tick-state as of 07-15 only.
- **Read note:** no table/embed drop warning reported at fetch.

### 3.5 `ok9tiXDCjB` — ADR 0002 — MCP progress-notification streaming relay for ask + edit verbs (R21)

- **status:** draft · **doc_type:** adr · dated 2026-07-16
- **Currency:** ⚠ **Framing stale, shipped mechanism current — flagged tension, unresolved.**
- **Decision (still the shipped mechanism):** the MCP relays a caller's own in-flight `ask`/edit-class turn back to that same caller via MCP `notifications/progress`, keyed by caller-supplied `progressToken`, with graceful buffered degradation. This is a **1-to-1, request-scoped, caller-addressed relay** — not server-initiated reactivity, no spine subscription, no broadcast, no content feed — and is framed as amending (not violating) the A-REACTIVE doctrine on `BE0jTNoweS` ("no content consumer, no SSE fan-out, agents poll" stands for everything else).
- **Context as originally written (now the stale part):** "the amazing-MCP design (TARGET-SPEC, 2026-07-16) had already **frozen the tool surface at exactly 19 intent verbs**" — this framing is the exact thing R-WDS-1 (2026-07-17) supersedes with hero-13 + on-demand long-tail.
- **ask-class (ENG-2811):** SSE relay is built + unit-tested (`sse-frame-parser`, `AskFrame` decoder) but **dormant** — `ask` advertises `accept: application/json` only, because ai's `/v1/ask` is a buffered single-JSON responder today (SSE lives only on ai's `/v1/chat`/`/api/ai/inline`, neither carries a K5 verdict frame). A verdict-free streamed drain fails loud with `AI_UPSTREAM_TRUNCATED` rather than fabricating a grounded answer. Explicitly named as "ESCALATE-not-invent."
- **edit-class (ENG-2813):** `save_page`/`edit` call no model — deterministic wiki-api writes, instrumented with a local stage-progress emitter (not the SSE parser). Progress additive; receipt/CAS unchanged with no `progressToken`. A `converting` stage only fires on a real DfM→ProseMirror conversion.
- **Write-cancellation safety (asymmetry-aware):** pre-send connection failure → certain no-write, normal `UPSTREAM_ERROR`. Post-send/in-flight severance or client abort → outcome genuinely unknown, surfaces `ABORTED_UNCERTAIN_STATE` (omits `persisted` rather than asserting `false`) + `get_page` recovery hint. Post-commit verify-window failure → `VERIFICATION_UNCONFIRMED`, preserves id/version/url, never asserts `persisted:true`.
- **Consequences:** "no surface growth: still exactly 19 intent verbs" (stale line — see below); streaming is additive UX, never load-bearing for correctness; no token material in progress payloads/logs; proven by 258 green integration tests (real MCP SDK client, real `onprogress` callback).
- **⚠ Unresolved tension recorded directly in the current Architecture page (`BE0jTNoweS`'s 2026-07-17 correction banner):** *"ADR-0038 streaming-scope reconciliation is still open. The draft ADR grants a two-tool-only (chat/inline) exception; what actually shipped (PR #37) is an ask-class SSE relay plus save/edit stage-progress — neither is chat/inline, and the ask relay is dormant by design. Ruling needed… Not resolved by the 2026-07-17 session — carried forward as an open item."* **`ADR-0038` is not itself a page in the `orvexstudiomcp` space** (not among the 19 listed) — its existence and contents are known only via this citation; could not be independently verified in this pass. Flagged, not guessed at.
- **Read note:** no table/embed drop warning reported at fetch.

---

## 4. The remaining pages (context for the five above)

### 4.1 `BE0jTNoweS` — Architecture: orvex-studio-mcp (post-split) — canonical, patched 2026-07-17

- ⚠️ fetch warning: `drops lossy node types [excalidraw, table]` — this page carries at least one Excalidraw diagram and table(s) not captured by plain `page get`; use `--prosemirror` or `page mirror pull` for lossless access if diagram content is needed.
- Carries a 2026-07-17 top-of-page correction banner (2 items): (1) A-UPSTREAM knowledge-routing correction per PO ruling 9/D-M8 (search/related/neighborhood reach knowledge **directly**, not "only via wiki-api's fronting output" as the body below still says); (2) re-baseline ratification note.
- **Re-baseline section (READ FIRST, additive, supersedes conflicting prose further down):** repeats R-WDS-1 hero-13 architecture, introduces the Tenant Governance Profile as a new architectural concept sitting inside the write-gate, names the disclosure-mechanism target (`tools/list_changed` push + platform Tool Search, retiring the fragile `tool-visibility.ts` SDK reach-through), reaffirms statelessness, and is the **origin of the ADR-0038 open-item flag** described in §3.5 above.
- **Body below the banner (2026-07-06 ratified, describes the *target* post-split architecture, itself now further amended by the 07-17 banner):** three upstreams (wiki-api / ai / identity); A-TOKENS pass-through-only (never mints, transports RATIFY/CONFIRM verbatim, `needs_human_publish`/`needs_human_confirm` pass through unshaped); A-CLIENT two-step repoint (byte-compatible facade now, `/v1` regen at contracts freeze); the ask repoint queues behind ai shipping its ask surface — same K5 contract, different upstream, golden tape as cutover detector.
- **Honesty ledger caveat (explicit "known-stale marker" on the page itself):** the ledger's 2026-07-05/2026-07-08 entries predate the 2026-07-16 self-rebuild (`07e2687`) — treat as historical, not a fact-check against today's code.

### 4.2 `k1sWjtJq3x` — PRD: orvex-studio-mcp (post-split repoint) — canonical, patched 2026-07-17

- ⚠️ fetch warning: `drops lossy node types [table]`.
- Same pattern as the Architecture page: a 2026-07-17 ratification banner + a "Re-baseline (READ FIRST)" additive delta section that maps old→new names explicitly: `get_page`→`wiki_get`; `search`→`knowledge_search`; `ask`→`ai_ask`; `save_page`+`edit`→merged `wiki_save`; `related_pages`/`get_neighborhood`/`get_space_tree`/`get_changes`/`get_capabilities` **demote to on-demand**.
- Body below (still-standing FR-M1..M19, NFR-M1..M6, OD-1..OD-7, OQ-M1..M7, D-M1..D-M9) is the **exhaustive baseline** the PRD-delta (`8nngxUpOXY`) explicitly built against rather than duplicating. Contains the full K5 envelope definition and FR-M13 (`needs_human_publish`/`needs_human_confirm`) — see §5 below for consolidated detail.
- States clearly: "~19 tools live today" was the **as-shipped-2026-07-03/07-14** figure — pre-dates the 07-17 hero-13 cut.

### 4.3 `BZldxVAmdR` — Architecture Audit — SE-Arch review (2026-07-05) — canonical

- SE-Architect adversarial review evidence record (not a live status page). Verdict at the time: **contradicts-canon** on one load-bearing point (raw in-process Kafka consumer vs mandated Knative-Trigger, OD-6) plus a canon-roster divergence (OD-7, since resolved by PO-ruling-9). Per-lens verdicts: 2 HIGH (stale README advertising a removed admin-equivalent credential; the OD-6 P2 contradiction, downgraded from HIGH after OD-1 resolution), several MEDIUM/LOW. Strong positives noted: anti-SSRF origin guard, JWT alg-pinning, fail-closed verify, A-CLIENT fail-loud discipline, tiny AI-spend footprint (MCP holds no LLM key).

### 4.4 `lR3kpc0Ra2` — ADR 0001 — MCP /v1 client regeneration + ask→ai upstream — draft

- Banner: "still governing for /v1 codegen provenance; tool NAMES herein superseded by … R-WDS-1." Decision: backstage client regen source moves from the engine's live 322-path OpenAPI descriptor to the pinned `orvex-studio-contracts` `/v1` tag; `ask` moves from the wiki facade onto the `ai` upstream. Filed 2026-07-12 per SE-Arch §4i mandatory-ADR trigger (ENG-1406 R2). This is the R2 cutover mechanism referenced as still-blocked (MR-M2) in the stale Wave-3 PRD-delta/SDD — current status of that block was not independently re-verified in this pass beyond the 07-17 implementation record's Wave 1/2 scope (which does not explicitly claim R2 landed).

### 4.5 `koIvfpnSbX` / `ppYIXBL4Cp` / `RcvZDU2Sds` — Wave-3 Contract Summary / Build Prompt / Test Plan

- All three: canonical (metadata), dated 2026-07-15, all carrying the identical "STALE BASELINE … superseded by commit `07e2687` and the 2026-07-17 WDS re-baseline" banner. Companion documents to the PRD-delta (`8nngxUpOXY`) and SDD (`tQcQ01U2iy`) — not separately deep-read in this pass beyond their banners, given the explicit staleness marker and the existence of the current `ZGjLctEnGH`/`O6o61ov2e7` anchor pair. Flag for a future pass: these were not walked line-by-line; if Track 1 (feature-parity mapping) needs their contract/test-plan detail, re-fetch and reconcile against `ZGjLctEnGH` first.

### 4.6 `2hPabxB7Fh` / `986V0taYy5` / `J8nvlh1ctw` / `6e2jqBdknZ` — Era-1 founding documents

- `2hPabxB7Fh` (Docmost Server Requirements) and `6e2jqBdknZ` (Thin Build Plan) both carry the "HISTORICAL (Era-1, pre-split) … retained as founding-intent evidence" banner, same family as the Brainstorm/Research pages already detailed in §3.1–3.2. `6e2jqBdknZ` fetch warning: `drops lossy node types [table]`.

### 4.7 `CjaHVTg8Id` / `lRERyG7Zpj` / `CIemV9m0eb` — Era-2 "act-as-user model" documents

- All three carry "HISTORICAL (Era-2 act-as-user model, retired by FR-M11). Do not use for current auth/deploy state." `CjaHVTg8Id` (Studio↔MCP Contract) fetch warning: `drops lossy node types [table]`. This era's auth model (Studio-signed session token + MCP→Studio token-resolution API, no OIDC/OAuth) is fully retired — current auth is dual-IdP via identity, per §5.3 below. `lRERyG7Zpj` and `CIemV9m0eb` are explicitly superseded operationally by `O6o61ov2e7` (§2.2).

---

## 5. Consolidated substantive-commitment detail (cross-page synthesis)

### 5.1 The tool-surface evolution (the central stale-vs-live thread)

| Era | Surface shape | Source page(s) | Status |
| --- | --- | --- | --- |
| Era-1 (pre-split brainstorm) | ~3 hero tools (`ask`/`search`/`save`·`edit`), ~12 verbs total | `986V0taYy5`, `J8nvlh1ctw`, `6e2jqBdknZ`, `2hPabxB7Fh` | HISTORICAL |
| Era-2 (act-as-user) | Studio-session-token model, tool set not the focus | `CjaHVTg8Id`, `lRERyG7Zpj`, `CIemV9m0eb` | HISTORICAL |
| Post-split repoint (as-shipped 2026-07-03/07-14) | **19 tools**: 11 hero (`whoami ask search get_page save_page edit get_neighborhood get_space_tree get_changes related_pages list_tools`) + 8 `studio_*` | `k1sWjtJq3x` (body), `8nngxUpOXY`, `tQcQ01U2iy`, `koIvfpnSbX`, `ppYIXBL4Cp`, `RcvZDU2Sds` | STALE BASELINE (banners) |
| "amazing-MCP" self-rebuild (2026-07-16, commit `07e2687`) | Frozen at **exactly 19 intent verbs**, uniform `{result, trust, fidelity, next}` envelope, no chat/inline/generate | `ok9tiXDCjB` (ADR 0002 context) | STALE FRAMING (superseded next day) |
| **WDS re-baseline (2026-07-17, PO-ratified)** | **Hero-13** namespaced verbs + on-demand long-tail, Architecture B, bidirectional-lite | `ZGjLctEnGH`, `BE0jTNoweS` (banner), `k1sWjtJq3x` (banner), `O6o61ov2e7` | **LIVE — merged to `dev`, deployed, 6/6 E2E green same day** |

### 5.2 Read-ladder

- **Current (`ZGjLctEnGH`, `O6o61ov2e7`):** `wiki_get` — outline→section→full **DfM** (Docmost-flavored-Markdown) ladder, one merged read verb.
- **Prior/stale variants seen across the canon (for historical/reconciliation awareness only):** `get_page` info→outline→blocks (PRD `k1sWjtJq3x` body, PRD-delta, SDD); `ask`→snippet→outline→full (brainstorm `986V0taYy5`, framed as the "cheap-by-default reads" idea); token-budget-aware auto-outline (technical research `J8nvlh1ctw`'s REFINEMENT of the static ladder — page > N tokens + has headings → TOC+node-IDs instead of body, `force_full` override). The current hero-13 collapses this family down to the single `wiki_get` verb; the internal ladder mechanics were not independently re-verified against the live `dev` code in this pass (out of scope — wiki canon only, per task framing).

### 5.3 Write governance

- **Current (R-WDS-3, `ZGjLctEnGH`):** writes **ON by default everywhere**, all four governance layers active (dry-run preview → space allowlist → confirm-token/elicitation → CAS `ifVersion`→409), hard `READ_ONLY` override flag for read-only deployments (GitHub/Supabase ceiling pattern). Live dev overlay: `WRITE_ALLOWED_SPACES` scoped to only the e2e persona space, base config deny-all (`O6o61ov2e7`).
- **New concept layered on top:** **Tenant Governance Profile** — per-tenant policy object, 3 knobs (memory-write mode staged|direct; sharing grants console-only|agent-enabled; publish path ratify-required|scoped-key), all default human/Librarian-gated. Selects *which* gated-write flavor applies; never widens what a `READ_ONLY` tenant can do (`BE0jTNoweS` banner, `ZGjLctEnGH` §4).
- **Superseded prior model (STALE):** a dark-by-default `WRITES_ENABLED=false` save door (the shape recommended by the technical-research survey `J8nvlh1ctw`'s "4-layer write governance, off by default" — explicitly reversed by R-WDS-3, and the PRD/Architecture pages' pre-banner body text still describes the old CAS-only framing without the tenant-profile layer).
- **Auth/token model (current, `k1sWjtJq3x`/`BE0jTNoweS` bodies, not touched by the 07-17 banners):** caller's own token forwarded **verbatim** upstream on all three legs (wiki-api, ai, Studio backend) — the MCP holds no service credential on user-facing paths, never mints, never exchanges. Dual-IdP (Clerk global / Keycloak realm) verification at the edge via a conformance-tested TS binding of the family verifier contract.

### 5.4 K5 ask envelope

- **Owner:** `orvex-studio-ai` (D-M7) — owns the **full** cited-ask loop: agentic multi-hop retrieval against `orvex-studio-knowledge` under the **caller's delegated principal**, then K5 synthesis. The MCP composes **zero** K5 fields — it passes the shape through "shaped-for-MCP but semantically unmodified" (`k1sWjtJq3x` FR-M7).
- **Shape (verbatim, `k1sWjtJq3x`):** `{answer, citations[], confidence, unanswered, gapNote, followups}`.
- **Routing correction (PO ruling 9 / D-M8, ENG-1403 Done, reaffirmed `ZGjLctEnGH` register-item-3):** `search`/`related_pages`/`get_neighborhood` (semantic half)/future `duplicates` reach knowledge **directly** (MCP holds a knowledge base URL) — this is the search/RAG path, distinct from `ask` which routes via ai. Knowledge must enforce ACL∩token-scope at its own egress chokepoint regardless of caller (FR-K31b) since the wiki-api ACL intermediary is removed from this path.
- **Current verb name:** `ai_ask` (hero-13, per R-WDS-1) — supersedes the un-namespaced `ask` used throughout the pre-07-17 canon body text.
- **Live evidence:** the 07-17 6/6 E2E run exercised `ai_ask` with confidence 0.95 (`ZGjLctEnGH` implementation record).
- **Streaming status (ADR-0002/R21):** `ask`/`ai_ask` streaming is a dormant, unit-tested SSE relay (`sse-frame-parser` + `AskFrame` decoder) not yet advertised (`accept: application/json` only) because ai's `/v1/ask` is buffered-only today; a verdict-free streamed drain would fail loud (`AI_UPSTREAM_TRUNCATED`) rather than fabricate — see §3.5.

### 5.5 `needs_human_publish` / human-gated actions

- **Rule (consistent across current and pre-banner canon — this piece has NOT changed across eras):** the MCP **never** self-promotes draft→canonical, on any path. When a flow reaches "ready to publish," it returns `needs_human_publish` (or `needs_human_confirm`) plus a Studio deep-link. RATIFY/CONFIRM tokens are opaque strings from the MCP's point of view — minted at the engine chokepoint (wiki-api D-A8), handed to a human via the deep-link, **transported verbatim if supplied, never parsed/cached/logged/minted** by the MCP (`BE0jTNoweS` A-TOKENS, `k1sWjtJq3x` FR-M13).
- **Era-2 predecessor (now retired):** `CjaHVTg8Id`'s framing — "Studio's tier-1 admin credential performs the promotion out-of-band" — same principle, superseded auth mechanism (Studio-signed session token model, retired by FR-M11).
- **Consistency note:** this is the one substantive commitment in the whole evidence set that reads as **stable across every era** — brainstorm, Era-2, post-split PRD, and the 07-17 re-baseline all converge on "AI never self-promotes; publish is human+Studio-deep-link-gated." No stale-vs-live conflict found here.

---

## 6. Deployment / operational ground truth (from `O6o61ov2e7`, cross-checked against `ZGjLctEnGH`'s implementation record)

- **dev:** LIVE at `mcp.orvex.dev`, `dev` branch @ `8076395`, Tekton auto-build + reloader, `kpi-golden-tape` required CI gate, hero-13 catalog live, writes-ON + hard `READ_ONLY` ceiling (dev overlay restricts `WRITE_ALLOWED_SPACES` to the e2e persona space only).
- **crew-daniel:** LIVE at `crew-daniel-mcp.studio.orvex.ai`, same `dev` code, manual 3-step rollout (push `dev:crew/daniel` → in-pod `git pull` → `crew-restart.sh`, now lockfile-hash-aware).
- **production:** **NOT deployed.** Explicitly held by the owner; no prod overlay exists; do not create one as a side effect of other work.
- **E2E evidence:** first-ever 6/6 green three-repo E2E, 2026-07-17T12:48Z, ENG-2886 comment `4bffbe1b`. 6/7 run stability; sole flake is a known, isolated, non-MCP knowledge cold-start race (ENG-2906).
- **Gates:** 417/417 hermetic tests, 12/12 kpi-golden-tape (required CI gate, not aspirational), typecheck/lint clean, connect-schema 5,303 tokens (within ~4.5–5.5k budget).
- **Dead host to purge from any downstream doc:** `dev-mcp.studio.orvex.ai` (Era-2, retired) — active triad is `mcp.orvex.dev` / `auth.orvex.dev` / `wiki-api.orvex.dev`.

---

## 7. Open items / owner queue (as of 2026-07-17, from `ZGjLctEnGH`)

- 16 In-Review tickets + ENG-2811/2813 + 8 evidence-closed tickets — pending owner Done-gate review (Linear status ceiling = In Progress; owner reviews before Done per standing memory rule).
- Wiki draft→canonical status-field flips require a human-minted RATIFY token (ENG-2899) — the CLI/API cannot self-mint this by design; this is why `ZGjLctEnGH` and other pages remain metadata-`draft` despite being content-ratified.
- ADR-0029 ratification package (ENG-2878) and ADR-0038 reconciliation package (ENG-2885) — **ADR-0038 is the still-open streaming-scope tension** flagged in §3.5/§4.1 above.
- `workgraph_save` hero-tier evidence memo (ENG-2868) — thin trigger-map evidence; owner ruling needed on whether it keeps its hero-13 seat.
- Production deployment — held on owner sign-off.
- Family canon root `CxjFpIVUZY` roster-line bug (contradicts PO ruling 9 on knowledge routing) — flagged, out of this pass's edit scope, needs a follow-up ticket beyond the ENG-2800 posting already made.

---

## 8. Fetch-integrity notes (embeds-drop caveat, honored per task instruction)

Pages where `docmost-cli page get` (plain) reported dropped lossy node types at fetch time — **not** independently re-fetched with `--prosemirror`/`page mirror pull` in this pass, so any table/diagram content on these pages is **not represented** below and should not be assumed absent from the source:

- `BE0jTNoweS` — drops `[excalidraw, table]`
- `k1sWjtJq3x` — drops `[table]`
- `CjaHVTg8Id` — drops `[table]`
- `6e2jqBdknZ` — drops `[table]`

All other fetched pages (`ZGjLctEnGH`, `O6o61ov2e7`, `BZldxVAmdR`, `lR3kpc0Ra2`, `ok9tiXDCjB`, `koIvfpnSbX`, `ppYIXBL4Cp`, `RcvZDU2Sds`, `8nngxUpOXY`, `tQcQ01U2iy`, `2hPabxB7Fh`, `986V0taYy5`, `J8nvlh1ctw`, `lRERyG7Zpj`, `CIemV9m0eb`) returned no lossy-drop warning at fetch time.
