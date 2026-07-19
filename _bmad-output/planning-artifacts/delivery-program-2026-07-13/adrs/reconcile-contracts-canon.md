# Reconciliation — Architecture: orvex-studio-contracts, §T1 (Change-authority)

**Target page:** `orvexstudiocontracts` / `o2waDNw3ix` — "Architecture: orvex-studio-contracts" (CANONICAL — do not edit directly; apply at next doc-ratify pass)
**Linear:** ENG-2035 (canon reconciliation, drift not decisions)
**Prepared:** 2026-07-13

## Why

Section "Tightened revision — SE-Arch review (2026-07-05)" → **T1 — Change-authority reconciliation (ADR-0001 trigger, CS §9) — HIGH** frames the P3-vs-CS§9 contradiction as **explicitly unresolved**, pending a not-yet-filed "ADR-0001," and labels its own layered reading a "draft position, pending ADR-0001" / "OPEN DECISION #1." That ADR has since been filed and ratified as **ADR-0008** (Contracts change-authority — layered automated-merge + ADR-gated reshaping, `orvexstudioarch` space), adopting essentially the same layered synthesis T1 proposed as a candidate. This is drift, not a new decision: T1 needs to cite ADR-0008 as settled canon and drop the "OPEN DECISION #1" / "draft position" language.

## Exact replacement text for T1

Replace the current **T1** paragraph block (the two paragraphs following the `### T1 — Change-authority reconciliation (ADR-0001 trigger, CS §9) — HIGH` heading, through the OPEN DECISION #1 sentence) with:

---

### T1 — Change-authority reconciliation — settled by ADR-0008 (CS §9)

Three authoritative sources previously disagreed on whether a contracts change is human-gated. Canon `CxjFpIVUZY` Principle 3: *"Contracts governance is fully automated: agents author and evolve the contracts ... CI drift-gates plus the AGPL import-guard are the only police — there is no human ratify step."* CS §3.7 requires a design-it-twice note on **any change to orvex-studio-contracts**, and CS §9 makes **any orvex-studio-contracts change** (OpenAPI, CloudEvent catalog, golden fixture) a mandatory ADR trigger whose draft→canonical promotion is a **human-only doc-ratify** (CS §12). The repo PRD's `OQ-C1` raised the same question as "who reviews."

**Resolution — ratified as ADR-0008** (Contracts change-authority — layered automated-merge + ADR-gated reshaping, `orvexstudioarch`). The two regimes bind **different layers** and reconcile without either yielding — this is now canon, not a candidate reading:

| Layer | What governs | Human ratify? |
| --- | --- | --- |
| The contract **artifacts** (a schema/catalog/fixture edit merged in this repo) | Automated CI only — self-validation, drift-gate, AGPL import-guard (canon P3) | No — P3's "no human ratify step" applies here |
| The **design decision** behind a change meeting the CS §9 three-part test (costly-to-reverse seam contract, breaking change, or new cross-service contract) | An ADR on the wiki; draft→canonical is human-ratified (CS §9, §12) | Yes — CS §9 governs the decision, not the YAML merge |

So a routine **additive** edit (a new optional field, a new `x-status: draft` type, a purely additive event type or OpenAPI path, a non-breaking `additionalProperties`-preserving tightening) rides the automated path P3 describes — CI drift-gates + AGPL import-guard + schema-validation are the only police, no human ratify, additive fast-track merge. A **breaking or seam-reshaping** change — removing/renaming a field, changing a `required` set, altering the ADR-0007 envelope's required attributes, changing error-code/exit-code semantics, retiring or repurposing an endpoint, or any change forcing a coordinated multi-repo cutover — is a mandatory ADR trigger with human doc-ratify (CS §9/§12) before promotion, and design-it-twice (§3.7) applies. **The classifier is the drift-gate + semver policy (FR-C17):** a MAJOR-classified change is breaking → ADR lane; MINOR/PATCH is mechanical → automated lane; ambiguity resolves to the ADR lane (fail-safe toward review). ADR-0008 additionally requires the contracts repo owner/maintainer model (`OQ-C1`) to name the human ratifier for the ADR lane before the v0.1 freeze — that naming remains a residual follow-up, distinct from the change-authority split itself, which is settled.

---

## Notes for the ratifier

- Update the rollup table near the foot of the page (the "OPEN DECISION #1 / OD-2" row and the §9-ADR-triggers row referencing `ADR-0001`) to instead read "ADR-0008 (ratified) — change-authority" so the rollup and the T1 body stay consistent; both currently still say `ADR-0001`, which was never filed under that number — the family sequence landed it as ADR-0008.
- No new product judgment is exercised here: this reflects the already-ratified ADR-0008 text back into the page that first proposed (as a draft candidate) the same layered reading.
- This page's status is `canonical`; per instruction, prepare as a comment + this revision file rather than a direct edit (its build-state note ("Tightened revision") self-describes as design-review findings, not an as-built freeze, but it is not flagged draft-status, so the direct-amend fallback does not apply).
