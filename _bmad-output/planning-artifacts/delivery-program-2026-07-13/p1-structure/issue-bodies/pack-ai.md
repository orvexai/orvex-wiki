## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-studio-ai` so that build stories dispatch only against a frozen, reviewed contract — never against an undefined LLM seam. This is a **Wave-3 delta-pack**: it folds the umbrella brief's new features into the drained `orvex-studio-ai` service and reconciles them against the deployed artifact, not the stale space canon. `orvex-studio-ai` is the family's **only door to LLMs** [Map current-state-map §2; CS §6], so its contract is the single point where the whole family's model spend, routing, and cost doctrine are pinned.

**Definition of Done — the binary gate** (all red = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [P1 yXUWpQpRjx §4; SE-Arch 8sYi523i4t]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for this service's tag; CI green on the tag commit* [P1 yXUWpQpRjx §3 artifact 2]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudioai` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each build story body has H1–H17 ticked* [Issue-Authoring 9VUHxAcoXw H17]
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the Wave-3 slice — *machine check: SDD covers full client + agent + internal surfaces, events, entitlement/quota, cell-lint, obs+SLOs, all test tiers, runbook, family-E2E* [P1 yXUWpQpRjx §3 artifact 4]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the umbrella brief and the concept-to-service map, When the PRD-delta is authored against the existing draft PRD `pbKI3BpQmY`, Then every added FR/NFR cites the brief or map and every contested seam is flagged, not silently chosen. *Assertion: the PRD-delta draft page in `orvexstudioai` lists ≥1 cited added FR and 0 uncited claims.* [Source: P1 yXUWpQpRjx §3 artifact 1; Brief rgBOQh31p3]
- [ ] **AC2 (Composer + task-first wizard backend)** — Given Composer (teaching Prompt Composer) + the task-first wizard are brief features, When the PRD-delta scopes them, Then it defines the `orvex-studio-ai` backend share and names the split with `orvex-studio-api` (BFF owns the surface; ai owns prompting/model logic), the seam recorded not assumed. *Assertion: PRD-delta names both the ai-side backend contract and the api-BFF counterpart for Composer + wizard.* [Source: P1 yXUWpQpRjx W3; Brief rgBOQh31p3]
- [ ] **AC3 (Orvex rating share)** — Given the Orvex rating is shared between ai and knowledge per the map, When the PRD-delta scopes it, Then the ai-owned half is pinned and the knowledge-owned half is cross-referenced to the `orvex-studio-knowledge` pack, avoiding a double-owner. *Assertion: PRD-delta cites the Orvex-rating share and links the knowledge pack's counterpart line.* [Source: P1 yXUWpQpRjx W3; Map current-state-map §2]
- [ ] **AC4 (free-tier cost-doctrine routing)** — Given the ratified pricing doctrine (ai PRD `pbKI3BpQmY` canonical), When model routing is contracted, Then it encodes a **model-class allowlist** (frontier models paid-tier-only; **zero-cost models uncounted**), enforced via LiteLLM per-caller scoped keys/budgets over a per-tenant `max_budget` backstop. *Assertion: the contract carries a model-class allowlist field + a `QUOTA_EXCEEDED`/cap-reached code; free tier cannot route a frontier model.* [Source: program-status §4; ai PRD pbKI3BpQmY (D-P3/D-AI11, D-S7, D-S15)]
- [ ] **AC5 (single LLM seam)** — Given LLM calls are confined to `orvex-studio-ai` family-wide (CS §6/§10), When the contract is frozen, Then it is the family's one LLM seam (LiteLLM the sole gateway) and any cross-service LLM path (e.g. the F6 knowledge-direct-key carve-out) is flagged as an ADR-required must-resolve, never encoded silently. *Assertion: contract exposes the sole LLM entrypoint; no second service's contract calls LiteLLM without a cited ADR.* [Source: CS §6; evidence orvexstudioai §6 F6]
- [ ] **AC6 (error-contract shapes)** — Given open defects D12/ENG-2051 + D13/ENG-2052 (ai error mapping — corpus 228 w/ bodies but `extraction_state=''` → 0 citations), When the PRD-delta shapes the error contract, Then it defines a typed retryable/terminal error envelope and the cited-ask K5 answer shape `{answer, citations[], confidence, unanswered, gapNote, followups}` such that a zero-citation state surfaces as a typed `gapNote`, not a silent empty. *Assertion: contract has a typed error envelope + K5 shape; a 0-citation result maps to a named code, not an empty 200.* [Source: program-status §2; evidence orvexstudioai §4]
- [ ] **AC7 (frozen tagged contract)** — Given the pack authors OpenAPI + CloudEvents (`ai.usage.recorded`, `ai.cap.reached`, `ai.cap.warning`, `ai.job.*` on the ADR-0007 envelope / ADR-0010 `studio.*` taxonomy) + golden fixtures + generated clients, When landed in `orvex-studio-contracts`, Then it is git-TAGGED and emits **TS clients** for TS consumers (api/mcp) per ADR-0035 alongside Go stubs. *Assertion: a tag in `orvex-studio-contracts` covering ai's surface exists (scheme per the W1 contracts pack) and fixtures round-trip in CI.* [Source: ADR-0035 QbEBPuKcGR; P1 yXUWpQpRjx §3 artifact 2]
- [ ] **AC8 (SDD totality)** — Given wave scoping happens AGAINST the SDD, When the SDD is authored, Then it lists the FULL eventual surface (client `/api/ai/*`: chat SSE, ask, inline, models, chats CRUD+fork/branches, drafts, memories, prompts, usage, images, tools/retry, health; agent MCP-upstream surface; internal `/internal/v1/steps/*` workflows-only step-API), events, entitlement/quota, cell-lint compliance, obs+SLOs, all test tiers, runbook, family-E2E — the FAIL six-surface verdict is its honest baseline. *Assertion: SDD enumerates all three surfaces + the step-API contract workflows' FR-W11 is blocked on.* [Source: evidence orvexstudioai §4; program-status §2]
- [ ] **AC9 (negative — REVISE bounces, untagged blocks)** — Given a review REVISE verdict or a claimed-but-absent tag, When either occurs, Then the pack is NOT certified: REVISE routes to a fix pass (never overridden) and an untagged contract blocks Phase-2 dispatch. *Assertion: no `PACK-REVIEW: PASS` without a matching finding-resolution; `git tag -l` empty ⇒ DoD box stays red.* [Source: P1 yXUWpQpRjx §4; SE-Arch 8sYi523i4t fake-done]
- [ ] **AC10 (forward-compat)** — Given later waves extend ai, When a future wave lands, Then it MUST NOT reshape the frozen envelope or the K5 answer shape additively-incompatibly; breaking/envelope-reshaping changes require ADR-0008 (ADR + human ratify), additive changes take the automated lane. *Assertion: any consumer pinned to this tag still compiles against a later additive tag; a breaking change without an ADR fails contracts CI.* [Source: ADR-0008; P1 yXUWpQpRjx §3 artifact 2]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, map `current-state-map §2/§3`, ai PRD `pbKI3BpQmY` + arch (TBD — defined by the ai architecture owner) / audit (TBD — defined by the SE-Arch reviewer), CS `6aMAzsYeQb`, ADR-0035 `QbEBPuKcGR`, cell-lint `JGAUQRsw2g` (AC: all).
- [ ] Draft **PRD-delta** in space `orvexstudioai` reconciled with `pbKI3BpQmY`; fold in Composer + wizard backend, Orvex rating share, cost-doctrine routing; cite each FR (AC: 1,2,3,4).
- [ ] Resolve or flag contested seams: LLM-confinement F6 carve-out, cap-override F8 break-glass — each an ADR-required must-resolve, not a silent choice (AC: 5).
- [ ] Author **contract** (OpenAPI `/api/ai/*` + `/internal/v1/steps/*` + CloudEvents) + golden fixtures in repo `orvex-studio-contracts`; wire TS-client + Go-stub generation per ADR-0035 (AC: 6,7).
- [ ] Land + **git-TAG** the ai surface in `orvex-studio-contracts`; confirm fixtures round-trip in contracts CI (AC: 7,9).
- [ ] Author **test plan** page: unit / store (testcontainers, Postgres append/outbox tables) / contract (fixture round-trip) / crew-slot / family-E2E per CS §5; LiteLLM is a true-external port with committed replay fixtures (AC: 4,6).
- [ ] Author **SDD** page covering the full eventual surface + events + entitlement/quota + cell-lint + obs/SLOs + runbook + family-E2E; baseline = the FAIL verdict (AC: 8).
- [ ] Author **per-agent build prompt** whose stories meet the full 9-section H1–H17 standard of `9VUHxAcoXw` (AC: all; DoD H1–H17).
- [ ] Request **adversarial review** (reviewer ≠ author); on REVISE run a fix pass; on PASS, tick verified boxes and hand to the orchestrator (AC: 9).

## 4. 🧠 Dev Context

**Inputs**

| Canon page / slug | What it feeds this pack |
|---|---|
| Brief `rgBOQh31p3` | Composer + task-first wizard, Orvex rating, cost doctrine — the new features |
| ai PRD `pbKI3BpQmY` (canonical) | ratified pricing/cost doctrine; existing FR set to reconcile the delta against |
| ai arch (TBD — defined by the ai architecture owner) + audit (TBD — defined by the SE-Arch reviewer) | surface shapes, D-* decisions, five mandatory ADR triggers |
| Map `current-state-map §2/§3` | concept-to-service ownership + contested seams |
| ADR-0035 `QbEBPuKcGR` | TS-client generation into the tag pipeline |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint compliance the SDD declares |

- **Space slug:** `orvexstudioai`. **Evidence:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudioai.md`.
- **Live-repo-wins reconciliation:** the repo is a **scaffold** (`go.mod` zero deps, `/v1/chat` → 501, no tier skeleton) per the 2026-07-05 audit — but the deployed artifact + migration assessment outrank stale space canon where they disagree. The PRD-delta reconciles against the deployed reality, not the "~90% unbuilt" narration.

**Contested seams this pack MUST resolve or flag**

- [ ] **F6 LLM-confinement carve-out** — D-S15 has knowledge calling LiteLLM with an ai-provisioned key, which CS §6/§10 declare a build failure. ADR required; flag as review must-resolve, do not encode. [evidence §6]
- [ ] **F8 cap-override break-glass** — the "separate audited workload-identity path" contradicts canon P4 (single console-admin break-glass). ADR required; retract pending. [evidence §6]
- [ ] **Billing entitlement-read seam** — billing WS-14 SoR not yet built; interim hardcoded Free caps must fail-closed if billing unreachable. Cite the W1 contracts pack's entitlement/cap shapes, do not re-derive. [evidence §6; program-status §4]

**❌ classic-mistakes (CS §0)**

| ❌#N | Canonical name | Assessment |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only work; the domain-rules-in-the-owning-package guard binds the build-prompt stories this pack authors (the ai build wave), not the pack. |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — definition-only; the Repository-seam confinement binds the build stories, not the contract/SDD this pack freezes. |
| ❌#3 | Premature interface / seam | APPLICABLE — binds the port/seam choices this pack pins: LiteLLM as the justified network-seam port (a port IS justified at a network seam), plus the api-BFF↔ai backend split (AC2) and the internal step-API seam — no in-process interface without ≥2 real impls. |
| ❌#4 | Mocking own packages | NOT APPLICABLE — definition-only; the pack's test-plan pins LiteLLM = true-external port with replay fixtures and the Postgres store via real testcontainers, so the own-package-mock ban binds the build stories that execute the plan. |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — definition-only; the vertical RED→GREEN tracer-bullet discipline binds the build-prompt stories this pack authors, not the definition. |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the contract/schema shapes this pack freezes: only the fields the current Issue needs in the OpenAPI surface, K5 answer shape, and error envelope (AC6, AC7). |
| ❌#7 | Shallow pass-through package | NOT APPLICABLE — definition-only; the deletion test (CS §3.1) binds the build stories' package layout, e.g. guarding the api-BFF from collapsing into a pass-through. |
| ❌#8 | Inline credentialed/IO client | APPLICABLE — the contract pins LiteLLM as a configured client injected at the network seam with per-caller scoped keys, credentials via env only — no inline base-URL / virtual-key (AC4, AC5). |
| ❌#9 | Time/randomness in the projection layer | APPLICABLE — binds the frozen event + usage/step-ledger projection shapes: `ai.usage.recorded` / `ai.cap.*` timestamps derived from event payloads, projections contracted deterministic (AC7). |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — binds the entitlement/cap shapes: the per-tenant `max_budget` / cap ceilings are human-ratified pricing doctrine, cited from the billing SoR not re-derived; a change needs ADR + human sign-off (AC4). |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; the handlers-hold-routing-and-marshalling-only rule binds the build-prompt stories this pack authors. |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — binds the contract's exported surface: concrete typed structs across the OpenAPI + generated Go/TS clients, `unknown` the sanctioned TS placeholder — no `any` laundering across the tagged boundary (AC7, ADR-0035). |

**SE-Arch lenses (`8sYi523i4t`)** — *Reliability:* fail-closed on billing-unreachable + idempotent step-API. *Security:* per-caller scoped LiteLLM keys; no base-URL/virtual-key writes post-cutover. *Cost governance:* the cost-doctrine allowlist + nested embedding budget (D-S15) is the family's spend chokepoint. *Operational excellence:* liveness/readiness split; runbook in SDD. *Performance-freshness:* SSE stream + agentic multi-hop ask latency budget = TBD — defined by the ai build wave. **ADR triggers this pack fires:** F6 (LLM-confinement carve-out), F8 (cap-override break-glass), model-config admin ownership — filed once the Studio ADR registry (stood up in Phase 0) lands (program-level dep).

## 5. 🧪 Verification

- [ ] Adversarial review verdict `PACK-REVIEW: PASS` on this issue + mirrored on the pack root draft.
- [ ] `git tag -l` shows ai's tag in `orvex-studio-contracts`; fixtures round-trip green in contracts CI on the tag commit.
- [ ] `docmost-cli page get <slug> --no-daemon` returns status=draft for all five artifacts in `orvexstudioai`.
- [ ] Build-prompt stories pass the `9VUHxAcoXw` H1–H17 FINAL SELF-AUDIT.
- [ ] SDD completeness checked against the concept-to-service map (full surface, not the Wave-3 slice).

**What NOT to fake:**

- No self-review (reviewer ≠ author is mandatory, non-overridable).
- No claimed-but-unverified tag (a claimed tag is not a tag).
- No SDD trimmed to the wave slice.
- No invented NFR numbers (latency/SLO budgets are `TBD — defined by the ai build wave` until canon has them).
- No silently-chosen ownership seam (F6/F8/billing-SoR are flagged, not decided here).

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: **§0** (12 ❌ above), **§3** (deep-module; design-it-twice on the api-BFF↔ai backend seam and the LLM-confinement seam), **§4** (TDD contract binds the build-prompt stories), **§5** (mocking categories — LiteLLM = true-external port with replay fixtures; Postgres store via testcontainers), **§6** (tier placement — LLM confinement to ai; step-API is the internal tier), **§7** (seam map — this pack pins the LLM seam, the step-API seam, the billing entitlement-read seam), **§8/§10/§11**, **§12** (wiki-first; the pinned contract is contract-shape law), **§13**. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules). **NO-MONGO override (D-S12):** event/usage journal + step-ledger = Postgres range-partitioned append/outbox tables → Kafka `studio-spine` direct — strike any Mongo/S3-journal wording (the audit's 3-way store divergence resolves to Postgres).

## 7. 🔗 References

- Program plan `5eFdxN3edd` (Phase 1 = Definition Factory; Wave 3 delta-packs) · P1 orchestrator `yXUWpQpRjx` §3 (five artifacts), §4 (stage gate), W3
- Brief `rgBOQh31p3` (Composer, task-first wizard, Orvex rating, cost doctrine)
- ai PRD `pbKI3BpQmY` (canonical) · ai arch (TBD — defined by the ai architecture owner) · SE-Arch audit (TBD — defined by the SE-Arch reviewer)
- Map `current-state-map §2/§3` · evidence `orvexstudioai.md` §4/§6
- CS `6aMAzsYeQb` · SE-Arch `8sYi523i4t` · Issue-Authoring `9VUHxAcoXw` (H1–H17)
- ADR-0035 `QbEBPuKcGR` (Go↔TS bridge) · ADR-0008 (contracts change-authority) · cell-lint `JGAUQRsw2g`
- Phase-0 ground truth: `program-status-2026-07-14.md` §2 (ai FAIL, D12/D13), §4 (cost doctrine)

## 8. 🔗 Dependencies

- **Project:** Orvex Studio AI · **Milestone:** P1 — Definition Factory
- **Blocked by:** Wave-2 gate (`wave2-gate`) — Wave-3 delta-packs cannot start until both Wave-2 packs are certified [ENG id wired at filing]
- **Blocks:** Wave-3 gate (`wave3-gate`) — cannot close until this pack is certified + tagged [ENG id wired at filing]
- **Deferred, named with owner:** the ai build/test story-level issues are born FROM this pack in Phase 2, not before it; F6/F8/OQ-AI3 ADRs filed by the ai build wave once the Studio ADR registry (stood up in Phase 0) lands (program-level human/registry dep).

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — move Todo→In Progress; post authoring agent + model; claim arbiter per ADR-0033 `yNFx3YyNap`.
2. **PLAN** — post a plan comment (artifact order, seams to flag).
3. **PROGRESS** — continuous comments as each artifact is drafted/landed and on any blocker.
4. **COMMITS** — every commit/PR body in `orvex-studio-ai` + `orvex-studio-contracts` carries **"Part of ENG-NNN"** (links, never closes; Done is gate-owned).
5. **STAGE HANDOFF** — author → review.
6. **REVIEW** — reviewer (≠ author) posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden.
7. **TICK** — tick boxes only when genuinely verified (full-body read-modify-write, preserve every other byte).
8. **DONE** — ONLY the delivery orchestrator advances to Done through the deterministic gate; the author CANNOT self-advance (fake-done gate).
9. **ESCALATIONS** — as comments; judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority".

Writes via the `linearis` CLI (`lnr-tracking-adapter`); reads from `.cache/linear/`; never the Linear MCP.
