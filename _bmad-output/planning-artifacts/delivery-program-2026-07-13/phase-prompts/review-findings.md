# Adversarial review — three phase-prompt drafts (2026-07-13)

Reviewer: adversarial subagent. Files audited:
- `p1-definition-factory.md` (P1)
- `p2-isolated-builds.md` (P2)
- `p25-product-acceptance-e2e.md` (P2.5)

Audited against: PO instruction (verbatim); canonical plan `ok-how-can-we-fancy-lemur.md`;
house conventions `gkkUDzn277`; the entry/exit chain; ADR-0033/0034/0035; Murat's
`e2e-test-strategy.md`; and the mechanical rules (no tables, no frontmatter/H1, tickable gates).

Each finding is tagged CONFIRMED (verified against a cited source) or SPECULATIVE (a real
risk I could not fully verify from available evidence). Refutation was the goal — where an
apparent defect held up under a source check, it is listed; where it did not, it is in "Cleared".

---

## CONFIRMED findings (fix before these prompts go live)

### F1 — CONFIRMED · HIGH · P1↔P2 chain · the P1-exit → P2-entry handshake is broken on the six-surface baseline

P2 entry (lines 21-23) gates Phase 2 on three things being GREEN:
- ENG-2033 six-surface re-baseline **SIGNED / "converted to a clean pass"**;
- the two meta-blockers **ENG-2039 (D1) + ENG-2040 (D16) CLOSED**;
- ENG-2034 nightly family-E2E cadence **LIVE + ratchet proven once**.

P1's exit criteria (§9) assert **none** of these. Worse, P1 is a definition-only phase that
**explicitly operates against the red baseline**: entry line 26 fixes the ground truth as
"**1 PASS / 5 FAIL / 1 BLOCKED** … NOT the '94% Done' tracking state," and §7/§9 write the SDDs
against that honest-red baseline. Phase 1 authors packs; it builds and fixes nothing.

So the six surfaces must travel from RED (accepted at P1 entry, unchanged at P1 exit) to GREEN
(required at P2 entry), yet **no phase in the documented chain owns that conversion**. A reader
who satisfies every P1 exit box still cannot satisfy P2 entry. This is precisely the "buggy
system" sequencing hole the PO fears — the gate that should catch it is simply absent from the
handshake.

Verified: plan Phase-0 exit only "executed and its defect list **triaged**" (not fixed/green);
`program-status.md` §Filing-note: "several code defects … **cannot be re-tested to green until
[D1/D16] clear**." Nothing between P1 exit and P2 entry clears them.

Fix: either (a) add the Phase-0 stabilization set (ENG-2033 green, ENG-2039/2040 closed, ENG-2034
live) as explicit **exit** boxes carried through P1, with a one-line note that Phase-0 stabilization
runs concurrently with the definition-only Phase 1 and must land before P2; or (b) make P2 entry
say plainly "Phase-0 exit (green baseline) is a **separate** predecessor to P1's certification, not
produced by Phase 1" and cross-link the owning tickets. Right now P2 entry line 19 ("gated on Phase 0
exit + the dispatching wave's Phase 1 certification") gestures at this, but P1 never states that its
own exit does NOT include the green baseline, so the two pages disagree about what "done with Phase 1"
guarantees.

### F2 — CONFIRMED · MEDIUM · P2 · "15 member projects" is stale and contradicts P1 + memory

P2 line 130: Initiative "Orvex Studio" — "**15 member projects**." P1 (lines 29, 116) says
"**17 member projects** (16 services + … Delivery Gates hub)." The Linear-initiative memory is
explicit: **17 member projects since 2026-07-10** (the original 15 + Orvex Studio Staging + Orvex
Studio Workgraph). P2 copied `gkkUDzn277` §2.4's pre-2026-07-10 count of 15.

This is not cosmetic: P1 Wave 2 authors staging + workgraph as real projects, and P2's own Stage 6
closes out all **16 services**. A Phase-2 orchestrator that trusts "15 member projects" as scope-of-
record will under-scope by exactly the two newest services it is supposed to build. CONFIRMED.

Fix: P2 → "17 member projects (16 services + the Delivery Gates hub)," matching P1 and the live
initiative; optionally add "verify against live structure, not the recorded `gkkUDzn277` §2.4 count,
which predates the staging/workgraph additions."

### F3 — CONFIRMED · MEDIUM · P2 · milestone section is self-contradictory and omits a Phase-2 milestone

P2 line 130: "**Milestones are per phase**; the **Phase-2 hub milestone is 'P1 — Definition
Factory'**." Naming the Phase-2 milestone as the Phase-1 milestone directly violates the "per phase"
rule stated in the same sentence. No "P2 — …" milestone is created anywhere in P2; build/test issues
are pointed at "the relevant milestone" (undefined).

Contrast the siblings, which get it right: P1 owns "P1 — Definition Factory" (line 116); P2.5 line
108 creates "**P2.5 — Product Acceptance E2E** … (mirroring the existing 'P1 — Definition Factory' …
milestones are per phase). **Create it if absent.**" P2 is the outlier — it should define/create a
"P2 — Isolated Builds" hub milestone and hang build/test issues (and the closing gate, which Stage 1
line 80 says is "built last") off it.

Fix: replace the P2 milestone text with the P2.5 pattern — a per-phase "P2 — …" hub milestone,
created if absent, with "P1 — Definition Factory" referenced only as the predecessor the wave builds
against.

### F4 — CONFIRMED · MEDIUM · P1↔P2 chain · "PRD delta ratified" (P2 entry) contradicts P1's autonomous draft-only model

P2 entry line 24 requires, per wave: "**PRD delta ratified**." But Phase 1's entire certification
model is **self-certified drafts with no human/PO gate**: P1 line 3 "fully autonomous (PO ruled)";
§3 artifact (1) is a draft; §7 and §9 "packs land as **visible wiki drafts**," "promotion is
human-only `doc-ratify` **downstream**." P1 never ratifies PRD-deltas.

"Ratified" has a specific meaning in this ecosystem — `draft → canonical` via human `doc-ratify`
(`gkkUDzn277` §3.4). As written, P2 entry demands a state Phase 1 deliberately does not produce, so a
literal-minded P2 orchestrator will block waiting for a human ratification that never comes. The root
ambiguity is the plan itself ("PRD delta (ratified):" at plan line ~147 vs. the Authoring section's
"self-certifies it — no PO gate"); P1 and P2 resolved that ambiguity in **opposite** directions.

Fix: align the vocabulary. If Phase 1 packs stay drafts, P2 entry should read "PRD delta **pack-
certified** (adversarial review PASS, draft)," not "ratified." If genuine ratification is intended, P1
must add a human `doc-ratify` step to its exit — but that contradicts the "fully autonomous, no PO
gate" ruling, so option 1 is the consistent fix.

---

## SPECULATIVE findings (verify, low severity)

### F5 — SPECULATIVE · LOW · P2.5 · "all 8 DoD boxes" on ENG-2033 is unverified and inconsistent with the 7-surface framing

P2.5 entry line 21: ENG-2033 "genuinely Done (**all 8 DoD boxes** ticked on observed evidence, not
just `api`)." The re-baseline is framed everywhere else as **7 surfaces** (6 surfaces + cross-cutting;
`program-status.md` §1 "1 PASS / 5 FAIL / 1 BLOCKED (**7 surfaces**)"; P1 line 26 lists the same
seven). I could not confirm the ENG-2033 ticket actually carries 8 DoD boxes. The "8" may be correct
for the live ticket (e.g. 7 surfaces + an overall sign-off), but it is an un-sourced number that
disagrees with the 7-surface count used in P1/P2.

Fix: confirm against the live ENG-2033 body, or genericize to "every DoD box on observed evidence,
not just `api`" to avoid pinning an unverified count.

### F6 — SPECULATIVE · LOW · P1 · "four-phase program" label is stale now that a Phase 2.5 exists

P1 line 1: "the **four-phase** Orvex Studio delivery program … followed by 'Phase 2'." The canonical
plan does describe four phases (0–3) with no 2.5. P2.5 is a PO-authorized formalization of the plan's
"program-exit product-acceptance run," legitimately inserted between Phase 2 and Phase 3 — so it is not
invented scope. But the "four-phase" phrasing and the plan's phase numbering no longer reflect the
2.5 insertion. This is a labeling imprecision, not a logic defect; P1 only needs to name its immediate
successor (P2), which it does correctly.

Fix (optional): "the phased Orvex Studio delivery program" or add "(with a Phase 2.5 product-acceptance
gate between Phase 2 and Phase 3)."

### F7 — SPECULATIVE · LOW · adjacent artifact `e2e-test-strategy.md` · has an H1 and pipe tables

The three prompts themselves are **clean** (no tables, no H1, no frontmatter — verified by grep). But
Murat's `e2e-test-strategy.md`, which P2.5 tells sub-agents to read and which sits in the same
`phase-prompts/` folder, opens with an H1 (`# Orvex Studio — Product Acceptance E2E…`) and contains
several markdown pipe tables (tiers §1, principals §2.5, coverage matrix, seed assets Appendix A). If
that file is ever pushed to the wiki via `docmost-cli` alongside the prompts, the pipe tables will
corrupt (edit-path-corruption memory) and the H1/frontmatter conventions would be violated. It is fine
as a local reference artifact; flag only so it is not mechanically wiki-stored as-is.

---

## Cleared (checked and held up — no defect)

- **Chain naming (criterion d):** P1 exit → "Phase 2: Isolated Builds & Continuous Proving"; P2 exit →
  "Phase 2.5: Product Acceptance E2E"; P2.5 exit → "Phase 3 — Integration Hardening & Cutover" (honestly
  noting the Phase-3 prompt is authored later). All correct and consistent.
- **P2 exit → P2.5 entry handshake:** matches well (SDD-evidenced + six surfaces continuously green +
  ratchet proven → P2.5 entry). P2.5's "not-ported rows" leniency is weaker than P2 exit, i.e. safe.
- **Mechanical rules (criterion g):** all three prompts free of markdown tables, H1, and frontmatter;
  every gate is a tickable `- [ ]`. Verified by grep.
- **ADR consistency (criterion e):** ADR-0033 `yNFx3YyNap` (claim arbiter), ADR-0034 `12aDkq4iOd`
  (credential lanes), ADR-0035 `QbEBPuKcGR` (Go↔TS bridge) cited identically across all three and
  matching `gkkUDzn277` §2.2/§2.3. P1 correctly cites **ADR-0008** for contracts change-authority (not
  the "never-filed ADR-0001"), matching `gkkUDzn277` §2.5.
- **Defect-ID facts:** ENG-2039 = D1, ENG-2040 = D16 (confirmed against `defect-ids.json`); "16 defects
  ENG-2039..2054" arithmetic is right; ENG-2033/34/35/36/37 usage matches the plan's "Filed 2026-07-13".
- **Pure-orchestrator contract / house conventions (criterion c):** all three carry the DECOMPOSE→
  DISPATCH→SYNTHESIZE→VERIFY contract, coordination-only orchestrator model, per-subagent model-tier
  pinning, the §3.11 toolchain-preflight as first action, deterministic reviewer≠author gates, boxes-
  clean, orchestrator-only Done advance, never-auto-close + revert discipline, Linear 2500/hr paced-
  write + cache-first reads + stage-on-rate-limit, and dual-write lockstep. Consistent and faithful.
- **Murat's strategy into P2.5 (criterion f):** faithful — T0/T1/T2/T3 tiers + budgets, the `ticket`
  Clerk strategy + project-based `clerkSetup` + no `--disable-web-security` + storage-state reuse + four
  principals, the R1–R14 risk matrix, the highest-risk-first build order (R1+R2 → R4 → R12+R11 → R3 →
  rest, Appendix B), flake/quarantine policy §5, the deliberate one-time ratchet test, the six-surface
  R4 with knowledge-sync as the linchpin/fake-done re-earn, and the Stage-5 PO sitting naming exactly
  the mandate's concerns (Clerk, onboarding, POC parity, demo, pricing/no-card, knowledge-sync).
- **PO mandate coverage (criterion a):** P2.5 covers clerk (R1), onboarding new user (R2), POC parity
  (R3 + Stage-2 parity matrix), demo system (R5), and "absolutely everything" (T3 sweep R13/R14). The
  verbatim mandate is quoted. Adequate.
- **Invented-scope check (criterion b):** no scope beyond plan + brief + ADRs surfaced; the reconciliation
  note ("live repo wins over stale canon") is carried consistently in P1 and P2.

---

## Priority order for the author

1. **F1** (chain gap — the missing green-baseline handshake between P1 and P2) — highest; it is the exact
   fake-done/buggy-system risk the whole program exists to prevent.
2. **F3** (P2 missing/mislabeled Phase-2 milestone) and **F4** ("ratified" vs draft-only) — both make a
   literal P2 orchestrator either mis-file or block.
3. **F2** (P2 "15 → 17 member projects") — one-word scope-of-record fix.
4. **F5–F7** — verify/optional.
