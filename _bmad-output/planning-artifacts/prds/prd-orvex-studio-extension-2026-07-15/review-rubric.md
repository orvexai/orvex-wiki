# Review — PRD Quality Rubric Walk

**Document:** PRD: Orvex Studio Extension — Cross-AI Delivery (`prd.md` + `addendum.md`)
**Reviewer:** Adversarial PRD-quality rubric walker
**Date:** 2026-07-15
**Verdict:** PASS_WITH_FIXES

---

## Scope of this review

Standard PRD-quality dimensions: FR atomicity / testability / altitude (capability vs implementation); success-metric measurability + counter-metrics; scope discipline; FR-ID stability & collision; document length for a launch-tier component; vague MUSTs; untestable acceptance; and `[ASSUMPTION]` tags that are actually phase-blockers. Cross-checked against ENG-2690 AC1–AC4 and the two adopted decision inputs (`V6hlDjecfh`, `IgOjzk034v`).

---

## What the doc gets right (verified, not rubber-stamped)

- **AC1 satisfied.** FR-PA1 adopts the verdict verbatim — ChatGPT GO / Gemini GO / Claude DEGRADE / Grok DEGRADE — and names `V6hlDjecfh` as the cited source of record. FR-PA2 carries the OQ1 MV3-extension resolution.
- **AC3 satisfied.** §8 surfaces all four must-resolves explicitly (repo / wiki / store-distribution / Linear), three RESOLVED and two OPEN with named owners — none silent.
- **AC4 satisfied.** F-D makes firewall + per-use consent contract-level (FR-CF1/CF2), "never silent injection" is repeated, firewall breach = hard failure, and §7 lists the consent-gate contract as git-TAGGED in `orvex-studio-contracts`.
- **Hard preconditions are NOT disguised as assumptions.** The two blockers (counsel review, live-DOM prototype) are stated as explicit build preconditions in §7 and FR-PA4 — correctly *outside* the `[ASSUMPTION]` machinery. This is the single most common failure mode and the doc avoids it.
- **Scope discipline is strong.** In/out explicit; out-of-scope forbids restating the memory model; §9 reinforces the fold-down boundary. No memory-model restatement leaks in.
- **Counter-metrics are genuinely thought-through** (support-volume regression, canary false-positives, install abandonment, injected-but-wrong), not decorative.
- **FR IDs are non-colliding** across all prefixes (FR-D / FR-PA / FR-CN / FR-CF / FR-BC / FR-TS / FR-BA / NFR).
- **Length is appropriate** — no padding; depth pushed correctly to the addendum.

---

## Findings (most severe first)

### F1 — MEDIUM — No FR-D → story traceability matrix (blocks AC2 verification)
**Location:** §5 F-A / §7 Sequencing / §9
ENG-2690 AC2 requires "every FR-D id maps to ≥1 story, no FR-D id unowned." The PRD folds FR-D1..D7 and states the ENG-2711..2730 stories are "already filed," but contains **no mapping table**. From this document alone a reviewer cannot confirm FR-D1..D7 are each owned by ≥1 story, nor that none is orphaned. (FR-D6 is correctly handled as knowledge-owned / cross-reference-only — that part of AC2 is met in prose.)
**Fix:** Add a short traceability table mapping FR-D1..D7 (and the extension-owned FRs) to their ENG-2711..2730 stories, explicitly annotating FR-D6 as "knowledge-owned — no extension story." This is the artifact AC2 is checked against.

### F2 — MEDIUM — Durability remediation SLA is unowned and unmetriced
**Location:** §2 metrics ("Breakage honesty") / §6 NFR-8 / FR-BC7 / FR-TS4 / §8
The flagship's entire premise is "fail-loud durability." But MV3 "no remote code" (FR-TS4) means every selector fix ships as a **store update** (FR-BC7), whose review latency is unbounded. The "Breakage honesty" metric measures *detection* (100% detected, 0 silent) but nothing bounds **detection → fix → ship** time. §8 admits "the review-latency budget for canary fixes need an owner" but leaves it OPEN with no NFR or metric. Detection at 100% while remediation latency is multi-day still means the delivery promise is broken for the whole user base during that window — the exact failure the flagship can't afford.
**Fix:** Add an NFR (and a metric) bounding canary-trip-to-remediation latency, with an owner and a target; or record a hotfix-channel decision (e.g., server-driven selector-manifest update within MV3 limits vs. store-review turnaround). Do not leave the remediation SLA purely as an §8 open item.

### F3 — MEDIUM — NFR-1 latency is untestable and under-scoped
**Location:** §6 NFR-1
"MUST feel instant on click" is subjective/untestable, and the only concrete number (~50 ms) is the **warm-retrieval** p95 inherited from knowledge. It does not budget the actual injection path the user perceives — pre-inject probe (FR-BC1) + write + post-inject read-back (FR-BC2) + render — which is where DOM work lives.
**Fix:** Replace "feel instant" with a perceived-latency budget for the end-to-end click→visible-in-composer action (e.g., a stated p95 threshold), and name the measurement. Keep the retrieval target as a component of it, not the whole.

### F4 — MEDIUM — FR-TS5 is a vague, non-atomic MUST bound to an unresolved decision
**Location:** §5 F-F, FR-TS5 (and its `[ASSUMPTION]`) / §8
"MUST address the extension-trust cost head-on" with "an open-source-able, inspectable build posture and a clear permissions/data story" is not atomic or testable — "address head-on" has no acceptance. It also carries an `[ASSUMPTION]` about open-sourcing that is *simultaneously* an OPEN PO decision in §8, so the FR asserts a MUST whose substance isn't decided yet.
**Fix:** Decompose into testable obligations that are actually shippable now (e.g., "publish per-permission justification in the store listing," "reproducible/inspectable build," "documented data-flow statement"), and move the open-source-licensing question entirely to §8 — an FR should not hinge on an undecided PO call.

### F5 — LOW — "17th component" vs "initiative member #18" reads contradictory
**Location:** tl;dr ("the family's 17th component") vs §8 ("initiative member #18")
On its face the two counts conflict; a reader can't tell whether the extension is the 17th or 18th of its set. (They can both be true if component-count ≠ initiative-member-count, but that is never stated.)
**Fix:** Reconcile with a one-line note distinguishing "17th *component*" from "18th *initiative member*," or correct whichever is wrong.

### F6 — LOW — Externally-defined IDs referenced without naming their source at point of use
**Location:** FR-CN1 (FR-O4), FR-CN4 (FR-O3), FR-CF3 (FR-L5), FR-CF4 (FR-S6), addendum (AD-5, AD-6)
These umbrella IDs are cited inline ("Folds FR-O4," "Inherits FR-S6") with no origin doc named at the reference, forcing the reader to guess they live in `g9vWbSYplh` / `iiCcKhGptV`. Weakens the fold-traceability the PRD otherwise does well.
**Fix:** Tag each external ID with its origin at first use, e.g., "FR-S6 (`g9vWbSYplh`)."

### F7 — LOW — The decided FORK ruling is encoded as SHOULD
**Location:** §5 F-G, FR-BA1 / FR-BA2 (SHOULD) vs FR-BA3 (MUST)
`IgOjzk034v` is presented as an *adopted decision input*, yet the fork/pattern-donate approach is written as SHOULD while the build-fresh pieces are MUST. If FORK is genuinely decided, SHOULD softens a ruling into a suggestion; if the latitude is deliberate (architecture may deviate with justification), that intent should be explicit.
**Fix:** Either state FR-BA1/BA2 as adopted (MUST, with an explicit "architecture may deviate with recorded justification" clause) or add a one-liner that SHOULD is deliberate build-approach latitude — don't leave the altitude ambiguous.

### F8 — LOW — No counter-metric for consent friction
**Location:** §2 Counter-metrics
Per-use consent is default-on and load-bearing (FR-CF1, NFR-2), yet the counter-metrics track install-permission abandonment but not **consent-prompt** abandonment/fatigue. A per-use gate that users learn to dismiss (or that suppresses activation) is the natural counter-force to the consent design and is unmeasured.
**Fix:** Add a consent-friction counter-metric (e.g., consent-prompt abandonment rate / activation drop at the consent step).

### F9 — LOW (editorial) — Implementation detail in FR bodies
**Location:** FR-BC2 (names ProseMirror/React); FR-TS2 (names api.supermemory.ai / api.mem0.ai)
Acceptable as illustration, but these are architecture-altitude details whose proper home is the addendum (which already covers them). Keeping FR bodies capability-level improves stability if the tech changes.
**Fix:** Optional — reduce to capability language in the FR ("the app's editor model," "any non-Orvex endpoint") and let the addendum carry the named specifics.

---

## Verdict rationale

**PASS_WITH_FIXES.** The PRD is well-disciplined for a launch-tier component: scope is tight, the adopted decisions are cited verbatim (AC1), must-resolves are surfaced (AC3), consent/firewall are contract-level (AC4), and the two hard preconditions are correctly kept out of the assumption machinery. No FAIL-level defect exists. The gating fixes before the pack dispatches are **F1** (the FR-D→story matrix that AC2 is literally checked against) and **F2** (a bounded remediation SLA for the durability spine the whole flagship rests on). **F3/F4** (untestable NFR-1, vague FR-TS5) should be tightened in the same pass. The remaining items are low-cost consistency and traceability cleanups.
