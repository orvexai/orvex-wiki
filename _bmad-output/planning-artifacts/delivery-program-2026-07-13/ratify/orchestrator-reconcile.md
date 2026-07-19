# Ratify receipt — Orchestrator Prompt (Delivery) §2 reconciliation

**Date:** 2026-07-13
**Authorization:** PO Daniel, ratify-all pass (verbal, session 2026-07-13)
**Linear:** ENG-2035 (canon reconciliation — drift, not new decisions)
**Target page:** `orvexstudioarch` / `gkkUDzn277` — "Orchestrator Prompt — Delivery" (CANONICAL)
**Prepared revision (corrected):** `_bmad-output/planning-artifacts/delivery-program-2026-07-13/adrs/reconcile-orchestrator-prompt.md`

## What the review flagged

The prepared §2 revision's §2.3 restatement still carried ADR-0006's **old hard credential refuse-gate**
("refuse dispatch and record an incident" / "Enforcement is a hard gate"). **ADR-0034** (`12aDkq4iOd`,
"Credential lanes for agent execution — deny-by-default per-lane scoping") *reverses* that gate: a deny-list
can only block, so it is replaced by a deny-by-default **allow-list**. The prepared revision also cited the
claim arbiter as a mere consequence of ADR-0006 §5, when **ADR-0033** (`yNFx3YyNap`) actually *ratifies*
Linear-status-as-claim as the arbiter (guardrail contract + Temporal-CAS trip-wire).

## Step 1 — Corrected the prepared revision file

- **§2.3** rewritten to ADR-0034's model: deny-by-default per-lane **ALLOW-LIST**; dispatch env starts empty,
  populated only by the lane's declared credentials, each minted short-lived + narrowly scoped on the
  OIDC→OpenBao pattern; forbidden credentials never candidates ⇒ nothing "refused", no dispatch blocked.
  Control / Build / Verify-review lanes enumerated. Model access = AI-brokered scoped token via
  `orvex-studio-ai`, **never a raw provider key**, **with the interim rule**: a scoped, short-TTL raw
  provider key remains a legal lane-declared credential for the narrow model-capability case **until the
  `orvex-studio-ai` broker ships**, then the broker-token supersedes it. Enforcement is structural, not detective.
- **OPEN-DECISIONS list** now cites all five governing ADRs: **ADR-0006** (execution seat),
  **ADR-0007 + ADR-0010** (event envelope / type taxonomy), **ADR-0008** (contracts change-authority),
  **ADR-0033** (claim arbiter), **ADR-0034** (credential lanes).
- **§2.2** claim-arbiter citation moved from "ADR-0006 §5 consequence" to **ADR-0033** (Linear-status-as-claim
  ratified as arbiter, guardrail-invariant contract, pre-designed Temporal deterministic-ID CAS trip-wire).
- Correction log appended to the revision file.

## Step 2 — Applied to the canonical page (PM-JSON surgery)

Page is table-heavy (plain markdown empty; 3 table nodes) and §2.1 carries `{dfm:…}` page-mention embeds,
so applied via ProseMirror-JSON surgery (not a markdown patch) to preserve embeds:

- §2.1 heading → "(settled — ADR-0007, ADR-0010)"; kept the two embed-bearing bullets (canon authority
  mentions + "no single Studio PRD"), replaced the old OPEN-DECISION envelope bullet with the settled
  ADR-0007 / ADR-0010 / Temporal bullets.
- §2.2 heading → "(settled — ADR-0006, ADR-0033)"; kept the LLM-agent + fake-done-gate bullets, replaced
  the OPEN-DECISION arbiter bullet with execution-seat (ADR-0006) + claim-arbiter (ADR-0033) bullets.
- §2.3 heading → "(settled — ADR-0034, refining ADR-0006 §2)"; bullet list replaced wholesale with the
  allow-list model + interim raw-key rule + structural-enforcement bullets. Old refuse-gate text removed.
- §2.4 (Linear ground truth) left untouched, between §2.3 and the new §2.5.
- New §2.5 "Contracts change-authority (settled — ADR-0008)" inserted before the trailing horizontal rule.

**Mechanics:** CAS write via `docmost-cli page update gkkUDzn277 --content-json @new_pm.json --if-version <ver>`.
- Fresh pre-write version: `2026-07-12T16:17:07.844Z`
- Write exit code `0`, outcome `updated`, new version `2026-07-13T12:57:20.755Z`
- No CONFLICT (exit 7) encountered; single write.
- Table-node count asserted unchanged (3 → 3) in the surgery script before write.

## Step 3 — Verification (re-fetch of live page)

Present (YES): "settled — ADR-0007, ADR-0010" · "settled — ADR-0006, ADR-0033" ·
"settled — ADR-0034, refining ADR-0006 §2" · "deny-by-default per-lane ALLOW-LIST (ADR-0034)" ·
"Interim rule" · "scoped, short-TTL raw provider key remains a legal…" · "Linear-status-as-claim" ·
"pre-designed trip-wire to a Temporal…" · "2.5 Contracts change-authority (settled — ADR-0008)" ·
`{6aMAzsYeQb}` mention · "FR-C17". Tables = 3. §2.4 "Linear ground truth" + `orvexai` body preserved.

Gone from §2 (as required): "refuse dispatch and record an incident" · "Enforcement is a hard gate" ·
"forbidden raw key detected in any dispatch env" · "(open decision)" · "OPEN DECISION — settle during the
Studio Act-1 run" · "mechanics TBD".

**Note:** the string "TBD — set during the Studio Act-1 run" still appears in §1 (Foundation Doctrine
nodes 1.1/1.2/1.5/1.6) and §3.15 — these are pre-existing, out-of-scope for this §2-only revision. The §1.6
execution-seat TBD is explicitly flagged in the ratifier notes as a separate follow-up (point it at ADR-0006
in a later pass); it was deliberately not touched here.

## Outcome

Reconciliation applied and verified on the canonical page. `gkkUDzn277` §2 now reflects the settled ADRs
(0006/0007/0008/0010/0033/0034); the stale OPEN-DECISION framing and the reversed hard refuse-gate are gone.
