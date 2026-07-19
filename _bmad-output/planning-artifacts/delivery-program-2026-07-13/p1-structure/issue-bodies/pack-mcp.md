## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Service Definition Pack for `orvex-studio-mcp` so that build stories dispatch only against a frozen, reviewed contract and never re-derive one architecture decision. This is a **Wave-3 delta-pack**: `orvex-studio-mcp` is the family's one deliberate **TypeScript satellite** — a thin, stateless MCP protocol gateway that *consumes* contracts (it publishes no OpenAPI of its own) and must therefore consume the **ADR-0035 generated TS clients** rather than Go stubs. [Source: P1 yXUWpQpRjx §3; ADR-0035 QbEBPuKcGR; Map orvexstudiomcp §1]

**Definition of Done — the binary gate** (red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [Source: P1 yXUWpQpRjx §4; SE-Arch 8sYi523i4t]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI; **TS clients generated per ADR-0035** for this TS consumer — *machine check: `git tag -l` non-empty for this service's tag; contracts CI green on the tag commit; TS client artifact present* [Source: ADR-0035 QbEBPuKcGR; P1 yXUWpQpRjx §3]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudiomcp` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [Source: P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body carries the self-audit block, all rows "yes"* [Source: Issue Authoring 9VUHxAcoXw H1–H17]
- [ ] SDD is complete against the concept-to-service map — every eventual-need line present + evidenceable, not the wave slice — *machine check: SDD covers full ~19-tool surface + `studio_*` + all three upstreams + cell-lint + SLOs* [Source: P1 yXUWpQpRjx §3 SDD ruling; Map orvexstudiomcp §4]

The pack leaves the BUILD agent **zero architecture decisions** — resolving them *is* what this pack is for.

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the umbrella brief and the concept-to-service map, When the PRD-delta is authored, Then every FR/NFR the brief folds into MCP is cited and reconciled against the **canonical post-split PRD** (ratified 2026-07-06), with the live repo winning over stale space canon. *Assertion: each delta line carries a `[Brief …]` or `[Map …]` cite; zero uncited additions.* [Source: Brief rgBOQh31p3; Map orvexstudiomcp §3; P1 yXUWpQpRjx §3]
- [ ] **AC2 (consumed contract, ADR-0035)** — Given MCP holds no OpenAPI of its own, When the contract artifact is frozen, Then it pins MCP's **consumed** surface (wiki verbs via `orvex-wiki-api`, ask/chat via `orvex-studio-ai`, token-verify via `orvex-studio-identity`) as a tag in `orvex-studio-contracts` emitting **TS clients** per ADR-0035, scheme per the W1 contracts pack. *Assertion: tag exists; TS client generates + compiles; fixture round-trips in CI.* [Source: ADR-0035 QbEBPuKcGR; Map orvexstudiomcp §1,§4]
- [ ] **AC3 (D2/ENG-2041 shapes)** — Given the open defect D2/ENG-2041 (save/edit **silent no-op** `persisted:false` + CAS `serverVersion:0`), When the contract shapes save/edit responses, Then a persisted write MUST return `persisted:true` + a monotonic non-zero `serverVersion`, and CAS `ifVersion` mismatch MUST surface `409 VERSION_MISMATCH` — never a silent success. *Assertion: golden fixture asserts `persisted:true` + `serverVersion>0` on write, `409` on stale `ifVersion`.* [Source: program-status §2; Map orvexstudiomcp §4]
- [ ] **AC4 (cluster-local URL leak)** — Given the D2/ENG-2041 companion defect (cluster-local upstream URL leaking to clients), When error/response envelopes are specified, Then no internal cluster host may appear in any client-facing field. *Assertion: fixture scans response bodies; zero `.svc`/cluster-local hosts present.* [Source: program-status §2]
- [ ] **AC5 (SDD honest baseline)** — Given the six-surface verdict is **FAIL** for mcp, When the SDD is written, Then it is written against that FAIL baseline (not the "94% Done" tracking optimism) and enumerates every eventual need incl. the R2 `/v1` regeneration retiring live-descriptor codegen. *Assertion: SDD cites the FAIL verdict + lists the R2 contract-freeze regeneration (FR-C19).* [Source: program-status §2; Map orvexstudiomcp §4]
- [ ] **AC6 (test plan)** — Given CS §5 tiers, When the test plan is authored, Then it splits unit / store(n-a) / contract (fixture round-trip) / crew-slot / family-E2E and **commits the golden-tape KPI fixtures** (≤2 calls / ≤~1k tokens, NFR-M6) rather than running against live dev Docmost backstage. *Assertion: plan names committed golden-tape fixtures as the parity detector, live-backstage listed as retired tech debt.* [Source: CS §5; Map orvexstudiomcp §4]
- [ ] **AC7 (`studio_*` seam must-resolve)** — Given OD-4/OQ-M1 leaves the `studio_*` tool seam-home unpinned and contracts-invisible (cutover-blocking, NFR-C4), When the pack freezes, Then the seam is pinned/re-homed/cut as a review must-resolve item — never silently chosen. *Assertion: pack review comment records the `studio_*` disposition; contract reflects it.* [Source: Map orvexstudiomcp §3,§6; SE-Arch 8sYi523i4t]
- [ ] **AC8 (negative — REVISE bounces)** — Given a review verdict of **REVISE**, When it is posted, Then it routes to a fix pass and is never overridden by the author; a `PACK-REVIEW: PASS` may only follow an independent re-review. *Assertion: no PASS comment precedes a REVISE on the same issue without an intervening reviewer≠author comment.* [Source: P1 yXUWpQpRjx §7; SE-Arch 8sYi523i4t]
- [ ] **AC9 (negative — untagged blocks dispatch)** — Given no git tag on MCP's consumed-contract slice, When Phase-2 attempts dispatch, Then dispatch is refused. *Assertion: `git tag -l` empty ⇒ pack uncertified, no build story frontier-eligible.* [Source: P1 yXUWpQpRjx §3 tag-is-authorization]
- [ ] **AC10 (forward-compat)** — Given a later wave adds MCP tools or repoints `ask` to ai (D-M7/OD-5), When the future change lands, Then it MUST be additive under ADR-0008's automated lane; any envelope reshape requires a new ADR + human ratify and MUST NOT break the frozen fixtures. *Assertion: forward-compat note pins ADR-0008 change-authority; existing fixtures unchanged by additive tools.* [Source: ADR-0008; program-status §4]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, map `current-state-map §2`, evidence `orvexstudiomcp.md`, ADR-0035 `QbEBPuKcGR`, cell contract `JGAUQRsw2g`, CS `6aMAzsYeQb` (AC: 1,2,6)
- [ ] Draft **PRD-delta** in space `orvexstudiomcp` → page "PRD-delta: orvex-studio-mcp (Wave-3)", reconciled against the canonical post-split PRD (live repo wins) (AC: 1,5)
- [ ] Resolve-or-flag contested seams: `studio_*` seam-home (OD-4), `ask`→ai sequencing (OD-5), flat-host vs per-cell `/mcp` (OD-2) — each a review must-resolve item, not a silent choice (AC: 7)
- [ ] Author the **consumed-contract** slice + golden fixtures in `orvex-studio-contracts` (save/edit `persisted`/`serverVersion` shapes, CAS `409`, no cluster-local host) (AC: 2,3,4)
- [ ] Land + **git-TAG** in `orvex-studio-contracts`; verify TS clients generate per ADR-0035 + fixtures round-trip in CI (AC: 2,3)
- [ ] Author **test plan** page (CS §5 tiers + committed golden-tape KPI fixtures) (AC: 6)
- [ ] Author **SDD** page — full ~19-tool + `studio_*` surface, three upstreams, revocation-consumer liveness SLI, cell-lint, SLOs, R2 `/v1` regeneration — against the FAIL baseline (AC: 5)
- [ ] Author **per-agent build prompt** with its stories to the 9-section H1–H17 standard of `9VUHxAcoXw` (AC: 1–10)
- [ ] Request adversarial review (reviewer ≠ author); on REVISE run a fix pass; tick boxes only when genuinely verified; hand to orchestrator (AC: 8)

## 4. 🧠 Dev Context

**Inputs**

| Canon page / slug | What it feeds this pack |
|---|---|
| Brief `rgBOQh31p3` | new features folded into the MCP PRD-delta |
| Map `current-state-map §2` | concept-to-service assignment + contested seams |
| Evidence `orvexstudiomcp.md` | shipped ~19-tool surface, three upstreams, OD-2..OD-7, defects |
| ADR-0035 `QbEBPuKcGR` | TS-client codegen for this TS satellite |
| ADR-0008 | contract change-authority (additive lane vs ADR-gated reshape) |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint compliance declaration |
| program-status §2 | six-surface FAIL verdict + D2/ENG-2041 defect shapes |

**Space slug:** `orvexstudiomcp`. **Evidence:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudiomcp.md`. **Live-repo-wins:** the deployed `orvex-studio-mcp` (real code on `dev-mcp.studio.orvex.ai`, Phases 0–3 shipped) + the migration assessment outrank stale space canon; the code is **pre-repoint** (single `DOCMOST_BASE_URL`, engine-descriptor codegen) — reconcile against the repoint target, not the current bytes. [Source: Map orvexstudiomcp §5]

**Contested seams — must resolve or flag (each surfaced to review):**

- [ ] `studio_*` tool seam-home (OD-4/OQ-M1) — unpinned, contracts-invisible, cutover-blocking (NFR-C4) [Source: Map orvexstudiomcp §3,§6]
- [ ] `ask` final upstream = ai (D-M7 resolved) but sequencing queues behind ai shipping (OD-5) — pin the facade contract meanwhile [Source: Map orvexstudiomcp §3]
- [ ] Flat-host `mcp.orvex.ai` vs per-cell `/mcp` routing (OD-2) — no cell-proxy mechanism described [Source: Map orvexstudiomcp §3]

**❌ Classic-mistakes (CS §0) — all 12 assessed:**

| ❌# | Canonical name | Assessment for THIS pack |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only; the row binds the build-prompt stories this pack authors (MCP protocol handlers keep upstream-call orchestration out of the controller). |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — MCP is a stateless gateway with no store tier / Repository seam; the row binds no artifact this pack freezes. |
| ❌#3 | Premature interface / seam | **APPLICABLE** — binds the port/seam choices the pack pins: the three upstream ports (wiki-api/ai/identity) are network seams (ports justified), while the in-process `studio_*` seam-home must be pinned/re-homed/cut (AC7), not prematurely interfaced. |
| ❌#4 | Mocking own packages | NOT APPLICABLE — definition-only; the row binds the test plan the build-prompt stories author (upstreams are process-boundary fakes, not mocked own-packages). |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — definition-only; the vertical RED→GREEN rule binds the build-prompt stories this pack authors, not the pack itself. |
| ❌#6 | Big-upfront struct / schema | **APPLICABLE** — binds the contract/schema shapes this pack freezes: only the fields the Issue needs (save/edit `persisted`/`serverVersion`, CAS `409` — AC2/AC3), no speculative envelope. |
| ❌#7 | Shallow pass-through package | **APPLICABLE** — the "thin gateway" claim must clear the deletion test: the SDD must show MCP earns its keep as MCP-protocol↔upstream translation, not a pass-through forwarder. |
| ❌#8 | Inline credentialed/IO client | **APPLICABLE** — binds the seam the pack pins: the three upstream clients are configured/injected at the seam with credentials via env only (single repointed `DOCMOST_BASE_URL`), never inlined or cluster-host-baked. |
| ❌#9 | Time/randomness in the projection layer | NOT APPLICABLE — MCP is a stateless gateway with no projection/event layer; the row binds no artifact this pack freezes. |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | **APPLICABLE** — binds the golden-tape KPI ceiling (≤2 calls / ≤~1k tokens, NFR-M6): a human-ratified ceiling that CI may not raise to go green; any change needs an ADR + sign-off. |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; the row binds the build-prompt stories this pack authors (MCP protocol handlers hold routing + marshalling only). |
| ❌#12 | any / interface{} type-laundering across boundaries | **APPLICABLE** — this TS satellite must use concrete typed structs across exported surfaces; `unknown` is the sanctioned TS scaffold placeholder (never `any`), and RATIFY/CONFIRM tokens stay typed-opaque. |

**SE-Arch lenses (`8sYi523i4t`, all 5):** *Reliability* — CAS + `persisted` shapes remove the silent-no-op failure mode. *Security* — identity is sole auth authority; tokens opaque; no cluster-host leak. *Cost governance* — golden-tape ≤~1k-token ceiling pins per-task cost. *Operational excellence* — revocation-consumer lag SLI + cell contract (`CELL_ID`, `/healthz` echo, `orvexcell` fail-closed). *Performance-freshness* — ≤2-call parity budget is the regression detector. **ADR triggers expected:** a mini-ADR for the `studio_*` seam-home if review demands, and the TS-tier model (proposed ADR-0004) if the "thin" claim needs a canon-backed tier.

## 5. 🧪 Verification

- [ ] Adversarial review returns `PACK-REVIEW: PASS` (reviewer ≠ author) [Source: SE-Arch 8sYi523i4t]
- [ ] Consumed-contract tag EXISTS in `orvex-studio-contracts`; fixtures round-trip green in contracts CI; TS client generates + compiles [Source: ADR-0035 QbEBPuKcGR]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` H1–H17 FINAL SELF-AUDIT [Source: Issue Authoring 9VUHxAcoXw]
- [ ] SDD completeness checked against the concept-to-service map (full surface, three upstreams, cell-lint, SLOs, R2 regeneration) [Source: Map orvexstudiomcp §4]
- [ ] Golden fixtures assert `persisted:true`+`serverVersion>0`, `409` on stale `ifVersion`, and zero cluster-local hosts [Source: program-status §2]

**What NOT to fake:** no self-review (reviewer ≠ author, non-overridable); no claimed-but-unverified tag (a claimed tag is not a tag — verify it exists + round-trips); no SDD trimmed to the Wave-3 slice; no invented NFR numbers (the golden-tape ceiling is NFR-M6, everything else is `TBD — defined by the W1 contracts pack`).

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌ above), §3 (deep-module + design-it-twice on the `studio_*` seam), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories bind the test plan; upstreams are process-boundary fakes), §6 (tier placement — MCP is a thin gateway tier, no store tier), §7 (seam map — this pack pins the wiki-api/ai/identity seams MCP consumes), §8 (the 2827-line `tools.ts` God-file), §10, §11, §12 (wiki-first; the pinned contract is contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules — declared, currently unhonored in deployed manifests, load-bearing before a second cell). **NO-MONGO override (D-S12):** event/revocation data = Postgres append/outbox + identity's transactional-outbox relay (D-S13) — strike any Mongo/Redis-bridge wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` — Phase 1 Definition Factory; Wave 3 delta-packs
- P1 orchestrator `yXUWpQpRjx` — §3 five artifacts; stage gate; Wave-3 content
- Umbrella brief `rgBOQh31p3` — features folded into the MCP PRD-delta
- Coding Standards `6aMAzsYeQb` — §0/§3/§4/§5/§6/§7/§8/§10/§11/§12/§13
- SE-Arch review `8sYi523i4t` — 5 lenses + fake-done gates
- Issue Authoring `9VUHxAcoXw` — H1–H17 standard for the build-prompt stories
- ADR-0035 `QbEBPuKcGR` — Go↔TS bridge / TS-client codegen · ADR-0008 change-authority
- Cell + tenancy contract `JGAUQRsw2g` — 14-rule cell-lint
- Evidence `orvexstudiomcp.md`; map `current-state-map §2`; `program-status-2026-07-14 §2` (mcp FAIL, D2/ENG-2041)

## 8. 🔗 Dependencies

- **Project:** Orvex Studio MCP · **Milestone:** P1 — Definition Factory (per-service P1 milestone `TBD — created by orchestrator via Linear MCP, batched human dependency`)
- **Blocked by:** `wave2-gate` (Wave-2 staging + workgraph packs certified before Wave-3 delta-packs open) — ENG id wired at filing
- **Blocks:** `wave3-gate` (this delta-pack must certify before the Wave-3 gate closes) — ENG id wired at filing
- **Deferred (born FROM this pack, not before it):** the MCP build/test stories (Phase 2, per the build prompt); the R1 three-repo E2E + R2 `/v1` contract-freeze regeneration (`TBD — owned by the Phase-2 MCP build wave`); the `studio_*` seam mini-ADR (`TBD — filed by this pack's review if demanded`).

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — move Todo→In Progress; post the agent + model; resolve concurrent claims via the ADR-0033 claim arbiter (`yNFx3YyNap`).
2. **PLAN** — post a plan comment naming the five artifacts + the target `orvexstudiomcp` pages and `orvex-studio-contracts` paths.
3. **PROGRESS** — continuous comments as each artifact is drafted/landed; blockers surfaced immediately.
4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes); one PR per touched repo, the per-repo PR gate is merge authority.
5. **STAGE HANDOFF** — author → review.
6. **REVIEW** — reviewer (≠ author) posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden.
7. **TICK** — tick boxes only when genuinely verified (full-body read-modify-write; preserve every other byte).
8. **DONE** — ONLY the delivery orchestrator advances to Done through the deterministic gate; the author CANNOT self-advance (fake-done gate).
9. **ESCALATIONS** — as comments; judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP.
