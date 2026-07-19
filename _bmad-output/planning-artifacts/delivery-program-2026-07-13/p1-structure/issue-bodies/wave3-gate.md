**Wave-gate umbrella for the Definition Factory's Wave 3** — the eleven **drained**
services `orvex-studio-ai`, `-api`, `-knowledge`, `-billing`, `-identity`, `-mcp`,
`-wiki`, `-wiki-api`, `-cli`, `-console`, `-workflows`. This wave folds the brief's
NEW product features (`rgBOQh31p3`) into each service as a reconciled **PRD-delta
pack**, distributed per the concept-to-service map — **not** by a forced 1:1. [P1
`yXUWpQpRjx` §4 Wave 3; Brief `rgBOQh31p3`; Map current-state-map §2]

This issue does not author a pack itself; it is the deterministic gate that closes
only when **all eleven** Wave-3 Service Definition Packs are certified (adversarial
review PASS, reviewer ≠ author) and their contracts are git-TAGGED in
`orvex-studio-contracts`, at which point Wave 4 (the UI surface-waves, `pack-ui`)
is unblocked. It mirrors ENG-2037 (the Wave-1 gate): a description plus a tickable
Definition-of-Done gate, nothing more. [P1 `yXUWpQpRjx` §4 Wave 3→4; Plan
`5eFdxN3edd` Phase-1]

**Why Wave 2 must land first.** Chat import, private memories, and the Librarian
preference system are **staging-anchored** and ride the `workgraph → staging`
promotion-edge frozen in Wave 2, so the delta-packs cannot freeze their consumer
surfaces until that seam is tagged. [P1 `yXUWpQpRjx` §4 Wave 2→3; ADR-0008
`QbEBPuKcGR` change-authority]

**Feature distribution across the eleven (defined inside the child packs, asserted here):**

- **Composer (teaching Prompt Composer) + task-first wizard** → primarily
  `orvex-studio-api` (BFF) + `orvex-studio-ai`; the surface itself is defined in Wave 4.
- **The Orvex rating** → `orvex-studio-ai` / `orvex-studio-knowledge` per the map.
- **Outbound sync (per-vendor caveats)** → `orvex-studio-knowledge` (the one
  retrieval/sync backbone).
- **Private memories + consent** → `orvex-studio-api` (`/v1/memory`, `studio.memory.*`)
  + `orvex-studio-knowledge` (corpus-isolation grade; OQ open).
- **Chat import** → `orvex-studio-api` (Curator `/v1/import`,
  `studio.conversation.imported`) with indexing in `orvex-studio-knowledge`.
- **Free-tier cost-doctrine model routing** → `orvex-studio-ai` (model-class
  allowlist; frontier paid-only) + `orvex-studio-billing` (the ratified ENG-2036 caps).

[Map current-state-map §2; program-status §4]

## ✅ Definition of Done — the binary wave gate

Red on any box = Wave 3 NOT done, no override. The author of any pack CANNOT tick these; only the delivery orchestrator advances this gate through the deterministic check. [P1 `yXUWpQpRjx` §7 orchestrator-only advance; SE-Arch `8sYi523i4t` fake-done]

- [ ] **All eleven Wave-3 delta-packs certified** — `pack-ai`, `pack-api`, `pack-knowledge`, `pack-billing`, `pack-identity`, `pack-mcp`, `pack-wiki`, `pack-wiki-api`, `pack-cli`, `pack-console`, `pack-workflows` each carry an adversarial pack-review verdict **PASS** (reviewer ≠ author) posted as a Linear comment + mirrored on the pack root wiki draft. *machine check: a comment containing `PACK-REVIEW: PASS` exists on each of the eleven pack issues.* [Source: P1 `yXUWpQpRjx` §4 stage gate; Plan `5eFdxN3edd` Phase-1 certification; must_carry #1]
- [ ] **All eleven contracts landed + git-TAGGED** in `orvex-studio-contracts`; fixtures round-trip green in contracts CI; TS clients generated per ADR-0035 where a TS consumer exists (api/mcp are TS satellites). *machine check: `git tag -l` non-empty for each of the eleven service tags; contracts CI green on each tag commit.* [Source: P1 `yXUWpQpRjx` §4; ADR-0035 `QbEBPuKcGR`; must_carry #1]
- [ ] **The map's contested seams are resolved OR review-flagged in every relevant pack — never silently chosen** — the four seams the map names: **Clerk-lifecycle identity-vs-workflows**, **memory ×3 homes**, **console un-chartered workflows-proxy**, and the **chat-import import-UX-vs-backbone** seam. *machine check: each named seam appears as a resolved decision or an open `must-resolve` review item in the owning pack's PRD-delta.* [Source: P1 `yXUWpQpRjx` §4 Wave 3; Map current-state-map §3 risk 9, §5 P1-6/P1-10; must_carry #2]
- [ ] **The deferred ENG-2036 entitlement/cap contract shapes are honored** — `pack-billing` and `pack-ai` freeze against the ratified free-tier cost-doctrine (frontier paid-only, zero-cost uncounted; ENG-2036 caps), carried from Wave 1, not re-derived. *machine check: the billing + ai delta-packs cite ENG-2036 caps and the contracts entitlement/cap shapes from the W1 contracts pack.* [Source: program-status §4; P1 `yXUWpQpRjx` §4 Wave 3 free-tier routing]
- [ ] **Every Wave-3 SDD is complete** — the total everything-eventually-needed service-level Done list per service (full API surface incl. later-wave features + events + entitlement/quota + cell-lint compliance + observability/SLOs + all test tiers + runbook + family-E2E), not the wave slice; wave scoping happens against it. *machine check: each of the eleven SDDs enumerates all eventual-need lines and each is evidenceable.* [Source: Plan `5eFdxN3edd` Phase-1 SDD ruling; cell contract `JGAUQRsw2g`]
- [ ] **Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT** (H1–H17 all "yes") on every one of the eleven packs; filed under the P1 milestone, project set at create time, `Todo` (never `Backlog`). *machine check: each pack's build-prompt stories body is 9-section H1–H17 tickable.* [Source: P1 `yXUWpQpRjx` §5; `9VUHxAcoXw` H17]
- [ ] **Wave 4 is unblocked and scoped** — with all eleven packs certified + tagged, `pack-ui` (the POC → target surface-waves) may dispatch; the Composer + task-first wizard surface is handed forward to Wave 4. *machine check: this issue's `blocks` edges to `pack-ui` + the Wave-4 gate are cleared on close.* [Source: P1 `yXUWpQpRjx` §4 Wave 4; must_carry #1]

*All five artifacts of each pack (PRD-delta, frozen/tagged contract, test plan, SDD, per-agent build prompt) are verified inside the child pack issues; this gate asserts only their certification, not their content.* [Source: P1 `yXUWpQpRjx` §3]

## 🔗 Dependencies

- **Project:** Orvex Studio — Delivery Gates · **Milestone:** P1 — Definition Factory (already exists on the Delivery Gates hub). [Plan `5eFdxN3edd` Tracking]
- **Blocked by:** `wave2-gate` (staging + workgraph must freeze first — the promotion-edge seam) · the eleven delta-packs `pack-ai`, `pack-api`, `pack-knowledge`, `pack-billing`, `pack-identity`, `pack-mcp`, `pack-wiki`, `pack-wiki-api`, `pack-cli`, `pack-console`, `pack-workflows`. *(ENG ids wired at filing.)*
- **Blocks:** `pack-ui` (Wave 4 UI surface-waves) · `wave4-gate` — neither may dispatch until this gate is green.
- **Deferred, named owners:** per-service P1 milestone creation for the eleven services is a **human dependency** (Linear-MCP-only; the CLI/adapter path cannot create milestones) — batch + escalate to the operator, do NOT block pack authoring on it. Story-level build issues are born FROM the delta-packs, not before them. [P1 `yXUWpQpRjx` §5, §8 Escalation]

## 📡 How to update Linear and behave

Writes go live through the `linearis` CLI via `lnr-tracking-adapter`; reads come from `.cache/linear/` — never the Linear MCP, never direct GraphQL. **CLAIM** (Todo→In Progress; post agent/model; claim arbiter per ADR-0033 `yNFx3YyNap`) · **PROGRESS** comments as each child pack certifies · **COMMITS** carry "Part of ENG-NNN" (links, never closes — Done is gate-owned) · **REVIEW** verdicts live on the child pack issues as `PACK-REVIEW: PASS|REVISE` (REVISE bounces to a fix pass, never overridden) · **TICK** only genuinely-verified boxes (full-body read-modify-write; never blanket-tick) · **DONE:** only the delivery orchestrator advances this gate — the pack authors cannot self-advance (fake-done gate `9VUHxAcoXw` §5e/H15). Judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority". Never fake-certify, never relax the review gate, never tag a contract whose fixtures do not round-trip. [P1 `yXUWpQpRjx` §5, §7, §8]
