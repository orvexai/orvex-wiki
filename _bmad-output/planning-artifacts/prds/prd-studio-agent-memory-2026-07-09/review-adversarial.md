---
title: "Adversarial Review — PRD: Cross-Agent Memory Service"
status: review
created: 2026-07-10
reviewer: SE-Architect adversarial lens (reviewer ≠ author)
target: prd.md (+ addendum.md), rev 2026-07-10
posture: cynical — the document is assumed wrong until the evidence proves it right
---

# Adversarial Review — Cross-Agent Memory Service PRD

**Verdict:** REVISE — the vision is coherent and the family-constraint hygiene is real, but the PRD rests its entire value proposition on an unvalidated behavioral assumption (prompt-pack adherence on hookless chat platforms), hard-codes a vendor-self-reported latency number the source research explicitly forbids citing as ground truth, treats a **built, deployed, data-bearing** memory store as a paper spec to "supersede" with no migration requirement, and ships a primary success metric (SM-1) that is structurally unmeasurable from inside the service. None of these are fatal to the concept; all are fatal to the PRD as an implementable contract until fixed.

**Counts:** 3 critical · 6 high · 6 medium · 3 low (18 findings).

---

## What survived scrutiny (stated so the critique is credible)

- **Postgres-only (D-S12)** is honored end-to-end: Dolt is dropped with a full rationale (addendum A1), pgvector is the store, six-tier Go service shape is named (§9). No Mongo, no versioned-SQL engine.
- The PRD **correctly reflects the code-reality correction** that the built memory store is in `orvex-studio-api`, not `orvex-studio-ai` (§9: "`ai_memories` planned-only; folds in") — matching the librarian-portal-scale-audit §1.
- The **4-edge subset** (of beads' 19) is defended by the research, not arbitrary (`beads-audit.md` §8 / §3.5).
- **NFR-MEM6 honest-empty degradation** is loud-not-silent, consistent with the no-fallbacks rule (not a fallback in the prohibited sense — though see H-6 for its coordination side-effect).

Everything below is where the document does not hold.

---

## CRITICAL

### C-1 — The whole value prop rides an invented adherence target on platforms the PRD itself says have no enforcement [attack #4]
**Cite:** §8 SM-3 (≥80% prime, ≥70% close after 4 weeks tuning); §4.5 FR-MEM18; addendum A4; `beads-audit.md` §8 "Top risks #2".
**Attack:** SM-3's 80%/70% numbers have **zero evidence base**. Beads' proven adherence comes from deterministic SessionStart/PreCompact **hooks**; the PRD explicitly removes hooks (A4: "ChatGPT portals and Claude projects offer none of this") and substitutes prompts, MCP `instructions`, and tool descriptions — a strictly weaker, non-deterministic injection path with no published adherence data anywhere in the 18-platform sweep. Every primary KPI is downstream of this one behavior: if prime isn't called, SM-1 (token reduction) is null; if claim-before-work isn't followed, SM-2 (double-claims) degrades; if close isn't run, the store never goes lean (SM-5) and token economy inverts. The PRD defines no product behavior for the likely case where adherence lands at 30%.
**Fix:** Demote 80/70 from success metrics to **hypotheses under test**; add a pre-GA spike measuring real prime/close rates on ChatGPT-portal + Claude with the actual pack, and gate the launch on it. Define a fallback product posture if adherence is structurally low (e.g., server-side prime auto-injection via MCP `instructions` on every connect; a "close nudge" the service can force through tool-description gating) so the value prop does not depend on voluntary model compliance. State the floor adherence below which the product is not viable.

### C-2 — "Supersedes" a built, deployed, data-bearing store with no migration FR and a silent per-item privacy regression [attack #5]
**Cite:** §0, §9 ("built `/v1/memory` route and tenant-partitioned `memory` table … migrates to the platform service"); §4.4 FR-MEM14 ("Supersedes the hidden `studio_memory_get/save` passthroughs (hard cut)"); §6.2 + addendum A2 ("no per-item ACLs in v1"); librarian-portal-scale-audit §1 + Appendix.
**Attack:** The audit shows the superseded thing is **real running code**, not a FormSpec: working `POST/GET /v1/memory`, a `PostgresMemoryRepository` with a `memory` table DDL (`src/store/postgres/repository.ts:111-120`), tenant-partitioned index, and live MCP tools `studio_memory_get/save` wired to it. Three concrete hazards the PRD does not address: **(a) No migration requirement** — "migrates to the platform service" is asserted in prose with no FR, no backfill/cutover/dual-write plan, no column mapping; this violates the house **no-fallbacks rule** ("migrations = required new path + loud migration error"), which the PRD invokes elsewhere (FR-MEM13) but not here. **(b) Capability regression** — the built store enforces a **3-state Open/Private/Shared-private** per-item privacy model (audit §1); the PRD's v1 is "namespace-prefix isolation only, no per-item ACLs," so every existing `Shared-private` memory either loses its grant or has nowhere to land. **(c) Client breakage** — hard-cutting `studio_memory_get/save` breaks any portal/agent prompt calling them; an MCP tool that simply disappears yields tool-not-found, which is not the "loud migration error" the rule demands. Interim risk: if the new service reads studio-api's `memory` table during transition, that is a cross-service DB read (build failure per project-context "services NEVER share a database").
**Fix:** Add explicit FRs: a data-migration FR (copy `memory` rows into the new service's store, mapping the 3-state privacy onto a defined v1 target — either preserve Shared-private as a first ACL primitive or document the downgrade and get PO sign-off), a deprecation-window FR for the MCP tools (alias + loud deprecation notice, not silent removal), and an ADR for the cutover. Confirm no shared-DB interim. Reframe §0/§9 language from "FormSpec Memory (spec)" to "built store (runtime migration)."

### C-3 — SM-1, the primary metric, is unmeasurable from inside a hookless service [attack #6]
**Cite:** §8 SM-1 ("median tokens spent reconstructing context … drops ≥ 40% … vs. baseline"); §7 NFR-MEM3.
**Attack:** "Tokens spent reconstructing context" without the service is host-side work — the agent re-reading transcripts / re-deriving inside ChatGPT or Claude. The memory service has **no hooks and no visibility into host token accounting** (the PRD's own premise, A4), so it can measure the tokens *its own* `prime`/`recall` returns but **cannot measure the baseline it is compared against**. A 40% reduction against an unobservable denominator cannot be computed as written. The metric also silently double-counts: SM-1 is "prime+recall enabled," so recall's extra round-trips add tokens that the compact-prime budget (NFR-MEM3) was trying to save.
**Fix:** Either (a) redefine SM-1 to a quantity the service can observe (e.g., tokens returned by prime+recall per session vs. a measured control cohort running a no-memory instrumented harness in a lab, not in production), or (b) specify the host-side instrumentation contract that yields baseline tokens (and concede it only exists on platforms that expose it — likely none of the chat portals). Make explicit that the production number is a lab/A-B result, not a live telemetry KPI, and net recall tokens against the prime saving in the definition.

---

## HIGH

### H-1 — 300ms p95 is Zep's vendor-reported number, on a different substrate, that the research forbids citing as ground truth [attack #2]
**Cite:** §7 NFR-MEM1 / NFR-MEM3; §4.2 FR-MEM9/10 ("Zep's ~300ms lesson"); `memory-prior-art-synthesis.md` lines 14, 43, and **line 144** ("benchmark and adoption numbers … are vendor-self-reported … **do not cite as ground truth in the PRD without that caveat**").
**Attack:** The PRD lifts Zep's "~300ms P95" and reapplies it as a **hard SLO** for create/claim/ready/recall/prime. But that number is (a) **vendor self-reported and flagged unverified** by the PRD's own source, (b) measured on Zep's **Neo4j/graph** stack, not Postgres+pgvector, and (c) a retrieval-only figure, now stretched to cover writes, claims, and prime assembly. Adopting an un-caveated competitor marketing number as an engineering ceiling is exactly what the research told the author not to do.
**Fix:** Replace the borrowed constant with a **budget derived from a spike** on the actual stack (pgvector HNSW + tsvector + recursive-CTE adjacency fusion at the target envelope), expressed as separate budgets per op class (write vs. hybrid-recall vs. prime). Until that spike exists, mark NFR-MEM1 as provisional and cite it as "target to validate," not a committed SLO.

### H-2 — 100k items / 500k edges "flat latency" sits exactly where beads flags un-built optimization, asserted multi-tenant with no evidence [attack #2]
**Cite:** §7 NFR-MEM2 ("100k items + 500k edges per tenant with flat query latency `[ASSUMPTION]`"); `beads-audit.md` §3.6, §7.3 (envelope "10K-100K per workspace"; blocked-cache 752ms→29ms at 10K; "future optimizations if >100K").
**Attack:** The envelope is 10× the top of beads' comfortable single-workspace range and beads itself names >100K as needing optimization it hasn't built — yet the PRD calls latency **"flat"** and makes it a per-tenant, multi-tenant guarantee. 500k edges / 100k items = 5 edges/item feeding a recursive-CTE blocked-cache that beads rebuilds transactionally on every dependency/status change; under 100-item batch writes (NFR-MEM2 itself) that recompute cost is real, and "flat" p95 on shared Postgres ignores noisy-neighbor CPU/IO contention (tenant partitioning isolates data, not compute). It is an NFR built on an admitted `[ASSUMPTION]` that its own source contradicts.
**Fix:** Ground the envelope with a load test (or lower it to a validated number), specify the blocked-cache rebuild strategy and its cost under batch load, and state the tenant compute-isolation mechanism (cell pinning ≠ per-tenant CPU quota). Replace "flat" with a measured degradation curve.

### H-3 — Immediate hard cascade-delete vs. restorable history / immutable audit trail — you cannot keep both for the same datum [attack #1]
**Cite:** §4.3 FR-MEM13 ("hard cascading delete … immediately — no TTL-floor soft-expiry"); FR-MEM11 ("soft-delete with trail"); FR-MEM12 ("originals restorable from history"); §7 NFR-MEM5 ("restore-from-history for compacted items … every mutation audited").
**Attack:** The PRD simultaneously promises an immutable audit trail plus restorable pre-compaction originals **and** immediate GDPR hard-erasure that cascades to "summaries, embeddings, consolidation traces." These are the classic audit-vs-erasure conflict: a right-to-erasure purge must destroy the very history/trail that NFR-MEM5 and FR-MEM12 promise to retain. The PRD asserts both without a reconciliation rule for the overlapping data.
**Fix:** Define the precedence explicitly — erasure wins and purges history/embeddings/traces for the erased principal, with the audit trail reduced to a tombstone (event that a deletion occurred, no content). State retention-vs-erasure as a policy matrix so the two subsystems don't each assume they own the datum.

### H-4 — Async LLM consolidation with DELETE/UPDATE authority over ungated coordination state contradicts the coordination-integrity guarantee [attack #1]
**Cite:** §4.1 ("Direct writes, no gate"); §4.3 FR-MEM11 ("post-write: top-k similar → ADD/UPDATE/DELETE/NOOP via orvex-studio-ai"); §8 SM-2 (<1% double-claims, ≥95% crash recovery); addendum A2 ("memory hygiene owned by consolidation").
**Attack:** FR-MEM11 gives an **LLM** ADD/UPDATE/DELETE authority over the store on a top-k-similarity trigger, and its scope is undefined — nothing restricts it to Remembered-Facts. If it runs over **Work Items**, an LLM deciding two items are "duplicates" can invalidate an item that is actively claimed or is a live handoff target, silently mutating coordination state that agents are transacting against — directly undermining SM-2. "Soft-delete with trail" does not help an agent whose ready-work item vanished between `ready` and `claim`.
**Fix:** Scope consolidation **explicitly to Remembered-Facts (FR-MEM8) and closed items only**; forbid consolidation from touching open/in-progress/claimed items or handoff targets. State this as a hard invariant in FR-MEM11, not an addendum aside.

### H-5 — Compact prime's ≤300-token budget cannot hold its promised contents for a busy fleet without truncation the PRD forbids [attack #1]
**Cite:** §4.2 FR-MEM9 (prime assembles claims + ready + handoffs + pinned + relevant memories + close reminder); §7 NFR-MEM3 (≤300 tokens p95); §8 SM-C2 (prime-size creep is a regression); FR-MEM8 ("hosts truncate silently, we never do").
**Attack:** UJ-3's own fleet has 7 in-progress, 12 ready, 3 blocked, plus handoffs and pinned memories. Serializing active claims + top ready + pending handoffs + pinned/relevant memories + a close-protocol reminder into ≤300 tokens (~225 words) — and keeping it there as tenants grow (SM-C2) — is only possible by dropping content, but FR-MEM8 forbids silent truncation and mandates an elision banner. So compact prime either blows NFR-MEM3/SM-C2 or degrades into a banner-plus-stub that undercuts the "start knowing what the fleet knows" promise. Beads split compact (~50-200) from full (~1-2k) precisely because compact can't carry it all.
**Fix:** Specify what compact prime **guarantees** vs. **elides** (e.g., own claims + close reminder always; ready/handoffs as counts-with-fetch-hint), and make the ≤300 budget a property of that reduced contract, not the full one. Reconcile with the elision banner rule.

### H-6 — Degraded honest-empty prime + ungated claim = double-claim exactly when lease visibility is down [attack #1/#3]
**Cite:** §7 NFR-MEM6 + UJ-1 edge case ("prime returns honest empty-with-status; Nova proceeds statelessly"); §4.1 ungated writes; §8 SM-2.
**Attack:** During a partial outage prime returns empty, so an agent cannot see existing claims/leases — then proceeds and (per ungated writes) may `claim`/create work already owned by another agent. The degradation mode manufactures the double-claim that SM-2 promises to keep under 1%, and it does so precisely when the reaper/lease machinery is impaired.
**Fix:** Specify that `claim` remains atomic (CAS) even when `prime` is degraded, so a stale-blind claim still fails server-side on conflict; and state that "proceed statelessly" means *read-only* proceed, not *coordination-write* proceed, during degradation.

---

## MEDIUM

### M-1 — SM-3's denominator ("% of sessions that begin with prime") is unobservable on hookless platforms [attack #4/#6]
**Cite:** §8 SM-3; §4.5 FR-MEM19.
**Attack:** With no SessionStart signal, the service cannot count "sessions"; it can only count sessions that called *some* memory tool. A session that never touches memory is invisible, so the measured base excludes exactly the non-adherent sessions SM-3 is meant to catch — a selection bias that flatters the number.
**Fix:** Redefine the denominator to an observable proxy and name it (e.g., "of sessions with ≥1 memory tool call, % whose first call is prime"), and acknowledge it undercounts total non-adherence.

### M-2 — SM-4's denominator is circular [attack #6]
**Cite:** §8 SM-4 ("≥50% of side-quest items carry `discovered-from`").
**Attack:** A side-quest filed **without** the `discovered-from` edge is indistinguishable from a normal item, so the population of "all side-quests" is only knowable via the edge you're measuring adherence to. The metric can report coverage among tagged items but cannot establish the true denominator.
**Fix:** Measure a proxy (e.g., items created by an agent while holding an active claim, within the claim's lifetime, that lack `discovered-from`) as the "missed side-quest" signal.

### M-3 — Compaction/deletion drops beads' reference-aware protection, breaking resumability [attack #7]
**Cite:** §4.3 FR-MEM12/13; `beads-audit.md` §2.7 (`bd prune` "skips closed beads whose ID is cited in any open bead's text"); addendum A4 (resumability test; note template).
**Attack:** The whole ritual system leans on notes citing item IDs ("would a fresh agent resume from this?"). Compaction summarizes / hard-delete erases closed items past a window, but nothing preserves beads' rule that a closed item still **referenced by an open item** is protected. Summarizing or erasing a closed item cited in an open handoff's next-steps silently guts the context an active work-item depends on.
**Fix:** Add a reference-aware guard to FR-MEM12/13: an item referenced by any non-closed item's notes/edges is compaction/deletion-protected (or its summary must retain the cited ID's resolution). Exempt GDPR erasure, which must win regardless (see H-3).

### M-4 — Content-derived / adaptive-hash-ID collision math is a decentralized-merge mechanism ported into a centralized store [attack #7]
**Cite:** §4.1 FR-MEM1 ("adaptive short IDs 4→8 chars by collision probability"); addendum A1 ("adaptive hash-ID collision math … deterministic content-derived IDs for convergent rows"); §11 Open Q5; `beads-audit.md` §2.5-2.6.
**Attack:** Content-derived IDs + birthday-paradox collision ladders exist in beads so **offline distributed clones** create convergent rows collision-free with no coordinator. A hosted single-writer Postgres has a central authority and UUIDv7 PKs — there is no convergent-row problem to solve, so the 30-attempt resolution ladder and content-hash IDs are machinery for a scenario that cannot occur. Open Q5 shows the author already doubts whether these even surface to users.
**Fix:** If human-typeable short IDs are wanted, generate them server-side (per-tenant sequence + short encoding + unique index) — trivially collision-free without the hash/ladder. Drop content-derived IDs unless a concrete offline-convergence requirement is stated.

### M-5 — Compliance posture is asserted at the service edge but the PII-egress control lives in a dependency and is unspecified [attack #3/#5]
**Cite:** §7 NFR-MEM7 ("no training on customer memory … EU residency"); §4.3 FR-MEM11/12 (consolidation/compaction "via orvex-studio-ai"); §10 ("memories may embed end-user content").
**Attack:** Ungated writes admit end-user PII, and the async consolidation/compaction path ships that content to `orvex-studio-ai` → an LLM provider (LiteLLM/Anthropic). The "no training / EU residency" guarantee therefore actually binds a **downstream dependency and its model provider**, not this service — yet the PRD states it as a property of the memory service with no contract on the consolidation call's residency/no-train/no-retention.
**Fix:** Add an NFR/dependency clause that the consolidation & compaction LLM calls MUST run under a no-train, EU-resident, no-retention contract, and cite where that is enforced (orvex-studio-ai's provider config). Otherwise NFR-MEM7 is unbacked.

### M-6 — Compact-prime retrieval semantics are ambiguous, hiding a budget collision [attack #2]
**Cite:** §4.2 FR-MEM9 ("pinned + relevant memories") vs. FR-MEM10 (hybrid retrieval, its own ≤300ms hot-path op).
**Attack:** If compact prime includes "relevant" (i.e., retrieved) memories, it contains a full hybrid-recall sub-call and therefore cannot be ≤300ms while recall itself is separately budgeted at ≤300ms. If compact prime uses pinned-only, the PRD should say so. The word "relevant" quietly straddles both.
**Fix:** State plainly: compact prime = pinned memories only (no semantic retrieval); "relevant"/retrieved memories are full-mode. Then the compact budget is index-scan-bound and defensible.

---

## LOW

### L-1 — Dolt row-lock / cell-conflict "schema design" carried into Postgres solves a non-problem [attack #7]
**Cite:** §10 ("cell-conflict … ideas survive as schema design only"); addendum A1; `beads-audit.md` §2.5 (migration 0054 `row_lock`), which itself notes "In Postgres this problem does not exist (real row locks)."
**Attack:** The `row_lock` synthetic-conflict column exists only to defeat Dolt's cell-level merge; Postgres `SELECT … FOR UPDATE` already prevents the lost-update it guards. Carrying the pattern into the Postgres schema is cargo-culted local-first residue.
**Fix:** Drop it; use row locks / optimistic version columns. Keep only the *lesson* (mutable coordination state needs real serialization), not the mechanism.

### L-2 — §0 frames a built store as "FormSpec Memory" (a spec), understating runtime risk [attack #5]
**Cite:** §0 ("supersedes the product-scoped Memory specs … orvex-studio-api FR-SA5–11 FormSpec Memory").
**Attack:** Calling the target a "FormSpec" (planning artifact) in the purpose section conflicts with §9's own admission that it is a built route + table, and it primes readers to under-weight the migration hazard of C-2.
**Fix:** Align §0 wording with §9: "supersedes … including the **built** `/v1/memory` store (runtime migration required)."

### L-3 — SM-2 "crashed-agent claims auto-recovered" conflates crash with lease expiry [attack #6]
**Cite:** §8 SM-2 ("≥95% of crashed-agent claims auto-recovered by the reaper within grace").
**Attack:** The service observes **expired leases**, not crashes; a slow-but-alive agent whose heartbeat lapsed is reclaimed identically to a crash. "Crashed-agent claims" is not an observable category, so the 95% can't be attributed to crashes as written.
**Fix:** Restate as "≥95% of expired-lease items returned to ready within grace," and treat crash-vs-slow as an unobservable the metric doesn't distinguish.

---

## Cross-cutting note for the PO

The three criticals cluster on one root cause: **the PRD writes aspirations as commitments** — an adherence rate as a metric (C-1), a competitor's marketing latency as an SLO (H-1), a code migration as a prose aside (C-2), and a lab result as a live KPI (C-3). The fix pattern is uniform: separate *validated commitments* from *hypotheses-under-test*, and attach each unvalidated number to the spike that will ground it before GA. The concept is sound and the family-constraint discipline is genuinely good; the document just over-commits ahead of its evidence.
