# Reconciliation — Orchestrator Prompt (Delivery), §2 Studio Canon Baseline

**Target page:** `orvexstudioarch` / `gkkUDzn277` — "Orchestrator Prompt — Delivery" (CANONICAL — applied under PO Daniel's ratify-all pass, 2026-07-13)
**Linear:** ENG-2035 (canon reconciliation, drift not decisions)
**Prepared:** 2026-07-13 · **Corrected:** 2026-07-13 (§2.3 re-aligned to ADR-0034; claim arbiter re-cited to ADR-0033)

## Why

§2's OPEN DECISIONS (2.1 event envelope, 2.2 claim arbiter / orchestrator authority, 2.3 credential lanes, plus the §1.6 execution-seat TBD it cross-references) have all since been settled by ADRs in the family registry (2026-07-06 through 2026-07-13). The page itself still reads as if these are pending. This is drift correction — no new product judgment is exercised here, only reflecting rulings the registry already made.

**OPEN-DECISIONS → governing ADR:**

- **Execution seat** → **ADR-0006** (Orchestrator execution seat — operator workstation), canonical, ratified 2026-07-07.
- **Event envelope / type taxonomy** → **ADR-0007** (CloudEvent envelope for the studio-spine) + **ADR-0010** (`studio.*` CloudEvent type taxonomy), both canonical.
- **Contracts change-authority** → **ADR-0008** (Contracts change-authority — layered automated-merge + ADR-gated reshaping), canonical.
- **Claim arbiter** → **ADR-0033** (`yNFx3YyNap`) — Work-claim arbiter for the delivery orchestrator: Linear-status-as-claim + guardrail contract + Temporal-CAS trip-wire. This **replaces** the earlier "resolved as a consequence of ADR-0006 §5, no arbiter needed" framing: ADR-0033 *ratifies* Linear-status-as-claim as the arbiter (bound by a guardrail-invariant contract, with a pre-designed trip-wire to a Temporal deterministic-ID CAS), rather than declaring the question moot.
- **Agent credential lanes** → **ADR-0034** (`12aDkq4iOd`) — Credential lanes for agent execution: deny-by-default per-lane scoping, allow-list dispatch, AI-brokered scoped model token (with a scoped short-TTL raw-key interim until the `orvex-studio-ai` broker ships). ADR-0034 **refines ADR-0006 §2 and partially reverses its 2026-07-07 amendment**, and explicitly supersedes the hard refuse-gate restatement that the earlier draft of this reconciliation carried in §2.3.

## Exact replacement text for §2

Replace the current §2.1–§2.3 (open-decision framing) with the following, and add §2.5. §2.4 (Linear ground truth) is unaffected and is left as-is between §2.3 and §2.5.

---

### 2.1 Canon authority & the event envelope (settled — ADR-0007, ADR-0010)

- Studio canon authority order lives on {dfm:CxjFpIVUZY} (Orvex Studio — Architecture & Principles, the family canon root). Regional + URL canon where those topics arise: {dfm:JGAUQRsw2g} (multi-region cells + day-1 cell contract) and {dfm:86CiGucQwU} (URL/environment scheme). Doc governance (drift + spec-gate are orvex-wiki-api capabilities): {dfm:cpeenW2R9t}. Space index: {dfm:GmKOk6xz0J}.
- There is **no single Studio PRD** — per-service PRDs live in each service's own wiki space (slug = repo name without dashes).
- **The event envelope is settled, not open.** Houston's 13-type run-event envelope was Houston-only machinery; the Studio equivalent is **CloudEvents on the studio-spine broker**, ratified as:
  - **ADR-0007** — the structured-mode JSON envelope (`events/schemas/_envelope.json`, CloudEvents 1.0 core + REQUIRED orvex extensions `orvexcell`/`orvextenant`; `partitionkey` = tenant id; required set `[specversion, id, source, type, orvexcell, orvextenant]`).
  - **ADR-0010** — the `studio.*` type taxonomy on top of that envelope (`studio.<subdomain>.<event>` grammar, e.g. `studio.skill.created`; producer = `orvex-studio-api`; consumers register per canon P9). Per-type payload schemas remain authored as-built in `orvex-studio-contracts` per the ADR-0008 lane (§2.5).
  - Durable workflow state for the studio-spine lives in Temporal (`orvex-studio-workflows`), per the ADR-0006/ADR-0007 pairing.

### 2.2 Orchestrator authority & the claim arbiter (settled — ADR-0006, ADR-0033)

Doctrine carried from the Houston ADR-0013 pattern (an LLM-backed orchestrator with claim/gate authority; the fake-done gate stays deterministic code):

- **Orchestrator = LLM-backed AGENT** — holds coordination + claim/gate authority; resolves the frontier, walks the graph, owns Done; escalates to human operators.
- **The fake-done gate stays a deterministic CODE check the orchestrator cannot bypass.**
- **Execution seat — settled by ADR-0006.** The delivery orchestrator and all build/review sub-agents run on **the operator's laptop / workstation** as Claude Code driving the delivery Workflow engine. Houston's in-cluster crew-pod agent seat is explicitly **not** adopted (the crew-*overlay deploy* pattern is kept for per-developer integration-test environments; the crew-pod *agent seat* is not). Concurrency ceiling: ≤32 concurrent sub-agents (two 16-slot workflows side by side); merges serialize per repo.
- **Claim arbiter — settled by ADR-0033.** Houston used Dolt CAS as the claim authority. Studio's ruling: **Linear-status-as-claim** is ratified as the delivery work-claim arbiter — the authoritative claim on an issue is its Linear `In Progress` state, written by the engine's explicit `linearis` flip and verified by the mandatory refresh read-back. Mutual exclusion is provided **structurally** by a binding guardrail-invariant set (G1 single orchestrator, per ADR-0006 §5; G2 single authoritative Linear writer; the one tolerated non-authoritative writer — Linear's GitHub-integration auto-close — is detected-and-reverted), **not by a lock**. No standalone arbiter service and no external CAS store is introduced now; a **pre-designed trip-wire to a Temporal deterministic-ID CAS in `orvex-workflows`** is armed to fire the moment any guardrail invariant can no longer hold (a second authoritative writer, a multi-operator / in-cluster seat).

### 2.3 Agent credential lanes (settled — ADR-0034, refining ADR-0006 §2)

- **Principle (binding, carried from the Houston ADR-0009 pattern):** never leak raw provider keys or control-plane credentials into a sub-agent environment. Build/review agents receive only the narrowly-scoped, short-lived credentials their lane declares.
- **Model — deny-by-default per-lane ALLOW-LIST (ADR-0034).** Each agent role is confined to a named credential *lane*. A dispatch env starts **empty** and is populated by an **allow-list of exactly the lane's declared credentials**, each minted short-lived and narrowly scoped on the OIDC→OpenBao pattern. Forbidden credentials are never *candidates* for injection, so nothing is ever "refused" and **no dispatch is ever blocked** — this reconciles ADR-0006's never-block mandate with CS §10 least-privilege simultaneously. It **replaces** ADR-0006's withdrawn raw-key *deny-list refuse-gate* (a deny-list can only block; the allow-list gets the confinement without the block).
  - **Control lane** — orchestrator process only, never enters any dispatch env: cluster-admin kubeconfig (build-only/read, never `apply`/`sync`), the `gh` REST/GraphQL merge token, the `docmost-cli` write token, in-cluster OpenBao auth, and the live Linear write token.
  - **Build lane** — build sub-agent: a work-branch-scoped git push credential (never the merge token), a read-only worktree, read-only wiki grounding, Linear reads via `.cache/linear/` (no live token), and injected per-service connection URLs (never the kubeconfig, never OpenBao auth itself).
  - **Verify/review lane** — reviewer (≠ implementer): a read-only diff + worktree, the ability to run the pinned CI gates locally, read-only grounding, and the Linear read-cache. No push credential, no merge token, no write token of any kind.
- **Model access is an AI-brokered scoped token, never a raw provider key (ADR-0034 §3).** The default remains harness-mediated LLM auth; when a task genuinely needs model capability beyond the harness, the build lane declares a scoped, metered, short-TTL token brokered through `orvex-studio-ai`'s contract API (Coding Standards {dfm:6aMAzsYeQb} §6 LLM confinement — no provider/LiteLLM master key exists outside `orvex-studio-ai`).
- **Interim rule — until the `orvex-studio-ai` broker ships.** The broker-token scope vocabulary is an open follow-up, so a **scoped, short-TTL raw provider key remains a legal, lane-declared credential for the narrow model-capability case** — minted and metered like any other lane credential, never a standing master key at rest. Once the broker ships, the scoped broker-token supersedes the raw key and the raw-key lane is retired. This deliberately preserves never-block: the ADR must not forbid the only available fallback while its replacement is unshipped, or it re-creates exactly the block the 2026-07-07 amendment withdrew.
- **Enforcement is structural, not detective.** Control-lane credentials cannot leak downward by omission-error, because a child env is built up from empty rather than filtered down from the parent (matching ADR-0029 §5's deny-by-default `requireScope()` and ADR-0021's caller-token pass-through). A per-agent OIDC-vended identity (Houston-style) is **deferred** to the in-cluster / multi-operator seat (an ADR-0006 §5 follow-up); on the laptop seat, "mint" is concretely the orchestrator deriving a scoped, expiring credential from its own OpenBao read and injecting it into the lane env.

### 2.5 Contracts change-authority (settled — ADR-0008)

Wherever this prompt or a sub-agent cites contracts change-authority (e.g. reasoning about how a breaking vs. additive contracts change is merged), the governing ruling is **ADR-0008** (Contracts change-authority — layered automated-merge + ADR-gated reshaping): mechanical/additive changes flow through canon P3's automated lane (agents author; CI drift-gates + AGPL import-guard + schema-validation police it; no human ratify; additive fast-track merge), while breaking or seam-reshaping changes — including any change to the ADR-0007 envelope's required attributes — are a mandatory ADR trigger with human doc-ratify before promotion. The drift-gate + semver policy (FR-C17) is the classifier; ambiguity resolves to the ADR lane.

---

## Notes for the ratifier

- §2.4 (Linear ground truth) is untouched — it was already current-state, not an open decision. It sits between §2.3 and §2.5 unchanged.
- The §1.6 execution-seat "TBD" cross-reference elsewhere in the prompt (outside §2) should be updated to point at ADR-0006 in the same ratify pass, for consistency — flagged here so it isn't missed, but out of scope for this §2-only revision.
- No product judgment was exercised in drafting this revision — it is a straight citation of already-ruled ADRs (ADR-0006/0007/0008/0010 canonical; ADR-0033/0034 the settling rulings for claim arbiter and credential lanes) against the stale OPEN DECISIONS framing.
- **Correction log (2026-07-13):** the earlier draft of §2.3 restated ADR-0006's *original* hard refuse-dispatch credential gate ("refuse dispatch + record an incident"). ADR-0034 reverses that gate — a deny-list can only block, so it was swapped for a deny-by-default allow-list. §2.3 above now reflects the allow-list model and its interim scoped-raw-key rule; the claim-arbiter citation moved from "ADR-0006 §5 consequence" to ADR-0033.
