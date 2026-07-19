# Reconciliation — PRD (HTExyRFHhs) vs ARCHITECTURE-SPINE (orvex-studio-workgraph)

**Date:** 2026-07-10
**Input (authoritative):** `prds/prd-studio-agent-memory-2026-07-09/prd.md` + `addendum.md`
**Spine (under review):** `architecture-orvex-studio-workgraph-2026-07-10/ARCHITECTURE-SPINE.md`
**PO rulings applied as overrides (deviations from these are ruled, not misses):** (1) rename → workgraph, `memory` reserved for user product, events `studio.workgraph.*`; (2) FormSpec split — no row migration, FR-MEM21 narrows to 3-state enum adoption, FR-MEM22 → tool-description repoints; (3) no pgvector — semantic via knowledge/Turbopuffer P9 adapter.

**Verdict: 10 gaps** (3 high / 4 medium / 3 low). Every FR-MEM1..27 and NFR-MEM1..7 has an AD + capability-map home; the misses are QUIET sub-requirements the AD structure compressed away, one bounded-scope decision, and one internally inconsistent application of Ruling 2. No unruled spine-vs-PRD contradiction on the load-bearing structure.

---

## Method

Enumerated every FR-MEM1..27, NFR-MEM1..7, §5 non-goal, §10 constraint, SM (incl. counter-metrics), and every addendum A1–A4 prose/ritual constraint; matched each to an AD, a Consistency Convention, a Capability-map row, a Deferred entry, or an Inherited Invariant. A requirement "lands" if a governing element exists — not merely if the FR id is name-checked. Grep sweep of the spine confirmed absence for each flagged item (envelope numbers, degradation, rate-limit, burst, store-by-reference, load-test, the three detector names, destructive-command/shadow/TodoWrite/note-template/resumability, consolidation trail, federation/cognify/mail/per-tier-retention: **zero hits** except where noted below).

---

## (a) Requirements with no home / partial home

### G1 [HIGH] — NFR-MEM2 scale + burst + noisy-neighbor + load-test gate mostly dropped
NFR-MEM2 carries five load-bearing clauses. Only **one** landed:
- ✅ Incremental blocked-flag recompute scoped to affected subgraph, never full rebuild → **AD-4** (verbatim intent).
- ❌ **100k items / 500k edges tenant envelope** — absent (no `100k`/`500k` anywhere).
- ❌ **Published, *measured* degradation curve (not asserted "flat")** — absent.
- ❌ **Per-tenant rate limits** as the noisy-neighbor control (cell-pinning landed via ADR-0011/NFR-MEM4; the rate-limit half did not).
- ❌ **Burst-safe workflow shape** — checkpointed, **event-count-capped** workflows, **store-by-reference for large payloads** (the Temporal-cliff lesson). This binds workgraph's own event/payload + `/internal/*` step-API design, not just the workflows service, so it cannot be waved off as "owned downstream."
- ❌ **Pre-GA load test** that validates-or-lowers the envelope. §6.2 lists it as a validation gate alongside the retrieval and adherence spikes; the spine's **Deferred** carries the retrieval spike (AD-3) and the adherence spike (AD-11) but **not** the load test.
**Home suggestion:** a scale/burst AD (or extend AD-4) + a Deferred "load-test gate" line mirroring the retrieval-spike entry.

### G2 [HIGH] — FR-MEM17 bounded anomaly set (exactly three detectors, rest deferred) dropped
FR-MEM17 pins the v1 anomaly scope to **exactly three** detectors — **stale claim** (lease expired without close), **re-open loop** (re-opened after rejection ≥2×), **orphaned blocker** (`blocks` edge → closed/missing item) — and explicitly **defers further anomaly classes**. Spine says only "console fleet view + anomalies → knowledge projections" (AD-7, map row 232). The **three detectors are unnamed** and the **deferral of the rest is absent** — a bounded-scope contract (each detector encodes real logic, e.g. orphaned-blocker = edge-to-closed/missing) that an epic can silently over- or under-build. **Home:** name the three in AD-7; add "further anomaly classes" to Deferred.

### G3 [MEDIUM] — NFR-MEM5 consolidation-decision audit trail (consolidation half) dropped
NFR-MEM5 = "every mutation audited **+ consolidation/compaction decisions carry trails** + restore-from-history." Spine lands the mutation-audit (AD-7 events) and **compaction** restore (AD-5 "restorable from history"), but the **consolidation** side — FR-MEM11's "contradictions soft-delete (invalidate with trail), never silently overwrite" and NFR-MEM5's "consolidation decisions carry trails" — has no explicit home (grep: no `trail`/`audit`/`soft-delete` in the AD bodies; AD-6 "invalidate never overwrite" covers *edges*, not the consolidation ADD/UPDATE/DELETE journal). **Home:** one clause in AD-5 requiring a decision trail on every consolidation verdict.

## (b) QUIET requirements the AD structure dropped

### G4 [HIGH] — Anti-footgun: errors must never carry copy-pasteable destructive commands
Addendum A4 (beads ADR-0002, "the text was the bug" — an agent destroyed 247 issues by obeying error text). This is **inverted** by the spine's pervasive "loud errors / no-fallbacks" posture (Inherited row 42; AD-1 "loud migration errors"): loud is mandated, but the constraint that **loud ≠ weaponizable** is nowhere. Also un-landed from the same A4 anti-footgun list: **memory-key writes that look like reads become reads** (bd remember's guard), and **always-return-≥1-memory** (the elision-banner *half* landed in AD-13; the at-least-one guarantee did not). **Home:** a convention/AD clause on safe error text + the recall/remember guards.

### G5 [MEDIUM] — Prompt-pack content contract compressed to "versioned artifact"
AD-11 makes packs versioned/admin-approved and ships server-side reinforcement (good — FR-MEM18/19 structure landed). But the **load-bearing pack *content*** from A4 is dropped: the **shadow-tracking prohibition** ("do NOT use markdown files / TodoWrite for task tracking" — the behavioral core: agents must use the graph, not side-channels), the **note template** `COMPLETED / IN PROGRESS / NEXT / KEY DECISION / BLOCKER`, the **resumability test** ("would a fresh agent resume from this alone?"), and the **prime truncation-defense first line**. These are behavioral/structural contracts, not wording polish. **Home:** an AD-11 clause pinning the mandated ritual content + note-template shape as a versioned contract (verbatim text can live in the epic).

### G6 [LOW] — FR-MEM9 prime compact content-contract specifics not pinned
Compact-mode guarantees (own active claims; **close-protocol reminder**; pinned tenant memories capped; ready/handoffs as **counts + single top item with fetch hint**; **no semantic retrieval in compact**) are only partially inferable: "pinned-only prime-compact" (AD-2) + "semantic is full-mode" (AD-3) cover the no-retrieval and pinned parts; the **close-protocol reminder in prime** and the counts-plus-one-top-item shape are unpinned. Minor — arguably epic detail, but the close-reminder-in-prime is a named guarantee.

## (c) Inconsistent application of a PO ruling

### G7 [MEDIUM] — AD-1 self-contradicts on `studio_memory_get/save`
AD-1 sentence 2: the user product's "`studio_memory_*` tools … stay product-side, **untouched**." AD-1 sentence 4: "`studio_memory_get/save` tool descriptions **are re-pointed to `workgraph_*`**." Since get/save ⊂ `studio_memory_*`, a tool cannot be both untouched and repointed. The PRD (§9, FR-MEM14) is unambiguous that get/save are **hidden agent-state passthroughs** being superseded — distinct from the `/v1/memory` FormSpec user product. Ruling 2's rescope (repoint, not hard-cut) is correctly applied to the *action*; the **"untouched" framing wrongly sweeps get/save into the user product**. Needs PO disambiguation: which `studio_memory_*` tools stay vs. repoint. Flagging per the brief's "flag if the spine applies [rulings] inconsistently."

## (a/§5/§10) Non-goals & constraints not fenced

### G8 [MEDIUM] — Three §5 non-goals have no guardrail
Not fenced anywhere (no AD, no Forbidden-edge, no Deferred): **no LLM-extracted knowledge-graph pipeline over conversations** (Cognify/Cognee-style — the explicit "structured Work Items are the substrate, prose stays in notes" boundary); **no peer-to-peer federation/sync**; **agent-to-agent mail excluded** (FR-MEM26/§5 — "beads deleted `bd mail` on this exact boundary"). These are the "don't accidentally build" fences; a "these are not built" line in Deferred/Forbidden would land them. (The orchestration-engine and cross-tenant non-goals *did* land: P6/D-WF-1 + AD-5; AD-9.)

### G9 [LOW] — §10 retention windows per plan tier
AD-5 has tiered compaction + per-tenant *policy* is implied, but "**retention windows per plan tier**" (a billing-tier-coupled retention policy) is not stated. Minor; note it in AD-5 or defer to billing SoR mapping (already Deferred for quota).

### G10 [LOW] — beads MIT NOTICE-level attribution
§5/§10 + assumptions index require **NOTICE-level attribution** for embedded beads concepts. AD-6 captures what was *dropped* from the port (hash-ladder/synthetic-conflict), but the affirmative attribution obligation is absent. Legal/packaging detail; one convention line.

---

## Minor (recorded, not counted)
- **FR-MEM27** ChatGPT-native-memory bridge is **platform-blocked** (external constraint, not deferral) — not recorded anywhere; harmless but the "why no ChatGPT backend" rationale is lost. AD-10 lands the Claude memory-tool backend correctly.
- **SM-4** (missed-side-quest / `discovered-from` trend) is not bound in any AD; the edge lives in `graph` and adherence tracks `discovered-from` (AD-11), so the signal is derivable, but SM-4 itself is unhomed.
- **FR-MEM1** "notes **and comments**" — spine ERD models `NOTE` only; assume notes ⊇ comments (fine if intended).
- **FR-MEM12** tier-1 **and** tier-2 both in v1 (§6.1) — AD-5 says "tiered" generically; the two-tier v1 scope is implied, not explicit.

## What landed cleanly (spot-check, not exhaustive)
Rename + subdomain (AD-1/AD-7); zero-LLM hot path + degraded CAS (AD-2, NFR-MEM6); semantic-via-knowledge with dual-side authz (AD-3, Ruling 3); incremental recompute + gates/dispatch (AD-4); janitor scope invariant + reference-aware compaction + erasure-wins tombstone (AD-5, FR-MEM11/12/13); UUIDv7+short-id + bi-temporal edges + hash-ladder drop (AD-6); one authz chokepoint + 3-state enum base + org namespaces (AD-9, Ruling 2 design-transfer); adapters-translate-only with pinned protocol versions (AD-10); wiki-worthy-via-staging with cycle guard (AD-12); quota-verdict/dimension split + elision banners + counter-metrics (AD-13, SM-C1/C2); LLM-dependency no-train/EU/zero-retention clause (AD-5, NFR-MEM7).
