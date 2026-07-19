## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Service Definition Pack for `orvex-studio-billing` so that build stories dispatch only against a frozen, reviewed contract — never against the service's stale, draft, "scaffold-only" canon. `orvex-studio-billing` is the **plan→entitlement→cap system-of-record for the whole platform** (Go: `api`/`webhook`/`metering`), serving both Studio and orvex-wiki as first-class consumers; it decides and serves/pushes values but is **never on a hot path** [Evidence orvexstudiobilling §1]. This is a **Wave-3 delta pack**: it folds the brief's free-tier cost doctrine into the existing (draft) billing PRD and reconciles against the live repo, which outranks stale space canon [P1 yXUWpQpRjx §2 reconciliation].

**Definition of Done — the binary gate** (red on any = NOT done, no override):
- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: comment containing `PACK-REVIEW: PASS` exists on this issue* [P1 yXUWpQpRjx §4; SE-Arch 8sYi523i4t]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for the billing surface tag; CI run green on the tag commit* [P1 yXUWpQpRjx §3]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudiobilling` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages*
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes")
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the Wave-3 slice [P1 yXUWpQpRjx §3 SDD ruling]

*This pack leaves the BUILD agent zero architecture decisions — that is what the pack is FOR: the contract shapes, tiers, seams and gates are pinned here, not discovered in the build.*

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the brief's free-tier features, When the PRD-delta is authored into space `orvexstudiobilling`, Then every added FR/NFR is cited and reconciled against the existing draft PRD `Blcvui4UIn`. *Machine check: `docmost-cli page get <prd-delta-slug> --no-daemon` returns status=draft with a "Reconciled against Blcvui4UIn" section and ≥1 `[Brief rgBOQh31p3]` cite per added FR.* [Source: P1 yXUWpQpRjx §3(1)]
- [ ] **AC2 (frozen contract)** — Given the billing API + event surface [Evidence orvexstudiobilling §4], When it is filed as OpenAPI + CloudEvents (ADR-0007 envelope / ADR-0010 `studio.*` taxonomy) with golden fixtures in `orvex-studio-contracts`, Then it is git-TAGGED and TS clients generate for the TS consumers per ADR-0035. *Machine check: a tag in `orvex-studio-contracts` covering the billing surface exists (scheme per the W1 contracts pack) and its fixtures round-trip green in CI.* [Source: ADR-0035 QbEBPuKcGR; P1 yXUWpQpRjx §3(2)]
- [ ] **AC3 (ENG-2036 pricing doctrine)** — Given the ratified ENG-2036 supersession, When the PRD-delta folds in the **free-tier cost doctrine + no-card standard-free-month**, Then it cites the canonical billing PRD `Blcvui4UIn` and flags the tension with the repo's D-S23 card-required-trial as a must-resolve seam (never silently chosen). *Machine check: PRD-delta contains a `[program-status §3]`-cited free-tier-cost-doctrine section AND a must-resolve item naming the D-S23 conflict.* [Source: program-status §3; Evidence orvexstudiobilling §3]
- [ ] **AC4 (system-of-record + human-ratified ceilings)** — Given billing owns plan→entitlement→cap as the sole system-of-record, When the SDD defines cap/quota policy, Then every ceiling is a **human-ratified** value (❌#10) — enforcement stays with `ai` (LiteLLM `max_budget`) and the wiki engine (Redis counters); billing only decides/serves/pushes. *Machine check: SDD marks each plan cap "human-ratified per ❌#10" and states billing is off every hot path.* [Source: CS ❌#10; Evidence orvexstudiobilling §1]
- [ ] **AC5 (consume, do not re-derive)** — Given the W1 contracts pack froze the entitlement/cap contract shapes, When billing's contract references them, Then it **imports/cites** those shapes and the shared `402 QUOTA_EXCEEDED` contract rather than re-deriving them. *Machine check: billing contract references the W1-frozen entitlement/cap types by name; no duplicate local re-definition.* [Source: program-status §4; Evidence orvexstudiobilling §4]
- [ ] **AC6 (Stripe true-external)** — Given Stripe is a true-external dependency, When the test plan is authored, Then it defines a Stripe **port** with **committed replay fixtures** (test-clock E2E, webhook-set drift, lookup-key↔mode) — no live Stripe in unit/store tiers. *Machine check: test plan names a Stripe port interface + a committed `stripe/` fixtures dir replayed in CI.* [Source: CS §5; Evidence orvexstudiobilling §4]
- [ ] **AC7 (cross-service cap delta)** — Given billing owes `ai` a workload-identity `PUT /admin/v1/tenants/{tenant}/cap` variant, When the SDD scopes it, Then it is named as landing in contracts + an ADR **before build**, not deferred silently. *Machine check: SDD lists the ai cap-endpoint delta with an ADR trigger and "before build" gate.* [Source: Evidence orvexstudiobilling §4,§6]
- [ ] **AC8 (NO-MONGO / Postgres-only)** — Given D-S12, When any event/usage/audit store is specified, Then it is Postgres append/outbox tables; any Mongo wording is struck. *Machine check: grep of the pack drafts returns zero "Mongo"/"MongoDB" store references in billing's own shapes.* [Source: P1 yXUWpQpRjx §6 D-S12; Evidence orvexstudiobilling §3]
- [ ] **AC9 (negative — untagged blocks dispatch)** — Given a contract with no git tag, When Phase-2 attempts dispatch, Then it is refused. *Machine check: absence of the billing surface tag ⇒ no build story is frontier-eligible.* [Source: P1 yXUWpQpRjx §4 hard gate]
- [ ] **AC10 (negative — REVISE never overridden)** — Given a `PACK-REVIEW: REVISE` verdict, When findings are returned, Then the pack bounces to a fix pass and is re-reviewed; it is never force-advanced. *Machine check: no Done transition exists on this issue without a subsequent `PACK-REVIEW: PASS`.* [Source: P1 yXUWpQpRjx §4; SE-Arch 8sYi523i4t]
- [ ] **AC11 (forward-compat)** — Given later waves (Teams/Enterprise quotas, Personal→Teams org-mint re-key) are deferred, When the SDD is authored, Then it reserves those surfaces so a future wave extends without breaking the frozen Wave-3 shapes (append-only, grandfatherable entitlement versions — D-B3/G4). *Machine check: SDD's "later waves" section names Teams/Enterprise quotas + the upgrade re-key path as reserved, non-breaking extensions.* [Source: Evidence orvexstudiobilling §3,§6]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: plan `5eFdxN3edd`, brief `rgBOQh31p3`, CS `6aMAzsYeQb`, SE-Arch `8sYi523i4t`, cell contract `JGAUQRsw2g`, ADRs 0033/0034/0035/0008, `map current-state-map`, and the billing digest `evidence/orvexstudiobilling.md` (AC: 1–11)
- [ ] Draft **PRD-delta** into space `orvexstudiobilling` (page: "PRD-delta — billing (Wave 3)"); reconcile against draft PRD `Blcvui4UIn`; fold ENG-2036 free-tier cost doctrine (AC: 1,3)
- [ ] Resolve-or-flag contested seams: D-S23 card-required-trial vs ENG-2036 no-card standard-free-month; OQ-B9 pricing-page ownership; upstream AGPL Stripe entanglement in the wiki engine core (AC: 3, and §4 must-resolve list)
- [ ] Author **contract + fixtures** in `orvex-studio-contracts`: billing OpenAPI surface [Evidence §4] + `billing.*` CloudEvents + Stripe replay fixtures; consume W1-frozen entitlement/cap shapes + shared `402 QUOTA_EXCEEDED` (AC: 2,5,6,8)
- [ ] Land + **git-tag** the contract in `orvex-studio-contracts`; generate TS clients per ADR-0035; verify fixtures round-trip in CI (AC: 2)
- [ ] Author **test plan** (page: "Test plan — billing"): unit / store (testcontainers, Postgres) / contract (fixture round-trip) / crew-slot / family-E2E per CS §5; Stripe port + committed replay fixtures (AC: 6)
- [ ] Author **SDD** (page: "Service Done Definition — billing"): full eventual API surface, events produced/consumed, entitlement/quota, cell-lint compliance `JGAUQRsw2g`, observability+SLOs (TBD ids), runbook, ai cap-endpoint delta, deferred Teams/Enterprise + upgrade re-key (AC: 4,7,11)
- [ ] Author **per-agent build prompt** (page: "Build prompt — billing"); its stories authored to the full 9-section H1–H17 standard of `9VUHxAcoXw` (AC: all)
- [ ] Request **adversarial review** (reviewer ≠ author); on REVISE run a fix pass and re-request (AC: 10)
- [ ] Tick boxes only on genuinely-verified evidence; hand to the delivery orchestrator for the Done advance (AC: all)

## 4. 🧠 Dev Context

**Inputs table**

| Canon page / slug | What it feeds in this pack |
|---|---|
| Draft PRD `Blcvui4UIn` | the existing billing PRD the delta reconciles against |
| Brief `rgBOQh31p3` | free-tier features + locked pricing folded into the delta |
| Map `current-state-map` §2 | concept-to-service distribution (free-tier cost-doctrine → ai + billing) |
| program-status §3/§4 | ratified ENG-2036 doctrine + deferred entitlement/cap contract shapes |
| Evidence `orvexstudiobilling.md` | API/event surface, D-decisions, scaffold-state ground truth |
| ADR-0035 `QbEBPuKcGR` | TS client generation for Studio/wiki TS consumers |
| Cell `JGAUQRsw2g` | 14-rule cell-lint the SDD declares compliance with |

- **Wiki space:** slug `orvexstudiobilling`. **Per-space evidence:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudiobilling.md`. **Live-repo-wins:** the repo is a scaffold with honest `501 not_implemented` stubs and a stale/"dangerous" `_bmad-output/.decision-log.md` — the repo + migration assessment outrank stale space canon, but here the arch page is canonical while the PRD is draft, so reconcile carefully [Evidence orvexstudiobilling §5].

**Contested seams this pack MUST resolve or flag (never silently choose):**
- [ ] D-S23 card-required 7-day trial vs the ENG-2036 no-card standard-free-month doctrine — flag as review must-resolve [program-status §3; Evidence §3]
- [ ] Upstream AGPL entanglement: wiki-engine core still holds real Stripe/billing logic (`STRIPE_SEATS_SYNC`→`BILLING_QUEUE`) — must sever to an event-only seam; flag as cross-service must-resolve [Evidence §6]
- [ ] OQ-B9 pricing-page ownership + OQ-B3 cap-reached UX/reset semantics — flag, do not decide [Evidence §3]

**❌ classic-mistakes (CS §0):**

| ❌ | Canonical mistake | Assessment |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only pack; no handler/cmd code lands. Binds the build-prompt stories this pack authors for the `api`/`webhook`/`metering` binaries (domain rules live in the owning billing domain package, never a controller) |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — no store code lands here. Binds the build-prompt stories that implement the Postgres append/outbox tables behind the Repository seam (D-S12), tests included |
| ❌#3 | Premature interface / seam | APPLICABLE — the pack pins the Stripe **port** and the billing↔ai cap-endpoint seam; a port IS justified at these network seams (true-external Stripe; cross-service cap PUT), so these are sanctioned, not premature |
| ❌#4 | Mocking own packages | NOT APPLICABLE — no tests land here. Binds the build-prompt test-plan stories (test through the exported interface with a real/in-memory substitute); Stripe is a true-external port with replay fixtures, not an owned module |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — no code/tests land in a definition pack. Binds the build-prompt stories, which `9VUHxAcoXw` authors as vertical RED→GREEN tracer bullets |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the contract/schema shapes this pack freezes: only the fields the Wave-3 slice needs land in the billing OpenAPI + CloudEvents surface; later-wave surfaces are reserved (AC11), not pre-built |
| ❌#7 | Shallow pass-through package | NOT APPLICABLE — no package lands. Binds the build-prompt stories per the deletion test (CS §3.1); billing is a deep plan→entitlement→cap module, not a pass-through |
| ❌#8 | Inline credentialed/IO client | APPLICABLE — the pack pins the Stripe client as a configured client injected at the port seam with credentials via env only, and fixes signature verification at the home-cell `webhook` binary (D-B12) — never an inline credentialed client |
| ❌#9 | Time/randomness in the projection layer | NOT APPLICABLE — no projection code lands. Binds the build-prompt metering/usage-projection stories (projections deterministic; timestamps derived from event payloads); the frozen CloudEvents contract carries those payload timestamps so the stories can comply |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — binds the entitlement/cap shapes: every plan→cap ceiling is a **human-ratified** value (AC4), billing is the SoR for exactly these ceilings, and any change needs ADR + human sign-off |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — no cmd/handler files land. Binds the build-prompt stories for the `api`/`webhook` binaries (handlers hold routing + marshalling only) |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — the pack freezes concrete typed structs across the exported contract surface (OpenAPI + CloudEvents + generated TS clients per ADR-0035); `unknown` is the sanctioned TS scaffold placeholder, never `any` laundering |

Guard: the build prompt's stories re-assess all 12 ❌ at build time per `9VUHxAcoXw` H6.

**SE-Arch lenses (`8sYi523i4t`):** Reliability — outbox/append tables + dunning grace state machine defined, no data loss on lapse. Security — `WorkloadIdentityOnly` internal surface + Stripe signature verified only at the home-cell `webhook` binary (D-B12). Cost governance — free-tier cost doctrine + human-ratified caps (❌#10). Operational excellence — SDD carries runbook + reconcile step-functions. Performance-freshness — entitlement push dissolves paywall <60s (D-S20), billing off every hot path.
**ADR triggers this pack fires:** Stripe true-external port; `ai` cap-endpoint delta; D-S12 store-engine decision; cross-cell webhook-forward; auth-flow touch — all blocked on the Studio ADR registry standing up [Evidence §5,§6].

## 5. 🧪 Verification

- [ ] Adversarial review returns `PACK-REVIEW: PASS` (reviewer ≠ author), live-read from the wiki drafts not the cache
- [ ] Billing surface tag EXISTS in `orvex-studio-contracts` (a claimed tag is not a tag) and its fixtures round-trip green in contracts CI
- [ ] Stripe replay fixtures + test-clock E2E present and green in CI
- [ ] Build-prompt stories pass the `9VUHxAcoXw` H1–H17 FINAL SELF-AUDIT
- [ ] SDD completeness checked line-by-line against the concept-to-service map (full eventual surface, not the Wave-3 slice)

**What NOT to fake:** no self-review; no claimed-but-unverified tag; no SDD trimmed to the wave slice; no invented NFR/SLO numbers (write "TBD — defined by SDD SLO section"); no Mongo store wording (D-S12 Postgres-only).

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module; design-it-twice on the Stripe port + ai cap seam), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories — Stripe is a true-external port with replay fixtures), §6 (tier placement binds the build prompt), §7 (seam map — this contract pins the billing↔ai cap seam, billing↔wiki quota seam, Stripe port), §8, §10, §11, §12 (wiki-first; pinned contracts are contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules). **NO-MONGO override (D-S12):** event/usage/audit data = Postgres append/outbox tables; strike any Mongo wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` (Phase 1 = Definition Factory; four waves)
- Phase-1 orchestrator `yXUWpQpRjx` §3 (five artifacts), §4 (stage gate + hard tag gate)
- Umbrella brief `rgBOQh31p3` (free-tier features, locked pricing)
- Coding Standards `6aMAzsYeQb` §0/§3/§4/§5/§6/§7/§12
- SE-Arch review `8sYi523i4t` (5 lenses + fake-done gates)
- Issue Authoring `9VUHxAcoXw` (H1–H17; build-prompt story standard)
- ADR-0035 `QbEBPuKcGR` (Go↔TS bridge; TS clients) · ADR-0034 `12aDkq4iOd` · ADR-0033 `yNFx3YyNap` · ADR-0008 (contracts change-authority)
- Cell + tenancy contract `JGAUQRsw2g` (14-rule cell-lint)
- Billing PRD `Blcvui4UIn` · billing evidence digest `evidence/orvexstudiobilling.md` · `program-status-2026-07-14.md` §3/§4

## 8. 🔗 Dependencies

- **Project:** Orvex Studio Billing · **Milestone:** P1 — Definition Factory (per-service P1 milestone creation is a batched human dependency — needs Linear MCP; do not block pack authoring on it).
- **Blocked by:** `wave2-gate` (staging + workgraph packs certified) — ENG id wired at filing.
- **Blocks:** `wave3-gate` (the drained-services delta-pack wave gate) — ENG id wired at filing.
- **Deferred work, named with its future owner:** the billing build/test **stories are born FROM this pack** (Phase-2 build agent), not before it; the `ai` cap-endpoint workload-identity delta lands in contracts + an ADR owned by the ADR-registry standup; Teams/Enterprise wiki-quota values + the Personal→Teams org-mint re-key path are deferred to a later wave (SDD reserves the surface).

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent + model; claim arbiter per ADR-0033 (`yNFx3YyNap`).
2. **PLAN** — comment the authoring plan (artifacts, target pages, repo paths).
3. **PROGRESS** — continuous comments as each artifact is drafted/landed; log blockers immediately.
4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes; Done is gate-owned).
5. **STAGE HANDOFF** — author → reviewer (reviewer ≠ author).
6. **REVIEW** — reviewer posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden.
7. **TICK** — check boxes only on genuinely-verified evidence (full-body read-modify-write; preserve every other byte).
8. **DONE** — ONLY the delivery orchestrator advances to Done; the author CANNOT self-advance (fake-done gate, H15).
9. **ESCALATIONS** — as comments; judgment calls logged to `po-decisions/` + a ticket comment marked "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI through `lnr-tracking-adapter`; reads from `.cache/linear/`; never the Linear MCP.
