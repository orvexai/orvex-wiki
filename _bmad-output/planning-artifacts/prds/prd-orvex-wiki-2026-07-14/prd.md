---
title: "PRD: Orvex Memory — Gap Closure"
status: final
created: 2026-07-14
updated: 2026-07-14
wiki_slug: g9vWbSYplh
wiki_status: canonical
---

# PRD: Orvex Memory — Gap Closure

> **tl;dr** — Orvex's memory *concept* leads the field (human-confirm curation, readable memory, the memory + skills + wiki loop, the personal↔employer firewall). This PRD specifies the requirements to close the capability gaps that keep that lead from being *real*: getting memory into the AIs people actually use (esp. ChatGPT), making the Librarian's *proposals* good enough that confirming is a delight not a chore, and adding the table-stakes rigor competitors already ship — a frozen memory data model, a lifecycle, retrieval evaluation, and BYOK/compliance. Scope covers all eight gaps (Tier 1–3). This is the umbrella; after it comes architecture, then a fold-in plan into the service PRDs, then updated delivery phases.

## 1. Context

The mid-2026 competitive assessment ([Memory Feature Gap — Orvex vs the Field](https://docs.eu-central-1.myidp.cloud/s/orvexstudio/p/memory-feature-gap-orvex-vs-the-field-FC23qWA8n3), `FC23qWA8n3`) found Orvex leads on the memory axes it chose but is missing on three fronts: **delivery** into third-party AIs for non-technical users, the **quality of the "propose"** half of propose-and-confirm, and **table-stakes rigor**. The competitive window is open but closing — labs now offer one-way memory import (switcher-poaching, not neutrality), and new entrants (MemoryLake team-RBAC memory; Second Brain for AI's confirm-before-canon; Engram's $98M token-cost memory) are narrowing specific gaps.

This PRD is the **umbrella gap-closure requirement set**. It does not restate the existing memory model — that lives in canon: the three stores (Memory / wiki / beads) and the Librarian ritual (`rgBOQh31p3`, `3z78laG6dB`, `fr7YaPq8Tl`), the knowledge storage/retrieval architecture (`azRwTCZMqw`, `dCbFzRQGDr`), and the AI service (`pbKI3BpQmY`). It specifies what must be *added or changed* to close the gaps, and its FRs are intended to fold down into the service PRDs after architecture.

**Build reality it must reckon with:** the knowledge-service core (query / indexer / retrieve) is built and tested; the AI service, cross-AI delivery, and the memory/skill/chat corpora are design-only.

## 2. Goals & success metrics

**Goals.** Close all eight identified gaps so Orvex's memory advantage is (a) *reachable* inside the assistants people use, (b) *trustworthy* because proposals and retrieval are good, and (c) *credible* to regulated buyers.

**Success metrics.** Targets marked `[ASSUMPTION]` are provisional and to be ratified; each names its measurement method and owner so the PRD is falsifiable and can gate fold-in. Owner for all product metrics: PM + analytics; revisit at architecture.

- **Activation** — ≥ 40% `[ASSUMPTION]` of new users connect ≥1 assistant *and* produce a memory-enriched output within 7 days. *Method:* product-analytics funnel on the connect + first-enriched-output events.
- **Delivery reach** — ≥ 50% `[ASSUMPTION]` of weekly-active users invoke Orvex *inside ChatGPT or Gemini* (not only Claude / copy-paste). *Method:* per-assistant delivery telemetry (FR-D1).
- **Confirm-loop health** — proposal **accept-rate ≥ 60%** and **median confirm time ≤ 10 s** `[ASSUMPTION]`. *Method:* the proposal event stream (accept / edit / discard, timestamps).
- **Retrieval quality** — **recall@10 ≥ 0.80** `[ASSUMPTION baseline]` on the Orvex memory eval set, regression-gated. *Method:* the offline eval harness (FR-E1).
- **Trust** (hard, not provisional) — **zero** personal↔employer leak incidents; **100%** of private-memory injections consented. *Method:* firewall/consent audit log.

**Counter-metrics** (watch for the win becoming a loss).
- Confirming becomes a chore — rising proposal **edit-rate / discard-rate** (proposal noise).
- Latency regressions on the warm retrieval path.
- Support volume on "connecting your AI."
- Memory staleness — surfaced facts that are no longer true.

## 3. Scope

**In scope:** all eight gap areas — cross-AI delivery, proposal quality, memory data model, memory lifecycle, retrieval evaluation, security/compliance, team-moderated memory, token-cost efficiency (Features F1–F8 below).

**Out of scope:** memory-as-infrastructure sold to third-party developers (a different market); building a frontier model; mid-conversation runtime auto-recall inside third-party clients beyond what their APIs permit.

**Sequence (user-directed).** This PRD → **Architecture** (memory gap-closure) → **fold-in plan** (thread these FRs into the ai / knowledge / mcp / api service PRDs) → **update the current delivery phases**.

## 4. Users & context

The memory user is a **non-technical professional running their day through AI** — the beachhead being regulated/high-stakes roles (a teacher like Laura Pendleton; doctors and lawyers). Two consequences drive requirements: (a) *delivery and setup must need zero technical skill* — no MCP config, no JSON; and (b) *compliance is load-bearing* — BYOK, HIPAA, and data residency are not enterprise nice-to-haves but beachhead entry conditions. Journeys are captured inline in the FRs where they matter.

## 5. Features & functional requirements

### F0 — First-run seeding & onboarding (Tier 1 — added at review)
*The #1 metric ("memory-enriched output in week 1") depends on a non-technical user getting from zero memories to a first useful one. This was absent; it is now first.*

- **FR-O1** A new user MUST reach a **first useful, memory-enriched output within their first session**, via a guided seed: a short profession-aware setup that produces starter Memory + a seeded demo world (per the onboarding/demo-data research, `axvs1ZzxGn`).
- **FR-O2** **Inbound import** MUST be a first-class capture path: bulk import from sanctioned ChatGPT / Claude / Gemini / Grok export files, screened by the Personal-Data Guard and routed through the propose-and-confirm gate. `[ASSUMPTION]` provider export is async/lossy (upload-archive is the only ToS-clean path); the UX MUST handle "request → come back when it lands → re-request."
- **FR-O3** Every memory surface MUST have a **designed empty state** that teaches the next action (not a blank screen), and a demo/real separation so seeded content is never mistaken for the user's own or lost on clear.
- **FR-O4** "Connect an assistant in one guided step" (FR-D2) MUST have a concrete acceptance test: a non-technical user completes connection in **≤ 3 taps and ≤ 2 minutes with no config file or command line**, verified by first-run usability testing.

### F1 — Cross-AI delivery (Tier 1)
*The biggest hole: Orvex memory must reach the assistant a non-technical user already uses — especially ChatGPT, which has no memory API.*

> **Gate.** F1 rests on an unowned ToS + web-UI-breakage risk. Before architecture commits to it, a **legal + technical viability spike** MUST confirm the injection approach is ToS-compliant and durable. If it degrades to copy/paste (FR-D5) it delivers nothing past the status quo, so viability is a go/no-go for the flagship — not a detail.

- **FR-D1** Orvex MUST deliver a composed prompt enriched with relevant Memory into the **ChatGPT and Gemini web UIs without copy/paste**. `[ASSUMPTION]` a browser extension is the mechanism; alternatives (bookmarklet, native helper) are weighed in architecture (OQ1).
- **FR-D2** A non-technical user MUST be able to connect an assistant in **one guided step** — no MCP configuration, no local server, no JSON — with clear per-assistant connection status. *Acceptance:* FR-O4.
- **FR-D3** Delivery MUST cover the beachhead assistants (ChatGPT, Claude, Gemini, Grok), with honest "not yet supported" messaging for others.
- **FR-D4** Delivery MUST honor the personal↔employer firewall and **per-use consent** for private memories — never silent injection.
- **FR-D5** Delivery MUST NOT scrape or breach provider ToS: it injects into the user's *own* session/compose surface, and **degrades to copy/paste** when a provider blocks injection.
- **FR-D6** Outbound Memory sync MUST continue for vendors with native memory APIs (Claude adapter); ChatGPT is reached via FR-D1 until/unless an API exists.
- **FR-D7** Delivery MUST **detect its own breakage** (a provider changing its web UI) and fail loud — notify the user, fall back to copy/paste, and alert the team — rather than silently injecting into the wrong place or nothing.

### F2 — Memory proposal quality (Tier 1)
*Confirm only delights if the Librarian proposes good candidates. The "propose" half is currently unspecced.*

- **FR-X1** The Librarian MUST propose memory candidates (from the beads stream, save-this-thread, and imports) at a measurable quality bar: **proposal precision ≥ 0.75 and recall ≥ 0.60** `[ASSUMPTION baseline]` against a labeled human-judged proposal eval set, so confirming is a light touch. *Method:* a maintained golden set of sessions with human-marked "should-keep" memories.
- **FR-X2** The **beads→staging capture edge** (today flagged "not yet in canon") MUST be specified and delivered as the reliable capture path.
- **FR-X3** Proposals MUST be de-duplicated and reconciled against existing Memory before display: **≤ 5%** `[ASSUMPTION]` near-duplicate rate in surfaced proposals, measured against the confirmed Memory set.
- **FR-X6** The extraction/proposal pipeline MUST defend against **memory-poisoning / prompt-injection** carried in captured content: the human-confirm gate is the structural defense, backed by provenance capture and sensitivity screening so a malicious source cannot silently write canon. *(See FR-S6.)*
- **FR-X4** Proposal quality MUST be **continuously measured** (accept / edit / discard rates) and regressions gated.
- **FR-X5** Extraction MUST run **asynchronously off the write path** (never inline) to preserve the instant feel.

### F3 — Memory data model (Tier 2)
*The "legible portrait" flagship claim has no frozen schema yet.*

- **FR-M1** The Memory **card schema MUST be frozen**: content, provenance/source, owner/scope, sensitivity, confidence, timestamps, and lifecycle state.
- **FR-M2** Every memory MUST have a **human-readable, human-editable** representation — the legible portrait, not an opaque blob.
- **FR-M3** The schema MUST be **versioned and forward-compatible**.
- **FR-M4** The schema MUST carry the fields the firewall (FR-S5), consent, and lifecycle (F4) features require (scope, sensitivity, validity window, state).

### F4 — Memory lifecycle (Tier 2)
*No temporal validity, decay, retention, or reconcile model exists for curated Memory — a memory that never ages will rot.*

- **FR-L1** A memory MUST carry **temporal validity** (observed-at, valid-from, valid-until) so superseded facts do not surface as current.
- **FR-L2** Contradictions MUST be **reconciled, not silently overwritten** — the Librarian's *Reconcile* disposition, with the older assertion invalidated (not deleted) and reversible.
- **FR-L3** A memory MUST have a **state model** (active / superseded / archived) consistent with the wiki's draft→canonical discipline where it applies.
- **FR-L4** A **retention / decay policy** MUST exist (staleness signals, optional expiry) under user control.
- **FR-L5** Deletion MUST erase every **Orvex-controlled** copy and every synced-out vendor memory **the vendor API allows** to delete. Content already *injected* into a third-party session (FR-D1) is outside Orvex's deletion reach; this boundary MUST be **disclosed to the user** at consent time, not silently assumed away.

### F5 — Retrieval quality & evaluation (Tier 2)
*Buyers compare memory quality on LongMemEval/LoCoMo; Orvex has no eval story.*

- **FR-E1** An **offline eval harness** MUST measure memory retrieval quality on representative task sets, reporting **recall@10 and answer-correctness** with a committed baseline (see Success Metrics: recall@10 ≥ 0.80 `[ASSUMPTION]`) — a number Orvex can stand behind.
- **FR-E2** Orvex SHOULD track a **public-comparable benchmark** (LongMemEval / LoCoMo-style) for external credibility. `[ASSUMPTION]` benchmark selection in OQ4.
- **FR-E3** Retrieval changes MUST pass a **regression gate** before ship.
- **FR-E4** The raw kept-content store (wiki) MUST remain **searchable alongside** distilled Memory — honoring the industry ablation that verbatim retrieval beats extracted-fact memory for long-context QA.

### F6 — Security & compliance (Tier 2, beachhead-critical)
*SOC2/HIPAA/BYOK is the market bar and doubly load-bearing for doctors and lawyers.*

- **FR-S1** Orvex MUST offer **BYOK** (customer-managed encryption keys) for Memory + wiki content, at least for Teams / regulated users.
- **FR-S2** Orvex MUST have a path to **SOC 2 Type II** and **HIPAA (BAA)**.
- **FR-S3** A **self-host / BYOC** option MUST be available for data-residency/air-gap needs. `[ASSUMPTION]` aligns with the Turbopuffer BYOC-per-cell posture.
- **FR-S4** Per-user/tenant isolation MUST hold at the memory-corpus level; the attribute-vs-namespace isolation grade (open in R-9, OQ2) MUST resolve to the **stronger wall for regulated tenants**.
- **FR-S5** The personal↔employer **firewall and per-use consent** MUST be enforced end-to-end — capture, storage, retrieval, delivery, and sync-out.
- **FR-S6** The memory pipeline MUST resist **memory-poisoning and stored prompt-injection**: no captured content becomes canon without passing the human-confirm gate; provenance and sensitivity are recorded per memory; and injected/retrieved memory is treated as untrusted data, not instructions.

### F7 — Team-moderated shared memory (Tier 3 — phased)
*The locked decision keeps team memory **deliberately minimal in v1** (minimally team-aware only). This feature respects that: v1 MUSTs are only the ones that avoid a later rewrite; the full team surface is SHOULD/phased (OQ6). MemoryLake is the entrant to watch.*

- **FR-T4** *(v1 MUST)* The data model MUST be **minimally team-aware** — nullable owner/scope, free CAS concurrency — so shared/official memory lands later without a rewrite, and MUST NOT leak personal memory (firewall).
- **FR-T1** *(SHOULD, phased)* Teams SHOULD support **shared/official Memory** with RBAC (read / propose / approve / admin).
- **FR-T2** *(SHOULD, phased)* A **moderation queue** SHOULD gate promotion of a team memory to "official" — the Librarian pattern at team scale.
- **FR-T3** *(SHOULD, phased)* Setup-chosen **governance models** (moderator-permissioned / self-curate / mix) SHOULD be selectable.

### F8 — Token-cost efficiency (Tier 3)
*Engram's whole pitch; a new competitive axis (efficiency, not just recall).*

- **FR-C1** Memory injection MUST be **token-budgeted** — only the most relevant memories enter a prompt — with **≥ 50%** `[ASSUMPTION]` token reduction vs. naive full-context injection on the eval set, at no measurable loss of answer-correctness (FR-E1).
- **FR-C2** Orvex SHOULD **measure and optionally surface** the token/cost reduction its memory delivers.
- **FR-C3** User memory profiles SHOULD be **precomputed / warm-cached** to hold both latency and cost. `[ASSUMPTION]`

## 6. Cross-cutting NFRs

- **NFR-1 Latency** — warm-path memory retrieval p95 within the knowledge target (align NFR-K13, ~50 ms); extraction always async.
- **NFR-2 Privacy & consent** — automatic *runtime recall* is default-off; per-use opt-in for private memories; GDPR erasure end-to-end within the FR-L5 boundary. This does **not** conflict with FR-D1 delivery: delivery is a **user-initiated** act (the user composes and sends), not silent background recall.
- **NFR-3 Neutrality** — no lock-in; memory portable across assistants; outbound sync free forever (locked decision).
- **NFR-4 Graceful degradation** — a memory/AI outage MUST NOT block core use; delivery degrades to copy/paste; never white-screen.
- **NFR-5 Non-technical accessibility** — every memory feature usable with no technical setup and no prompt engineering.
- **NFR-6 Auditability & reversibility** — memory changes are diffed, reversible, and (for teams) audited.
- **NFR-7 Localization** — the memory surfaces MUST support i18n; English first, EU-beachhead languages phased. `[ASSUMPTION]` locale priority set with GTM (OQ7).

## 7. Dependencies & sequencing

**Service dependencies:** `orvex-studio-knowledge` (storage, retrieval, eval — F4/F5), `orvex-studio-ai` (chat/ask, metering — F2/F8), `orvex-studio-mcp` + a **new browser-extension component** (F1), `orvex-studio-api` `/v1/memory` (data model, lifecycle — F3/F4), `orvex-studio-identity` (firewall, BYOK — F6), `orvex-studio-billing` (tier gating), `orvex-studio-contracts` (memory schema + MCP contract).

**Roadmap (user-directed):** this PRD → **Architecture** → **fold-in plan** (thread FRs into the service PRDs) → **update the current delivery phases**. Because delivery, the AI service, and the Studio corpora are design-only today, sequencing must stand these up before or alongside the gap features.

## 8. Open questions & assumptions

- **OQ1** Cross-AI delivery mechanism — browser extension vs. alternatives (trust, ToS, maintenance). Architecture to decide (drives FR-D1).
- **OQ2** Memory-corpus isolation grade — attribute-scoped vs. per-user namespace wall (R-9 open); regulated tenants likely force the wall (FR-S4).
- **OQ3** Outbound-sync conflict policy — Orvex master vs. vendor-side divergence (open in `3z78laG6dB`).
- **OQ4** Which public benchmark(s) to adopt (FR-E2).
- **OQ5** Naming disambiguation — "Memory" (product) vs. agent-memory vs. beads/workgraph (P1 ruling pending).
- **OQ6** Team-memory depth for v1 vs. later (currently deliberately minimal — F7 may phase).
- **OQ7** Locale/i18n priority for the EU beachhead (NFR-7) — set with GTM.
- **OQ8** F1 legal + technical viability spike outcome (the F1 Gate) — go/no-go input to architecture.
- **[ASSUMPTION]** tags above mark inferences beyond current canon; confirm during architecture. All provisional metric targets are `[ASSUMPTION]` pending ratification. Mechanism-level choices (isolation grade, precompute, storage engine) are architecture-owned, not fixed here.

## 9. Relationship to existing canon

This PRD is additive. On fold-in, F1 lands in a new extension/mcp spec; F2/F5 in `PRD: orvex-studio-knowledge` + `orvex-studio-ai`; F3/F4 in the `/v1/memory` (api) spec + knowledge; F6 across identity + knowledge; F7 in the Teams product surface; F8 in ai + knowledge. The Librarian ritual, three-store model, firewall, and outbound-sync decisions are unchanged and inherited.
