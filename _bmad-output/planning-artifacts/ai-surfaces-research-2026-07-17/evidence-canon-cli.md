# Evidence Mapping: `orvexcli` wiki space canon — orvex-cli

Sync: `docmost-cli cache sync --space orvexcli` → `{"status":"complete","triggered_at":"2026-07-17T15:12:01Z"}`
Listing: `docmost-cli page list --space orvexcli --output json` → **8 pages**, all top-level except one child.
Method: `docmost-cli page get <slug> --no-daemon` (plain, not `--prosemirror`) for all 8 pages.

**Standing caveat (per task instruction — noted, not guessed):** plain `page get` printed the warning
`⚠️ page get (plain): drops lossy node types [table] — use 'page get --prosemirror' or 'page mirror pull' for lossless access`
for **3 of the 8 pages**: `pf10XC2Qjz` (Architecture), `PACF13d3I3` (Audit Findings & Rebirth Plan), and `EJ9WgVAuls` (SE-Arch Review). These three contain PM `table` embed nodes (Dependencies tables, Findings tables, repoint matrices, cell-lint tables) that plain-text extraction may render incompletely or lossily. The pipe-table text captured below for those three pages is what plain `page get` returned; it should **not** be treated as a guaranteed-lossless transcript — a `--prosemirror` or `page mirror pull` re-fetch would be needed for byte-exact table content. The other 5 pages (`6NVIjKeiWs`, `9AdZkNTlyj`, `UQFNh4QEmw`, `lhqTzMTPCj`, `8GNuGKq8wn`) triggered no such warning — their tabular content is rendered as ASCII-aligned code-fence blocks (not PM table nodes), consistent with the known docmost-cli create/write guard that steers authors away from pipe tables (see memory `docmost create guard: HRs + tables`).

---

## Page inventory (all 8 pages in `orvexcli`)

| Slug | Title | Status (metadata) | doc_type | Parent | Updated |
|---|---|---|---|---|---|
| `pf10XC2Qjz` | Architecture: orvex-cli | **canonical** | architecture | (root) | 2026-07-16 |
| `EJ9WgVAuls` | Architecture Audit — SE-Arch review (2026-07-05) | **canonical** | retrospective | child of `pf10XC2Qjz` | 2026-07-12 |
| `PACF13d3I3` | Orvex CLI — Audit Findings & Rebirth Plan | **draft** | prd | (root) | 2026-07-16 |
| `UQFNh4QEmw` | PRD-delta (reconciled): orvex-cli | **canonical** | prd | (root) | 2026-07-15 |
| `6NVIjKeiWs` | Build Prompt: orvex-cli | **canonical** | technical-spec | (root) | 2026-07-15 |
| `9AdZkNTlyj` | Contract Summary + Tag State: orvex-cli | **canonical** | technical-spec | (root) | 2026-07-15 |
| `lhqTzMTPCj` | Service Done Definition (SDD): orvex-cli | **canonical** | technical-spec | (root) | 2026-07-15 |
| `8GNuGKq8wn` | Test Plan: orvex-cli | **canonical** | technical-spec | (root) | 2026-07-15 |

`UQFNh4QEmw` metadata carries `"supersedes":["R4AOVBLST7"]` — the old **"PRD: orvex-cli" (`R4AOVBLST7`)** is NOT present in this page listing at all (not draft, not canonical, not visible) — see **Flag 1** below.

---

## ⚠️ FLAG 1 (HIGH) — metadata says "canonical", page body says "DRAFT, never self-ratify"

Five of the six 2026-07-15 "Wave 3 / ENG-2105" pages carry the wiki's `status: canonical` field in their metadata, **yet their own first line of body text explicitly declares themselves draft and unratified**:

| Slug | Metadata status | First-line self-declaration in body |
|---|---|---|
| `UQFNh4QEmw` (PRD-delta) | canonical | *"**Status: DRAFT.** Pack ENG-2105 (Wave 3), artifact 1 of 5. Reviewer ≠ author. Never self-ratify."* |
| `6NVIjKeiWs` (Build Prompt) | canonical | *"**Status: DRAFT.** Pack ENG-2105 (Wave 3), artifact 5 of 5. Reviewer ≠ author. Never self-ratify."* |
| `9AdZkNTlyj` (Contract Summary) | canonical | *"**Status: DRAFT.** Pack ENG-2105 (Wave 3), artifact 2 of 5. Reviewer ≠ author. Never self-ratify."* |
| `lhqTzMTPCj` (SDD) | canonical | *"**Status: DRAFT.** Authored for pack ENG-2105 (Wave 3). Reviewer ≠ author; not canonical; never self-ratified."* |
| `8GNuGKq8wn` (Test Plan) | canonical | *"**Status: DRAFT.** Pack ENG-2105 (Wave 3), artifact 3 of 5. Reviewer ≠ author. Never self-ratify."* |

This is a direct metadata/content contradiction on 5 of 8 pages in the space, and it collides with the `docmost-cli ratify-token guard` doctrine (memory: "draft→canonical now needs a human-minted token") and the "AI never self-promotes" rule that `doc-ratify` is supposed to enforce. Either (a) these pages were canonicalized without a human ratify pass (a process violation), or (b) the `status` field was set some other way (e.g. inherited default, bulk operation) that never got reconciled with the in-body draft banner. **Not resolved by this evidence pass — flagged for the orchestrator, not guessed at.**

Only `PACF13d3I3` (the older, 2026-07-05 audit/rebirth-plan page) has internally-consistent status: metadata says `draft`, and its body carries no canonical/draft self-declaration of its own (it predates the Wave-3 ENG-2105 convention).

`pf10XC2Qjz` (Architecture) and `EJ9WgVAuls` (SE-Arch audit) are the only pages where metadata (`canonical`) and body text agree: both explicitly state *"STATUS: canonical (ratified 2026-07-06, batch approval)"* in-body.

---

## ⚠️ FLAG 2 (HIGH) — the canonical Architecture + SE-Arch pages are stale relative to the Wave-3 evidence pack (2026-07-15)

- `pf10XC2Qjz` (Architecture, canonical, ratified 2026-07-06) and `EJ9WgVAuls` (SE-Arch audit, canonical, ratified 2026-07-06) were both written when **the repo was a 2-file stub** (`README.md` + `CLAUDE.md`, single commit `a996980`, "no go.mod, cmd, internal, tests, or CI"). Both explicitly self-describe as auditing **design only, not implementation**, because there was no implementation yet.
- The Wave-3 pack (`UQFNh4QEmw`, `6NVIjKeiWs`, `9AdZkNTlyj`, `lhqTzMTPCj`, `8GNuGKq8wn`, all dated 2026-07-15) measures the **real, current state of `orvex-cli` at `origin/dev @ 48329b7`**: 17,913 Go LOC, 108 Go files, 49 test files, 15 `internal/` packages, 13 `cmd/` namespaces, real HTTP-calling/auth-aware/contract-tested handlers for most wiki/auth/search/ai/migrate verbs — **and CI RED since 2026-07-13**, with a documented false-green trap (D-CLI1: a local `go test ./...` pass is a lie caused by an ambient `DOCMOST_API_TOKEN` leaking into non-hermetic `cmd` tests; the auth-threading commit `48329b7`/`84db4a0` broke ~15 `cmd` tests under a clean env).
- Neither `pf10XC2Qjz` nor `EJ9WgVAuls` has been updated to reflect this reality — they still read as "design-only, zero implementation drift to audit." The one exception: `pf10XC2Qjz` (and `PACF13d3I3`) each carry a **2026-07-16 appended note** resolving OQ-CLI3 (audit-sink ownership → orvex-studio-audit, ADR-0037) — so the Architecture page has been touched since Wave-3 landed, but only for that one item, not for the CI-red / false-green finding, the real LOC count, or the must-resolve list (MR-CLI1..5) the Wave-3 pack introduces.
- This is a textbook instance of the "Certified ≠ current" pattern from user memory: the ratified/canonical design pages describe a scaffold that no longer exists; the deployed-artifact reality (measured, dated, referenced by commit hash) lives in five DRAFT-labeled-but-canonical-flagged pages that the Architecture page does not cross-link to or reconcile against.

---

## ⚠️ FLAG 3 (MEDIUM) — stale cross-reference to a PRD slug not present in this space

- `pf10XC2Qjz` (Architecture) states: *"Satisfies `PRD: orvex-cli` (FR-CLI1 to FR-CLI20)."* — no slug given inline, but `EJ9WgVAuls` (its child audit page) repeatedly cites the PRD by slug: **`R4AOVBLST7`**, e.g. in the F-A finding ("Arch page pf10XC2Qjz ... and PRD R4AOVBLST7 pin hosts as...").
- `R4AOVBLST7` **does not appear anywhere in the current `orvexcli` page list** (8 pages, enumerated above). It is referenced as superseded metadata on `UQFNh4QEmw`: `"supersedes":["R4AOVBLST7"]`.
- `UQFNh4QEmw` (PRD-delta) itself states explicitly: *"the **draft service PRD** — `R4AOVBLST7` 'PRD: orvex-cli' (draft; the reconciliation base, not regenerated)"* and reconciles against it as canon-to-be-superseded — but does NOT claim to replace `R4AOVBLST7` outright (it's a *delta*, "does not regenerate the PRD").
- Net effect: the **canonical Architecture page cites a PRD (`R4AOVBLST7`) that is absent from the space's live page list** (presumably archived/trashed after being marked `supersedes` on `UQFNh4QEmw`, but not confirmed — I did not attempt to fetch a trashed/archived page). Nobody has gone back to `pf10XC2Qjz` to repoint that citation at `UQFNh4QEmw`. **Not guessed further — flagged as a dangling/ambiguous canon reference.**

---

## Per-page substantive commitments

### 1. `pf10XC2Qjz` — Architecture: orvex-cli (canonical, ratified 2026-07-06; tightened per SE-Arch 2026-07-05; appended ADR-0037 note 2026-07-16)

- **Multi-service scope, confirmed:** single Go/cobra binary `orvex` (+ `orvex-full`); wiki is **one namespace among peers** — `ai`, `auth`, `search`, `admin` — plus client-local tooling (`daemon`, `cache`, `config`, `doctor`, `audit`, `instructions`).
- **From-scratch build (D-S21 AMENDED):** empty repo, deliberate commits against the microservice architecture; `docmost-cli` is the untouched behavioural reference (never imported).
- **Domain-pure routing (D-S16):** wiki→orvex-wiki-api, search/knowledge/SSE→knowledge, ask/chat→ai, auth→identity; **engine's raw API never contacted**.
- **pkg/dfm serializer:** DfM↔ProseMirror conversion is **in-process and offline**, via clean-room `orvex-studio-lib/pkg/dfm` — not a network call.
- **Linear absent (D-S11).**
- **Endpoint registry / host form (F-A, the one HIGH pre-tightening finding):** originally pinned cell-segmented hosts contradicting family canon `86CiGucQwU`; tightened draft adopts canon's **flat service hosts** (`wiki-api.orvex.{tld}`, `auth.orvex.{tld}`, `events.orvex.{tld}`), with **only the wiki tenant host cell-segmented** (`{tenant}.wiki.{cell}.orvex.{tld}`). Still-open: `ai` host and public knowledge query host (OQ-CLI2), wiki-api host form flat-vs-`api.wiki` (OQ-CLI2b).
- **Cell-contract conformance (JGAUQRsw2g):** 421 cell-mismatch handling (typed retriable-after-re-resolve), cursor cell-qualification `(cell/events-host, space)`, Idempotency-Key on replayable writes, correlation-ID origination/propagation — all specified in the tightened design (per findings F-B/F-C/F-F/F-G below).
- **Not a service tier (CS §6 non-service note):** no store/event/cache service tier; reaches Studio state only via siblings' published APIs; local SQLite cache + knowledge SSE stream are client-local.
- **9 dependencies tabulated**, explicitly **excluding** orvex-studio-billing (webhook-only, no CLI-facing host; entitlement state via knowledge FR-K20 projection).
- **10 open questions (OQ-CLI1..9)** carried, incl. content_pm parity, ai/knowledge/wiki-api host forms, audit sink (since resolved by ADR-0037, appended 2026-07-16), ifVersion representation, image_from_prompt cross-service path, config-discovery coupling, freshness SLO, tenant-to-cell resolution contract, ADR registry parent.
- **Owner:** jezer.bacquian@orvex.ai. **Last reviewed: 2026-07-05.**

### 2. `EJ9WgVAuls` — Architecture Audit — SE-Arch review (2026-07-05) (canonical, ratified 2026-07-06; child of `pf10XC2Qjz`)

- Adversarial SE-Arch review applying 5 Well-Architected lenses + routing/canon-conformance + governance/ADR checks against a **design-only** target (repo was a 2-file scaffold at review time; explicitly "ZERO implementation drift to audit").
- **Pre-tightening verdict: contradicts-canon** (one HIGH finding, F-A, on host-routing form vs family canon `86CiGucQwU`); **post-tightening: all findings dispositioned** (fixed-in-draft or open-decision, none silently dropped).
- **7 findings table** (F-A HIGH routing/canon; F-B/F-C MEDIUM reliability/cell-contract; F-D MEDIUM governance/ADR; F-E MEDIUM completeness/routing — workspace-admin unrouted; F-F/F-G LOW idempotency/observability) — each with evidence citation and disposition.
- **Security/Zero-Trust and Cost/Resource Governance lenses: CONFORMS, no findings** — no elevated credential, no authz decisions, no LLM/provider key in the CLI.
- **Preserved strengths** explicitly re-affirmed: domain-pure routing, CS §6 non-service tiers, clean-room pkg/dfm AGPL boundary, contracts-tag codegen (never served-descriptor), client zero-trust posture, no Linear, honest REQUIRES_FULL_BINARY stubs (no fake-done claim).

### 3. `PACF13d3I3` — Orvex CLI — Audit Findings & Rebirth Plan (2026-07-05) (**draft**, prd doc_type; updated 2026-07-16)

- The **evidence/execution-detail page** that `pf10XC2Qjz` and the (now-superseded, absent) `R4AOVBLST7` PRD distill from. Explicitly labeled "Study Page 2," destined to migrate from `docmostcli` space (D-S21) — confirms this page's own provenance is the pre-split legacy docmost-cli codebase audit, not the new orvex-cli repo.
- **13 real defects (D1–D13)** found in the *original docmost-cli* codebase with file:line evidence, each with a fix mapped to the rebirth plan — e.g. D1 (markdown→PM has no offline path — fixed by pkg/dfm), D2 (baked-Excalidraw data-loss bug — fixed by opaque byte-identical reattach), D4 (`orvex-ai` vs `orvexai` GitHub org mismatch breaking release automation), D5 (keychain rename silently orphans tokens), D6 (cursor lag/monotonicity coupled to Redis stream-ID shape), D13 (coarse space-level-only permission pruning, soft-trash leaves revoked content on disk).
- **D-S21 AMENDED (Daniel, 2026-07-05):** overrides the plan's own earlier "rename-in-place / seed git history from docmost-cli" mechanic — repo is built **from scratch, empty**, docmost-cli stays a frozen behavioural reference only.
- **Full command-tree census** (§2.2): namespace-first cobra tree, 21 retained block schema types (29→21 after 8 Linear entries drop) + the `diagram` command (22nd retained non-Linear block subcommand).
- **42-row repoint matrix** (§3): maps every legacy docmost-cli HTTP call to its target microservice (FACADE/`/v1`/KNOW/AI/ID/WAPI-PROXY) and CLI build phase (C0–C9).
- **pkg/dfm keystone (§4):** required Go API surface (`PMToDfM`/`DfMToPM`/`MarkdownToPM`/`MarkdownToDfM`/`Fidelity`/opaque-node handle encode-reattach); a **gating pre-task AGPL-provenance audit** of the existing hand-mirrored serializer (`internal/content/prosemirror.go`) before any pkg/dfm code lands, because `@docmost/editor-ext` is AGPL-3.0 and no CI guard catches contamination today.
- **SSE & cache-sync cutover (§5):** an 11-item FR-K15 gap list pinning the *actual, richer-than-spec* wire contract verbatim (`/events/head` cold-start, Redis stream-ID cursor semantics, unprefixed event names, thin `content_updated` frames, 1 MiB frame cap, 45s heartbeat, control frames, `applied_events` exactly-once dedup, `page.status_changed` gap = D3). `content_pm` (raw ProseMirror) flagged as the **single biggest FR-K22 parity risk** — the knowledge projection's `text_repr` has no PM-JSON analogue.
- **§6 Linear removal inventory — complete, product-wide (D-S11), feeds WS-19.** Enumerates every command (`cmd/linear/`, `cmd/issue/`, 4 block-renderer files/6 subcommands), internal packages (`internal/linear`, `internal/linearview`, `internal/embeds/linear/*`), content-layer scrub (loss_detector.go LossyNodeTypes, embed_guard.go fence prefixes), 20 `/api/integrations/linear/*` endpoints, schema catalog (29→21 blocks), the sole Linear-specific error code `LINEAR_NOT_CONNECTED`, and instructions text. Explicitly notes existing wiki content with Linear embed blocks must round-trip as **opaque-preserve, not hard-fail or silent-drop**. **Distinct from Linear-the-issue-tracker** used to manage ENG-* tickets for this program — see note in "Terminology" section below.
- **§7 contract gaps register** — ~20 numbered gaps (G1–G21 + named gaps) grouped by owner (contracts, wiki-api, knowledge, identity, cross-cutting/undecided), incl. G-audit (now resolved 2026-07-16 by ADR-0037 per the page's own appended change-log entry), G-tamper (audit tamper-evidence aspirational, not hash-chained), G3 (ifVersion representation unpinned).
- **§8 rename/back-compat plan** — full `DOCMOST_*`→`ORVEX_*` env map, keychain/config-dir/module/binary/Homebrew renames, what breaks (Linear commands gone, no shim) vs what holds (JSON output contract, exit codes, error vocabulary preserved byte-identically via the facade).
- **§9 sequenced build plan C0–C9** with sizes, gates, and master-study workstream dependencies (WS-1 contracts, WS-6/WS-8 identity, WS-10/11/12/13 wiki-api/pkg-dfm/knowledge/ai).
- **§10 risks/open questions** (10 items) — OQ-A7 marked CLOSED by D-S16 (domain-pure routing resolves the "engine-direct residual" question).
- **Change log (2026-07-05 + 2026-07-16 append):** documents propagation of Daniel's D-S12..D-S26 rulings, and the 2026-07-16 ADR-0037 resolution of the audit-sink gap (routes to shared `orvex-studio-audit` service, not the engine; **decision only, not yet re-pointed in code**).

### 4. `UQFNh4QEmw` — PRD-delta (reconciled): orvex-cli (canonical [metadata] / **DRAFT** [self-declared body]; supersedes `R4AOVBLST7`; 2026-07-15; ENG-2105 Wave 3, artifact 1 of 5)

- **Explicitly a delta, not a regeneration** of the PRD — reconciles the umbrella brief + concept-to-service map against three things: (1) draft service PRD `R4AOVBLST7`, (2) canonical Architecture `pf10XC2Qjz`, (3) **the deployed artifact** `orvex-cli origin/dev @ 48329b7` (2026-07-15) — which "wins over all prose including this repo's own README and its own Linear stories" (binding lesson 4).
- **First reconciliation — two repos both called "the CLI":** clarifies `docmost-cli` (legacy, monolith-coupled, installed at `~/go/bin/docmost-cli`) is NOT the Wave-3 target; `orvex-cli` (`orvexai/orvex-cli`) is the microservice-era successor. docmost-cli's only legitimate remaining role: behaviour-parity oracle for the DfM byte-round-trip corpus.
- **Second reconciliation — the false-green anti-fake-done centerpiece:** CI is RED since 2026-07-13 (4 consecutive dev-branch failures); a developer-box `go test ./...` PASSES only because the shell carries an ambient `DOCMOST_API_TOKEN`; under `env -i` (clean env) it fails (`AUTH_REQUIRED` where `SERVICE_UNREACHABLE`/`GATE_UNSATISFIED`/`VERSION_MISMATCH`/success was expected). Root cause: the auth-threading commit `48329b7`/`84db4a0` made every wiki verb require a bearer before the request, ahead of fixtures.
- **Program-level baseline cited:** per `program-status.md`, 1 PASS / 5 FAIL / 1 BLOCKED across 7 surfaces; only `api` is a clean end-to-end pass; the CLI is one of the 5 FAIL surfaces (no released binary, no tag, `which orvex` empty).
- **FR/NFR deltas (ADD/RECONCILE tagged):** CLI is the operator/agent surface over the microservice split, not the monolith (no provider key, no index — pure client); search routes through wiki-api's ACL'd `/v1/search` (fixed 2026-07-13, 3 leaves — related/duplicates/attachment-search — still hit knowledge directly, flagged MR-CLI1); ADD FR-D3 (capture is ambient — the CLI is the human/operator leg, MCP is the agent leg, staging pipeline NOT Phase-1 CLI scope); no-fallbacks doctrine reaffirmed (codegen fails loud on missing tag; cgo toolchain fails loud, ADR-0031); the CLI ships as a **signed binary, not a cluster workload** — no ArgoCD Application, no Helm chart, no cell pod.
- **Must-resolves flagged, explicitly left undecided:** MR-CLI1 (host-routing form), MR-CLI4 (SSE cursor scheme + content_pm parity) — maintained in ONE place, SDD §10.
- **One genuinely unspecified seam:** the **Go codegen bridge** — ADR-0035 governs only the 3 TS satellites (api/mcp/ui) and explicitly discusses **no Go stubs for any satellite**; the CLI's Go codegen mechanism (MR-CLI2) has no decided ADR.
- **Provenance section** lists every artifact reconciled against, incl. Linear read-only census from `.cache/linear/` by title-prefix `[cli]` — 35 stories `ENG-2544..ENG-2578` — "this pack touched no Linear" (writes).

### 5. `6NVIjKeiWs` — Build Prompt: orvex-cli (canonical [metadata] / **DRAFT** [self-declared body]; 2026-07-15; ENG-2105 Wave 3, artifact 5 of 5)

- Build-agent-facing prompt. **"The stories already exist. All 35 of them. Do NOT file any."** — `ENG-2544..ENG-2578`, censused by title-prefix `[cli]` (never substring, to avoid sweeping `[ai] beads→staging` etc.). No Linear writes permitted; only the orchestrator advances tickets, and never past a gate (memory: "Linear status ceiling = In Progress" applies).
- Reiterates the D-CLI1 false-green trap as **"THE DEFECT THAT REOPENS DISPATCH"** — the single most important thing on the page — with the exact repro commands.
- **§3 "YOU MAY NOT DECIDE THE MUST-RESOLVES"** — MR-CLI1..5 tabulated with which stories they block (MR-CLI1 blocks ENG-2545/2573; MR-CLI2 blocks ENG-2547; MR-CLI4 blocks ENG-2572/2573; MR-CLI5 blocks ENG-2546).
- **35-story sequence** mapped to epics E1–E8 across FOUNDATION → WIKI SURFACE → FULL VARIANT → OFFLINE → SEARCH/AI → CACHE/SYNC → AUTH → RELEASE, with explicit BLOCKED annotations where a story hits an open must-resolve.
- **Crew testing recipe (§7):** siblings slotted via `ORVEX_<SVC>_URL`; no dind/testcontainer (CLI's only store is embedded SQLite); private module `orvex-studio-lib` fetched via GitHub OIDC → OpenBao clone-only token (matches memory `private-go-module-oidc-ci`).
- **Deterministic Done gate (§8)** and a **self-audit H1–H17 (§9)** that is explicitly "not clean, and deliberately so" — H4 and H9 caveated rather than force-filled.

### 6. `9AdZkNTlyj` — Contract Summary + Tag State: orvex-cli (canonical [metadata] / **DRAFT** [self-declared body]; 2026-07-15; ENG-2105 Wave 3, artifact 2 of 5)

- **The CLI owns no OpenAPI** — no `openapi/cli.yaml` in `orvex-studio-contracts` — correct, since it's a client. Its "contract surface" = the 6 surfaces it **consumes** + 2 it co-owns (frozen exit/errorCode vocabulary; SSE/projection wire contract).
- **All 6 consumed surfaces are reachable from contracts tag `v0.1.3`** (verified via `git cat-file -e`, not timestamp) — explicitly contrasted with the *staging* pack's finding of "no tag" (do not copy that finding here — it's false for the CLI).
- **All 6 surfaces are still `x-status: draft`** at `4d32371` — stated as expected/by-design, not a defect; MR-CLI3: dev-codegen off draft is fine (ADR-0035 §3 permits it), but a GA/release pin needs `x-status: pinned`.
- **19-entry frozen `errorCode` vocabulary**, counted via `grep -cE '^\tCode[A-Z]' internal/output/errors.go`, all 19 codes enumerated; drift gate `TestCliContractNoDrift` parses `errors.go` via `go/parser` and is real/passing.
- **`gen/` is a placeholder** (`doc.go` only); `internal/client` typed clients are **hand-authored shells**, not yet codegenned — MR-CLI2 (Go codegen bridge undecided) blocks replacing them.
- **AGPL-provenance boundary reaffirmed:** generating Go types from the Apache-2.0 contracts YAML is clean-room; generating from the AGPL engine's served descriptor is forbidden — binds the CLI even though ADR-0035's toolchain doesn't cover it.
- Self-audit explicitly caveats: did NOT diff `internal/client`'s hand-mirrored shapes field-by-field against `v0.1.3` — that's the (blocked) codegen gate's job.

### 7. `lhqTzMTPCj` — Service Done Definition (SDD): orvex-cli (canonical [metadata] / **DRAFT** [self-declared body]; 2026-07-15; ENG-2105 Wave 3)

- **Mechanical totality check (NFR-CLI-T1):** every `internal/` package (15/15) and every `cmd/` namespace (13 + `gen/`) must appear in the SDD by path — re-runnable grep-based check, explicitly framed as a response to the Waves 1–2 lesson that self-audits can't catch omissions.
- **§1 honest baseline, counted not asserted:** 15 `internal/` packages, 20 `cmd/*.go`, 108 Go files, 49 test files, 17,913 Go LOC, 19 error codes, 5 routable ServiceIDs, CI RED. Corrects two stale survey claims: "not checked out locally" (it is) and "~108 Go files, much smaller / compiling skeleton" (17,913 LOC is real mid-maturity, not a skeleton).
- **§1.2 the D-CLI1 false-green finding**, restated as the SDD's anti-fake-done centerpiece — "CI-green," "a local test pass," and "the binary builds" are explicitly refused as evidence for any line in the SDD.
- **§2 all 15 `internal/` packages tabulated** with REAL(LOC) and a DONE-means clause each — e.g. `internal/client` (1,352 LOC, real 421 re-resolve runtime, hand-authored shells today, Idempotency-Key still a scaffold stub); `internal/gate` (0 production LOC — a **575-line M12 six-surface E2E harness only**, test-only by design, currently does NOT run green because family-E2E is RED).
- **§5 cell-lint 14-rule assessment for a CLIENT** (JGAUQRsw2g): 3 EVIDENCED, 1 MET-as-client-dual, **1 NOT MET (R11 — no Idempotency-Key minting on writes, transport.go:29 "deferred to C1")**, 9 N/A-to-a-client (with reasons stated per rule, not force-fit).
- **§10 the 5 must-resolves (MR-CLI1..5)**, explicitly "OPEN, BLOCKING, AND NOT DECIDED HERE" — restated with authority owners.
- **§13 self-audit** admits: "I nearly shipped its false green myself — my first `go test ./...` returned 'all ok'; only the clean-env re-run under `env -i` exposed the truth."

### 8. `8GNuGKq8wn` — Test Plan: orvex-cli (canonical [metadata] / **DRAFT** [self-declared body]; 2026-07-15; ENG-2105 Wave 3, artifact 3 of 5)

- Governed by **CS §5** (fixed test-tier categories, not re-derived per issue).
- **§0 opens with the same false-green repro** as the other Wave-3 pages — "this is the CLI's centrepiece anti-fake-done finding, the analogue of staging's Hollow-Healthy."
- **§1 five CS §5 tiers mapped for a client with an embedded store:** the CLI has **no Postgres and no remote store of its own** — only an embedded SQLite WAL cache (`modernc.org/sqlite`, pure-Go) — so **no testcontainer/dind requirement**, a real, explicitly-stated deviation from every Postgres-backed service in the family. **No Row-4 (true-external) dependency** either — the CLI holds no Clerk/Stripe/Turbopuffer/LLM-provider key; any future direct-provider call would be an architecture violation to escalate.
- **§4 contract tier:** 5 siblings faked from `orvex-studio-contracts` golden fixtures at the `internal/client` transport port — never a mock of an owned package (CS ❌4). Notes the codegen drift gate `TestGeneratedClientsMatchContractsTag` does not exist yet (blocked on MR-CLI2).
- **§5 8 named DoD tests**, each stating its tier and whether it exists/passes/is blocked today — incl. 2 that don't exist yet: `TestCmdSuiteIsHermetic` and `TestWikiVerbAuthPreconditionOrdering` (the two fixes that reopen dispatch).
- **§8 "looks good AND works" bar:** explicitly N/A for "looks good" (no GUI) — the CLI's output/error contract (JSON-when-piped, `--fields`, frozen exit codes) is named as the closest analogue and is NOT exempt from the "works" half.

---

## Cross-page synthesis — substantive commitments confirmed multiply

| Commitment | Confirmed in |
|---|---|
| Multi-service scope (wiki as ONE namespace among ai/auth/search/admin + client-local tooling) | `pf10XC2Qjz`, `EJ9WgVAuls`, `PACF13d3I3`, `UQFNh4QEmw` |
| Linear (the wiki-embed *product feature*) dropped entirely, product-wide (D-S11) | `pf10XC2Qjz` ("Linear is absent"), `PACF13d3I3` §6 (full removal inventory), `EJ9WgVAuls` ("No Linear (D-S11)") |
| pkg/dfm clean-room serializer, in-process, offline, embedded from `orvex-studio-lib` | `pf10XC2Qjz`, `PACF13d3I3` §4, `9AdZkNTlyj` §5 |
| From-scratch rewrite (D-S21 AMENDED), docmost-cli = frozen behavioural reference only, never imported | `pf10XC2Qjz`, `PACF13d3I3`, `UQFNh4QEmw`, `6NVIjKeiWs` |
| Domain-pure routing (D-S16) — engine's raw API never contacted by the CLI | `pf10XC2Qjz`, `PACF13d3I3` |
| CI RED since 2026-07-13 / D-CLI1 false-green (local `go test` lies due to ambient credential) | `UQFNh4QEmw`, `6NVIjKeiWs`, `9AdZkNTlyj`(implicitly via gate), `lhqTzMTPCj`, `8GNuGKq8wn` — **NOT mentioned in `pf10XC2Qjz`/`EJ9WgVAuls`** (predates it) |
| 5 must-resolves (MR-CLI1..5) open and blocking, not to be decided by an implementer | `UQFNh4QEmw`, `6NVIjKeiWs`, `9AdZkNTlyj`, `lhqTzMTPCj` |
| 35 pre-existing Linear-tracker (ENG-2544..2578) stories — file none, elevate only | `UQFNh4QEmw`, `6NVIjKeiWs`, `lhqTzMTPCj` |

---

## Terminology note — two unrelated things both called "Linear" in this space

1. **Linear.app as a wiki content-embed integration** (`orvex linear`/`issue` commands, `linear_issue`/`linear_view`/`linear_graph`/`linear_cycle`/`linear_roadmap`/`linear_mention` blocks, `/api/integrations/linear/*`) — this is the feature being **dropped entirely, product-wide (D-S11)**, per the task's framing ("Linear integration is DROPPED entirely"). Confirmed removed from the command tree, block schema, error vocabulary, and instructions across `pf10XC2Qjz` and `PACF13d3I3` §6.
2. **Linear the issue tracker**, used by this engineering program itself to manage `ENG-2544..ENG-2578` (the 35 build stories for orvex-cli). This is unaffected by D-S11 — it's the *tracking tool for building the CLI*, not a *feature the CLI ships*. `6NVIjKeiWs`/`UQFNh4QEmw`/`lhqTzMTPCj` all reference these tickets and instruct the build agent to touch zero Linear (tracker) state itself (writes are orchestrator-only, per memory `multi-agent-linear-collision-discipline`).

Do not conflate the two when reading "Linear" in this space's pages — the pages themselves are careful about this (e.g. `6NVIjKeiWs` footnotes "[ai] beads→staging" as a counterparty ticket wrongly swept by a substring search for "cli", underscoring the census discipline).

---

## What was NOT captured / explicit gaps in this evidence pass

- `R4AOVBLST7` (the original "PRD: orvex-cli", draft, referenced repeatedly by `pf10XC2Qjz` and `EJ9WgVAuls`) was **not fetched** — it does not appear in the live `orvexcli` page list and was not chased into a trashed/archived state (out of scope for a plain `page list`). Its content is known only second-hand via citations in `EJ9WgVAuls`'s findings table and `UQFNh4QEmw`'s reconciliation section.
- Per the standing caveat above, table content in `pf10XC2Qjz`, `PACF13d3I3`, and `EJ9WgVAuls` was extracted via plain `page get`, which the tool itself flagged as lossy for `table` node types. No `--prosemirror` re-fetch was performed in this pass.
- `docmost-cli page list` does not expose trashed/archived pages by default, so it cannot be confirmed from this pass alone whether `R4AOVBLST7` is trashed, archived, or simply excluded from a default listing for another reason.
