**Wave-gate umbrella for the Definition Factory's Wave 2** — the two zero-ticket
services `orvex-studio-staging` + `orvex-studio-workgraph`, whose canon/contracts
landed 2026-07-12 but which carry **zero tickets today** (pre-definition, not
abandoned). Their epics AND stories are authored from scratch in this phase.

This issue does not author a pack itself; it is the deterministic gate that closes
only when **both** Wave-2 Service Definition Packs are certified (adversarial review
PASS, reviewer ≠ author) and their contracts are git-TAGGED in
`orvex-studio-contracts`, at which point Wave 3's eleven delta-packs are unblocked
and scoped. It mirrors ENG-2037 (the Wave-1 gate): a description plus a tickable
Definition-of-Done gate, nothing more. [P1 `yXUWpQpRjx` §4 Wave 2; Plan
`5eFdxN3edd` Phase-1]

**Why Wave 1 must land first.** The `workgraph → staging` promotion-edge is a
**new** cross-service CloudEvent contract, so it can only freeze against a tagged
`orvex-studio-contracts` (ENG-2037). [P1 `yXUWpQpRjx` §4 Wave 1→2; ADR-0008
change-authority]

**In scope of this gate (defined inside the two child packs, asserted here):**

- `orvex-studio-staging` — the Agent Staging Area + the **Librarian** product epic,
  superseding the OPS Librarian/Card Contract v1 and the BFF Curator; the hard-cut of
  agent write surfaces sequenced against the 501-dep circular gate. [Map
  current-state-map §2 Librarian loop, §5 P1-7]
- `orvex-studio-workgraph` — the multi-agent work-graph coordination kernel, plus the
  new `workgraph → staging` promotion-edge for the Librarian's beads fishing, plus the
  **beads** product epic from the brief. [Brief `rgBOQh31p3`; P1 `yXUWpQpRjx` §4]

## ✅ Definition of Done — the binary wave gate

Red on any box = Wave 2 NOT done, no override. The author of either pack CANNOT tick these; only the delivery orchestrator advances this gate through the deterministic check. [P1 `yXUWpQpRjx` §7 orchestrator-only advance; SE-Arch `8sYi523i4t` fake-done]

- [ ] **Both Wave-2 packs certified** — `pack-staging` and `pack-workgraph` each carry an adversarial pack-review verdict **PASS** (reviewer ≠ author) posted as a Linear comment + mirrored on the pack root wiki draft. *machine check: a comment containing `PACK-REVIEW: PASS` exists on each of the two pack issues.* [Source: P1 `yXUWpQpRjx` §4 stage gate; Plan `5eFdxN3edd` Phase-1 certification]
- [ ] **Both contracts landed + git-TAGGED** in `orvex-studio-contracts`; fixtures round-trip green in contracts CI; TS clients generated per ADR-0035 where a TS consumer exists. *machine check: `git tag -l` non-empty for each service's tag; contracts CI green on each tag commit.* [Source: P1 `yXUWpQpRjx` §4; ADR-0035 `QbEBPuKcGR`]
- [ ] **The staging + workgraph epics AND stories exist — from zero** — authored to the full 9-section H1–H17 tickable standard of `9VUHxAcoXw`, filed under the P1 milestone, project set at create time, `Todo` (never `Backlog`). *machine check: ≥1 epic + its child stories exist in the staging and workgraph projects, each body 9-section H1–H17.* [Source: P1 `yXUWpQpRjx` §5; Plan `5eFdxN3edd` Tracking; must_carry #2]
- [ ] **The `workgraph → staging` promotion-edge contract is authored** (the Librarian's beads-fishing seam) as a CloudEvent on the ADR-0007 envelope / ADR-0010 `studio.*` taxonomy, frozen in `orvex-studio-contracts`. *machine check: a promotion-edge event type appears in the tagged workgraph surface with a golden fixture.* [Source: P1 `yXUWpQpRjx` §4 Wave 2; Brief `rgBOQh31p3`]
- [ ] **The Librarian product epic** is authored under staging — superseding the OPS Librarian/Card Contract v1 and the BFF Curator — with the hard-cut of agent write surfaces sequenced against the 501-dep circular gate (flagged, not silently resolved). *machine check: a Librarian epic issue exists in the staging project with the epic title, carrying supersession links to the OPS Librarian/Card Contract v1 + the BFF Curator.* [Source: P1 `yXUWpQpRjx` §4 staging pack; Map current-state-map §2 Librarian loop, §5 P1-7]
- [ ] **The beads product epic** is authored under workgraph from the brief; the naming collision is recorded — *workgraph memory ≠ the Memory product.* *machine check: a beads epic issue exists in the workgraph project with the epic title, its body recording the workgraph-memory ≠ Memory-product collision.* [Source: P1 `yXUWpQpRjx` §4 workgraph pack; Map current-state-map §2]
- [ ] **Both SDDs are complete** — the total everything-eventually-needed service-level Done list per service, not the wave slice; wave scoping happens against it. *machine check: each SDD enumerates full API surface + events + entitlement/quota + cell-lint compliance + observability/SLOs + all test tiers + runbook + family-E2E.* [Source: Plan `5eFdxN3edd` Phase-1 SDD ruling; cell contract `JGAUQRsw2g`]
- [ ] **Wave 3 is unblocked and scoped** — with both packs certified + tagged, all wave-3 delta-packs have their concept-to-service seams confirmed and may dispatch. *machine check: this issue's `blocks` edges to the Wave-3 gate are cleared on close.* [Source: P1 `yXUWpQpRjx` §4 Wave 3; must_carry #1]

*All five artifacts of each pack (PRD-delta, frozen/tagged contract, test plan, SDD, per-agent build prompt) are verified inside the child pack issues; this gate asserts only their certification, not their content.* [Source: P1 `yXUWpQpRjx` §3]

## 🔗 Dependencies

- **Project:** Orvex Studio — Delivery Gates · **Milestone:** P1 — Definition Factory (already exists on the Delivery Gates hub). [Plan `5eFdxN3edd` Tracking]
- **Blocked by:** ENG-2037 (Wave-1 gate — contracts/lib seam + Go↔TS bridge proof must freeze first) · `pack-staging` · `pack-workgraph`. *(ENG ids wired at filing.)*
- **Blocks:** all Wave-3 delta-packs (the eleven drained services) — none may dispatch until this gate is green.
- **Deferred, named owners:** per-service P1 milestone creation for staging + workgraph is a **human dependency** (Linear-MCP-only; the CLI/adapter path cannot create milestones) — batch + escalate to the operator, do NOT block pack authoring on it. Story-level build issues are born FROM the two packs, not before them. [P1 `yXUWpQpRjx` §5, §8 Escalation]

## 📡 How to update Linear and behave

Writes go live through the `linearis` CLI via `lnr-tracking-adapter`; reads come from `.cache/linear/` — never the Linear MCP, never direct GraphQL. The full stage-by-stage protocol:
1. **CLAIM** — Todo→In Progress; post agent/model; claim arbiter per ADR-0033 `yNFx3YyNap`.
2. **PLAN** — post a plan comment naming the two child packs, the wiki space, and the gate check to be run.
3. **PROGRESS** — continuous comments as each child pack drafts/lands its artifacts and certifies; flag blockers.
4. **COMMITS** — every commit/PR body carries "Part of ENG-NNN" (links, never closes — Done is gate-owned).
5. **STAGE HANDOFF** — hand author→review; the certifying reviewer must be ≠ the pack author.
6. **REVIEW** — verdicts live on the child pack issues as `PACK-REVIEW: PASS|REVISE` + findings.
7. **TICK** — only genuinely-verified boxes (full-body read-modify-write; never blanket-tick).
8. **DONE** — only the delivery orchestrator advances this gate; the pack authors cannot self-advance (fake-done gate `9VUHxAcoXw` §5e/H15).
9. **ESCALATIONS** — judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority".
Never fake-certify, never relax the review gate, never tag a contract whose fixtures do not round-trip. [P1 `yXUWpQpRjx` §5, §7, §8]
