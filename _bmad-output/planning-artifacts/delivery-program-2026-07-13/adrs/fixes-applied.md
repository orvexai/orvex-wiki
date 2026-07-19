# Review-findings applied to ADR-0033 / 0034 / 0035

**Date:** 2026-07-13 · **Source:** `review-findings.md` (ENG-2035 adversarial review) · **Applied to:** live wiki draft pages (status: draft, amended in place with `--if-version` CAS) + the local copies in this directory.

All three pages are `status: draft` in space `orvexstudioarch`. Table-bearing pages (0033, 0034) were amended via PM-JSON surgery (`page update --content-json`) after `page patch` tripped the `EMBED_DEGRADATION` table guard on structural inserts; 0035 (no table) was amended via `page patch`. No finding was marked speculative in the source, so every lettered finding was applied. The "Non-finding worth stating" (G3 tightening of ADR-0006) under F33 was intentionally **not** applied — it is explicitly a non-finding/suggestion, not a defect.

## ADR-0033 — `yNFx3YyNap` (Work-claim arbiter)

- **F33-1 (substantive) — mid-run lease double-build risk / mutually-exclusive mitigations.** Rewrote the §2 "Mid-run claim lease" bullet: reclaim now keys on a **concrete, engine-owned liveness signal** — a live dispatched-agent handle table (in-process PID/child-handle), explicitly **not** `updatedAt` — and fires **only when all three hold**: no live handle, no open PR, and an elapsed hard wall-clock window. Added the reasoning that a slow-but-alive agent (live handle) is never reclaimed, so the lease stays a pure liveness fix and cannot manufacture a double-build. Rewrote the corresponding "Negative / accepted risk" bullet to **drop the contradictory `claimedIds` backstop** — stated plainly that `claimedIds` does not backstop reclaim because re-picking a reclaimed issue necessarily removes it from `claimedIds`; safety rests on the liveness signal alone.
- **F33-2 (moderate) — G2 "SOLE writer" known-violated.** Reworded G2 to **"Single *authoritative* Linear writer"** (SOLE *authoritative* writer), and added that Linear's GitHub-integration auto-close is a **known non-authoritative writer, detected-and-reverted per §3 (pattern P1)** — so the invariant set no longer asserts a clause the ADR itself knows is false.

## ADR-0034 — `12aDkq4iOd` (Credential lanes)

- **F34-1 (substantive) — §3 forbids the raw key but routes through an unbuilt broker (re-creates the block).** Added an **Interim rule** paragraph to §3: until the `orvex-studio-ai` broker ships, a **scoped, short-TTL raw provider key remains a legal, lane-declared credential** for the narrow model-capability case (minted/metered like any lane credential, never a standing master key); once the broker ships it supersedes the raw key. This closes the no-path gap that would otherwise reproduce the block the 2026-07-07 amendment withdrew.
- **F34-1 framing sub-point — "refines" undersells the reversal.** Rewrote the Supersedes/relates cell to state plainly that the ADR **partially reverses the 2026-07-07 amendment** (raw key allowed → narrowed to a scoped broker-token with a raw-key interim fallback), rather than merely "refining" it.
- **F34-1 cross-artifact coordination.** Added to the Supersedes/relates cell that ADR-0034 **supersedes the hard refuse-gate restatement of orchestrator-prompt §2.3** (the allow-list model replaces it), so a co-ratify does not leave canon self-contradicting. (The stale `reconcile-orchestrator-prompt.md` §2.3 text itself is a separate companion doc and was left for a follow-up correction; the ADR now explicitly overrides it.)
- **F34-2 (moderate) — ADR-0009 mis-citation.** Fixed both the Supersedes/relates cell and the References entry: the **vended-ephemeral *agent*-credential principle is attributed to Houston ADR-0009** (a different document, per ADR-0006's references); Studio ADR-0009 (`94xrZhXCej`) is cited only for **"one auth spine, one principal"** (the user-auth exchange-token→session-mint contract).
- **F34-3 (minor) — soften §2's absolute "never blocked."** Reworded the §2 bullet to "**No dispatch is ever refused or blocked at dispatch time**" and added the caveat that an under-declaring lane surfaces later as a per-ticket task failure (not a run halt) — the guarantee is never-block-the-run, not never-stall-a-ticket.

## ADR-0035 — `QbEBPuKcGR` (Go↔TS bridge)

- **F35-1 (moderate) — §2d/§4 misplace the CS §9 / ADR-0008 gate.** §2(d): the consumer's `generated.d.ts` diff is now described as a **downstream visibility of a break already classified at the contracts repo per ADR-0008** — a second confirmation, not the CS §9 review surface itself. §4: reworded so the MAJOR classification **fires at the contracts repo per ADR-0008, before any consumer regens**; the consumer regen diff is a downstream confirmation, not where the ADR-gate fires.
- **F35-2 (minor) — §6 pins draft-sourced event types without citing §3's draft/pinned rule.** Added the clause: types land now **as draft-sourced types for in-flight dev per §3 — a GA cutover still waits on the catalog types reaching `x-status: pinned`**.
- **F35-3 (minor) — weak license-collision rejection rationale.** Replaced the "monolithic client package would force one license posture" strawman with the real ground: **any npm publish would force the deliberately non-building seam repo to grow a package-license + registry-publish surface it lacks.**
- **F35-4 / cross-cutting — ADR-0029 status.** Relabeled the ADR-0029 (`WZWmazrlS0`) References entry from **"canonical" → "draft"** (it is Draft — pending PO doc-ratify).

## Cross-cutting (0034 & 0035) — ADR-0029 relabel

ADR-0029 (`WZWmazrlS0`) was cited as "canonical" but is Draft. Relabeled to "draft" in ADR-0035's References. In ADR-0034 the ADR-0029 citations do not carry a "canonical" status label on the deny-by-default reference line, so no relabel was required there.

## Not applied (out of scope / not a finding)

- **F33 "Non-finding worth stating"** (make the G3 tightening of ADR-0006 §5 explicit) — explicitly a non-finding suggestion, not a defect; skipped per "apply the confirmed findings."
- **`reconcile-orchestrator-prompt.md` §2.3 correction** — a separate companion doc, not one of the three ADR pages; ADR-0034 now explicitly supersedes its stale refuse-gate restatement, but editing that doc is a follow-up outside this task's scope.
