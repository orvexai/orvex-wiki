# Wiki study: space `orvexstudioai` (orvex-studio-ai, the AI brain service)

Synced 2026-07-17. 8 pages read (100% of space; INDEX.md is the 9th file, not a content page). All 8
pages are `status: canonical` per frontmatter, but two of them (PRD-delta, Contract Summary, SDD,
Build Prompt, Test Plan — the 5 Wave-3 pack pages) carry an internal "Status: DRAFT ... Never
ratified by an agent" banner in their own body that contradicts the canonical frontmatter — flagged
in Staleness flags below.

## 1. Per-page table

| Slug | Title | Frontmatter status | Body-declared status | One-line substance |
|---|---|---|---|---|
| `pbKI3BpQmY` | PRD: orvex-studio-ai | canonical | (none — real canonical) | Full PRD for the Go rewrite of the AGPL fork's AI tier: chat/ask/inline/drafts/prompts/memories/images, FR-20 cost enforcement, FR-39 no-in-fork-model-path, owns the cited-ask RAG loop end-to-end (D-ASK), LiteLLM is the only model gateway, billing owns the cap value (SoR) and ai enforces it. |
| `Cb0XBkNezd` | Architecture: orvex-studio-ai | canonical | (none — real canonical) | Two-binary Go architecture (`cmd/server` streaming + `cmd/metering` Kafka consumer) over Postgres+Redis+Kafka; A-METER (layered cost enforcement), A-ASK (the one cited-ask loop), A-TOOLS (one write door via wiki-api chokepoint), A-LOOP (central Temporal, no in-service worker), A-OUTBOX, A-OPS, A-GOV. Tightened per the SE-Arch audit below; ratified 2026-07-06. |
| `oaD5XUHqfb` | Architecture Audit — SE-Arch review (2026-07-05) | canonical | (none — real canonical, ratified 2026-07-06) | Adversarial review of the architecture page as of 2026-07-05, when the repo was a genuine 193-LOC scaffold. Verdict "needs-tightening" (not contradicts-canon); 11 findings (F1–F11), most fixed-in-draft, three left as open ADR-required decisions (F6 LLM-confinement carve-out, F8 break-glass, F7 ADR registry filing). **Its build-state paragraph ("repo is a SCAFFOLD") is explicitly declared STALE by the later Wave-3 PRD-delta** — the design findings remain live, the maturity snapshot does not. |
| `gmvqNoNNax` | PRD-delta — orvex-studio-ai (Wave 3) | canonical (body says DRAFT, never ratified) | DRAFT | Reconciles the 2026-07-13 Product Brief `rgBOQh31p3` against the already-complete PRD/arch AND the deployed artifact (dev HEAD `9e7c5fa`, 2026-07-14). Core move: retires the Free-tier 10-lifetime-action counter in favor of a model-class allowlist (D-1); adds 4 greenfield folds (Prompt Composer, Orvex rating structural-quality factor, per-vendor privacy-registry backend, cited-ask confirmation); surfaces 9 must-resolves (MR-AI1..9), the biggest being a contract-prefix mismatch that blocks all 50 stories. |
| `n1elHysgrl` | Contract Summary — orvex-studio-ai (Wave 3) | canonical (body says DRAFT, never ratified) | DRAFT | Measures orvex-studio-contracts at dev HEAD `4d32371`: only 4 of ~20 needed API ops exist, all on the wrong `/v1/*` prefix (should be `/api/ai/*`), all `x-status:draft`; zero `studio.ai.*` CloudEvent schemas exist; a tag (v0.1.3) exists but differs from dev HEAD and is incomplete. This IS MR-AI1's evidence base. |
| `pbKI3BpQmY` *(dup — see above)* | | | | |
| `0zSYFVo5OW` | SDD — orvex-studio-ai (Wave 3) | canonical (body says DRAFT, never ratified) | DRAFT | The full "eventual Done" checklist for the service: mechanical totality check (30/30 internal packages, 5/5 cmd binaries all present and non-empty), full API surface Done-list, events produced/consumed, FR-20 entitlement spine, all 14 cell-lint rules assessed, observability/SLOs, degradation posture, 5 test tiers, runbook, family-E2E. Anti-fake-done clause names the exact lie-vector (flip 6 wired routes green and call it done while `/internal/v1/steps/*` + the free-tier swap + greenfield folds are untouched). |
| `E6N8BWHqR7` | Build Prompt — orvex-studio-ai (Wave 3) | canonical (body says DRAFT, never ratified) | DRAFT | Per-build-agent prompt: names 5 traps (README lies about maturity, ArgoCD-Healthy proves nothing, "Free-tier works" is the retired gate, the v0.1.3 contract tag is not your surface, ref-sensitivity of counts), the 50-story census (ENG-2245–2293 + ENG-2747), the 9 must-resolves an agent may NOT decide, CS §5/§6 category assignments, the seam map (in-process vs Row-2/3/4), tier placement, pinned versions, the crew testing recipe, and a deterministic Done gate. |
| `y6eOtSn7Ox` | Test Plan — orvex-studio-ai (Wave 3) | canonical (body says DRAFT, never ratified) | DRAFT | CS §5-fixed category assignment for testing: 30 internal packages test through their own interface (never mocked); Postgres is Row-2 (testcontainers, real pg); Kafka/Redis/knowledge/wiki-api/billing/workflows/mcp/identity are Row-3 (port+adapter, sibling contracts faked from golden fixtures); **LiteLLM and SearXNG are Row-4 true-external** (tape-replay only, no hand-authored responses) — flagged as the one category call this service is most likely to get wrong. 5 test tiers (unit/store/contract/crew-slot/family-E2E); "looks good AND works" bar explicitly N/A (headless service). |

## 2. Deeper summaries — load-bearing pages

### PRD: orvex-studio-ai (`pbKI3BpQmY`) — canonical, 2026-07-14

- Go ground-up rewrite (clean-room, network-boundary reuse only) of the AGPL fork's 18 `/api/ai/*`
  controllers; supersedes chat, ask, inline, drafts, prompts, memories, images, usage.
- **Owns the full cited-ask RAG loop end-to-end (D-ASK):** calls knowledge's `retrieve` with the
  **caller's delegated principal** (knowledge's egress chokepoint still enforces ACL ∩ token-scope —
  no ACL regression); the loop is agentic (retrieval is a model-callable tool, multi-hop), not a
  fixed retrieve-then-stuff pipeline. Owns the K5 cited-answer shape
  `{answer, citations, confidence, unanswered, gapNote, followups}`.
- **wiki-api's `ask` verb is removed** — agents (client + MCP) ask ai, not wiki-api. wiki-api keeps
  only the write path, DfM, wiki-CRUD shaping, and get/save/edit/search/list.
- **orvex-studio-mcp's AI tools (ask/chat/inline/generate) call ai directly** — ai is a third MCP
  upstream alongside wiki-api + identity (closes MCP's OQ-M7).
- **LiteLLM is the only model gateway family-wide** (FR-39 launch gate: after cutover the engine
  makes zero LLM/embedding/image calls). Knowledge's direct embedding calls are the one sibling
  exception, riding a **separate nested embedding budget** (D-S15) that never draws the user-action
  cap.
- **Cost protection (FR-20, P0):** layered — per-caller scoped LiteLLM keys+budgets (call-site
  ceiling, D-S5) sit above a per-tenant `max_budget` hard backstop; the cap **value** is billing's
  entitlement (system of record, D-P3, flip from an earlier ai-as-SoR posture); ai reads it via
  `billing.entitlement.changed` and enforces; console only **displays**.
- **Free tier doctrine (D-AI12, 2026-07-13 PO ruling — supersedes the earlier 10-lifetime-action
  trial):** Free = the ~zero-cost AI capability set free forever (cheap models + free/near-free
  embeddings), no frontier-model access, no action count; enforced via a pre-flight model-class
  allowlist keyed on billing's entitlement (frontier denied 402 paid-only; fail-closed on lookup
  failure).
- **Linear is removed family-wide (D-S11)** — no Linear tool in ai's tool registry, not deferred.
- **Durable orchestration is central Temporal in orvex-studio-workflows** (D-WF-1) — ai exposes
  idempotent step-APIs (`model-call`, `tool-exec`, `result-sink`) only; runs no Temporal worker.
- **In-editor AI is thin-UI (D-S4, FR-AI26)** — all prompting/tool-loop/grounding/diagram-conversion
  logic lives server-side in ai; the client (docmost React, later Studio surfaces) is thin.
- **Every page write goes through orvex-wiki-api's block chokepoint** with the caller's own token —
  ai holds no elevated write credential; F-QUOTA 402 rejections surface verbatim, never
  retried-around.
- Memory: product Memory system-of-record moved to orvex-studio-api per ADR-0025 (2026-07-10); ai
  keeps only chat-recall memory + extraction compute (memory gap-closure fold-in, FR-X*/FR-C*).
- Rollout is 7 reversible steps (metering spine first as P0, then contracts, then stateless
  reads/writes, then chat/ask streaming, then MCP re-point, then durable domain, then engine
  thinning).

### Architecture: orvex-studio-ai (`Cb0XBkNezd`) — canonical, ratified 2026-07-06

- Two binaries: `cmd/server` (always-warm streaming Deployment — Knative never fronts SSE) and
  `cmd/metering` (Kafka-consumer worker, fixed replicas, NO-KEDA).
- A-METER: 3-layer enforcement — per-caller scoped keys (call-site ceiling) → per-tenant
  `max_budget` backstop (authoritative even if ai's own logic is wrong) → reporting journal. Cap
  value read from billing, never stored in ai.
- A-ASK: one `internal/ask` package owns the whole loop; both front doors (`/api/ai/ask` and MCP)
  call the identical core so answer quality/citation discipline can never fork.
- A-TOOLS: tool registry validates against the engine's block-schema catalog; page-edit tools write
  only through wiki-api's chokepoint with the caller's token; F-QUOTA 402 surfaces verbatim.
- A-OUTBOX (added post-audit): ai's own producer path (`ai.usage.recorded`, `ai.cap.*`, `ai.job.*`)
  is transactional-outbox-backed, not a bare publish — closes audit finding F2.
- A-OPS (added post-audit): liveness (`/healthz`, always-200, echoes CELL_ID+CLUSTER_NAME) split
  from readiness (`/readyz`, real dependency round-trips) — closes F9.
- A-GOV: names two still-OPEN governance decisions requiring ADRs — F6 (knowledge holding an
  ai-provisioned LiteLLM key, a carve-out to CS §6/§10's single-gateway confinement rule) and F8
  (an ai-local cap-override break-glass would violate canon P4's single console-admin-plane rule).
- Preserved client wire contract (`/api/ai/*`) survives cutover via ingress path-routing + a
  recorded-tape parity gate (frame types/order/DTOs diffed, not token text).

### Architecture Audit — SE-Arch review (`oaD5XUHqfb`) — canonical, ratified 2026-07-06

- Verdict: needs-tightening, not contradicts-canon. Repo was a genuine 193-LOC scaffold as of
  2026-07-05 (this build-state claim is now STALE — see PRD-delta below).
- 11 findings F1–F11; **fixed-in-draft** (folded into the arch page above): F2 (outbox), F3 (`ce-id`
  idempotency + `orvexcell` fail-closed), F4 (A-DATA self-contradiction — cap-state column
  contradicted the billing-SoR flip), F9 (liveness/readiness split), F10 (`ARG CMD_NAME` doc fix).
- **Still open, ADR-required, NOT silently resolved:** F6 (LLM-confinement carve-out for
  knowledge's embedding LiteLLM key), F8 (break-glass single-surface rule), F7 (ADR registry
  filing — registry now exists per the Wave-3 packs, next-free ADR 0036).
- Build-time corrections flagged but out of this page's write scope: F1 (metering deploy topology
  drift — Knative scale-to-zero vs the mandated plain-Deployment consumer), F5 (config/deploy still
  names the old engine-direct write door instead of wiki-api), F-JOURNAL (deploy wires S3, arch
  mandates Postgres partitioned tables — 3-way divergence), F11 (README staleness).

### PRD-delta — Wave 3 (`gmvqNoNNax`) — DRAFT, 2026-07-15

- **Explicitly corrects the record on staleness of two earlier canonical pages**: the README's
  "scaffold" self-report is false (repo is now 30 internal packages, 98 test files, ArgoCD
  Synced/Healthy with same-day incident fixes); the SE-Arch audit's build-state paragraph was true
  2026-07-05 but is stale now (design findings F1–F11 remain live).
- **D-1 (the central delta):** the deployed code still runs the RETIRED 10-lifetime-action
  `FreeActionCap` gate; the brief's D-AI12 doctrine overrules it. The replacement (model-class
  allowlist) must **replace**, not add to, the gate — named as the single biggest fake-done risk.
- D-2/D-3/D-4: three greenfield folds with zero code/canon footprint — Prompt Composer/Improve-
  with-AI/task-first-wizard backends (ENG-2290–2292), the Orvex-rating structural-quality-only
  factor (ENG-2293, NOT the composite rating/popularity/upvotes), a per-vendor training/retention
  posture registry backend (ENG-2747, Claude has a native adapter, ChatGPT is platform-blocked, MCP
  is the universal fallback).
- D-5: reaffirms the cited-ask loop ownership map (already canon, D-ASK) — no new ai ownership.
- 9 must-resolves (MR-AI1–9), the census: 50 stories (ENG-2245–2293 contiguous + ENG-2747), all
  Todo, all blocked on ENG-2097 and (transitively) on MR-AI1's contract completion.
- Explicit "ArgoCD-Healthy is not evidence" clause (D-STG1 lineage): honest baseline stated as
  1 PASS / 5 FAIL / 1 BLOCKED against defects ENG-2039..2054.

### SDD — Wave 3 (`0zSYFVo5OW`) — DRAFT, 2026-07-15

- Mechanical totality check (re-runnable grep loop over `internal/`/`cmd/`) rather than a
  self-audit, specifically because self-audits "cannot catch an omission."
- Full API-surface Done-list distinguishes real-when-wired routes (6: chat, inline, export, image,
  diagram, ask/orchestrator) from honest 501 stubs (`/v1/ask`, `/v1/inline` legacy dup,
  `/v1/spend-cap`, `/api/ai/usage`, all three `/internal/v1/steps/*`).
- Events: zero `studio.ai.*` events emitted today (metering deployed at replicas:0).
- Cell-lint: all 14 rules individually assessed as evidenced/N/A/not-yet — none glossed over.
- Names the exact fake-done vector for this SDD itself: flipping the 6 wired routes green and
  declaring done while ignoring the step-APIs, the free-tier gate swap, and the greenfield folds.

### Build Prompt — Wave 3 (`E6N8BWHqR7`) — DRAFT, 2026-07-15

- 5 named traps for any build agent (README lies, ArgoCD-Healthy proves nothing, "Free-tier works"
  is the retired gate, the v0.1.3 contract tag is not the real surface, ref-sensitivity of counts).
- The seam map: LiteLLM + SearXNG are ai's Row-4 (true-external) deps — the one category call this
  service is most likely to get wrong by mocking inline instead of tape-replaying.
- ADR triggers named explicitly, including: never store a cap value in ai, never add a second model
  gateway, never let knowledge hold a LiteLLM key without the F6 carve-out ADR, never build an
  ai-local break-glass.

### Test Plan — Wave 3 (`y6eOtSn7Ox`) — DRAFT, 2026-07-15

- CS §5 category table fixed: 30 internal packages tested through their own interface; Postgres
  Row-2 (testcontainers real pg); Kafka/Redis/knowledge/wiki-api/billing/workflows/mcp/identity
  Row-3 (port+adapter, faked from contracts golden fixtures); LiteLLM/SearXNG Row-4 (tape-replay
  only).
- 5 tiers: unit → store (testcontainers) → contract (golden-fixture round-trip, blocked on MR-AI1)
  → crew-slot (real pod loop, ArgoCD-Healthy explicitly rejected as sufficient) → family-E2E (7
  sibling services + the LiteLLM tape).
- "Looks good AND works" design bar is explicitly N/A — ai is headless; the design bar belongs to
  `ui`, which consumes ai's backends.

## 3. Bindings on the AI-surfaces redo (MCP / API / CLI PRD-architecture)

These are commitments from this space that directly constrain or interlock with the wiki-api, MCP,
and CLI redo:

- **wiki-api has no `ask` verb.** Any AI-surfaces PRD/architecture redo must NOT reintroduce a
  synthesis/ask primitive on wiki-api — D-ASK deleted `/internal/v1/synthesize` and the dual-auth
  route class with it. Agents ask **ai**, not wiki-api.
- **ai is a third MCP upstream, alongside wiki-api + identity.** MCP's AI-facing tools
  (ask/chat/inline/generate) must call ai directly with the caller's forwarded bearer — no new
  internal route class, no proxy through wiki-api. This is load-bearing for the MCP tool-surface
  architecture: MCP's 19-tool surface (per memory: R21 streaming folded into design verbs) needs an
  explicit ai-upstream lane distinct from its wiki-api lane.
- **The K5 cited-answer shape `{answer, citations[], confidence, unanswered, gapNote, followups}`
  is ai-owned and frozen-by-convention** — any MCP `ask`/`chat` tool response shape that touches
  citations must match this shape, not invent its own.
- **wiki-api's block chokepoint remains the single write door** for every agent surface (MCP, CLI,
  ai's own inline/draft tools) — the AI-surfaces redo must not create a second write path; even ai's
  own writes go through wiki-api with the caller's token, no elevated credential.
- **Caller-token pass-through discipline**: MCP forwards the caller's bearer to ai unmodified (no
  new route class); this is the same discipline the CLI/API redo should assume for any AI-touching
  verb.
- **F-QUOTA `QUOTA_EXCEEDED` (402) must surface verbatim** across every layer — engine → wiki-api →
  ai → MCP/CLI/client — never retried-around, never silently absorbed. Any AI-surfaces contract
  work should treat this as a frozen error code, not re-mint it.
- **Durable/long-running AI work is central Temporal in orvex-studio-workflows, not any client-facing
  service.** If the MCP/API/CLI redo adds long-running generation tooling, it must call ai's
  step-APIs (or workflows directly), never spin up its own worker.
- **Contract layering (ADR-0008 change-authority):** ai's own OpenAPI story (4-of-~20 ops on a
  wrong `/v1/*` prefix vs the mandated `/api/ai/*`) is a live cautionary precedent — the AI-surfaces
  redo's contracts work should verify against dev HEAD counts, not trust a tag, and should not
  assume any given tag is current.
- **Cross-tenant/ACL discipline for retrieval:** any AI-facing verb that touches retrieval must pass
  the **caller's delegated principal** through to knowledge — knowledge's egress chokepoint is the
  sole ACL enforcement point; no shortcut, no re-implementation of ACL logic in MCP/CLI/API.
  Draft-quarantine semantics (drafts excluded from retrieval by default; caller's own drafts
  opt-in via `isDraftCitation`) must be respected by any surface assembling a similar answer shape.
  This is directly relevant to the sibling agent's mcp-research-corpus study — flag for
  cross-check.
- **Free-tier / cost-gate enforcement is billing's entitlement value, ai's enforcement.** Any new
  AI-touching MCP/CLI verb must ride ai's per-caller scoped-key metering — it must not invent its
  own quota/cap logic client-side.
- **Linear is removed family-wide (D-S11).** No AI-surfaces redo should reintroduce a Linear tool
  anywhere in the stack (MCP, CLI, ai) — this was an explicit, deliberate removal, not a gap.
- **In-editor / thin-UI discipline (D-S4/FR-AI26)** sets the general family pattern any client
  surface (including a CLI or MCP-driven UI) should follow: logic server-side, client/CLI renders
  only.

## 4. Staleness flags

- **Internal DRAFT banner vs canonical frontmatter, on 5 of 8 pages** (PRD-delta, Contract Summary,
  SDD, Build Prompt, Test Plan): each opens "Status: DRAFT ... Never ratified by an agent" while the
  YAML frontmatter says `status: canonical`. Treat these 5 as unratified working documents despite
  the mirror's status field — do not cite them as ratified canon in the redo without checking
  current ratification state in the live wiki.
- **The architecture page (`Cb0XBkNezd`) is stale on the free-tier doctrine.** It still states
  "Free = 10-lifetime-AI-action trial" (A-METER Layer 2, In-short) — this was superseded by D-AI12
  (2026-07-13, folded into the PRD) and the PRD-delta explicitly instructs: "the arch page is
  STALE ... do not obey it here." The arch page itself has not been edited to reflect this; a
  redo relying on the arch page's free-tier language will be wrong.
- **The SE-Arch audit's build-state claim ("repo is a SCAFFOLD, 193 LOC") is stale**, superseded by
  the PRD-delta's 2026-07-15 census (30 internal packages, 98 test files, deployed+Healthy with
  same-day production fixes). Its *design* findings (F1–F11) remain live; its maturity snapshot
  does not — the PRD-delta says this explicitly and it is worth repeating for any downstream reader.
- **Contract prefix contest is unresolved as of 2026-07-15 (MR-AI1):** the deployed/tagged contract
  uses `/v1/*` (4 ops only, all draft, 0 events); the PRD/architecture mandate `/api/ai/*` (~20 ops).
  This blocks all 50 Wave-3 stories. Per the session's known 2026-07-16/17 live state (wiki-api /v1
  cutover done, MCP live-green 19 tools), it is worth checking directly against the live ai repo
  whether MR-AI1 has since closed — the wiki mirror (synced 2026-07-15/17) does not show a
  resolution, but the wiki-api /v1 cutover completion elsewhere in the program suggests the prefix
  question may have moved since this space was last touched. **Flag for verification, not assumed
  resolved.**
- **Free-tier gate: deployed code vs doctrine, live discrepancy as of 2026-07-15.** The deployed
  `internal/budget` package still runs the retired `FreeActionCap=10` lifetime-action gate; D-1
  requires swapping (not adding to) it with a model-class allowlist. No page in this space confirms
  the swap has landed — treat "Free-tier enforcement" as unverified/pending as of this study.
  Cross-check against the actual /api/ai/* free-tier behavior if the AI-surfaces redo depends on it.
- **`cmd/metering` deployed at replicas:0** (Kafka consumer unwired) as of the Wave-3 census —
  zero `studio.ai.usage.recorded`/`ai.cap.*`/`ai.job.*` events are actually flowing today despite
  the architecture mandating them. Any redo assuming ai's usage/cap events are live on the spine
  should verify this has been un-pinned since 2026-07-15.
- **Two governance ADRs (F6 LLM-confinement carve-out, F8 break-glass) remain open** as of the
  latest page in this space (2026-07-15) — the ADR registry now exists (next-free 0036) so they are
  fileable, but neither had been filed/ratified as of this sync. Do not assume either carve-out is
  settled canon.
- **This space's pages predate the session's known 2026-07-16/17 program state** (MCP live-green
  19 tools on dev, wiki-api /v1 cutover done, streaming folded into design verbs per R21, audit-
  service PRD canonical). None of that later state is reflected here — this space's newest sync is
  2026-07-17T15:08 for the INDEX but the content pages themselves are dated 2026-07-14/15/17
  (synced_at fields) with substantive content authored 2026-07-05 through 2026-07-15. Nothing in
  this space contradicts the later live state outright, but nothing in it confirms MR-AI1..MR-AI9
  have closed either — treat all 9 must-resolves as open unless verified elsewhere.
