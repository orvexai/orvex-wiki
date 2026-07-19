## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-studio-ui` so that
build stories dispatch only against a frozen, reviewed contract and every UI surface wave is scoped
against a complete Service Done Definition — never copy-pasted from the POC, never built against an
unfrozen DTO vocab. This is the **Wave 4** UI surface-wave pack: it enumerates the migration surfaces,
records the rewrite-same-stack ruling, and pins the shared DTO/error vocab to contracts codegen. It
leaves the build agent **zero architecture decisions** — that is what this pack is for. [Plan 5eFdxN3edd §Phase-1; P1 yXUWpQpRjx §3]

**Definition of Done — the binary gate** (all five, red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: comment containing `PACK-REVIEW: PASS` exists on this issue* [SE-Arch 8sYi523i4t; P1 yXUWpQpRjx §4]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI; **TS clients generated per ADR-0035** (ui is a TS satellite) — *machine check: `git tag -l` non-empty for the ui surface tag; CI run green on the tag commit* [ADR-0035 QbEBPuKcGR]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudioui` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body has zero unfilled `{…}` placeholders and a named binary DoD test* [Issue Authoring 9VUHxAcoXw H1–H17]
- [ ] SDD is complete (every eventual-need line present + evidenceable — full ~35-surface parity set, not the first wave's slice) — *machine check: SDD surface list count ≥ POC surface inventory* [P1 yXUWpQpRjx §3 artifact 4]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the umbrella brief and the concept-to-service map, When the PRD-delta is authored, Then every added FR/NFR the brief folds into the UI (Composer surface, task-first wizard, chat-import Curator desk, private Memory FormSpec, Your Wiki omnibox) is cited and reconciled against the existing draft PRD `orvex-studio-ui`. *Assert: every FR/NFR line in the delta carries a `[Brief rgBOQh31p3]` or `[Map current-state-map §2]` cite; zero uncited additions.* [Brief rgBOQh31p3; Map current-state-map §2]
- [ ] **AC2 (surface enumeration)** — Given the POC `orvex-prompt-studio-poc`, When the SDD is authored, Then all ~35 surfaces are enumerated parity-first in build order: Discover/marketplace → Builder/editor flagship → Memory → Library/Collections → Curation Queue → Phase-2 surfaces incl. Composer + wizard. *Assert: SDD surface table row count ≥ 35 and lists each named anchor surface.* [P1 yXUWpQpRjx §4 Wave-4]
- [ ] **AC3 (rewrite-same-stack ruling)** — Given the Phase-2 UI ruling, When the SDD records the stack, Then surfaces are declared REWRITTEN (never copy-pasted) on Tailwind + Radix + CVA + zustand + zod + TipTap, with **orvex-ds design tokens as the Tailwind styling contract** (tokens ported into the theme; Radix primitives skinned by the DS). *Assert: SDD contains the literal ruling "rewritten, not copy-pasted" + the six named stack libraries + tokens-as-Tailwind-contract.* [Plan 5eFdxN3edd §Phase-2 UI ruling]
- [ ] **AC4 (shared DTO/error vocab)** — Given the POC's `packages/shared` has no target counterpart, When the contract is frozen, Then the shared DTO/error vocab is sourced from contracts codegen (generated TS client) and scheduled to land in **Wave 0 of the UI build**. *Assert: pack names the contracts-generated TS client as the sole DTO source; `packages/shared` marked replaced-by-codegen.* [P1 yXUWpQpRjx §4 Wave-4; ADR-0035 QbEBPuKcGR]
- [ ] **AC5 (contract frozen + tagged)** — Given the SPA→api `/api` seam (REST + SSE grammars: `scaffold_proposed/committed`, `section`, `done`, PacingGate, improve response, entitlement verdict), When the contract lands, Then it is frozen + git-TAGGED in `orvex-studio-contracts` with golden fixtures and generated TS clients. *Assert: `git tag -l` shows the ui surface tag; fixture round-trip CI green on the tagged commit.* [Map orvexstudioui §4; ADR-0035 QbEBPuKcGR]
- [ ] **AC6 (test plan — "looks good AND works")** — Given every surface wave, When the test plan is authored, Then each wave carries its tests WITH it: vitest + Playwright + axe + visual/screenshot sweep + dual-theme spec + design-token audit + human delight-check. *Assert: test plan enumerates all seven tiers per wave; each maps to a CS §5 category.* [P1 yXUWpQpRjx §3 artifact 3; CS §5]
- [ ] **AC7 (UI-canon amendment drafted)** — Given the UI architecture canon currently says exact-match `orvex-ds.css`, When the pack is authored, Then the amendment to the rewrite-same-stack + tokens-as-Tailwind-contract model is DRAFTED (not promoted). *Assert: an amendment draft page exists at status=draft; body records the `orvex-ds.css` → tokens-as-Tailwind-contract supersession; no canonical write.* [P1 yXUWpQpRjx §4 Wave-4; CS §12]
- [ ] **AC8 (build prompt to H1–H17)** — Given the per-agent build prompt, When its stories are authored, Then each passes the `9VUHxAcoXw` FINAL SELF-AUDIT. *Assert: every story body has a named binary DoD test + machine-checkable ACs + all 12 ❌ assessed + zero `{…}` placeholders.* [Issue Authoring 9VUHxAcoXw H1–H17]
- [ ] **AC9 (negative — REVISE never overridden)** — Given a review verdict of `PACK-REVIEW: REVISE`, When findings are posted, Then the pack bounces to a fix pass and is NOT advanced. *Assert: no Done transition exists while the latest review comment is REVISE.* [SE-Arch 8sYi523i4t; P1 yXUWpQpRjx §7]
- [ ] **AC10 (negative — untagged contract blocks dispatch)** — Given an untagged or fixture-failing contract, When Phase-2 dispatch is attempted, Then it is blocked. *Assert: no build story is frontier-eligible while `git tag -l` is empty for the ui surface tag.* [P1 yXUWpQpRjx §9; ADR-0035 QbEBPuKcGR]
- [ ] **AC11 (forward-compat — later waves must not break parity)** — Given a future surface wave, When it lands, Then it must not regress an earlier certified surface's tests or design-token audit. *Assert: the design-token audit + axe sweep for every prior wave stays green in CI on each new wave's merge.* [P1 yXUWpQpRjx §4 Wave-4; Map orvexstudioui §6]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, map `current-state-map §2`, plan `5eFdxN3edd` Phase-2 UI ruling, CS §5/§6, SE-Arch `8sYi523i4t`, ADR-0035, cell contract `JGAUQRsw2g`, evidence `orvexstudioui.md` (AC: 1,2,3)
- [ ] Draft **PRD-delta** in space `orvexstudioui` (page `PRD-delta — orvex-studio-ui`), reconciled against the existing draft PRD (AC: 1)
- [ ] Author the **SDD** (page `SDD — orvex-studio-ui`): enumerate ~35 surfaces parity-first; record rewrite-same-stack ruling + stack libraries + tokens-as-Tailwind-contract; full API surface, events, entitlement/quota, cell-lint, observability/SLOs, all test tiers, runbook, family-E2E (AC: 2,3)
- [ ] File the **contract delta** to `orvex-studio-contracts` (SPA→api `/api` REST + SSE grammars + entitlement verdict shape); add golden fixtures; land + git-TAG; wire TS-client generation per ADR-0035; verify fixtures round-trip in contracts CI (AC: 4,5)
- [ ] Author the **test plan** (page `Test plan — orvex-studio-ui`): per-wave vitest + Playwright + axe + visual sweep + dual-theme + design-token audit + human delight-check (AC: 6)
- [ ] Draft the **UI-canon amendment** (`orvex-ds.css` exact-match → tokens-as-Tailwind-contract) at status=draft; flag for downstream human doc-ratify (AC: 7)
- [ ] Author the **per-agent build prompt** with stories to the full 9-section H1–H17 standard; run the FINAL SELF-AUDIT (AC: 8)
- [ ] Request adversarial review (reviewer ≠ author); on `REVISE` run a fix pass, re-request; on `PASS` tick + hand to the delivery orchestrator (AC: 8,9)

## 4. 🧠 Dev Context

**Inputs**

| Canon page / slug | What it feeds this pack |
|---|---|
| Brief `rgBOQh31p3` | Composer, task-first wizard, chat import, private Memory, Orvex rating surfaces to fold into the PRD-delta |
| Map `current-state-map §2` | concept-to-service map — which brief features land on the UI vs its BFF |
| Plan `5eFdxN3edd` Phase-2 | rewrite-same-stack ruling; parity-first surface order; UI-canon amendment owed |
| ADR-0035 `QbEBPuKcGR` | ui is a TS satellite → tag emits generated TS clients; DTO vocab source |
| Evidence `orvexstudioui.md` | live-repo reality: single-commit scaffold, no CI, serving-topology drift, open OQs |
| CS §5 `6aMAzsYeQb` | mocking categories bind the test plan's tiering |

**Space + reconciliation.** Space slug `orvexstudioui`; per-space evidence `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudioui.md`. **Live-repo-wins:** the repo + migration assessment outrank stale space canon — but for `orvex-studio-ui` the live repo is a *single-commit scaffold* (`ae0400d`: React 19 + Vite 7, **no test runner, no eslint, no contracts codegen dep, HTTPRoute self-labelled STUB, prod sourcemaps on, cloudflare-proxied contradicting grey-cloud canon**). The Architecture page IS canonical (ratified 2026-07-06); the PRD is still draft. The SDD reconciles against the deployed POC (`orvex-prompt-studio-poc`, Phase-1 shipped 15/15) as the parity target, not the empty target repo. [Map orvexstudioui §2/§5]

**Contested seams this pack MUST resolve or flag:**

- [ ] **OQ-UI7 (DS as-is vs Tailwind)** — the rewrite-same-stack ruling settles this: tokens-as-Tailwind-contract. Record the ruling; flag any residual for review, never silently choose. [Map orvexstudioui §3]
- [ ] **OQ-UI5 (which repo ships Phase-2 Alpha)** — strangler-extraction-first vs the 07-23 Alpha clock; a real sequencing risk → review must-resolve, do not silently pick. [Map orvexstudioui §6]
- [ ] **Serving-topology drift** (scaffold orange-proxied nginx vs canon Workers Static Assets + grey-cloud) — flag as a contract/runbook must-resolve, not silently reconciled. [Map orvexstudioui §5/§6]

**❌ classic-mistakes (CS §0)** — all 12 assessed for definition-only work:

| ❌# | Canonical mistake (CS §0) | Assessment |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only; the row binds domain-package placement, and the build-prompt stories this pack authors produce a presentation-tier SPA that holds zero business logic (no handler/cmd/main to misplace it in) |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — the UI holds no store/Repository seam; every read/write crosses the `/api` boundary this pack pins, so there is no store-driver to leak in the stories this pack authors |
| ❌#3 | Premature interface / seam | APPLICABLE — guard: this pack pins exactly one seam, the SPA→api `/api` network seam (a port IS justified at a network seam); it forbids any speculative in-process service split or extra interface in the build-prompt stories |
| ❌#4 | Mocking own packages | APPLICABLE — guard: the test plan this pack authors tests through exported surfaces with real/in-memory substitutes; only Clerk/Stripe (true-external) are boundary-redirected — no own-package mocks |
| ❌#5 | Horizontal slicing (all tests, then all code) | APPLICABLE — guard: the build-prompt stories this pack authors are vertical RED→GREEN per-surface-wave tracer bullets, never all-tests-then-all-code |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — guard: the contract/schema shapes this pack freezes (SSE grammars, DTO/error vocab, entitlement verdict) carry only the fields the current wave needs, frozen per wave in `orvex-studio-contracts`, not all-at-once |
| ❌#7 | Shallow pass-through package | APPLICABLE — guard: `packages/shared` is replaced-by-codegen rather than kept as a hand-rolled wrapper; the build-prompt stories must survive the deletion test (CS §3.1), no shallow pass-through package |
| ❌#8 | Inline credentialed/IO client | APPLICABLE — guard: the SPA attaches an identity-exchanged cell-bearing session token via an injected configured client; credentials via env only, never an inline Clerk JWT or baked secret in the stories this pack authors |
| ❌#9 | Time/randomness in the projection layer | NOT APPLICABLE — this pack authors no projection/read-model layer; the SPA renders server-sent state and builds no projections (deterministic timestamping is the engine/BFF's concern, not the UI stories) |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — guard: the entitlement/cap shape this pack carries, the human-ratified entitlement-freshness 60,000ms ceiling (`nfr-budget.json`), is fixed; any change needs ADR + human sign-off, never a CI-driven bump |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — the SPA has no cmd/ or server-handler layer; the build-prompt stories this pack authors route and marshal client-side only and hold no domain logic to misplace |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — guard: the DTO/error vocab crosses the `/api` boundary as codegen-generated concrete TS types; the build-prompt stories forbid `any`, with `unknown` as the only sanctioned scaffold placeholder |

**SE-Arch lenses** (`8sYi523i4t`, all 5): **Reliability** — dual-theme + visual regression gate blocks silent UI rot. **Security** — SPA attaches identity-exchanged cell-bearing session token (A-STATELESS), never raw Clerk JWT; no secrets/card data. **Cost governance** — entitlement verdict rendered from one BFF SSE channel, no per-surface polling. **Operational excellence** — serving-topology drift flagged for runbook resolution. **Performance/freshness** — entitlement-freshness budget machine-checked. **ADR triggers this pack fires:** serving-topology (Workers vs nginx), Clerk/Stripe external-dependency, session-token auth-flow — all three blocked on the Studio Decision Records registry standing up; escalate as batch. [Map orvexstudioui §6]

## 5. 🧪 Verification

- [ ] Adversarial review verdict `PACK-REVIEW: PASS` posted (reviewer ≠ author) — *reviewer live-reads the wiki drafts via `docmost-cli page get --no-daemon`, never the cache*
- [ ] Contract tag EXISTS in `orvex-studio-contracts` — *`git tag -l` non-empty; a claimed tag is not a tag*
- [ ] Fixtures round-trip green in contracts CI on the tagged commit; TS clients generated per ADR-0035
- [ ] Build-prompt stories pass the `9VUHxAcoXw` H1–H17 FINAL SELF-AUDIT
- [ ] SDD completeness checked against the concept-to-service map (~35-surface parity set present)

**What NOT to fake** (plain bullets, not boxes):

- No self-review — the author cannot certify their own pack.
- No claimed-but-unverified tag — the tag is verified to exist and its fixtures to round-trip.
- No SDD trimmed to the first wave's slice — the SDD is the full ~35-surface everything-eventually-needed set.
- No invented NFR numbers — the only pinned budget is entitlement-freshness 60,000ms; all else is TBD — defined by the contracts pack.
- No canonical write — the UI-canon amendment lands at draft; promotion is human doc-ratify only.

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌ above), §3 (deep-module + design-it-twice on the tokens-as-Tailwind-contract seam), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories bind the test plan — Clerk/Stripe = true-external redirect-only), §6 (tier placement: SPA is presentation tier, zero business logic), §7 (seam map — the single SPA→`/api` seam this contract pins), §8, §10, §11, §12 (wiki-first; pinned contracts are contract-shape law — SPA is a conformant consumer, not the author), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules — the SPA declares compliance; Worker routes by `cell` claim). **NO-MONGO override (D-S12):** event data = Postgres append/outbox → Kafka spine; strike any Mongo wording (UI holds no store regardless).

## 7. 🔗 References

- Plan `5eFdxN3edd` §Phase-1 / §Phase-2 UI ruling — surface order, rewrite-same-stack, UI-canon amendment
- P1 orchestrator `yXUWpQpRjx` §3 (five artifacts) / §4 Wave-4 / §7 fake-done / §9 exit
- Brief `rgBOQh31p3` — Composer, wizard, chat import, Memory, Orvex rating
- CS `6aMAzsYeQb` §0/§3/§4/§5/§6/§7/§12 · SE-Arch `8sYi523i4t` (5 lenses)
- ADR-0035 `QbEBPuKcGR` (Go↔TS bridge; TS-client generation) · ADR-0008 (contracts change-authority) · Cell contract `JGAUQRsw2g`
- Issue Authoring `9VUHxAcoXw` (H1–H17)
- Evidence: `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudioui.md`; `current-state-map.md §2`

## 8. 🔗 Dependencies

- **Project:** Orvex Studio UI · **Milestone:** P1 — Definition Factory
- **Blocked by:** `wave3-gate` (Wave 3 delta-packs certified + tagged; UI parity depends on the drained-service contracts existing) — ENG id wired at filing
- **Blocks:** `wave4-gate` (Definition Factory Wave 4 + Phase-1 exit) — ENG id wired at filing
- **Deferred work born FROM this pack (not before it):** the UI build stories per surface wave (Phase-2, authored against the tagged contract); the UI-canon amendment's human doc-ratify (downstream); the 3 mandatory ADRs (serving topology, Clerk/Stripe external-dep, session-token) — owned by the operator once the Studio Decision Records registry stands up.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent + model; claim-arbiter per ADR-0033 (`yNFx3YyNap`).
2. **PLAN** — post a plan comment naming the five artifacts + target wiki pages.
3. **PROGRESS** — continuous comments as each artifact is drafted/landed + any blocker (OQ-UI5, ADR-registry gap).
4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes); one PR per touched repo (`orvex-studio-contracts` for the contract delta).
5. **STAGE HANDOFF** — author → review when all five artifacts are drafted + the contract is tagged.
6. **REVIEW** — reviewer (≠ author) posts `PACK-REVIEW: PASS|REVISE` + findings; live-reads the drafts, verifies the tag.
7. **TICK** — boxes ticked only when genuinely verified (full-body read-modify-write; preserve every other byte).
8. **DONE** — ONLY the delivery orchestrator advances to Done (author CANNOT self-advance — fake-done gate H15).
9. **ESCALATIONS** — as comments; judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP.
