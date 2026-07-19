# Adversarial review — ADR-0033 / ADR-0034 / ADR-0035

**Reviewer:** adversarial-review subagent · **Date:** 2026-07-13 · **Ticket:** ENG-2035
**Method:** refute-the-decision. For each ADR I attempted to break it against ratified canon (ADR-0006/0007/0008/0009, the cell contract `JGAUQRsw2g`, Coding Standards `6aMAzsYeQb` §3.2/§6/§10/§13) and against the ADRs' own internal logic. Live canon fetched fresh (`docmost-cli cache sync`, then `page get` by slug).

**Verdicts**

| ADR | Decision holds? | Verdict |
| --- | --- | --- |
| 0033 — work-claim arbiter | Core ratification is right; two findings touch correctness/completeness | **REVISE** |
| 0034 — credential lanes | Allow-list model is right; the model-key narrowing has an interim gap + a mis-citation | **REVISE** |
| 0035 — Go↔TS bridge | Decision is sound; findings are framing + citation fixes, none overturn it | **SOUND (revise notes)** |

Cross-cutting citation defect affecting 0034 **and** 0035: both reference **ADR-0029 (`WZWmazrlS0`) as "canonical."** It is **Draft — pending PO doc-ratify** (verified in live copy). Leaning on it as settled canon for the deny-by-default `requireScope()` posture (0034 §2) and the unshipped-Kafka-binding decoupling (0035 §6) is fine on the *code* (both are built), but the status label is wrong and should read "draft."

---

## ADR-0033 — Work-claim arbiter → **REVISE**

The central call — **ratify Linear-status-as-claim, bound by G1–G4 + a Temporal-CAS trip-wire, rather than build an arbiter now** — is correct and well-defended. It honors ADR-0006 §5 ("with exactly one orchestrator … Linear-status-as-claim needs no CAS arbiter"), §3.5 single-source-of-truth, and the §2.2 ratify-or-replace mandate. The optimistic-CAS-on-Linear and Dolt rejections are airtight. Two findings, one substantive.

### F33-1 (substantive) — the mid-run lease (§2) converts a liveness problem into a possible **double-build**, and its two stated mitigations are mutually exclusive for the reclaimed issue
The ADR's spine is "stale claim is a *liveness* problem (work stranded), never a *safety* problem (no double-build)." The added mid-run lease breaks that framing. §2 reclaims an In-Progress issue "whose lease is older than a bounded staleness window **with no open PR and no live dispatched agent** … reset to Todo and re-picked," and the Negatives claim two backstops: (a) "requiring no open PR and no live dispatched agent," and (b) "the intra-engine `claimedIds` guard preventing the same engine from re-dispatching."

These two backstops cannot both hold for the same issue:
- To **re-pick** a reclaimed issue, it must be **removed from `claimedIds`** (otherwise the intra-engine guard G4 blocks the re-pick and the lease is inert).
- Once it's out of `claimedIds`, backstop (b) is gone — nothing stops the engine dispatching it to a *second* agent while the original slow-but-alive agent is still building.

So the entire safety of the lease rests on the single unspecified predicate **"no live dispatched agent."** The ADR never says how liveness is detected for an in-process sub-agent — and the lease exists *precisely because* startup-reclaim can't observe a mid-run death, i.e. the engine has no restart signal to lean on. A false-negative on that liveness check (long silent build, no PR yet, `updatedAt` unmoved) yields two agents building one issue and both pushing branches — exactly the double-build the whole ADR is written to prevent. **Fix:** either specify a concrete, reliable in-process liveness signal (a live PID/handle table the engine owns, not `updatedAt`) and state that reclaim keys on *that* alone, or downgrade the lease to "PR-gated reclaim only" (reclaim only issues with no dispatched-agent handle AND past a hard wall-clock), and drop the `claimedIds` sentence from the mitigation (it does not apply post-reclaim). As written, §2's "a too-eager window is a liveness annoyance, never a double-build" is not established.

### F33-2 (moderate) — G2 "SOLE writer of issue state" is asserted as a load-bearing invariant but is **known-violated** by the very automation §3 handles
G2 states: "The delivery engine(s) are the SOLE writer of in-scope issue *state*. No … second automation … may flip delivery state." But §3 documents Linear's GitHub integration auto-flipping a linked ticket to **Done** on merge (pattern P1, victims ENG-1405/ENG-1395) — a second automation writing state, standing, by design. The safety story survives (that write is a premature *release*, not a double-*claim*, and P1 reverts it), but the ADR presents G2 as an invariant mutual exclusion "rests on," while simultaneously carrying a permanent counter-example to it. **Fix:** reword G2 to "sole *authoritative* writer; the Linear↔GitHub auto-close is a known non-authoritative writer, detected-and-reverted per §3" — so the invariant set doesn't include a clause the ADR itself knows is false.

### Non-finding worth stating (strengthens the ADR)
G3 quietly corrects ADR-0006 §5's looser reasoning: 0006 attributes no-contention to "single orchestrator," but the real cross-engine arbiter for the two-engine (two-16-slot-workflow) run 0006 §1 mandates is **partition disjointness**, not orchestrator count. ADR-0033 gets this right and grounds it in §3.18. Consider saying so explicitly — it's a genuine tightening of 0006, not just a restatement.

---

## ADR-0034 — Credential lanes → **REVISE**

The reframe — **replace ADR-0006's withdrawn deny-list refuse-gate with a deny-by-default allow-list, so confinement returns without the block** — is genuinely good and dissolves the apparent never-block-vs-least-privilege conflict correctly. It aligns cleanly with CS §10 (least privilege, secrets-via-env) and §3.2/§6 (provider-key confinement; §3.2 even names "the Studio build-agent credential model … an OPEN DECISION — settle during the Studio Act-1 run," which this settles). Two findings, one substantive.

### F34-1 (substantive) — §3 forbids the raw provider key the PO explicitly re-allowed, but routes the replacement through an **unbuilt broker**, re-creating the very block the amendment removed
The 2026-07-07 ADR-0006 amendment is a **ratified PO decision** with the PO's own words: *"let's allow agent api keys, don't want you to get blocked."* ADR-0034 §3 walks that back — "an AI-brokered scoped token, **never a raw provider key**" — and points the replacement at "a scoped … token brokered through `orvex-studio-ai`'s contract API." But the ADR's own Follow-ups list "the `orvex-studio-ai` broker-token scope vocabulary" as **open, not decided here** — i.e. the broker does not exist yet. So in the interim, a task that "genuinely needs model capability beyond the harness" has *no lane-declared credential*: under the allow-list it isn't handed the (now-forbidden) raw key, and the broker token it's supposed to get isn't shippable. That task fails-to-progress — which is precisely the block the PO withdrew the gate to avoid. **This is the strongest finding.** Fix one of:
- state an explicit **interim rule** (until the `orvex-studio-ai` broker ships, a scoped raw key remains a legal lane-declared credential for the narrow model-capability case), or
- gate §3 on the broker's existence and mark model-beyond-harness as harness-only until then,
so the ADR doesn't forbid the fallback *and* leave no path.

Framing sub-point: the Supersedes line says the ADR "refines ADR-0006 §2 + its 2026-07-07 amendment." "Refines" undersells that §3 **reverses the amendment's core permission** (raw key allowed → raw key forbidden). A PO scanning "refines" may not register that their explicit "allow agent api keys" is being narrowed. State the reversal plainly.

### F34-2 (moderate) — ADR-0009 mis-cited: `94xrZhXCej` does **not** originate the vended-ephemeral *agent-credential* principle
Reference line: "ADR-0009 (`94xrZhXCej`, canonical) — origin of the vended-ephemeral-credential principle; 'one auth spine, one principal.'" Two different ADR-0009s are being conflated. Studio ADR-0009 (`94xrZhXCej`) is the **user-auth exchange-token → session-mint** contract — it says nothing about vending ephemeral credentials to build/review *agents*. Per ADR-0006's own references, the vended-ephemeral **agent**-credential principle comes from **Houston ADR-0009**, a different document. The "one auth spine, one principal" phrase *is* Studio ADR-0009's; the "vended-ephemeral-credential principle" is Houston's. **Fix:** attribute the vended-ephemeral principle to Houston ADR-0009 (as ADR-0006 does), and cite `94xrZhXCej` only for "one auth spine, one principal."

### F34-3 (minor / caveat, already half-acknowledged) — "no dispatch is ever blocked" is narrower than it reads
§2 headlines "No dispatch is ever refused or blocked." True at *dispatch*, but the Negatives concede a lane that under-declares "surfaces as a task failure." For the PO's never-*block*-the-run intent, a burned agent that fails mid-build for a missing connection URL and escalates is a per-ticket stall — the run doesn't halt, but that work doesn't progress either. The ADR is honest about this in Negatives; just don't let §2's absolute phrasing overstate the guarantee. No decision change.

### Cross-artifact coordination risk (not an ADR-0034 defect, but blocks a clean ratify)
The companion `reconcile-orchestrator-prompt.md` in this same dir restates prompt §2.3 with the **old hard refuse-gate** ("if a forbidden raw key … refuse dispatch and record an incident … Enforcement is a hard gate"), which the 2026-07-07 amendment **withdrew** and which ADR-0034 replaces with the allow-list. If both land in the same doc-ratify pass, canon self-contradicts. ADR-0034 should either explicitly supersede that §2.3 restatement, or the reconcile doc must be corrected to the allow-list model before/with ratify.

---

## ADR-0035 — Go↔TS bridge → **SOUND** (with revision notes)

The decision — **per-repo checked-in codegen from a local pinned checkout, driven by a contracts-owned shared recipe + manifest; `openapi-typescript`+`openapi-fetch` for REST, `json-schema-to-typescript`+ajv for events; no published client package** — is well-grounded. It generalizes the already-CI-gated mcp pattern, honors ADR-0006 (git+GitHub substrate, no new infra), correctly routes regen through ADR-0008's two lanes, and respects the D-A7 / agpl-guard rule (never codegen off the served AGPL descriptor). The central-package rejection survives on its strong rationales (non-building seam repo, no npm/registry infra, diff-in-consumer-PR visibility). None of the findings below overturn the decision; they are accuracy fixes.

### F35-1 (moderate) — §2(d)/§4 misplace where the CS §9 / ADR-0008 gate actually fires
The ADR argues the generated-type diff in the *consuming* PR "**is** the CS §9 design-review surface for a seam change" (§2d) and that "a generated-type diff that deletes or renames a field is exactly the drift-gate's MAJOR signal → the ADR + human-ratify lane" (§4). But ADR-0008 locates the classifier at the **contracts-repo** change — "the classifier is the drift-gate + semver policy (FR-C17)," running in *contracts* CI on the schema edit, *before* any consumer regens. By the time a consumer bumps its pin and sees a red `generated.d.ts` diff, the breaking contract change has **already merged upstream**. The consumer diff is a useful *downstream confirmation*, not the primary §9 review surface, and it is not where ADR-0008's ADR-gate fires. As written, §2d/§4 could be read to imply per-repo codegen *provides* the §9 gate — it doesn't; ADR-0008 already sites it at the contracts change. **Fix:** reword to "the consumer's regen diff is a second, downstream visibility of a break already classified at the contracts repo per ADR-0008" — keep the benefit claim, drop the "IS the review surface" overreach.

### F35-2 (minor) — §6 generates CloudEvent types from **still-draft** catalog types without citing §3's own draft/pinned rule
§6 says TS CloudEvent types "are generated per §1 and **land now**." Per ADR-0007 (canonical), **all** catalog types are still `x-status: draft` ("nothing downstream may pin a draft artifact — SEAMS.md"). §3 already carries the correct rule (generate against draft for dev; a GA cutover must pin an `x-status: pinned` artifact). §6 states the "land now" unconditionally and never cross-references §3, so it reads as license to pin draft-sourced event types into a launch. **Fix:** one clause in §6 — "as draft-sourced types for in-flight dev per §3; a GA cutover still waits on the catalog types reaching `x-status: pinned`."

### F35-3 (minor) — one rejection rationale for the central package is weak
The `@orvex/openapi-clients` rejection lists "a monolithic client package would force one license posture (`@orvex/dfm` Apache-2.0 vs `@orvex/audit-contract` AGPL-3.0)." A generated client is clean-room from the **Apache-2.0** authored OpenAPI and would naturally be Apache-2.0; it need not bundle the AGPL `audit-contract` *logic*, so there's no forced collision. The rejection stands on its other, real grounds (non-building repo, no publish/registry infra, diff visibility); the license-collision line is a strawman and should be dropped or recast as "any npm publish forces the seam repo to grow a package-license + publish surface it deliberately lacks."

### F35-4 (minor) — ADR-0029 status (shared with 0034): cited "canonical," actually Draft. See cross-cutting note above.

---

## Summary of required edits

- **ADR-0033:** rewrite §2 lease safety around a concrete in-process liveness signal (or downgrade to PR+wall-clock reclaim) and fix the mutually-exclusive `claimedIds` mitigation (F33-1); reword G2 to "sole *authoritative* writer" acknowledging the GitHub auto-close (F33-2).
- **ADR-0034:** add an interim rule for the model-capability case until the `orvex-studio-ai` broker ships, and state the amendment-reversal plainly (F34-1); fix the Houston-vs-Studio ADR-0009 mis-citation (F34-2); soften §2's absolute "never blocked" (F34-3); reconcile with the stale `reconcile-orchestrator-prompt.md` §2.3 before ratify.
- **ADR-0035:** reword §2d/§4 so the consumer diff is downstream confirmation, not the §9 gate (F35-1); cross-reference §3's draft/pinned rule in §6 (F35-2); drop the license-collision strawman (F35-3).
- **Both 0034 & 0035:** relabel ADR-0029 (`WZWmazrlS0`) from "canonical" to "draft."
