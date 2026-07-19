# Fixes applied — CONFIRMED review findings (2026-07-13)

Source: `review-findings.md`. Applied all four CONFIRMED findings (F1–F4); skipped the three SPECULATIVE findings (F5–F7) per instruction. P2.5 (`p25-product-acceptance-e2e.md`) required no changes — no CONFIRMED finding targeted it (F5 was speculative).

## p2-isolated-builds.md

- **F1 (chain gap — green-baseline handshake, P2 side).** Added a paragraph under Entry criteria making the split explicit: the first three entry boxes (ENG-2033 signed baseline, ENG-2039/2040 closed, ENG-2034 ratchet) are **Phase-0 stabilization deliverables — a separate predecessor**, not Phase-1 outputs. Notes that Phase 1 is definition-only and deliberately leaves the honest-red baseline unchanged, that Phase-0 stabilization runs concurrently and must land before P2, and that satisfied Phase-1 exit boxes are not evidence the baseline is green.
- **F4 ("ratified" vs draft-only).** Entry criteria per-wave line: "PRD delta ratified" → "PRD delta **pack-certified** (adversarial review PASS, draft — NOT human `doc-ratify`d…)", aligning vocabulary with Phase 1's autonomous self-certified-draft model so a literal P2 orchestrator does not block on a human ratification that never comes.
- **F2 ("15 → 17 member projects").** Linear protocol scope-of-record line: "15 member projects" → "**17 member projects (16 services + the Delivery Gates hub)**", with a note to verify against live structure rather than the stale `gkkUDzn277` §2.4 count of 15 (predates the 2026-07-10 staging/workgraph additions).
- **F3 (missing/mislabeled Phase-2 milestone).** Same Linear protocol line: replaced the self-contradictory "the Phase-2 hub milestone is 'P1 — Definition Factory'" with a per-phase **"P2 — Isolated Builds"** hub milestone, **created if absent** (mirroring the P2.5 pattern); "P1 — Definition Factory" now referenced only as the predecessor the wave builds against; build/test issues and the closing gate issue hang off the P2 milestone.

## p1-definition-factory.md

- **F1 (chain gap — green-baseline handshake, P1 side).** Added a "Scope boundary — what Phase-1 exit does NOT include" note at the top of §9 Exit criteria: Phase 1 is definition-only and leaves the six-surface baseline as Phase 0 filed it (1 PASS / 5 FAIL / 1 BLOCKED); converting it to green (ENG-2033 / ENG-2039 / ENG-2040 / ENG-2034) is Phase-0 stabilization, a separate concurrent predecessor, NOT a Phase-1 exit box; satisfying every P1 exit box does not on its own satisfy Phase 2 entry.

## p25-product-acceptance-e2e.md

- No changes. No CONFIRMED finding targeted this file (F5 "8 DoD boxes" was SPECULATIVE and skipped).

## Skipped (SPECULATIVE — per instruction)

- **F5** — ENG-2033 "8 DoD boxes" vs 7-surface framing (P2.5): unverified count; left as-is.
- **F6** — "four-phase program" label stale vs Phase 2.5 (P1): labeling imprecision, not a logic defect.
- **F7** — adjacent `e2e-test-strategy.md` has an H1 + pipe tables: a reference artifact, not one of the three prompts; no prompt edit needed.
