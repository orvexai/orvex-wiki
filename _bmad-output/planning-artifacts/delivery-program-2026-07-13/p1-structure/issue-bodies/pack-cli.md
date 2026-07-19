## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-cli` so that build stories dispatch only against a frozen, reviewed contract — the one user-facing CLI is defined whole (SSO-delegated, domain-pure routing) before any story touches its from-scratch rewrite. [P1 yXUWpQpRjx §3]

`orvex-cli` is the family's single agent-facing command-line client (`orvex` / `orvex-full`), successor to `docmost-cli` but **not a fork** — an empty repo rewritten from scratch, routing domain-pure to satellites (wiki verbs → `orvex-wiki-api`, search/SSE → knowledge, ask/chat → ai, auth → identity), never the engine's raw API. [Map current-state-map §2; evidence orvexcli §1]

**Definition of Done — the binary gate** (all must be green; red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: comment containing `PACK-REVIEW: PASS` exists on this issue* [SE-Arch 8sYi523i4t; P1 yXUWpQpRjx §4]
- [ ] `orvex-cli`'s consumed contract shapes are frozen in a **git-TAGGED** commit of `orvex-studio-contracts` (a tag covering this service's surface, scheme per the W1 contracts pack); typed clients round-trip green in contracts CI — *machine check: `git tag -l` non-empty for this service's tag; CI green on the tag commit* [P1 yXUWpQpRjx §3 artifact 2; ADR-0035 QbEBPuKcGR]
- [ ] All five artifacts exist as wiki drafts in space `orvexcli` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body has the H-audit block all-yes* [Issue Authoring 9VUHxAcoXw H1–H17]
- [ ] SDD is complete — every eventual-need line present + evidenceable, honest FAIL baseline included, not just the Wave-3 delta slice [P1 yXUWpQpRjx §3 artifact 4; program-status §2]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 — PRD-delta (reconciled)** — Given the umbrella brief and the concept-to-service map, When the delta is authored, Then every brief-added FR/NFR for the CLI is cited and reconciled against the existing draft PRD (`R4AOVBLST7`) + canonical Architecture (`pf10XC2Qjz`), with the PRD↔Architecture host-convention inconsistency (F-A) reconciled to flat service hosts per canon. *Assert: each FR/NFR line carries a `[Brief …]`/`[Map …]` cite; zero cell-segmented host strings remain.* [Brief rgBOQh31p3; Map current-state-map §2; evidence orvexcli §6]
- [ ] **AC2 — the one user-facing CLI** — Given the SSO-delegated auth model, When the contract pins CLI verbs, Then wiki issue create (the ENG-1484 pattern) and peer namespaces (wiki/search/ai/auth/admin) are defined as domain-pure routed surfaces, engine-direct calls forbidden. *Assert: contract OpenAPI refs resolve only to satellite hosts (`wiki-api.*`, `auth.*`, knowledge/ai); no engine `/api/*` route appears.* [memory ENG-1484; evidence orvexcli §1, §4]
- [ ] **AC3 — FROZEN, TAGGED contract** — Given the CLI consumes codegenned typed clients, When the W1 contracts tag is cut, Then `orvex-cli`'s clients regenerate from that tag (never a served descriptor) and one golden fixture round-trips. *Assert: contracts CI green on the tag; generated client diff = codegen-only, no hand-edits.* [ADR-0035 QbEBPuKcGR; evidence orvexcli §4]
- [ ] **AC4 — DfM via the Go twin** — Given the AGPL boundary, When the CLI performs any DfM markdown↔PM conversion, Then it calls the Go twin `orvex-studio-lib` `pkg/dfm`, never the AGPL TS package. *Assert: `go list -deps ./...` shows `orvex-studio-lib/pkg/dfm`; no import of the AGPL TS DfM package.* [ADR project-context A-SEAMS; evidence orvexcli §1]
- [ ] **AC5 — test plan** — Given CS §5 tier split, When the plan is authored, Then it covers unit / store / contract (fixture round-trip in CI) / crew-slot / family-E2E, with committed DfM golden-fixture pairs expanded beyond the "inadequate" 6-pair corpus (embed/opaque-node/table-cell-mark/mermaid). *Assert: fixture manifest lists ≥ the 4 named missing categories.* [CS §5; evidence orvexcli §6]
- [ ] **AC6 — SDD honest baseline** — Given the six-surface verdict, When the SDD is authored, Then its current-state baseline records the CLI surface as **FAIL** (not the tracking optimism) and enumerates the total eventual API/event/entitlement/observability/runbook surface it must reach. *Assert: SDD contains the literal FAIL baseline + a line per eventual-need category.* [program-status §2; P1 yXUWpQpRjx §3 artifact 4]
- [ ] **AC7 — open-defect context folded in** — Given D4/ENG-2043, D5/ENG-2044, D6/ENG-2068 (DfM converter corruption) + D16 residual, When the PRD-delta + test plan are authored, Then each defect's failing behaviour is named as a must-not-regress contract/test line. *Assert: each of ENG-2043/2044/2068 appears as a cited test-plan or DoD line.* [program-status §2, §Defects D4/D5/D6/D16]
- [ ] **AC8 (negative)** — Given a review verdict of **REVISE**, When findings are posted, Then the pack bounces to a fix pass and is never overridden or self-certified. *Assert: no Done transition exists while any open `PACK-REVIEW: REVISE` comment stands.* [P1 yXUWpQpRjx §4; SE-Arch 8sYi523i4t fake-done]
- [ ] **AC9 (negative)** — Given an untagged or fixture-failing contract, When Phase-2 dispatch is attempted, Then it is blocked. *Assert: `git tag -l` empty OR contracts CI red ⇒ gate closed.* [P1 yXUWpQpRjx §3 artifact 2]
- [ ] **AC10 (forward-compat)** — Given the frozen 0–9 exit codes + `errorCode` string vocab, When a future wave extends the CLI, Then codes are **extended, never renumbered** and the CAS `ifVersion` → 409 `VERSION_MISMATCH` shape is preserved. *Assert: contract diff adds only new codes; exit-code enum ordinals unchanged.* [evidence orvexcli §4]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, map `current-state-map`, CS `6aMAzsYeQb`, SE-Arch `8sYi523i4t`, ADR-0034/0035, cell contract `JGAUQRsw2g`, evidence `evidence/orvexcli.md` (AC: 1,2)
- [ ] Draft **PRD-delta** in space `orvexcli` (reconcile `R4AOVBLST7` + `pf10XC2Qjz`; fix the F-A host inconsistency to flat canon hosts) (AC: 1,2)
- [ ] Resolve/flag contested seams: DfM Go-twin boundary, ai/knowledge host unpinned (OQ-CLI2), `ifVersion` CAS wire form (OQ-CLI4) — flag unresolved ones as review must-resolve (AC: 4)
- [ ] Author **contract** consumption + golden fixtures; land + cut the CLI-surface tag in `orvex-studio-contracts` (path: `orvex-studio-contracts`), regenerate typed clients (AC: 3,10)
- [ ] Author **test plan** page in `orvexcli` (unit/store/contract/crew-slot/family-E2E; expand the DfM fixture corpus) (AC: 5,7)
- [ ] Author **SDD** page in `orvexcli` with the honest FAIL baseline + full eventual-need surface (AC: 6)
- [ ] Author **per-agent build prompt** whose stories meet the full 9-section `9VUHxAcoXw` H1–H17 standard (AC: all)
- [ ] Request adversarial review (reviewer ≠ author); run fix pass if REVISE (AC: 8)
- [ ] Tick DoD boxes only when genuinely verified; hand to the delivery orchestrator for the Done advance (AC: 8,9)

## 4. 🧠 Dev Context

Inputs:

| Canon page / slug | What it feeds this pack |
|---|---|
| Brief `rgBOQh31p3` | brief-added CLI features folded into the PRD-delta |
| Map `current-state-map` §2/§3 | concept-to-service routing; contested seams |
| Architecture `pf10XC2Qjz` (canonical) | domain-pure routing, transport, exit-code contract |
| PRD `R4AOVBLST7` (draft) | existing PRD to reconcile (F-A host inconsistency) |
| ADR-0034 `12aDkq4iOd` / ADR-0035 `QbEBPuKcGR` | credential lanes; Go-stub/TS-client codegen boundary |
| `evidence/orvexcli.md` | service ground truth (scaffold state, seams, OQ list) |

- **Wiki space slug:** `orvexcli`. **Per-space evidence:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexcli.md`.
- **Live-repo-wins reconciliation:** the `orvex-cli` repo is a bare 2-file scaffold (single commit `a996980`), so here the *design canon* (Architecture + evidence) outranks stale space prose; the deployed `docmost-cli` is the behavioural reference/spec only, never the repo. [P1 yXUWpQpRjx §2 reconciliation; evidence orvexcli §5]

Contested seams this pack MUST resolve or flag:

- [ ] DfM access boundary: Go twin `orvex-studio-lib` `pkg/dfm` is the sanctioned path; the AGPL TS package MUST NOT cross the boundary — encode in the contract. [project-context A-SEAMS]
- [ ] ai host + public knowledge query host unpinned (OQ-CLI2) — flag for the ai/knowledge packs' rulings, do not silently pin. [evidence orvexcli §3]
- [ ] `ifVersion` CAS wire representation (OQ-CLI4) — resolve against the W1 contracts pack or flag. [evidence orvexcli §6]

❌ classic-mistakes (CS §0):

| # | Canonical mistake | Assessment |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only; no CLI code authored here. Binds the build-prompt stories this pack authors: their `cmd/` verbs must delegate to owning routing/domain code, re-assessed at build time |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — the CLI is a client binary with no store tier (CS §6, no server tier). Binds the build-prompt stories only if any local cache/store is later added — Repository seam then, including tests |
| ❌#3 | Premature interface / seam | APPLICABLE — binds the port/seam choices this pack pins: satellite routing (wiki/search/ai/auth) is a network seam where a port IS justified; design-it-twice on the DfM Go-twin (`pkg/dfm`) boundary; no in-process interface pinned without ≥2 real impls |
| ❌#4 | Mocking own packages | NOT APPLICABLE — definition-only; no owned package to mock here. Binds the test-plan stories this pack authors: `docmost-cli` is the behavioural reference, never a mock of an owned module (AC5; §6 guidance) |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — definition-only, no code slices. Binds the build-prompt stories this pack authors: they must be vertical RED→GREEN tracer bullets, enforced by the `9VUHxAcoXw` H-audit |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the contract/schema shapes this pack freezes: consume only the fields the current CLI surface needs, frozen to the W1 tag; no speculative CLI-local schema (AC3) |
| ❌#7 | Shallow pass-through package | APPLICABLE — binds the routing-layer design this pack pins: the CLI must earn the deletion test (CS §3.1) by adding SSO-delegation, DfM conversion, and the exit-code contract, not stand up a thin proxy over satellite APIs |
| ❌#8 | Inline credentialed/IO client | APPLICABLE — binds the credential-lane/client shapes this pack pins: SSO-delegated lanes per ADR-0034, configured satellite clients injected at the routing seam, credentials via env only — no inline-constructed credentialed client |
| ❌#9 | Time/randomness in the projection layer | NOT APPLICABLE — the CLI is a client with no projection/read-model layer; no event-sourced projection surface in this unit, so no build-prompt story binds it |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — binds the entitlement/cap shapes this pack consumes: ceilings are human-ratified and consumed from contracts, never re-derived or relaxed in the CLI; any change needs ADR + human sign-off |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; no `cmd/` files authored here. Binds the build-prompt stories this pack authors: their command files hold routing + marshalling only, re-assessed at build time |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — binds the typed-client/contract surface this pack freezes: concrete typed structs across the codegenned client boundary; `unknown` is the only sanctioned TS scaffold placeholder, never `any` across the exported surface |

Guard: the build-prompt stories re-assess all 12 at build time, when runtime CLI code exists.

SE-Arch lenses (`8sYi523i4t`):

- Reliability — exactly-once SSE dedup + frozen exit codes named in the SDD.
- Security — SSO-delegated credential lanes per ADR-0034; deny-by-default routing.
- Cost governance — zero-cost reads uncounted; no served-descriptor codegen anti-pattern.
- Operational excellence — runbook + honest FAIL baseline in the SDD.
- Performance/freshness — SSE heartbeat/freshness SLO (OQ-CLI7 numeric TBD — defined by CLI PRD owner).

ADR triggers this pack is expected to fire: the 5 un-filed seam decisions (rewrite-from-scratch, host convention, `pkg/dfm`/AGPL boundary, contracts-tag codegen, hard-delete tombstones) — file per-service ADRs once the Studio ADR registry stands (OQ-CLI9). [evidence orvexcli §3, §6]

## 5. 🧪 Verification

- [ ] Adversarial pack review returns **PASS** (reviewer ≠ author). *Assert: `PACK-REVIEW: PASS` comment present.*
- [ ] Contract tag EXISTS in `orvex-studio-contracts` and fixtures round-trip green in contracts CI. *Assert: `git tag -l` non-empty; CI green on tag commit.*
- [ ] All five artifacts are status=draft in space `orvexcli`. *Assert: `docmost-cli page get --no-daemon` returns draft for each.*
- [ ] Build-prompt stories pass the H1–H17 self-audit. *Assert: all-yes H-audit block per story.*
- [ ] SDD completeness checked against the concept-to-service map. *Assert: a line per eventual-need category, FAIL baseline recorded.*

**What NOT to fake:** no self-review (reviewer ≠ author); no claimed-but-unverified tag (a claimed tag is not a tag — verify it EXISTS); no SDD trimmed to the Wave-3 delta slice; no invented NFR/SLO numbers (write "TBD — defined by CLI PRD owner").

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module; design-it-twice on the DfM Go-twin seam), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories bind the test plan — `docmost-cli` as behavioural reference, not a mock), §6 (tier placement — CLI is a client binary, no server tier), §7 (seam map — routing/host/DfM seams this contract pins), §8, §10, §11, §12 (wiki-first; the pinned contracts tag is contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules — CLI declares compliance; only the wiki tenant host is cell-segmented). NO-MONGO override (D-S12): any event/audit-sink data = Postgres append/outbox, never Mongo — strike any Mongo wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` (Phase 1 = Definition Factory; four waves)
- Phase-1 orchestrator `yXUWpQpRjx` §2 (reconciliation), §3 (five artifacts), §4 (stage gate), Wave 3
- Umbrella brief `rgBOQh31p3` (CLI-facing features)
- Coding Standards `6aMAzsYeQb` §0/§3/§4/§5/§6/§7/§12; SE-Arch `8sYi523i4t` (5 lenses)
- Issue Authoring `9VUHxAcoXw` H1–H17; cell contract `JGAUQRsw2g`
- ADR-0034 `12aDkq4iOd`; ADR-0035 `QbEBPuKcGR`; ADR-0008 (contracts change-authority)
- Evidence: `evidence/orvexcli.md`; `evidence/current-state-map.md`; `program-status-2026-07-14.md` (cli row: D4/ENG-2043, D5/ENG-2044, D6/ENG-2068, D16/ENG-2040)
- Service canon: Architecture `pf10XC2Qjz`; PRD `R4AOVBLST7`; SE-Arch audit `EJ9WgVAuls`

## 8. 🔗 Dependencies

- **Project:** Orvex CLI · **Milestone:** P1 — Definition Factory
- **Blocked by:** `wave2-gate` (Wave 2 packs certified + tagged; ENG ids wired at filing)
- **Blocks:** `wave3-gate` (Wave-3 delta-packs gate)
- **Deferred (born FROM this pack, not before it):** the CLI build/test story-level issues — authored by the per-agent build prompt, dispatched in Phase 2 against the tagged contract. The 5 seam ADRs are deferred to the Studio ADR registry owner (OQ-CLI9).

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — move Todo → In Progress; post agent + model; resolve contention per the ADR-0033 claim arbiter. 2. **PLAN** comment before authoring. 3. **PROGRESS** comments continuously (each artifact drafted/landed; blockers). 4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes; one PR per touched repo — `orvex-cli`, `orvex-studio-contracts`). 5. **STAGE HANDOFF** author → review. 6. **REVIEW** — reviewer posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden. 7. **TICK** boxes only when genuinely verified (full-body read-modify-write). 8. **DONE** — ONLY the delivery orchestrator advances; the author CANNOT self-advance (fake-done gate). 9. **ESCALATIONS** as comments; judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP.
