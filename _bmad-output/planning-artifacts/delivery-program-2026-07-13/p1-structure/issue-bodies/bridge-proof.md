## 1. 🎯 Issue

As the Phase-2 build orchestrator I want the ADR-0035 Go↔TS contract/client bridge **proven on ONE real seam** — a single frozen contract compiled to a generated Go stub *and* a generated TS client, with one golden fixture round-tripping through both — so that every downstream service pack can freeze a contract knowing the bridge it depends on actually works, before the family bets on it. This is a **bridge proof**, not a five-artifact Service Definition Pack: its deliverable is a working, CI-green round-trip on the tagged commit plus a short proof write-up draft — not a PRD/SDD/test-plan set. Adapted per the authoring brief's bridge-unit trim.

**Definition of Done — the binary gate** (bridge-adapted; red on any = NOT done, no override):

- [ ] Adversarial bridge review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the proof's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [SE-Arch 8sYi523i4t §Done-gates]
- [ ] The chosen seam's contract → **generated Go stub** (`orvex-studio-lib` `gen/`) **and generated TS client** BOTH compile — *machine check: `go build ./...` in orvex-studio-lib and `tsc --noEmit` on the generated TS client both exit 0* [ADR-0035 QbEBPuKcGR]
- [ ] One golden fixture **round-trips through BOTH generated sides** (decode→re-encode byte/semantic-equal on each) — *machine check: the round-trip test asserts fixture-in == fixture-out on both stubs and passes* [P1 yXUWpQpRjx W1]
- [ ] The round-trip runs **green in contracts CI on the git-TAGGED commit** — *machine check: `git tag -l` non-empty at the proof commit AND the contracts CI run on that tag SHA is green* [P1 yXUWpQpRjx §4 stage-gate]
- [ ] The seam choice + design-it-twice note (if the seam is new) is recorded as a visible wiki draft in space `orvexstudiocontracts` — *machine check: `docmost-cli page get <slug> --no-daemon` returns a status=draft page* [CS §3.7]

---

## 2. ✅ Acceptance Criteria

- [ ] **AC1** — Given a contract already frozen by the Wave-1 `orvex-studio-contracts` pack, When the bridge author picks exactly ONE real seam to exercise, Then the seam and its rationale are recorded, and if the seam is new a design-it-twice note is attached. *Assertion: the proof draft names one seam + its contract file path; design-it-twice note present iff seam is new.* [Source: CS §3.7; P1 yXUWpQpRjx W1]
- [ ] **AC2** — Given the chosen seam's OpenAPI/CloudEvents schema, When the `orvex-studio-lib` `gen/` codegen toolchain runs, Then a Go stub is generated and `go build ./...` succeeds. *Assertion: generated Go stub committed under `gen/`; `go build ./...` exits 0.* [Source: ADR-0035 QbEBPuKcGR; Map current-state-map §5 P0-5]
- [ ] **AC3** — Given the same seam, When the tag pipeline emits the TS client per ADR-0035, Then `tsc --noEmit` on the generated TS client succeeds. *Assertion: generated TS client present; `tsc --noEmit` exits 0.* [Source: ADR-0035 QbEBPuKcGR]
- [ ] **AC4** — Given one golden fixture for the seam, When it is decoded and re-encoded through the generated Go stub, Then output equals input. *Assertion: Go round-trip test asserts fixture-in == fixture-out and passes.* [Source: P1 yXUWpQpRjx §4]
- [ ] **AC5** — Given the same golden fixture, When it is decoded and re-encoded through the generated TS client, Then output equals input. *Assertion: TS round-trip test asserts fixture-in == fixture-out and passes.* [Source: P1 yXUWpQpRjx §4]
- [ ] **AC6** — Given the round-trip suite, When it runs in the contracts CI on the tagged commit, Then it is green. *Assertion: contracts CI run on the tag SHA reports success for the round-trip job.* [Source: P1 yXUWpQpRjx §4 stage-gate; must_carry binary gate]
- [ ] **AC7** (negative) — Given a bridge review verdict of `PACK-REVIEW: REVISE`, When findings are posted, Then the proof bounces to a fix pass and CANNOT be advanced to Done by the author. *Assertion: no Done transition exists while the latest review comment is REVISE; author is not the advancing actor.* [Source: P1 yXUWpQpRjx §9; SE-Arch 8sYi523i4t]
- [ ] **AC8** (negative) — Given a claimed-but-nonexistent tag, When Phase-2 dispatch checks the proof, Then the gate blocks. *Assertion: `git tag -l` empty ⇒ ENG-2037 stays blocked; a claimed tag without a matching ref does not satisfy AC6.* [Source: P1 yXUWpQpRjx §7 fake-done]
- [ ] **AC9** (forward-compat) — Given a future contracts tag that reshapes this seam, When it lands, Then it MUST keep the proven round-trip green or gate through ADR-0008 breaking-change authority. *Assertion: contracts CI re-runs this round-trip on every subsequent tag; a red round-trip blocks the tag.* [Source: ADR-0008 change-authority; P1 yXUWpQpRjx W1]

---

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: ADR-0035 `QbEBPuKcGR`, CS §3/§4/§5, contracts + lib evidence digests, current-state-map §5 P0-5 (AC: 1)
- [ ] Confirm both prerequisite packs are certified + tagged (contracts pack froze a seam; lib pack defined the `gen/` layout) before starting (AC: 2,3)
- [ ] Pick ONE real seam from the frozen contracts surface; record choice + design-it-twice note in the proof draft — target space `orvexstudiocontracts`, page slug **TBD — defined by bridge author** (AC: 1)
- [ ] Generate the Go stub via `orvex-studio-lib` `gen/`; commit under `gen/`; `go build ./...` — repo path `orvex-studio-lib/gen/` (AC: 2)
- [ ] Generate the TS client via the contracts tag pipeline; `tsc --noEmit` — repo path `orvex-studio-contracts/clients/ts/` (AC: 3)
- [ ] Author one golden fixture (or reuse the seam's existing golden fixture) — repo path `orvex-studio-contracts/fixtures/` (AC: 4,5)
- [ ] Write the Go round-trip test + the TS round-trip test; wire both into contracts CI (AC: 4,5,6)
- [ ] Cut the tag on the proof commit; confirm contracts CI green on the tag SHA (AC: 6)
- [ ] Land the proof write-up as a wiki draft in `orvexstudiocontracts` (seam, method, evidence links) (AC: 1)
- [ ] Request adversarial bridge review (reviewer ≠ author); fix pass if REVISE (AC: 7)
- [ ] Tick only genuinely-verified boxes; hand to the delivery orchestrator for the Done advance (AC: 8)

---

## 4. 🧠 Dev Context

**Inputs**

| Canon | Feeds |
| --- | --- |
| ADR-0035 `QbEBPuKcGR` | the Go-stub + TS-client generation contract this proof exercises |
| P1 prompt `yXUWpQpRjx` W1 | the bridge-proof scope + stage-gate |
| CS `6aMAzsYeQb` §3.7 | design-it-twice on the seam if new |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint the touched repos declare against |
| Evidence `orvexstudiocontracts.md` §4/§5 | real seams (write-receipt, k5-cited-answer, org-move-manifest); `gen/` + tag/CI gaps to close |
| Map current-state-map §5 P0-5 | the "bridge unproven" open item this closes |

- Wiki space: **`orvexstudiocontracts`** (the proof write-up lands here as a draft). Per-space evidence: `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudiocontracts.md`.
- **Live-repo-wins reconciliation:** both `orvex-studio-contracts` and `orvex-studio-lib` repos + the migration assessment outrank the spaces' stale "~90% unbuilt" canon; the proof reconciles against the deployed artifact. [Map reconciliation note]

**Contested seams this proof MUST resolve or flag**

- [ ] Which single seam to prove — **TBD — defined by bridge author**; candidate real schemas are `write-receipt {url,id,version,persisted}`, `k5-cited-answer`, `org-move-manifest` (evidence §4). Note the one real event payload schema was missing the load-bearing `version` field — if an event seam is chosen, `version` must be present. [evidence §3/§6]

**❌ classic-mistakes (CS §0)**

| # | Canonical name | Assessment |
| --- | --- | --- |
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — this proof authors no handler/cmd; the row binds the build-prompt stories each Wave-3 service pack authors, not a codegen round-trip proof |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — no store access anywhere in a codegen bridge proof; the row binds the build stories that touch the Repository seam, not this proof |
| ❌#3 | Premature interface / seam | APPLICABLE — the seam choice IS the deliverable; a port is justified only at the ONE network seam this proof pins, and if that seam is new the design-it-twice note guards it (CS §3.7) |
| ❌#4 | Mocking own packages | APPLICABLE — the round-trip test this proof authors exercises the REAL generated Go stub + TS client with a real golden fixture; no mock stands in for a package we own in the wire path |
| ❌#5 | Horizontal slicing (all tests, then all code) | APPLICABLE — the round-trip test is a vertical RED→GREEN tracer bullet (written to fail first, then made green), not an all-tests-then-all-code pass |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — the proof is scoped to ONE seam's contract/schema shape, only the fields that seam needs — not the whole frozen surface |
| ❌#7 | Shallow pass-through package | NOT APPLICABLE — no package is hand-authored here; the `gen/` stub is codegen output, not a hand-written wrapper that would fail the deletion test (CS §3.1) |
| ❌#8 | Inline credentialed/IO client | NOT APPLICABLE — codegen + fixture round-trip only; no credentialed or IO client is instantiated (the generated client's seam-injected config + env credentials are the lib pack's concern) |
| ❌#9 | Time/randomness in the projection layer | APPLICABLE — the fixture round-trip must be deterministic for byte/semantic-equal to hold; no wall-clock or randomness may enter the decode→re-encode path, and any timestamps ride the event payload |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | NOT APPLICABLE — no entitlement/cap/ceiling shapes in a codegen proof (they live in the billing/contracts packs); a future reshape routes through ADR-0008 authority, never a ceiling bump |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — this proof authors no cmd/ or handler files; the row binds the build-prompt stories the service packs author, not a bridge proof |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — the generated Go stub + TS client must carry concrete typed structs across the wire boundary; `unknown` is the only sanctioned TS placeholder, `any`/`interface{}` laundering is banned across the exported surface |

**SE-Arch lenses (`8sYi523i4t`)**

- Reliability — the round-trip is deterministic + CI-gated; a red round-trip blocks the tag.
- Security — codegen only; no new external dependency, no credential surface (auth verifier is the lib pack's concern).
- Cost governance — NOT APPLICABLE (no spend path); noted, not faked.
- Operational excellence — the tag + CI green is the observable, un-fakeable evidence.
- Performance/freshness — forward-compat AC9 keeps the seam green across future tags.
- **ADR triggers this proof may fire:** a new codegen toolchain seam (→ mini-ADR only if review demands, per lib pack); no topic-schema or ceiling change expected.

---

## 5. 🧪 Verification

- [ ] Adversarial bridge review returns `PACK-REVIEW: PASS` (reviewer ≠ author).
- [ ] Generated Go stub compiles (`go build ./...` exit 0).
- [ ] Generated TS client compiles (`tsc --noEmit` exit 0).
- [ ] Golden fixture round-trips green through BOTH sides.
- [ ] Contract git tag exists AND contracts CI is green on the tag SHA.
- [ ] Proof write-up visible as a draft in `orvexstudiocontracts`.

**What NOT to fake** (not boxes):

- No self-review — the author cannot be the reviewer.
- No claimed-but-unverified tag — a tag name without a matching `git tag -l` ref is not a tag.
- No round-trip declared green from the cache — the reviewer live-reads CI on the tag SHA.
- No invented seam or fixture — the fixture is a real golden fixture for the chosen real seam.

---

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §3 (deep-module + design-it-twice on the seam), §4 (TDD — the round-trip test is written to fail first), §5 (mocking categories — the fixture round-trip is the contract-test tier, no mocks in the wire path), §7 (seam map — name the one seam this proof pins), §12 (wiki-first; the pinned contract is contract-shape law). SE-Arch `8sYi523i4t`: all 5 lenses + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules) — both touched repos declare compliance. **NO-MONGO override (D-S12):** if an event seam is chosen, its data path is the Postgres append/outbox model, never Mongo; strike any Mongo wording.

---

## 7. 🔗 References

- Program plan `5eFdxN3edd` (Phase 1 = Definition Factory; Wave 1)
- P1 orchestrator `yXUWpQpRjx` §3–§4 (pack artifacts, stage-gate), W1 (bridge proof-on-one-seam)
- ADR-0035 `QbEBPuKcGR` (Go↔TS contract/client bridge)
- ADR-0008 (contracts change-authority)
- CS `6aMAzsYeQb` §0/§3/§4/§5/§7/§12 · SE-Arch `8sYi523i4t` (5 lenses + Done gates)
- Cell + tenancy contract `JGAUQRsw2g` (14-rule cell-lint)
- Evidence: `evidence/orvexstudiocontracts.md` §3/§4/§5/§6; `evidence/current-state-map.md` §5 P0-5

---

## 8. 🔗 Dependencies

- **Project:** Orvex Studio — Delivery Gates · **Milestone:** P1 — Definition Factory
- **Repos:** `orvex-studio-contracts` + `orvex-studio-lib` (one PR per touched repo; each repo's PR gate is the merge authority)
- **Blocked by:** `pack-contracts` (the frozen seam + first tag) · `pack-lib` (the `gen/` codegen layout + toolchain) — ENG ids wired at filing
- **Blocks:** `ENG-2037` (Definition Factory Wave 1 gate)
- **Deferred, named owners:** the seam choice is **TBD — defined by bridge author**; broader multi-seam codegen coverage is owned by each Wave-3 service pack, born FROM those packs, not here.

---

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent + model; resolve concurrent claims via ADR-0033 claim arbiter.
2. **PLAN** — post a plan comment (seam candidate, generation + round-trip approach).
3. **PROGRESS** — continuous comments as the stub/client/fixture/CI land; blockers surfaced immediately.
4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes; Done is gate-owned).
5. **STAGE HANDOFF** — author → reviewer.
6. **REVIEW** — reviewer posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden.
7. **TICK** — boxes only when genuinely verified (full-body read-modify-write; preserve every other byte).
8. **DONE** — ONLY the delivery orchestrator advances; the author CANNOT self-advance (fake-done gate).
9. **ESCALATIONS** — as comments; judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP.
