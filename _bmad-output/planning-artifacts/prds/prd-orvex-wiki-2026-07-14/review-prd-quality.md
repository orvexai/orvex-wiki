---
title: "Adversarial PRD Quality Review — Orvex Memory Gap Closure"
reviewer: skeptical staff PM (adversarial)
target: prd.md (PRD: Orvex Memory — Gap Closure, draft 2026-07-14)
date: 2026-07-14
verdict: REVISE
---

# Adversarial review — PRD: Orvex Memory — Gap Closure

**Verdict: REVISE.** This is a well-structured umbrella PRD with real strengths — a clean 1:1 gap→feature spine (F1–F8), disciplined `[ASSUMPTION]`/OQ quarantining of most tech leaks, and visible awareness of the locked decisions. But it is not yet safe to hand to architecture. The entire success-metrics section is placeholder "target" values; the headline activation metric has no requirement that can produce it (cold-start is unaddressed); the flagship (F1 inject-into-ChatGPT) rests on an unowned ToS/breakage risk; the GDPR-erasure promise contradicts the delivery model; F7's MUST-level breadth contradicts the "team memory deliberately minimal in v1" lock; and a cluster of Tier-1 FRs are unfalsifiable as written. Fix the CRITICAL/HIGH items below before architecture consumes this.

Findings are tagged `[CRITICAL|HIGH|MED|LOW]`. Each has a concrete fix.

---

## Lens 1 — Completeness (missing required requirements/concerns)

### [CRITICAL] C1. Cold-start / first-run population of Memory is entirely absent — and it breaks the headline metric
The user is a *brand-new non-technical professional* (§4). On day 1 they have **zero memories**. Nothing in F1–F8 takes them from an empty store to a first useful memory: F2 proposes candidates *from an existing beads/chat stream that doesn't exist yet*, and F1 injects "relevant Memory" *that isn't there yet*. Yet the #1 success metric is "produce a memory-enriched output in week 1" — **not deliverable by any FR in the document.** This is the single biggest completeness hole for this audience.
- **Fix:** Add an **F0 First-run / seeding** feature: a guided memory-seed step (short interview / "tell me about your work" / import from an existing assistant), an explicit empty-state, and an acceptance test for "install → first memory-enriched output." Tie it to the activation metric.

### [HIGH] C2. Inbound import of a user's existing memories is referenced twice but never made a requirement
The Context section leans on the competitive dynamic ("labs offer one-way memory import — switcher-poaching"), and FR-X1 names proposals "from … imports." So import is load-bearing to the neutrality/switcher story — but **no FR governs importing a user's existing ChatGPT/Claude/Gemini memories into Orvex** (schema mapping, dedup on import, consent, conflict/merge). FR-L5 covers deletion of synced-*out* copies; there is no inbound counterpart.
- **Fix:** Add an FR for inbound memory import (source coverage, mapping to the frozen schema, dedup/reconcile on import per FR-X3/FR-L2, consent). This is also the most credible cold-start seed (see C1).

### [HIGH] C3. Extension breakage when a provider changes its web UI is unowned
F1 — the flagship — injects into third-party web UIs Orvex does not control. The counter-metric names the *symptom* ("support volume on connecting your AI") and OQ1 mentions "maintenance," but **no FR owns the failure mode**: silent DOM drift that lands the injection in the wrong place or corrupts the user's prompt, detection that injection has broken, and an update cadence. FR-D5 only covers a provider *blocking* injection, not a provider silently *changing* it.
- **Fix:** Add an FR: injection MUST self-detect breakage (canary/verify-after-inject), fail safe to copy/paste on detection (not corrupt the prompt), and surface connection health; define an acceptable time-to-repair after a provider UI change.

### [HIGH] C4. Memory-poisoning / prompt-injection attack surface is unaddressed
Memory is auto-extracted from beads/chat/imports (F2), and for teams (F7) and imports the content originates from sources the user doesn't fully control. A poisoned document, email, shared team memory, or imported memory can plant a false "fact" that is later **auto-injected into future prompts** — steering the AI with wrong medical/legal content for the exact beachhead (doctors/lawyers) where that is most dangerous. Human-confirm curation is a partial mitigation but is never stated as a *security control against poisoning*, and team-"official" auto-injection (FR-T1/T2) may bypass per-item human confirm.
- **Fix:** Add an FR under F6: memory ingestion (extraction, import, team-proposal) MUST treat source content as untrusted, isolate/label injected-from-untrusted-source content, and require human confirm before any auto-inject-eligible promotion — explicitly including team-official memory.

### [MED] C5. Observability/metrics wiring is asserted, not required
Success metrics and FR-X4 ("continuously measured," "regression gated") name metrics the product must produce, but **no FR wires memory delivery/proposal/retrieval events into observability** (the console-over-LGTM contract per canon). Metrics that gate ship must be made to exist.
- **Fix:** Add an FR: memory events (proposal accept/edit/discard, delivery attempt/degrade, retrieval hit/latency, staleness) MUST emit to the observability pipeline with defined event shapes.

### [MED] C6. i18n / language scope is unstated for an EU-regulated beachhead
The stack is EU-hosted (`docs.eu-central-1`), residency is load-bearing (F6/FR-S3), and the beachhead is EU-plausible professionals — yet nothing states the language scope. Extraction quality (FR-X1) and the eval sets (FR-E1, LongMemEval/LoCoMo are English) are implicitly English-only, which may not represent a French doctor or German lawyer.
- **Fix:** State v1 language scope explicitly; if non-English is in-beachhead, add extraction-quality + eval coverage for it, or scope it out on the record.

### [MED] C7. Empty/error states are only partially covered
FR-D5 (provider blocks → copy/paste) and NFR-4 (outage → no white-screen) exist, but the everyday empty/error states for a non-technical user are unspecified: no memories yet, no proposals pending, no assistant connected, a proposal that's wrong, retrieval returns nothing relevant.
- **Fix:** Add an FR (or fold into F0) specifying required empty/error states across the memory surfaces.

### [MED] C8. Compliance sub-requirements under-specified vs. the F6 claim
F6 claims HIPAA/SOC2/GDPR, but: NFR-6 scopes auditability "for teams" only — HIPAA requires **individual** memory/PHI access audit; there is no **consent-revocation / consent audit trail** (GDPR demonstrable consent + withdrawal), only per-use grant (FR-D4/FR-S5); and no **data-export/portability** FR (GDPR Art. 20) despite NFR-3's "portable" claim.
- **Fix:** Add FRs for individual-level access audit, consent revocation + audit trail, and user memory export.

### [LOW] C9. Free/paid line and accessibility (WCAG) unstated
Which of F1–F8 is free vs. paid is unspecified (only "outbound sync free forever" is locked; BYOK is "Teams/regulated"). Teachers/schools often require WCAG/508; NFR-5 is ease-of-use, not accessibility conformance.
- **Fix:** Either state the free/paid boundary and a WCAG target, or explicitly defer each to a named GTM/design doc.

---

## Lens 2 — Testability (FRs not verifiable as written)

### [CRITICAL] T1. The entire Success-metrics section is placeholder "target"
Every metric reads "≥ target" / "≤ target" / an unnamed "%": activation, delivery reach, accept-rate, confirm time, retrieval eval score. **A PRD whose success criteria are all placeholders cannot be judged succeeded or failed**, and it can't gate the fold-in PRDs.
- **Fix:** Commit a baseline + numeric target per metric, **or** for each, name the measurement method, the owner, and the date the number will be set. "target" is not a number.

### [HIGH] T2. FR-X1 — "measurable quality bar (precision/recall targets)" has no number, dataset, or labeling method
"Measurable" ≠ measured. There's no precision/recall target, no ground-truth definition for judging a *proposal* good, and no labeled set.
- **Fix:** State the target (e.g., proposal precision ≥ X on a labeled set of N), the labeling method, and who owns the ground truth.

### [HIGH] T3. FR-D2 — "one guided step" is undefined and has no acceptance test
"One step" is unfalsifiable (one screen? one click? zero config fields?), and there's no verification for a non-technical user completing it.
- **Fix:** Define "one guided step" concretely (≤ N clicks, zero free-text config) **and** attach an acceptance test: n ≥ 5 target-persona users, task-success ≥ X%, median time ≤ T, in a moderated usability test.

### [MED] T4. Systemic "measurable/measured" without thresholds — FR-X3, FR-X4, FR-C1, FR-E1, FR-E3
- FR-X3 "no near-duplicate spam" — "near-duplicate" (similarity threshold?) and "spam" undefined.
- FR-C1 "measurable token savings vs. naive full-context" — baseline is defined (good), target % is not.
- FR-E1 "recall@k, answer correctness — a number Orvex can stand behind" — no k, no threshold, "representative task sets" undefined.
- FR-X4 / FR-E3 "regression gated" — no regression threshold (how much drop fails the gate?).
- **Fix:** Attach a number + method to each; define the baseline and the fail threshold for every gate.

### [MED] T5. FR-S2 — "a path to SOC 2 Type II and HIPAA (BAA)" is an aspiration, not a requirement
"A path to" is unverifiable. A regulated buyer needs a deliverable and a date, not a direction.
- **Fix:** Specify the verifiable deliverable (controls implemented + audit engaged/scheduled) and target date; separate "controls in place" (buildable now) from "certification achieved" (later).

---

## Lens 3 — Scope discipline (implementation leaking into capability FRs)

The PRD is mostly disciplined — `[ASSUMPTION]` tags and OQs quarantine most leaks. Residual offenders:

- **[MED] S1. FR-S3 names a vendor — "aligns with the Turbopuffer BYOC-per-cell posture."** A specific storage tech in a capability FR. → Move the vendor/posture to architecture; the FR should say "self-host/BYOC for residency/air-gap."
- **[MED] S2. FR-S4 — "attribute-vs-namespace isolation grade."** How isolation is implemented in the store, inside the FR. The capability is "regulated tenants get the stronger isolation wall." → Keep the capability in the FR; move the attribute-vs-namespace mechanism to architecture (it already cites OQ2/R-9).
- **[MED] S3. FR-C3 — "precomputed / warm-cached."** An implementation technique as an FR; the capability is "hold latency and cost." Already `[ASSUMPTION]`-tagged. → Move mechanism to architecture; state the outcome (latency/cost bound) in the FR.
- **[LOW] S4. FR-D1/FR-D5 — "browser extension," "injects into the compose surface."** Mechanism-flavored, but FR-D1 self-tags `[ASSUMPTION]` and routes to OQ1; acceptable as-is, tighten if convenient.

Net: scope discipline is a relative strength; only S1–S3 need moving.

---

## Lens 4 — Traceability (gaps ↔ FRs)

- **Strength:** All 8 gaps map cleanly, 1:1, to features F1–F8. Gap→feature coverage is complete. No gap is orphaned.
- **[MED] Tr1. No explicit gap→FR→metric→service traceability matrix.** This is an *umbrella* PRD that will fold into 4 service PRDs; §9 gives a prose FR→service mapping but success metrics don't trace to owning FRs (which FR delivers "delivery reach %"? which delivers the eval score?). The fold-in step has to reconstruct this.
  - **Fix:** Add a matrix: gap → FR(s) → success/counter-metric → target service PRD.
- **[LOW] Tr2. Minor reverse-trace noise.** FR-D6 restates the locked *outbound-sync* decision (inherited canon, not a gap closure) and reads as an FR; FR-E4 ("keep wiki searchable") is a design hedge more than a stated gap. Both are defensible but sit slightly outside "close the 8 gaps."
  - **Fix:** Move FR-D6 to §9 (inherited canon) or mark it as context, not a new requirement.

---

## Lens 5 — Contradiction / risk (vs. locked decisions + internal)

### [HIGH] R1. GDPR-erasure (FR-L5 / NFR-2) contradicts the F1 delivery model
FR-L5 promises deletion of "every copy … to satisfy GDPR erasure." But F1 reaches ChatGPT by **injecting into the user's own session** (FR-D1) — there is no API to later delete content that has landed in the user's ChatGPT history/memory. "Where the vendor API allows" is an honest hedge, but it means the erasure/GDPR guarantee is **not actually deliverable** for the exact channel the flagship depends on — in the compliance-critical beachhead.
- **Fix:** Scope FR-L5/NFR-2 honestly: complete erasure within Orvex-controlled stores + vendor-API-deletable copies; explicitly state that content injected into a third-party session is outside Orvex's erasure boundary, and disclose that to users at inject-time.

### [HIGH] R2. F7's MUST breadth contradicts "team memory deliberately minimal in v1"
Locked: team memory is deliberately minimal in v1; FR-T4 itself calls the model "minimally team-aware (nullable owner/scope)." Yet FR-T1 (4-role RBAC), FR-T2 (moderation queue), FR-T3 (selectable governance models) are **MUST** — that is a substantial team feature, not minimal. OQ6 admits "F7 may phase," which leaves MUSTs dangling in contradiction with a locked decision and with FR-T4.
- **Fix:** Demote FR-T1–T3 to SHOULD / explicitly phased (per OQ6), keeping only the data-model hooks (nullable owner/scope, FR-T4) as v1 MUST — or renegotiate the "minimal" lock on the record.

### [HIGH] R3. F1 flagship viability rests on an unresolved ToS/legal question with no gate
FR-D5 asserts "MUST NOT … breach provider ToS," but automating input into ChatGPT via an extension may itself violate OpenAI's automated-access ToS — OQ1 only *mentions* "trust, ToS." If ToS/DOM/blocking forces the FR-D5 copy/paste degrade, **F1 collapses back to the status quo** (copy/paste) and delivers nothing beyond it — while F1 is billed as "the biggest hole."
- **Fix:** Gate F1 behind an explicit legal/ToS + technical viability spike *before* architecture commits; state the fallback value proposition if injection is disallowed (is copy/paste-with-composed-prompt still a win worth shipping?).

### [MED] R4. FR-D1 "deliver a composed prompt enriched with relevant Memory" reads default-on vs. locked "recall default-off"
NFR-2 correctly states recall default-off, and FR-D4 gates *private* memory on per-use consent — which implies **non-private** memory is injected by default. That is a plausible reading of "recall default-off" being violated for non-private memory. The interaction is unspecified.
- **Fix:** State explicitly what "default-off" covers — all recall, or only private-memory recall — and reconcile FR-D1's "MUST deliver enriched prompt" with it.

### [MED] R5. Firewall direction under F1×F7 is unspecified
The firewall is well-threaded personal→employer (FR-D4/S5/T4/M4), but the reverse — employer/team-official memory being injected into a user's **personal** ChatGPT session via F1 — is not addressed. That is a firewall crossing in the other direction.
- **Fix:** Specify that team/employer memory is not injected into personal sessions (or is gated) under F1 delivery.

### [MED] R6. FR-E4 quietly undercuts the F3 flagship
FR-E4 honors "the industry ablation that verbatim retrieval beats extracted-fact memory for long-context QA." Intellectually honest, but it half-concedes that the distilled "legible portrait" (F3 flagship) may retrieve *worse* than searching raw wiki — a strategic tension the PRD surfaces without resolving.
- **Fix:** State the intended division of labor (distilled Memory for legibility/injection-efficiency; verbatim wiki for retrieval recall) so F3 and FR-E4 aren't read as competing.

### [MED] R7. NFR-1 (~50 ms p95 warm path) vs. BYOK/BYOC (F6)
Customer-managed keys (envelope decrypt) and BYOC self-host (extra network hops) typically add latency; the ~50 ms warm-path target may not hold for exactly the regulated tenants F6 targets.
- **Fix:** State whether NFR-1 applies to BYOK/BYOC tenants or carries a separate (looser) target for them.

### [LOW] R8. FR-M1 "frozen" vs. FR-M3 "versioned/forward-compatible" reads as a mini-contradiction
"Frozen" (never changes) and "versioned/evolvable" only coexist if "frozen" means "frozen for v1."
- **Fix:** Reword FR-M1 to "frozen for v1, evolves only via the versioning in FR-M3."

### [MED] R9. "Outbound sync free forever" × compliance boundary
If outbound sync is free forever but BYOK/BAA is paid (Teams/regulated), a free user can outbound-sync PHI with no BAA/compliance envelope — an unresolved compliance interaction, not a flat contradiction.
- **Fix:** State the compliance floor that applies to free outbound sync, or restrict what sensitivity classes free sync may carry.

---

## What's genuinely strong (keep)
- Clean 1:1 gap→feature spine; complete gap coverage; no orphaned gap.
- Disciplined use of `[ASSUMPTION]` tags + OQs to quarantine tech decisions to architecture.
- Explicit awareness and threading of the locked decisions (firewall, recall default-off, outbound-sync-free, three-store model).
- Honest counter-metrics (edit/discard rate, latency regression, support volume, staleness) — rare and valuable.
- Async-off-write-path (FR-X5/NFR-1) protects the "instant feel" — the right instinct.

## Priority order for the revise pass
1. **T1** — put numbers (or method+owner+date) on every success metric.
2. **C1 + C2** — add first-run/seeding + inbound import; without them the activation metric is undeliverable.
3. **R1** — reconcile GDPR-erasure with the injection model (compliance-critical).
4. **R2** — resolve F7 MUST-vs-"minimal-v1" contradiction.
5. **R3 + C3** — gate F1 on a ToS/viability spike; add extension-breakage detection.
6. **C4** — add the memory-poisoning security control.
7. **T2/T3/T4** — make the Tier-1 quality/connect FRs testable.
