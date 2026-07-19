**Wave-gate umbrella for the Definition Factory's Wave 4 — and the Phase-1 EXIT
gate.** Wave 4 defines the UI migration surface-waves for `orvex-studio-ui` (the
POC → target port, ruled a rewrite on the same stack). Because Wave 4 is the last
wave, this same issue is the deterministic gate that closes **all of Phase 1** — the
Definition Factory — and authorises the launch of Phase 2. [P1 `yXUWpQpRjx` §4 Wave 4,
§9 Exit; Plan `5eFdxN3edd` Phase-1]

This issue does not author a pack itself; the UI pack is authored in its child
(`pack-ui`). It mirrors ENG-2037 (the Wave-1 gate): a description plus a tickable
Definition-of-Done gate, nothing more. It closes only when the UI pack is certified
(adversarial review PASS, reviewer ≠ author) **and** every Phase-1 exit box is
genuinely green — evidence observed, not reported.

**In scope of the Wave-4 UI definition (defined inside `pack-ui`, asserted here):**

- Enumerate the POC's **~35 surfaces** in parity order (Discover/marketplace →
  Builder/editor flagship → Memory → Library/Collections → Curation Queue → Phase-2
  surfaces incl. Composer + task-first wizard). [P1 `yXUWpQpRjx` §4 Wave 4]
- **Rewrite-same-stack ruling recorded** — surfaces are rewritten (never
  copy-pasted) on the POC's proven stack (Tailwind + Radix + CVA + zustand + zod +
  TipTap), with the **orvex-ds design tokens as the Tailwind styling contract**.
  [P1 `yXUWpQpRjx` §4 Wave 4 ruling]

## ✅ Definition of Done — the binary wave + Phase-1 exit gate

Red on any box = Phase 1 NOT done, no override. The pack author CANNOT tick these; only the delivery orchestrator advances this gate through the deterministic check. [P1 `yXUWpQpRjx` §7 orchestrator-only advance; SE-Arch `8sYi523i4t` fake-done]

**Wave-4 UI definition boxes**

- [ ] **UI pack certified** — `pack-ui` carries an adversarial pack-review verdict **PASS** (reviewer ≠ author) posted as a Linear comment + mirrored on the pack root wiki draft. *machine check: a comment containing `PACK-REVIEW: PASS` exists on the `pack-ui` issue.* [Source: P1 `yXUWpQpRjx` §4 stage gate; Plan `5eFdxN3edd` Phase-1 certification]
- [ ] **The ~35 POC surfaces are enumerated** in parity order in the UI pack, each mapped to its surface-wave. *machine check: the UI pack lists ≥35 named surfaces with a wave assignment.* [Source: P1 `yXUWpQpRjx` §4 Wave 4]
- [ ] **The rewrite-same-stack + orvex-ds-tokens ruling is recorded** and the **UI-canon amendment is drafted** (the UI architecture canon still says exact-match `orvex-ds.css`; the amendment to the rewrite-same-stack + tokens-as-Tailwind-contract model lands as a draft, human-ratify downstream). Shared DTO/error vocab via contracts codegen replaces the POC's `packages/shared`. *machine check: a draft UI-canon amendment page exists in the `orvexstudioui` space; the ruling appears in the pack.* [Source: P1 `yXUWpQpRjx` §4 Wave 4]
- [ ] **Every surface wave carries its tests with it** — the "looks good AND works" bar (vitest + Playwright + axe + visual/screenshot sweep + dual-theme + design-token audit → human delight-check). *machine check: each surface-wave entry names its test tier + the delight-check gate.* [Source: P1 `yXUWpQpRjx` §3 artifact 3, §4 Wave 4]

**Phase-1 exit audit** *(must_carry #1 — the whole Factory)*

- [ ] **All 16 Service Definition Packs are certified + their contracts git-TAGGED** (contracts, lib, staging, workgraph, ai, api, knowledge, billing, identity, mcp, wiki, wiki-api, cli, console, ui, workflows) — each an adversarial-review PASS + a tag whose fixtures round-trip in contracts CI. *machine check: 16 `PACK-REVIEW: PASS` comments + `git tag -l` non-empty per service + contracts CI green on each tag commit.* [Source: P1 `yXUWpQpRjx` §9; Plan `5eFdxN3edd` Verification]
- [ ] **Every SDD is complete** — the total everything-eventually-needed service-level Done list per service, evidenceable, not the wave slice. *machine check: each SDD enumerates full API surface + events + entitlement/quota + cell-lint + observability/SLOs + all test tiers + runbook + family-E2E.* [Source: Plan `5eFdxN3edd` Phase-1 SDD ruling; cell contract `JGAUQRsw2g`]
- [ ] **The Go↔TS bridge is proven on one real seam** and TS clients generate for the TS satellites (api/mcp/ui) per ADR-0035. *machine check: the bridge-proof seam compiles a Go stub + a TS client + round-trips a fixture.* [Source: P1 `yXUWpQpRjx` §9; ADR-0035 `QbEBPuKcGR`]
- [ ] **The deferred ENG-2036 entitlement/cap contract shapes are landed** in the contracts pack, matching the ratified pricing. *machine check: entitlement/cap types appear in the tagged `orvex-studio-contracts` surface.* [Source: P1 `yXUWpQpRjx` §9; program-status §4]
- [ ] **The Staging + Workgraph epics/stories exist — from zero** — including the `workgraph → staging` promotion-edge contract and the Librarian/beads product epics. *machine check: ≥1 epic + child stories in each project, authored to the 9-section H1–H17 standard.* [Source: P1 `yXUWpQpRjx` §9; `9VUHxAcoXw` H17]
- [ ] **The pack drafts are visible in each service's own space** (slug = repo name without dashes; PO can spot-check any time) and the contract TAG stands as the hard Phase-2 dispatch gate. *machine check: `docmost-cli page get <slug> --no-daemon` returns status=draft pack pages per service.* [Source: P1 `yXUWpQpRjx` §9; Plan `5eFdxN3edd` Phase-1]
- [ ] **Linear epics/stories are authored to the full 9-section H1–H17 standard of `9VUHxAcoXw`, under the P1 milestones** — per-service P1 milestones created, or their creation escalated as the batched human dependency (Linear-MCP-only). *machine check: each service's epics/stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") and hang under a P1 milestone.* [Source: P1 `yXUWpQpRjx` §5, §9]

**Scope boundary — read before ticking exit** *(must_carry #2)*

- [ ] **Phase-1 exit does NOT include the six-surface acceptance baseline going green.** Phase 1 is definition-only; it builds/fixes nothing, so it leaves the baseline exactly as Phase 0 filed it. Acceptance ground truth at filing (po-decisions Phase-4 walk, 2026-07-14 evening, prod spine): 6/8 PASS — api, knowledge-sync, mcp, cross-cutting (live 402), web, identity; residuals rag (blocked: prod query image behind dev), ai (token threading), cli (dfm format rejection). The 2026-07-14 morning dev-cell re-baseline (ENG-2039..2054) remains the filed defect ledger. Converting it to green is **Phase-0 stabilization** — a separate predecessor running *concurrently* — not an exit box here. **Phase-2 entry verifies BOTH independently** (the green baseline from Phase 0 *and* this phase's certification/tags); satisfying every box above does not on its own satisfy Phase-2 entry. *machine check: this gate's boxes reference only pack/tag/SDD/UI artifacts — none assert the acceptance verdict.* [Source: P1 `yXUWpQpRjx` §9 scope boundary; program-status §1–§2]

**Exit action** *(must_carry #3)*

- [ ] **Launch the next phase's prompt** — "Orchestrator Prompt — Phase 2: Isolated Builds & Continuous Proving" (`Ng66su4dVG`) in a fresh session, under the contract-first dispatch rule (a story is frontier-eligible only if its service's contract tag ≥ the tag its pack names). Do this ONLY when every box above is genuinely green. *machine check: a PROGRESS comment on this gate records the Phase-2 prompt (`Ng66su4dVG`) launched in a fresh session, posted only after every box above is ticked.* [Source: P1 `yXUWpQpRjx` §9 exit action; must_carry #3]

*All five artifacts of the UI pack (PRD-delta, frozen/tagged contract, test plan, SDD, per-agent build prompt) are verified inside `pack-ui`; this gate asserts only its certification and the whole-Factory exit audit, not per-pack content.* [Source: P1 `yXUWpQpRjx` §3]

## 🔗 Dependencies

- **Project:** Orvex Studio — Delivery Gates · **Milestone:** P1 — Definition Factory (already exists on the Delivery Gates hub). [Plan `5eFdxN3edd` Tracking]
- **Blocked by:** `wave3-gate` (the eleven drained-service delta-packs must certify first) · `pack-ui` (the UI surface-wave pack this gate audits). *(ENG ids wired at filing.)*
- **Blocks:** nothing inside Phase 1 — this is the terminal gate. Its close authorises the Phase-2 prompt (`Ng66su4dVG`); Phase 2 is a *separate phase*, not a Linear `blocks` edge.
- **Deferred, named owners:** per-service P1 milestone creation is a **human dependency** (Linear-MCP-only; the CLI/adapter path cannot create milestones) — batch + escalate to the operator, do NOT block on it. Phase-0 stabilization (ENG-2033 sign-off, ENG-2039/2040 close, ENG-2034 ratchet) is owned by the concurrent Phase-0 lane, verified independently at Phase-2 entry. Story-level build issues are born FROM the packs in Phase 2, not here. [P1 `yXUWpQpRjx` §5, §8, §9]

## 📡 How to update Linear and behave

Writes go live through the `linearis` CLI via `lnr-tracking-adapter`; reads come from `.cache/linear/` — never the Linear MCP, never direct GraphQL. **CLAIM** (Todo→In Progress; post agent/model; claim arbiter per ADR-0033 `yNFx3YyNap`) · **PLAN** comment (the exit-audit order the gate will verify boxes in) · **PROGRESS** comments as the UI pack certifies and each exit-audit line is verified · **COMMITS** carry "Part of ENG-NNN" (links, never closes — Done is gate-owned) · **STAGE HANDOFF** author→review (pack author hands `pack-ui` to the adversarial reviewer; reviewer ≠ author) · **REVIEW** verdicts live on `pack-ui` as `PACK-REVIEW: PASS|REVISE` · **TICK** only genuinely-verified boxes (full-body read-modify-write; never blanket-tick) · **DONE:** only the delivery orchestrator advances this gate — the pack author cannot self-advance (fake-done gate `9VUHxAcoXw` §5e/H15). Judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority". Never fake-certify, never relax the review gate, never tag a contract whose fixtures do not round-trip. [P1 `yXUWpQpRjx` §5, §7, §8]
