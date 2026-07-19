# AC Audit — PRD: Orvex Studio Extension — Cross-AI Delivery

**Reviewer:** ENG-2690 acceptance auditor (adversarial lens)
**Documents reviewed:** `prd.md` + `addendum.md` (both read in full); cross-checked against decision inputs `V6hlDjecfh` (viability verdict, fetched) and `IgOjzk034v` (build-vs-buy, per addendum).
**Date:** 2026-07-15
**Verdict:** PASS_WITH_FIXES

---

## AC1 — Adopt spike mechanism verbatim AND cite ruling slug `V6hlDjecfh` — **MET**

Evidence:
- **FR-PA1** (§5, F-B) adopts the per-assistant ruling verbatim as shipped behavior: **ChatGPT — inject (GO)**, **Gemini — inject (GO)**, **Claude — copy/paste (DEGRADE)**, **Grok — copy/paste (DEGRADE)**, each conditioned on the breakage canary. Explicit citation: "The ruling page `V6hlDjecfh` is the cited source of record." This matches the verdict page verbatim (confirmed against the live `V6hlDjecfh` executive-verdict table).
- **FR-PA2** adopts the mechanism ruling (OQ1): Chrome MV3 browser extension; bookmarklet + native-helper rejected as primary vehicle — matches the verdict's §8 recommendation and §D rejected-alternatives.
- The verdict's two **hard preconditions** are both carried, not assumed away: **counsel review** (FR-PA4 + §7 precondition 1) and the **live-DOM prototype** (§7 precondition 2 + addendum §B "Live-DOM prototype REQUIRED before trust").
- The verdict's **co-equal NO-GO dissent** for Claude/Grok is preserved honestly in FR-PA4 ("a co-equal analysis read them as NO-GO") and addendum §C — not laundered into false unanimity.
- The breakage canary as durability spine is adopted in full (F-E).

Citation density is high and correct throughout (§ header on F-B, FR-D1, D5, FR-PA1-4, tl;dr, §7). AC1 is cleanly satisfied.

## AC2 — Every FR-D id (D1..D7) present + owned; FR-D6 sync-out cross-referenced to knowledge — **MET (with a traceability gap, see F-1)**

Presence + ownership (§5, F-A "Delivery (folded F1, FR-D1..D7)"):
- **FR-D1** — present (inject into ChatGPT/Gemini without copy/paste). Owned.
- **FR-D2** — present (one-guided-step connect). Owned.
- **FR-D3** — present (all four beachhead assistants, honest per-assistant messaging). Owned.
- **FR-D4** — present (firewall + per-use consent, never silent). Owned.
- **FR-D5** — present (no scrape / ToS-clean / degrade to copy/paste). Owned.
- **FR-D6** — present, explicitly **knowledge-owned**, "the extension MUST NOT duplicate it. Cross-reference only." Cross-reference reinforced in §7 dependencies ("`orvex-studio-knowledge` … outbound sync FR-D6"), §3 out-of-scope, and §9. **The FR-D6→knowledge cross-reference is satisfied.**
- **FR-D7** — present (detect own breakage, fail loud), expanded concretely in F-E (FR-BC1..7). Owned.

**No FR-D id is unowned → no CRITICAL finding.** The AC2 core is met.

The one weakness: the sub-clause "every FR-D id maps to ≥1 story" is asserted only in aggregate — §7/§9 reference "build stories ENG-2711..2730 (already filed)" but the PRD contains no per-id FR-D→story map, so id-level story ownership is not demonstrable from this artifact alone (see F-1).

## AC3 — All four must-resolves surfaced explicitly, none silent — **MET**

Evidence: §8 "AC3 must-resolves (surfaced explicitly, never silent)":
- **Repo home** — surfaced, RESOLVED: `orvexai/orvex-studio-extension`.
- **Wiki space** — surfaced, RESOLVED: `orvexstudioextension`.
- **Linear project home** — surfaced, RESOLVED: "Orvex Studio Extension" (initiative member #18).
- **Store-distribution posture** — surfaced, **OPEN (PO/architecture)** with an explicit owner and named risk (MV3 multi-host review latency vs. canary-fix budget).

All four are present under an AC3-labelled heading; none is silent. A resolved-with-provenance status (po-decision 2026-07-14) still satisfies "surfaced not silent." A fifth item (open-source posture) is added as extra — acceptable. AC3 satisfied.

## AC4 — Firewall + per-use consent as contract-level obligations, no silent injection — **MET**

Evidence:
- **FR-D4** (F-A): "MUST honor the personal↔employer firewall and per-use consent for private memories — never silent injection."
- **FR-CF1** (F-D): "MUST show the memories it will include and obtain per-use consent … never silent injection."
- **FR-CF2**: firewall enforced at delivery; "A firewall breach is a hard failure, not a warning."
- **NFR-2**: automatic runtime recall default-off; delivery is user-initiated.
- **Contract-level binding:** §7 lists `orvex-studio-contracts` carrying "the delivery/compose port + **consent-gate** + breakage-heartbeat contract, git-TAGGED"; §9 states "the component's FRs are the build contract." Firewall/consent are thus contract obligations, not silent injection. "Never silent injection" is stated 4× across FR-D4/FR-CF1/FR-D1-narrative.

AC4 satisfied. One strengthening note (F-3): the *consent-gate* is a named port in the git-tagged contract, but the *firewall* is bound via delegation to `orvex-studio-identity` and via FR-CF2 rather than a named firewall port in the extension's tagged contract — worth making explicit so "contract-level" is unambiguous for the firewall too.

---

## Findings

### F-1 (MEDIUM) — FR-D→story traceability asserted only in aggregate
**Location:** §5 F-A / §7 (sequencing) / §9.
**Issue:** AC2's letter includes "every FR-D id maps to ≥1 story." The PRD names the build stories as a block (`ENG-2711..2730, already filed`) but provides no per-id map, so which story owns FR-D1 vs FR-D6 vs FR-D7 is not verifiable from the pack home. Not a CRITICAL (nothing is *unowned* — every FR-D is present and has an authoritative FR home), but the story-mapping half of AC2 is not demonstrable here.
**Fix:** Add a short FR-D→story traceability table (or one line per FR-D) in §5 F-A or §7 mapping each of FR-D1..D7 to its owning ENG-271x story id, with FR-D6 pointing at the knowledge-owned sync story rather than an extension story. If the map already lives in the ENG-2690 Definition Pack, cite that pack section from the PRD.

### F-2 (LOW) — Internal count inconsistency: "17th component" vs "member #18"
**Location:** tl;dr ("family's 17th component") vs §8 ("initiative member #18").
**Issue:** The two numbers read as contradictory at a glance; they in fact count different sets (component number vs Linear-initiative project ordinal, which includes non-component members such as staging/workgraph). Left unexplained it invites a "which is it?" challenge.
**Fix:** Add a half-clause disambiguating them, e.g. "#18 in the initiative (17th *component*; the initiative also carries non-component projects)."

### F-3 (LOW) — Firewall contract binding less explicit than consent-gate
**Location:** §7 dependencies (`orvex-studio-contracts` line) + FR-CF2.
**Issue:** AC4 is met, but the git-tagged contract names a "consent-gate" port while the personal↔employer firewall is carried via FR-CF2 + delegation to `orvex-studio-identity`. The firewall's contract-level status is therefore inferential rather than a named port, a small gap an adversarial AC4 reader could probe.
**Fix:** Name the firewall obligation in the tagged contract line (e.g. "delivery/compose port + consent-gate + **firewall-scope gate** + breakage-heartbeat"), or state explicitly that FR-CF2 is enforced by the identity firewall contract, so "contract-level" covers firewall as unambiguously as consent.

### F-4 (LOW) — FR-D6 superior-DEGRADE assumption is load-bearing but only flagged
**Location:** FR-D6 `[ASSUMPTION]` + OQ-E1.
**Issue:** The possibility that Claude's native memory-import path supersedes copy/paste as Claude's delivered route materially affects Claude's shipped behavior yet sits under an unresolved assumption/OQ. Correctly surfaced (not a defect), but it straddles the extension/knowledge boundary and should not be lost.
**Fix:** Ensure OQ-E1 has a named owner and a resolve-by gate (before Claude DEGRADE UI build) in the Definition Pack, so the cross-component decision doesn't fall between the extension and knowledge homes.

---

## Summary

All four ENG-2690 ACs are substantively met. AC1 (verbatim mechanism adoption + slug citation), AC3 (four must-resolves surfaced), and AC4 (firewall + per-use consent as contract obligations, no silent injection) are cleanly satisfied. AC2 is met on its critical dimension — all of FR-D1..D7 are present and owned, none unowned, and FR-D6 is correctly cross-referenced to knowledge — but the "maps to ≥1 story" sub-clause is asserted only in aggregate (F-1, medium). Remaining findings are low-severity polish. **PASS_WITH_FIXES**: land the FR-D→story traceability line (F-1) and the doc is clean.
