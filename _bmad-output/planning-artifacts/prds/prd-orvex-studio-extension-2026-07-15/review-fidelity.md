# Fidelity Review — PRD: Orvex Studio Extension (Cross-AI Delivery)

**Reviewer lens:** Source-fidelity checker (anti-overclaim).
**Scope:** Does `prd.md` + `addendum.md` faithfully represent its two adopted decision inputs — `V6hlDjecfh` (viability verdict) and `IgOjzk034v` (build-vs-buy)?
**Verdict:** **PASS_WITH_FIXES**

---

## Bottom line

On the load-bearing, build-driving representations the PRD is faithful — and in one place (the fork credit) it is exemplary. It does **not** present a DEGRADE as a GO, does **not** drop the counsel/live-DOM preconditions, does **not** overcredit the supermemory fork with a working feature, and does **not** invent the Anthropic tier-gating number (it explicitly refuses to cite one). No overclaim reverses a GO/DEGRADE ruling or removes a hard precondition, so this is not a FAIL.

The fidelity gaps are concentrated in the **§1 competitive-context prose**, which states several unverified competitive facts as established — most notably asserting Anthropic memory-import as a shipped fact when the very source it adopts (`V6hlDjecfh` §5) marks it "reported-not-primary-verified," and stating a precise "93% of enterprise ChatGPT" statistic with no citation. A secondary gap: the emphatic "contested / NO-GO-adjacent" framing that `V6hlDjecfh` demanded receive "equal billing, not a footnote" is carried only in FR-PA4 and addendum §C, and is smoothed to a clean "DEGRADE" in the tl;dr and FR-PA1.

---

## What is faithfully represented (verified against both inputs)

- **GO/DEGRADE tiers are correct and not inverted.** ChatGPT = GO, Gemini = GO, Claude = DEGRADE/copy-paste, Grok = DEGRADE/copy-paste appear consistently (tl;dr, FR-PA1, FR-D1, FR-D3, FR-D5, UJ-1/2/3). Matches `V6hlDjecfh` §1 exec table.
- **The "without copy/paste" withdrawal for Claude/Grok is stated, not buried.** FR-D1 scopes the phrase to "ChatGPT and Gemini"; FR-D5 says it is "explicitly withdrawn for those two"; UJ-2 says "honestly withdrawn for Claude." Matches `V6hlDjecfh` §10.
- **Both hard preconditions are carried prominently.** Counsel review (FR-PA4, §7.1, §8) is gated on *"any provider … for each injecting provider"* — i.e. it correctly blocks the GO providers too, matching the verdict's "route to counsel before architecture commits to injection on any GO/DEGRADE provider." Live-DOM prototype (tl;dr, §7.2, addendum §B) matches `V6hlDjecfh` §9 "Open gap" and §11.
- **GO is presented as conditional, not clean.** FR-PA1 conditions every tier "on the breakage canary"; §7 gates injection on live-DOM + counsel. Matches the verdict's "GO, conditional on the FR-D7 breakage canary proving reliable — neither canary has been validated against a live production DOM yet."
- **Fork credit is exemplary and matches `IgOjzk034v`.** FR-BA1 credits supermemory only for "WXT/MV3 scaffold and per-provider layout … not greenfield." FR-BA2 pattern-donates the composer-write + selectors from mem0 "including the input-event dispatch that supermemory's own writers omit." FR-BA3 lists the canary, review-pause, GO/DEGRADE split, degrade UI and memory wiring as "build-fresh — no OSS prior art exists; **the pack MUST NOT credit the fork with delivering these.**" Addendum §A calls supermemory's writers "broken-as-written." This is a faithful, non-overclaiming rendering of the build-vs-buy TL;DR.
- **The Anthropic tier-gating number is explicitly NOT invented.** §1 carries `[ASSUMPTION — … this PRD cites no specific tier number pending primary-source verification.]` — directly honoring the landscape's unverified flag.
- **Grok dual-ToS posture is faithful.** Addendum §C and OQ-E3 carry "x.com … stricter and controls — dual-ToS jeopardy; v1: grok.com only," matching `V6hlDjecfh` §7.
- **The NO-GO dissent is present (though under-billed — see F3).** FR-PA4 and addendum §C both state "a co-equal analysis read Claude + Grok as NO-GO … counsel review is a hard build precondition."

---

## Findings

### F1 — MEDIUM — §1 Context (competitive white-space, bullet 2) + internal inconsistency with OQ-E1 / FR-D6
The PRD asserts as flat fact: *"Anthropic shipped Claude memory-import (pulling from ChatGPT/Gemini/Grok) in early 2026."* But the source it adopts, `V6hlDjecfh` §5 (and §10, §14), explicitly marks Anthropic Memory Import as **"reported-not-primary-verified"** — existence corroborated only by secondary sources (MacRumors, Fast Company), *"not independently fetched/verified against Anthropic's own primary page text."* The PRD's own OQ-E1 and FR-D6 correctly hedge it ("`V6hlDjecfh` flags it as reported-but-not-primary-verified"), so §1 both overstates the adopted source **and** contradicts the PRD's own requirement-level text. This matters because the Claude degrade route (FR-D6, OQ-E1) leans on this claimed feature.
**Fix:** Soften §1 to match the source and the PRD's own OQ-E1: *"Anthropic reportedly shipped Claude memory-import … (reported-not-primary-verified per `V6hlDjecfh` §5)."*

### F2 — MEDIUM — §1 Context (competitive white-space, bullets 1 & 3)
Several precise competitive figures are stated as established fact with no citation and are not supported by either decision input:
- *"MemoryPlugin … sits at only ~3,800 users"* — `IgOjzk034v` §3 lists MemoryPlugin activity as **"unknown"** (closed-SaaS, no repo), so the specific count is unsupported by, and arguably contradicts, the cited build-vs-buy.
- *"Sider (~4–6M users), Monica (10M+), Merlin (5M+) at $8–20/mo"* — not in either input.
- *"OpenAI's 'Dreaming' (2026-06-04)"*, *"Google followed on 2026-03-27 with … 'Import Memory' + 'Import Chat History'"* — product names/dates not in either input.
- *"an estimated 93% of enterprise ChatGPT use runs through ungoverned personal accounts"* — a load-bearing statistic (it anchors the firewall's "genuinely unclaimed" claim) with **no source at all**.
- *"the EU AI Act's high-risk provisions land 2026-08-02"* — not in either input (contrast the Google ToS 2026-07-30 date, which *is* sourced to `V6hlDjecfh` §6 and is fine).

These are motivational context rather than build instructions, so they don't mislead a builder about *what to build* — hence MEDIUM, not HIGH — but for an anti-overclaim doc they are exactly the confident, uncited specifics that erode trust.
**Fix:** Attribute each to a citable primary/landscape source (`FC23qWA8n3` or the competitive canon), or tag `[ASSUMPTION]`/`[UNVERIFIED]`. The 93% figure in particular must get a source or be dropped/softened to a qualitative claim.

### F3 — MEDIUM/LOW — tl;dr and FR-PA1 (per-assistant ruling)
`V6hlDjecfh` is emphatic that the Claude/Grok DEGRADE is **"NO-GO/DEGRADE-contested, not a resolved DEGRADE,"** and that the co-equal NO-GO dissent must get *"equal billing, not a footnote,"* warning *"a PO reading only this summary should not walk away thinking 'no provider is NO-GO' is resolved."* The PRD carries that dissent only in FR-PA4 and addendum §C; the tl;dr and FR-PA1 render it as a clean, settled **"DEGRADE."** Because the shipped behavior (copy/paste + counsel gate) is identical under either reading, build risk is low — but the framing demotes the source's central caveat below the "equal billing" it demanded.
**Fix:** In FR-PA1 (and the tl;dr), annotate Claude/Grok as *"copy/paste (DEGRADE — contested; a co-equal pass ruled NO-GO for a persistent extension; counsel-gated per FR-PA4)."*

### F4 — LOW — tl;dr and F-B (ChatGPT GO)
`V6hlDjecfh` §4 records that ChatGPT's GO also drew a dissent — *"a separate, parallel mechanism-focused research pass … read this as DEGRADE rather than GO."* The PRD presents ChatGPT (and Gemini) as clean GO. The verdict did adopt GO as its ruling of record, and Gemini genuinely had "none" dissent, so this is defensible — but for full fidelity the ChatGPT-specific DEGRADE divergence (counsel-flagged) is dropped while FR-PA4 attributes the NO-GO dissent only to "two providers" (the DEGRADE pair).
**Fix:** One clause noting ChatGPT's GO carried a minority DEGRADE reading that counsel review (FR-PA4) also covers.

---

## Verdict rationale

The four charge-specific risks — presenting a DEGRADE as GO, dropping the counsel/live-DOM caveats, burying the "without copy/paste" withdrawal, overcrediting the fork, and inventing the Anthropic tier number — are all **cleared**. The residual issues are uncited/overstated competitive-context facts (F1, F2) and an under-billed-but-present dissent (F3, F4). None reverses a ruling or removes a precondition. **PASS_WITH_FIXES**, with F1 and F2 the priorities (they are the only places the PRD asserts, as fact, things its own adopted sources hedge or leave unsourced).
