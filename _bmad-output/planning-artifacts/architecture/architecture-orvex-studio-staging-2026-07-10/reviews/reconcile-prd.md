# PRD ↔ Spine reconciliation — orvex-studio-staging

**Input (authoritative):** `prd-studio-staging-area-2026-07-09/prd.md` + `addendum.md`
**Spine (under review):** `architecture-orvex-studio-staging-2026-07-10/ARCHITECTURE-SPINE.md`
**Date:** 2026-07-10
**Ruled deviation (not a miss):** sibling `orvex-studio-memory` → `orvex-studio-workgraph` rename (PRD still says memory / `divert-to-memory`); the spine's `WG[orvex-studio-workgraph divert]` and `workgraphclient` are the PO-ruled form.

Method: a requirement *lands* if an AD / convention / capability-map row / deferred entry governs it, or it is plainly delegated to code. This report lists ONLY what did NOT land: (a) a requirement with no home, (b) a quiet prose rule the AD structure dropped, (c) a spine claim that contradicts the PRD.

---

## What landed (spot-confirmed, not exhaustive)

- **Intake / lifecycle / provenance / pointers (FR-STG1–6):** AD-2 (state CAS), AD-8 (verified-principal provenance, immutable, survives to wiki history), AD-10 (S3 pointer-state), AD-11 (quota). Content-format rejection (lossy) in conventions. ✓
- **Triage / routing / conflicts (FR-STG7–9):** AD-3 (conflict keying on stable block IDs, authoritative ≤45s-free read, three-way prose merge forbidden, multi-proposal anchor re-resolution), AD-6 (LLM via ai, candidates via knowledge). ✓
- **Dial / tiers / review queue (FR-STG10–12):** AD-7 (server-side verdict = dial × risk × tier × confidence; destructive human-gated <full-auto; mandatory low-confidence adjudication lane excluded from bulk-accept). ✓
- **Apply (FR-STG13):** AD-2/3/4/5 (workflow-state gate, snapshot-before-mutate + inverse ops, explicit paused state = partially-mutated wiki). ✓
- **Beautify (FR-STG14, FR-STG21):** AD-13 (triage-time re-author = the approved diff; schema-registered nodes only; full-text+marks equality; scope matches op granularity). ✓
- **Learning + packs + cold-start (FR-STG15–17, 27, 29):** AD-14 (append-only feedback; exemplars+tiers+proposed revisions; admin-gated; content-free cold-start & marketplace; held-out validation). ✓
- **Maintenance sweeps (FR-STG18–21):** capability map → `sweep`; AD-6 (knowledge trust-gating as v1 dep deliverable, contract in contracts). ✓
- **Groundability auto-apply gate (FR-STG22, partial):** AD-7 (auto-applied-but-unreviewed not groundable until post-hoc flip). Partial — see note N2.
- **Surfaces + hard cut + events (FR-STG23–26):** conventions (`staging_*`, `orvex-cli staging`, event naming), AD-12 (verbatim Card-v1 superset, loud cut, all write paths), AD-9 (outbox CloudEvents), AD-4 (wiki-api 403 chokepoint). ✓
- **Scheduling (FR-STG28):** AD-2/AD-5 + state diagram `accepted → applying: scheduled`. ✓
- **NFRs:** NFR-STG1 (Deferred numeric SLOs + benchmark gate + per-tenant ai budget in AD-6), NFR-STG2 (AD-4/AD-11 + ADR-0015 no cross-DB), NFR-STG3 (AD-5), NFR-STG4 (AD-8/9/14 immutable audit), NFR-STG5 (AD-4/AD-8 chokepoint + RLS + VerifyFresh), NFR-STG6 (AD-9 + Observability convention). ✓
- **§10 constraints:** Postgres-only/no-Dolt + steal cell-keying (inherited P5+D-S12, AD-3), no-fallbacks/hard-cuts (inherited Ruling-5, AD-12). ✓
- **Sequencing invariants:** hard cut LAST + gated on non-501 deps (AD-4), wiki-api promotion prerequisite (AD-4/NFR-STG5), knowledge trust-gating v1 deliverable (AD-6), benchmark can't bind pre-501 (Deferred). ✓

---

## Gaps (did NOT land)

### G1 — §10 / §5 / §12: "AI never self-promotes to canonical; ratify gate untouched" has NO home. **(category a — strong)**
PRD §10 constraint: *"AI never self-promotes wiki status to canonical; ratify gate untouched."* §5 non-goal: *"Does not replace the doc-ratify human gate for canonical status — the Librarian applies content; page status promotion keeps its existing human-ratification contract."* §12 assumption: *"applied agent content lands at wiki status draft/published per tenant policy, canonical stays human-ratified."*
The spine never mentions wiki page status, `draft`/`published`/`canonical`, `page-meta status`, ratify, or self-promotion. AD-4 (apply via wiki-api: CAS, block ops, receipts) could set any status without violating a stated invariant. This is a Daniel hard rule *(cf. no-fallbacks / ratify-gate canon)* and the single most load-bearing omission — the apply engine's status behavior is ungoverned. **Needs an AD or convention clause: apply writes at draft/published per tenant policy, never promotes canonical.**

### G2 — FR-STG26: AD-9 reroutes the reindex trigger, contradicting the PRD's wording. **(category c — deliberate but unratified)**
PRD FR-STG26: *"knowledge consumes apply events for reindexing"* — parallel to *"console consumes queue metrics,"* i.e. knowledge consumes staging's `studio.staging.*` apply events. AD-9 states the opposite: *"Knowledge reindexes wiki content from the ENGINE's `wiki.*` events after apply — staging events … never trigger a second reindex."*
The *outcome* (knowledge reindexes after apply) is preserved and the engine-truth trigger is architecturally cleaner (staging's "applied" is a claim; the engine mutation is truth). But it directly negates the PRD's stated mechanism. Defensible refinement — **flag for PO ratification, don't silently diverge.**

### G3 — §4.4 / NFR-STG1: maintenance sweep's SEPARATE daily interaction budget dropped. **(category b — moderate)**
PRD §4.4: *"Maintenance recommendations carry their own daily interaction budget, separate from intake ChangeSets (NFR-STG1)."* NFR-STG1: *"The intake-ChangeSet interaction budget is separate from the maintenance-sweep queue (which carries its own daily budget) — the two share a surface, not a budget."*
The spine's `sweep`/`policy`/`quota` coverage and NFR-STG1 capability-map row (→ benchmark) never carry this budget-separation constraint. Without it, sweep recommendations can consume the intake ≤10-interaction budget the SM-3 gate protects.

### G4 — §4.4 / §2.2 / §5: default sweep scope protecting human-authored pages dropped. **(category b — moderate)**
PRD §4.4: *"Default sweep scope: write-proposals target agent-authored pages; human-authored pages receive flag-only findings unless the tenant opts in — the human editing path stays untouched (§2.2)."* This realizes the §5 non-goal (*"not a general human collaboration/review tool … humans keep editing the wiki directly"*) and §2.2 (*"their direct edit path is untouched"*).
Nothing in AD-6, AD-7, or the sweep capability-map row expresses "don't propose writes onto human-authored pages by default." A sweep that proposes edits to human pages would breach a non-goal with no invariant to stop it.

### G5 — SM-C2: acceptance-weighted proposal-volume counter-metric has no home. **(category a — minor)**
SM-C1 and SM-C3 are both bound in AD-7. SM-C2 (*"proposal volume … watch acceptance-weighted volume; counterbalances SM-1"*) appears in no AD, no capability-map row, and is not in NFR-STG6's metric list (queue depth/age, acceptance rates, apply latencies, auto-apply counts — none is acceptance-weighted volume). The one counter-metric with no landing.

### G6 — FR-STG11: "throttles repeat-rejected producers" (SO submitter gate) has no home. **(category b — minor)**
FR-STG11: Trust Tier *"gates auto-apply eligibility **and throttles repeat-rejected producers** (SO submitter gate)."* AD-7 uses the tier only to gate auto-apply eligibility; AD-11 quota caps are billing-entitlement caps, not trust-based intake throttling; AD-8 keys trust on the verified principal but does not throttle. The anti-abuse throttle on a producer whose proposals keep getting rejected is ungoverned.

---

## Notes (borderline — lands, flagged for awareness; not counted)

- **N1 — `partially-accepted` ChangeSet state:** PRD FR-STG2 enum includes `partially-accepted/accepted`; the spine state diagram (Structural Seed) shows only `accepted`. AD-2's rule (*"carry the PRD's exact state enums"*) governs it, so it lands via the rule — but the concrete diagram is inconsistent with AD-2 and should add the state.
- **N2 — FR-STG22 human-set groundability flag:** AD-7 captures the *auto-apply* review-state gate and references "the FR-STG22 flag," but the *human-set* "AI-groundable/editable, decoupled from human ACLs" flag respected by agent retrieval is only half-present (retrieval enforcement rides AD-6/knowledge). Lands weakly; worth an explicit line.
- **N3 — §10 GDPR delete cascade:** retention windows are in Deferred (30-day purge), but *"GDPR delete cascades through staging store AND audit references"* is unaddressed, and sits in tension with NFR-STG4 immutable audit / AD-14 append-only. Resolve at the deferred privacy review.
- **N4 — FR-STG1 p95 submit ≤500ms:** distinct from NFR-STG1's submit-to-triaged SLO; absorbable into the Deferred "numeric SLO values," but not explicitly listed there.

---

**Bottom line:** the spine is a faithful, well-structured contract for the bulk of the PRD. Six requirements did not land: one strong (G1, ratify/canonical gate — ungoverned apply status), one deliberate contradiction needing ratification (G2, reindex trigger), two moderate quiet-prose drops on the maintenance mandate (G3 budget separation, G4 human-page scope), and two minor no-homes (G5 SM-C2, G6 repeat-rejected throttle).
