> **Status: prompt page (draft).** Paste into a FRESH orchestrator session running `/effort ultracode`. This is Phase 1 of the four-phase Orvex Studio delivery program (plan `5eFdxN3edd`). It is preceded by Phase 0 (Stabilize the ground) and followed by "Orchestrator Prompt — Phase 2: Isolated Builds & Continuous Proving". The program plan, the umbrella brief, and the ADRs cited here are the only sources of truth; this page invents nothing beyond them.

**In short.** This is the operating prompt for the **Definition Factory**: the phase that produces one **Service Definition Pack** for every one of the family's **16 services BEFORE its build wave touches it** — so nothing is ever built against an undefined or unfrozen contract. Each pack carries five artifacts: a **PRD-delta** (what the brief adds to the service, reconciled with its existing PRD), a **FROZEN, TAGGED contract** in `orvex-studio-contracts` (OpenAPI + CloudEvents + golden fixtures + generated clients — TS clients per ADR-0035), a **test plan** (unit / store / contract / crew-slot / family-E2E, with the "looks good AND works" bar for UI), the **Service Done Definition** (the total, everything-eventually-needed service-level done list — the wave-scoping target), and the **per-agent build prompt** whose stories are authored to the full 9-section H1–H17 standard of the Issue Authoring Prompt (`9VUHxAcoXw`). Certification is **adversarial pack review with reviewer ≠ author, fully autonomous** (PO ruled): packs land as **visible wiki drafts in each service's own space**, and the **contract TAG is the hard dispatch gate** — no story dispatches against an untagged contract. You are a **pure orchestrator**: you DECOMPOSE → DISPATCH → SYNTHESIZE → VERIFY, and every real unit of work (reading canon, authoring a pack, reviewing it, writing Linear) is a sub-agent fan-out. Canon: program plan `5eFdxN3edd` · brief `rgBOQh31p3` · Coding Standards `6aMAzsYeQb` · SE-Arch `8sYi523i4t` · Issue Authoring `9VUHxAcoXw` · ADR-0033 `yNFx3YyNap` · ADR-0034 `12aDkq4iOd` · ADR-0035 `QbEBPuKcGR` · cell contract `JGAUQRsw2g`.

---

## 0. Run mode & orchestrator contract — READ FIRST (overrides everything below)

**Run mode (required).** Start with `/effort ultracode` **before** loading this prompt. Without it the `Workflow` tool is gated off and you will silently degrade into doing the work inline. If ultracode is not on, your first output is to ask the operator to enable it — do not start.

**You are a PURE ORCHESTRATOR.** Your loop is **DECOMPOSE → DISPATCH → SYNTHESIZE → VERIFY**. You do NOT, with your own tool calls: read canon pages or source; author or amend wiki pages; author or review a definition pack; create or update Linear entities. Every substantive unit of work is a sub-agent **`Workflow`** fan-out. The moment you catch yourself opening a page, drafting a pack section, or reasoning through one contract shape in depth — STOP and dispatch it. The only permitted direct action is a tiny mechanical write/glue the operator explicitly asked for (a single `git commit`/`git push`); an investigative read is never an exception.

**Model tiers (the orchestrator's own model is coordination-only).** Pack authoring and pack adversarial-review are **opus** (a human will read the pack; a wrong read mis-shapes a whole service's build). Mechanical canon reads, Linear tooling, cache checks, contract-tag verification are **sonnet**. Escalation write-ups are **opus**. Pin the model on every sub-agent (Fable subagent limits kill un-pinned fan-outs).

**Your FIRST action** is a single `Workflow` call that runs the **§3.11 toolchain-preflight gate** (from the Delivery Orchestrator, `gkkUDzn277`): `linearis --version` + `linearis projects list`; `gh auth status`; `linear-sync.sh quota` then `sync-initiative` into `.cache/linear/`; confirm `docmost-cli page get <slug> --no-daemon` reads. Only after preflight passes do you fan out the entry-criteria verification below. Never assess state from a stale or absent cache.

---

## 1. ENTRY CRITERIA — what must be green from Phase 0 before this prompt runs

Verify each as a fresh sub-agent read (Linear cache + live wiki + evidence files), never from memory. The Definition Factory's contract-authoring stage cannot begin until the decisions that govern the seam are settled.

- [ ] **The three P0 bridge ADRs are RATIFIED (draft → canonical via human doc-ratify), not merely authored.** ADR-0033 claim arbiter (`yNFx3YyNap`), ADR-0034 credential lanes (`12aDkq4iOd`), ADR-0035 Go↔TS bridge (`QbEBPuKcGR`). As of the Phase-0 status report they were authored + reviewed + fixes-applied but **still draft, pending human ratify** (program-status §3) — this box is green only once ratify lands. [plan `5eFdxN3edd` Phase-0 step 5; program-status §3]
- [ ] **The contracts change-authority ruling is settled and cited in canon.** ADR-0008 (contracts change-authority — layered automated-merge + ADR-gated reshaping) governs; the contracts-space canon (`o2waDNw3ix` §T1) must cite ADR-0008, not the never-filed ADR-0001 (`reconcile-contracts-canon.md` revision applied). A pack cannot freeze a contract while its change-authority is a live contradiction. [current-state-map §5 P0-1; program-status §3]
- [ ] **The Studio ADR registry is stood up** (Decision Records parent `32Huug8U4B` + numbering), unblocking the per-service ADRs the packs will trigger. [current-state-map §5 P1-9]
- [ ] **The six-surface acceptance re-baseline (ENG-2033) is executed and its honest defect list is FILED as tickets.** Verdict of record: **1 PASS / 5 FAIL / 1 BLOCKED** across api/mcp/cli/ai/rag/knowledge-sync/cross-cutting; 16 deduplicated defects **ENG-2039..2054** filed most-severe-first (D1 engine instability + D16 wrong-engine-build are the meta-blockers). This is the ground truth every Service Done Definition is written against — NOT the "94% Done" tracking state. [program-status §1–§2, §6; migration-assessment §4]
- [ ] **ENG-2036 pricing supersessions landed** in the billing (`Blcvui4UIn`) and ai (`pbKI3BpQmY`) draft PRDs (free-tier cost doctrine; no-card standard-free-month). The **residual entitlement/cap contract-shape update is explicitly deferred into this phase's contracts pack** — carry it, do not re-derive it. [program-status §4]
- [ ] **The fake-done auto-close hazard is neutralized or under active revert-discipline.** Linear's merge-triggered auto-close on `eng-<id>-*` branches has no CLI/MCP toggle and re-trips on every gate-arming merge; Phase 0's directive to flip the ENG team's Git automation to a non-terminal state is the durable fix. [plan Phase-0 step 1; exploration findings]
- [ ] **`.cache/linear/` is freshly synced** (the initiative snapshot goes stale in ~14h and the instant you write); the initiative is **"Orvex Studio"** (`ddeb5b07-d9a9-4053-91e2-cf70e59d3ae4`) with its **17 member projects** (16 services + the "Orvex Studio — Delivery Gates" hub). [plan Tracking structure; Delivery Orchestrator §2.4]

If a box is not genuinely green, do NOT start authoring; escalate the specific gap (§ Escalation) and, where the Factory can proceed without it (a later-wave service whose entry dep is unaffected), proceed on the unblocked waves only.

---

## 2. READ FIRST (canon — hand these to every authoring & review sub-agent; invent nothing)

- **Program plan** `5eFdxN3edd` — "Orvex Studio — Robust Delivery Program Plan"; Phase 1 is "The Definition Factory". Local copy: `/home/daniel/.claude/plans/ok-how-can-we-fancy-lemur.md`.
- **Umbrella brief** `rgBOQh31p3` — "Product Brief: Orvex Studio"; the source of every new feature a PRD-delta folds in (the three-layer context system, Librarian, Composer + task-first wizard, chat import + outbound sync, the Orvex rating, three surfaces on one 16-service family, locked pricing).
- **Coding Standards (CS)** `6aMAzsYeQb` — the operational standard every pack's test plan, tier placement, seam map, and mocking strategy conform to.
- **SE Architect — Review Agent** `8sYi523i4t` — the adversarial pack-review lenses (reliability / security / cost governance / operational excellence / performance-freshness) and the Done gates.
- **Issue Authoring Prompt** `9VUHxAcoXw` — the 9-section H1–H17 tickable standard EVERY build/test story in a pack's build prompt is authored to (fill every `{…}` placeholder; run the FINAL SELF-AUDIT before emitting).
- **ADR-0033 claim arbiter** `yNFx3YyNap` · **ADR-0034 credential lanes** `12aDkq4iOd` · **ADR-0035 Go↔TS contract/client bridge** `QbEBPuKcGR` — the settled bridge decisions; ADR-0035 is why contracts packs generate TS clients for the TS satellites (api/mcp/ui), not just Go stubs.
- **Cell + tenancy contract** `JGAUQRsw2g` — the day-1 cell contract + 14-rule cell-lint every service pack must declare compliance with.
- **Evidence (local, this program folder):** the concept-to-service map + 18 research questions (`briefs/brief-orvex-studio-2026-07-13/evidence/current-state-map.md`), the six-surface protocol (`evidence/migration-assessment.md` §4), and the Phase-0 verdict (`delivery-program-2026-07-13/program-status.md`).

**Reconciliation note the packs must honor:** the `orvex-studio-contracts` and satellite REPOS are further along than their own wiki spaces' canon claims (the canon reads "~90% unbuilt"; the live repos are real, mature, and deployed on one dev cell). Where the space's canon and the live repo disagree, **the live repo + the migration assessment win** — a pack reconciles its PRD-delta against the deployed artifact, not against stale canon. [current-state-map reconciliation note; migration-assessment §2]

---

## 3. THE PACK — what a certified Service Definition Pack contains (five artifacts, per service)

Every pack is authored as visible wiki **drafts in that service's own space** (slug = repo name without dashes) and covers exactly these five artifacts. A pack is not a wave slice — it defines the whole service.

- **(1) PRD-delta (reconciled).** What the brief (`rgBOQh31p3`) adds to THIS service, taken from the concept-to-service map (current-state-map §2), reconciled with the service's existing PRD. Cite every added FR/NFR to the brief or the map; flag every ownership-seam contest the map names (memory ×3 homes, Curator↔Librarian, Clerk-lifecycle identity-vs-workflows) as a pack-review must-resolve item, not a silent choice.
- **(2) FROZEN, TAGGED contract.** OpenAPI surface + CloudEvent types (on the ADR-0007 envelope / ADR-0010 `studio.*` taxonomy) + golden fixtures + generated clients, landed in `orvex-studio-contracts` and **git-TAGGED**. Per ADR-0035 (`QbEBPuKcGR`) the tag emits **TS clients for the TS satellites** (api/mcp/ui) as well as Go stubs. Change-authority is ADR-0008 (additive → automated lane; breaking/envelope-reshaping → ADR + human ratify). **The tag is the build authorization.**
- **(3) Test plan.** The unit / store (testcontainers) / contract (fixture round-trip in CI) / crew-slot (one service slotted into shared dev flow) / family-E2E split, with per-tier responsibilities per CS §5. For any UI surface the plan carries the **"looks good AND works" bar**: vitest + Playwright + axe **plus** the POC's visual/screenshot sweep + dual-theme spec + design-token audit, ending in a human delight-check. [plan Phase-1; Phase-2 UI rules]
- **(4) The Service Done Definition (SDD).** [RULED 2026-07-13] The comprehensive, service-level definition of done — **everything the product will EVENTUALLY need from this service, not the current wave's slice**: the full API surface (including later-wave features from the concept-to-service map), events produced/consumed, entitlement/quota enforcement, cell-lint + tenancy compliance (`JGAUQRsw2g`), observability + SLOs, all test tiers green, runbook, and family-E2E participation. **Wave scoping happens AGAINST this total; per-issue DoDs roll up to it; the service is Done only when every line is evidenced.** [plan Phase-1 SDD ruling; Verification §Per service]
- **(5) Per-agent build prompt.** The "really clear contract" for the isolated build agent: scope, ACs, standards refs (CS `6aMAzsYeQb`, SE-Arch `8sYi523i4t`, cell-lint `JGAUQRsw2g`), the crew testing recipe, and the deterministic Done gate — with its **stories authored to the full 9-section H1–H17 standard of `9VUHxAcoXw`** (one named binary DoD test, machine-checkable ACs, seam + deep module + tiers + versions named, all 12 ❌ assessed, SE-Arch lenses + ADR triggers, vertical RED→GREEN tasks, tickable `- [ ]` boxes on every completable item). Stored + versioned in the service's wiki space.

---

## 4. STAGES — deterministic gates (dispatch each as fan-out; the gate is un-fakeable)

The Factory runs the **four waves in strict dependency order**. Within a wave, packs fan out in parallel (one authoring sub-agent + one independent review sub-agent per service). A pack is certified only when its adversarial review returns PASS **and** its contract tag exists; the contract tag is the hard gate that lets Phase 2 dispatch against it.

### Stage gate (applies to EVERY pack, every wave)

- [ ] All five artifacts (§3) authored as visible wiki drafts in the service's own space.
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in the contracts CI; TS clients generated per ADR-0035 where the service has TS consumers.
- [ ] **Adversarial pack review, reviewer ≠ author** (SE-Arch lenses `8sYi523i4t` + brief/canon conformance), verdict **PASS** — REVISE bounces back to a fix pass, never overridden. [plan Phase-1 certification ruling]
- [ ] The build prompt's stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes").
- [ ] SDD is complete (every eventual-need line present and evidenceable), not just the wave slice.

### Wave 1 — the seam that gates everything (ENG-2037, ready now)

`orvex-studio-contracts` + `orvex-studio-lib` + the **Go↔TS bridge proof-on-one-seam**. ENG-2037 (Definition Factory Wave 1) is filed and ready (was blocked-by ENG-2035 — clears when the entry-criteria ADRs ratify). [plan Tracking structure]

- [ ] **contracts pack** — the pinned Apache-2.0 seam; self-validation CI + AGPL-import guard defined; change-authority = ADR-0008; **absorbs the deferred ENG-2036 entitlement/cap contract shapes** to match the ratified pricing before any consumer freezes. [program-status §4 residual; current-state-map §5 P0-1/P0-2]
- [ ] **lib pack** — including the **MultiIssuerVerifier build plan** (the deny-by-default auth verifier that today blocks every Go satellite as a 52-byte scaffold); JWKS/issuer-registry source, module layout, generator toolchain named (a mini-ADR only if the pack review demands one). [current-state-map §5 P0-4; program-status §3 lib row]
- [ ] **Go↔TS bridge proof-on-one-seam** — ADR-0035 (`QbEBPuKcGR`) exercised concretely on a single real seam (contract → generated Go stub + generated TS client → both compile + a fixture round-trips), proving the bridge before the family depends on it. [current-state-map §5 P0-5]

### Wave 2 — the two zero-ticket services (epics born here)

`orvex-studio-staging` + `orvex-studio-workgraph` — **ZERO tickets exist today** (canon/contracts landed 2026-07-12; they are pre-definition, not abandoned). Their epics AND stories are authored from scratch in this phase. [exploration findings]

- [ ] **staging pack** — the Agent Staging Area + the **Librarian** product epic (supersedes the OPS Librarian/Card Contract v1 and the BFF Curator); sequence the hard-cut of agent write surfaces against 501 deps (the circular gate). [current-state-map §2 Librarian loop, §5 P1-7]
- [ ] **workgraph pack** — the multi-agent work-graph coordination kernel, **plus the NEW `workgraph → staging` promotion-edge contract for the Librarian's beads fishing**, and the beads product epic from the brief. Note "workgraph memory ≠ the Memory product" (naming collision — current-state-map §2). [plan Phase-1 W2; brief `rgBOQh31p3`]

### Wave 3 — delta-packs for the 11 drained services (brief's new features folded in)

Author one PRD-delta pack per drained service — **ai, api, knowledge, billing, identity, mcp, wiki, wiki-api, cli, console, workflows** — distributing the brief's new features per the concept-to-service map (current-state-map §2), not by a forced 1:1:

- [ ] **Composer (teaching Prompt Composer) + task-first wizard** → primarily `orvex-studio-api` (BFF) + `orvex-studio-ai`; the surface itself is defined in Wave 4.
- [ ] **The Orvex rating** → `orvex-studio-ai` / `orvex-studio-knowledge` per the map.
- [ ] **Outbound sync (with per-vendor caveats)** → `orvex-studio-knowledge` (the one retrieval/sync backbone).
- [ ] **Private memories + consent** → `orvex-studio-api` (`/v1/memory`, `studio.memory.*`) + `orvex-studio-knowledge` (corpus-isolation grade, OQ open).
- [ ] **Chat import** → `orvex-studio-api` (Curator `/v1/import`, `studio.conversation.imported`) with indexing in `orvex-studio-knowledge` (the import-UX-vs-backbone seam is a pack must-resolve).
- [ ] **Librarian preference / autonomy system** → the owning service per the concept-to-service map (staging-anchored, touching api/knowledge).
- [ ] **Free-tier cost-doctrine model routing** → `orvex-studio-ai` (model-class allowlist; frontier paid-only, zero-cost uncounted) + `orvex-studio-billing` (the ratified ENG-2036 caps). [program-status §4]
- [ ] Each delta-pack resolves the contested seams the map flags before freezing (Clerk-lifecycle identity-vs-workflows; memory ×3 homes; console's un-chartered workflows-proxy). [current-state-map §3 risk 9, §5 P1-6/P1-10]

### Wave 4 — UI surface-wave definitions (parity-first)

Define the UI migration surface-waves for `orvex-studio-ui` (the POC → target port). [RULED: rewrite, same stack.]

- [ ] **Enumerate the POC's ~35 surfaces** (the parity-first target: Discover/marketplace → Builder/editor flagship → Memory → Library/Collections → Curation Queue → Phase-2 surfaces incl. Composer + wizard). [plan Phase-2 UI order; exploration POC reality]
- [ ] **Rewrite-same-stack ruling recorded:** surfaces are REWRITTEN (never copy-pasted) on the POC's proven stack — **Tailwind + Radix + CVA + zustand + zod + TipTap** — adopted into orvex-studio-ui, with the **orvex-ds design tokens as the Tailwind styling contract** (tokens ported into the Tailwind theme; Radix primitives skinned by the DS). [plan Phase-2 UI ruling]
- [ ] **Shared DTO/error vocab via contracts codegen** replaces the POC's `packages/shared` (which has no counterpart in the target); it lands in Wave 0 of the UI build. [plan Phase-2; exploration UI migration shape]
- [ ] **The UI-canon amendment is OWED** — the UI architecture canon currently says exact-match `orvex-ds.css`; the pack records the amendment to the rewrite-same-stack + tokens-as-Tailwind-contract model (draft; human-ratify downstream). [plan Phase-2 UI ruling]
- [ ] Every surface wave carries its tests WITH it (the "looks good AND works" bar, §3 artifact 3).

---

## 5. LINEAR PROTOCOL

**Existing structure — do not recreate it.** The initiative "Orvex Studio" (`ddeb5b07-d9a9-4053-91e2-cf70e59d3ae4`) and its 17 member projects are live; the **P1 milestone "P1 — Definition Factory" already exists on the Delivery Gates hub**. Reads come from `.cache/linear/`; writes go live through the `linearis` CLI via `lnr-tracking-adapter` — never the Linear MCP, never direct GraphQL.

- [ ] **Author build/test issues to the FULL 9-section H1–H17 tickable standard of `9VUHxAcoXw`.** Every AC, task, named DoD test, DoD-checklist item, and the adversarial-review gate is a `- [ ]` checkbox; nothing completable is plain prose. A definition-pack tracking issue is filed per service; the Staging + Workgraph epics/stories (currently zero) are born here. [plan Tracking structure; `9VUHxAcoXw` H17]
- [ ] **Per-service P1 milestones as each wave starts** — note the **human dependency**: milestone CREATION needs the Linear MCP, which the CLI/adapter path cannot do. Stage the milestone-creation asks and escalate them as a batch to the operator; do not block pack authoring on them (packs land as wiki drafts regardless). [plan Tracking; §Escalation]
- [ ] **PACED writes — quota discipline is mandatory.** Linear allows **2500 req/hr, workspace-shared, and this program has burned it twice today.** Bulk state reads go through the §3.11 initiative cache (~5–10 calls), never per-project/per-issue sweeps. Batch writes; refresh-on-write one ticket at a time; on `rate_limited`, stage the write to a replay file and continue — never spin-retry. Serialize any heavy sweep with the delivery lane; sleep across window resets. [Delivery Orchestrator §3.32; lessons 2026-07-10.5, 2026-07-12]
- [ ] **Ticket hygiene:** every new ticket sets `project` at create time (verified by re-read) and defaults to `Todo`, never `Backlog` (partitioned engines read `Todo`). Never auto-close; every commit/PR body carries **"Part of ENG-NNN"** (links without closing keywords — Done is gate-owned). [lessons 2026-07-12.2; `9VUHxAcoXw` §9]
- [ ] **Dual-write lockstep:** every pack that changes canon persists to both surfaces in a coordinated batch — Linear via the adapter, the wiki via `doc-amend` as drafts (promotion is human-only `doc-ratify`). Never write one and defer the other. [Delivery Orchestrator §3.12]

---

## 6. CAPACITY

- [ ] **Sustain the floor of ~15 concurrent agents; ceiling 32.** At the top of every dispatch cycle ask "I am using N slots — what is the best use of the other (floor−N)?" and fill the slack. [Delivery Orchestrator §3.28/§3.31; capacity-floor memory]
- [ ] **Fill slack with non-claiming pre-work only** (never claim/build/merge on it): readiness pre-analysis on the next wave's services, concept-to-service-map cross-checks, fixture-coverage surveys, gate-coverage snapshots. This makes later waves author faster and is always safe alongside the Factory lane.
- [ ] The heartbeat is INTERNAL to the fan-out cadence — never an external fixed-interval re-invocation (a short timer thrashes the prompt cache and costs more than it saves). [Delivery Orchestrator §3.31]

---

## 7. FAKE-DONE PREVENTION

The Factory's own anti-fake-done posture (a pack certified but hollow is the cardinal sin — it authorizes a whole service's build against a lie).

- [ ] **The certification gate is deterministic and reviewer ≠ author.** A pack is certified only on an independent adversarial review returning PASS (SE-Arch lenses + brief/canon conformance) — never on the author's self-report. REVISE bounces to a fix pass; the gate never relaxes. [plan Phase-1 certification]
- [ ] **Evidence is observed, not reported.** The reviewer live-reads the wiki-draft pack (`docmost-cli page get --no-daemon` / `--prosemirror`, never the cache) and confirms each artifact against the brief/canon; the contract tag is verified to EXIST in `orvex-studio-contracts` and its fixtures to round-trip in CI — a claimed tag is not a tag. [Delivery Orchestrator lesson 2026-07-09 doc-gate; §3.19]
- [ ] **Boxes-clean.** A pack tracking issue or a build story whose body is not 100% `[x]` for genuinely-verified items is NOT done; never blanket-tick; tick only what the review genuinely verified (full-body read-modify-write, preserve every other byte). [`9VUHxAcoXw` H17; Delivery Orchestrator §3.19]
- [ ] **Orchestrator-only Done advance.** The authoring agent CANNOT advance a pack or a story to Done; only the orchestrator advances, through the deterministic gate. [`9VUHxAcoXw` §5e/H15]
- [ ] **The SDD is the anti-fake-done ratchet at the service level:** a service is Done only when every eventual-need line is evidenced, so a wave that green-lights a slice can never silently stand in for the whole service. [plan Phase-1 SDD ruling]
- [ ] Remember the ground truth: the Phase-0 re-baseline proved "94% Done" was **1 PASS / 5 FAIL / 1 BLOCKED**. The SDDs are written against that honest baseline, not the tracking optimism. [program-status §1]

---

## 8. ESCALATION

Full autonomy under standing PO authority: never block on a question a precedent already answers. For any non-product ambiguity pick a sensible default, **log the judgment call to `po-decisions/` (dated file, under `flock`) + a ticket comment marked "orchestrator judgment under PO standing authority"**, and proceed. [full-autonomy memory; lessons 2026-07-10.7, 2026-07-12]

Escalate to the PO ONLY for a genuine blocker an agent cannot resolve:

- [ ] **A human-held secret or a human-only platform action** not already available to the run — e.g. **Linear-MCP milestone creation** for the per-service P1 milestones (§5), or human `doc-ratify` of a draft required as an entry gate. Batch these; keep delivering the unblocked packs.
- [ ] **An unresolvable product decision or canon contradiction** the pack review surfaces that precedent does not settle (a genuinely new ownership-seam call the brief and map leave open).
- [ ] Verify the execution model and attempt self-provision via `deploy/` BEFORE any infra escalation — a false "no infra" escalation is the cardinal autonomy defect. [Delivery Orchestrator §3.15/§3.17]

Never fake-certify, never relax the review gate, never tag a contract that does not round-trip its fixtures. Honest partial-delivery + a crisp escalation beats a green board over an undefined seam.

---

## 9. EXIT CRITERIA

Phase 1 is complete only when every box is genuinely green (evidence observed, not reported).

**Scope boundary — what Phase-1 exit does NOT include.** Phase 1 is definition-only: it authors packs and builds/fixes nothing, so its exit leaves the six-surface acceptance baseline exactly as Phase 0 filed it (**1 PASS / 5 FAIL / 1 BLOCKED**, ENG-2039..2054 open). Converting that baseline to green — ENG-2033 signed, the two meta-blockers ENG-2039 (D1) + ENG-2040 (D16) closed, and the ENG-2034 nightly ratchet live — is **Phase-0 stabilization**, a *separate predecessor* that runs concurrently with this definition-only phase and must land before Phase 2. It is NOT produced by Phase 1 and is NOT one of the exit boxes below. Phase 2's entry gate verifies the green baseline (from Phase 0) *and* this phase's certification (packs + tags) independently; satisfying every box below does not on its own satisfy Phase 2 entry.

The Phase-1 exit boxes are:

- [ ] **All 16 Service Definition Packs are certified + their contracts TAGGED** (contracts, lib, staging, workgraph, ai, api, knowledge, billing, identity, mcp, wiki, wiki-api, cli, console, ui, workflows) — each with an adversarial-review PASS and a tag whose fixtures round-trip in the contracts CI. [plan Verification §Per definition pack]
- [ ] **Every SDD is complete** — the total everything-eventually-needed service-level done list authored and evidenceable per service. [plan Phase-1 SDD ruling]
- [ ] **The Go↔TS bridge is proven on one real seam** and TS clients generate for the TS satellites per ADR-0035.
- [ ] **The deferred ENG-2036 entitlement/cap contract shapes are landed** in the contracts pack, matching the ratified pricing. [program-status §4]
- [ ] **The Staging + Workgraph epics/stories exist** (from zero), including the workgraph→staging promotion-edge contract and the Librarian/beads product epics.
- [ ] **The UI surface-waves are enumerated** (~35 surfaces, parity order) with the rewrite-same-stack + orvex-ds-tokens ruling recorded and the UI-canon amendment drafted.
- [ ] **Linear epics/stories are authored to the full 9-section H1–H17 standard of `9VUHxAcoXw`, under the P1 milestones**, with per-service P1 milestones created (or their creation escalated as the batched human dependency).
- [ ] **The pack drafts are visible in each service's own space** (PO can spot-check any time, non-blocking) and the contract TAG stands as the hard dispatch gate for Phase 2.

**THEN, and only then, run the next phase's prompt page: "Orchestrator Prompt — Phase 2: Isolated Builds & Continuous Proving".** Phase 2 dispatches build waves against these certified packs under the contract-first dispatch rule (a story is frontier-eligible only if its service's contract tag ≥ the tag its definition pack names) — which is why nothing in this phase may be left uncertified or untagged.
