## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Service Definition Pack for **`orvex-studio-console`** so that build stories dispatch only against a frozen, reviewed contract set — the troubleshooting/observability UI over LGTM, its consumed admin-API surfaces, and the resolved workflows-proxy seam — with zero architecture decisions left to the build agent. This is the Wave-3 delta-pack: it folds the brief's operator/observability needs into the console's existing PRD/arch canon in space `orvexstudioconsole` and reconciles against the deployed repo, not stale space canon. [P1 yXUWpQpRjx §3; Map current-state-map reconciliation note]

**Definition of Done — the binary gate** (red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: comment containing `PACK-REVIEW: PASS` exists on this issue* [SE-Arch 8sYi523i4t; P1 yXUWpQpRjx §4]
- [ ] Console's consumed-contract set is pinned to git-TAGGED tags in `orvex-studio-contracts` (obs `CONVENTIONS.md` FR-C18 vocab + each satellite admin-API contract); fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for each cited tag; CI green on those tag commits* [P1 yXUWpQpRjx §3 artifact 2; Digest §4]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudioconsole` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body 100% `[x]` on its self-audit block* [Brief 9VUHxAcoXw H1–H17]
- [ ] SDD is complete — every eventual-need line present + evidenceable (full obs pane + all 4 rollout phases incl. break-glass), not just the Phase-1 read-only slice — *machine check: SDD lists every arch §3 route + every rollout-phase gate* [P1 yXUWpQpRjx §3 artifact 4; Digest §5]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 (PRD-delta)** — Given the umbrella brief's operator/observability needs, When the PRD-delta is authored, Then every added FR/NFR cites the brief or the map and reconciles with the console's existing PRD/arch canon in space `orvexstudioconsole`. *Assert: zero added FR/NFR without a `[Source:]` cite; the F3 canon contradiction (roster "Postgres,Redis" vs Redis-only) is flagged, not silently chosen.* [Brief rgBOQh31p3; Digest §3 F3]
- [ ] **AC2 (observability UI over LGTM)** — Given the troubleshooting UI is the operator pane over Loki/Mimir/Tempo (NOT an embedded Grafana server), When the contract is frozen, Then the obs correlation contract FR-C18 (`obs/CONVENTIONS.md` label vocab) is the pinned consumed tag and the trace-waterfall/result panes are recorded as original console code (Grafana Apache-2.0 `@grafana/ui`/`scenes` = shell only). *Assert: SDD names the pinned FR-C18 tag; NFR-CT4 "no Grafana server embedded" is an explicit SDD line.* [Digest §3 D-OBS-UI, §4]
- [ ] **AC3 (workflows-proxy contested seam)** — Given the un-chartered workflows authorizing proxy (`/v1/workflows`, M13 gate ENG-1549 AC4) that FR-CT3/FR-CT10 depend on entirely, When the pack is reviewed, Then this seam is a **review must-resolve** with a single ruling (owned by `orvex-studio-workflows`, consumed by console via D-CTRL Temporal-access-by-removal), never a silent console-side choice. *Assert: a `- [ ]` must-resolve item names the proxy owner + whether its contract is a `orvex-studio-contracts` artifact; RESOLVE recorded before freeze.* [current-state-map §5 P1-6/P1-10; program-status §4 gate table (M13/AC4); Digest §3 D-CTRL, §6]
- [ ] **AC4 (message-tracing-across-outbox gap)** — Given message-tracing across the transactional outbox is the known observability gap, When the SDD is authored, Then the SDD OWNS this gap as an eventual-need line (trace correlation from producer → `orvex_outbox` → Kafka `studio-spine` → consumer). *Assert: SDD contains an explicit "message-tracing-across-outbox" eventual-need row with owner + status.* [Digest §3 OQ-CT5/D-P6, §6]
- [ ] **AC5 (UI "looks good AND works" bar)** — Given console ships a React/shadcn SPA operator surface, When the test plan is authored, Then every UI surface carries the "looks good AND works" bar: vitest + Playwright + axe + visual/screenshot sweep + dual-theme + design-token audit ending in a human delight-check. *Assert: test plan enumerates all six checks per obs/admin surface.* [P1 yXUWpQpRjx §3 artifact 3]
- [ ] **AC6 (repo-private BFF adaptation)** — Given D-CT5 makes console's BFF API repo-private (never a contracts artifact), When artifact 2 is authored, Then it is honestly stated as a **consumer-pin** (the set of consumed contract tags), NOT a published OpenAPI; console owns no new contracts surface. *Assert: artifact 2 declares "console publishes zero contracts; dispatch gate = the consumed tags exist" — no fabricated console OpenAPI.* [Digest §4 D-CT5]
- [ ] **AC7 (cell-lint rule 14 conflict)** — Given OQ-CT4 (per-cell vs global deploy) collides with cell-contract rule 14 (console absent from the global-singleton allowlist), When the pack declares cell-lint compliance, Then this conflict is flagged as an ADR-owed decision, not resolved by fiat. *Assert: SDD's cell-lint section names OQ-CT4 as an open ADR trigger against `JGAUQRsw2g` rule 14.* [Cell-lint JGAUQRsw2g rule 14; Digest §3 OQ-CT4, §6]
- [ ] **AC8 (negative — untagged/self-review)** — Given a consumed tag that does not exist or a self-authored review, When certification runs, Then dispatch is blocked and the review verdict is void. *Assert: any missing cited tag ⇒ DoD gate red; a `PACK-REVIEW: PASS` authored by the pack author ⇒ rejected.* [P1 yXUWpQpRjx §7; SE-Arch 8sYi523i4t]
- [ ] **AC9 (forward-compat)** — Given later rollout phases (admin writes, break-glass), When the Phase-1 read-only slice is defined, Then a future wave MUST NOT be able to add a mutating route without the durable Kafka `studio-spine` audit stream live (FR-CT14 audit-or-fail). *Assert: SDD marks every Phase-3 write route blocked-until audit-stream-live.* [Digest §5, §6]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, map `current-state-map`, CS `6aMAzsYeQb`, SE-Arch `8sYi523i4t`, cell-lint `JGAUQRsw2g`, ADR-0035 `QbEBPuKcGR`, + the console's existing PRD/arch canon in space `orvexstudioconsole` + digest `orvexstudioconsole.md` (AC: 1)
- [ ] Draft **PRD-delta** in space `orvexstudioconsole` → new draft page; reconcile against deployed repo; flag F3 canon contradiction (AC: 1)
- [ ] Resolve-or-flag the **workflows-proxy** seam and the **memory/admin ownership** seams as review must-resolve items in the PRD-delta (AC: 3)
- [ ] Author **artifact 2 as a consumer-pin**: enumerate consumed contract tags (FR-C18 obs vocab + identity/knowledge/billing/ai/workflows admin APIs) into `orvex-studio-contracts` cite-list; NO console OpenAPI (AC: 2, 6)
- [ ] Author **test plan** page with the six-check UI bar + Temporal/LGTM proxy test categories per CS §5 (AC: 5)
- [ ] Author **SDD** page: full arch §3 route surface, all 4 rollout phases, cell-lint incl. OQ-CT4 conflict, message-tracing-across-outbox gap, SLOs (TBD — defined by console owner), family-E2E participation (AC: 4, 7, 9)
- [ ] Author **per-agent build prompt** whose stories meet the full 9-section H1–H17 standard of `9VUHxAcoXw` (AC: all)
- [ ] Request adversarial review (reviewer ≠ author); run fix pass on any `PACK-REVIEW: REVISE` (AC: 8)
- [ ] Tick verified boxes only; hand to the delivery orchestrator for Done advance (AC: all)

## 4. 🧠 Dev Context

**Inputs**

| Canon page / slug | What it feeds this pack |
|---|---|
| Brief `rgBOQh31p3` | operator/observability features folded into the PRD-delta |
| Map `current-state-map` §2/§3/§5 | concept-to-service ownership; workflows-proxy + memory seams |
| Console existing PRD/arch canon (space `orvexstudioconsole`) | existing service canon to reconcile against |
| Digest `evidence/orvexstudioconsole.md` | D-CT5 repo-private, D-CTRL, D-OBS-UI, OQ-CT4, F3 |
| obs `CONVENTIONS.md` (FR-C18) | the one consumed correlation contract |
| ADR-0035 `QbEBPuKcGR` | TS-client generation for console's TS SPA consumers |

- **Space slug:** `orvexstudioconsole`. **Evidence:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudioconsole.md`.
- **Live-repo-wins:** the deployed repo + migration assessment outrank stale space canon; but note repo drift F6 (stale `orvex-studio-control`/`cmd/control` naming + out-of-charter `FR-CT20–23` scope + a canon-contradicting "Redis→Kafka bridge") — wiki-first governs; the repo is the stale side here. [Map reconciliation note; Digest §3 F6]

**Contested seams this pack MUST resolve or flag**

- [ ] **workflows-proxy** (`/v1/workflows`, M13 AC4): owned by `orvex-studio-workflows`, consumed by console; is its contract a `orvex-studio-contracts` artifact? — one ruling, in lockstep with the workflows pack. [current-state-map §5 P1-6/P1-10]
- [ ] **OQ-CT4** per-cell vs global deploy vs cell-lint rule 14 — ADR-owed, flag not decide. [Digest §6]
- [ ] **F3 canon contradiction** (Postgres,Redis vs Redis-only) — flag for human reconciliation (authority order: canon > space). [Digest §3]

**❌ classic-mistakes (CS §0)**

- [ ] ❌#1 domain-logic-in-handler/cmd — NOT APPLICABLE: definition-only; no runtime handler/BFF code authored here — binds the build-prompt stories.
- [ ] ❌#2 raw store-driver outside store pkg — NOT APPLICABLE: console is Redis-only/stateless (no store package); no runtime code in this pack.
- [ ] ❌#3 premature seam — APPLICABLE: the workflows-proxy port choice is deferred to the seam ruling, not pre-bound; design-it-twice per CS §3.7.
- [ ] ❌#4 mocking own packages — NOT APPLICABLE: definition-only; the mock-boundary discipline (siblings faked from contracts golden fixtures) binds the build-prompt stories, not this pack.
- [ ] ❌#5 horizontal slicing — NOT APPLICABLE: definition-only; vertical tracer-bullet TDD binds the build-prompt stories, not this pack.
- [ ] ❌#6 big-upfront schema — APPLICABLE: console publishes no schema (D-CT5); consumed contract shapes bind only what it reads, no speculative fields.
- [ ] ❌#7 shallow pass-through package — APPLICABLE: the BFF must add authz + correlation value over LGTM/admin APIs, not be a bare pass-through — SDD names this deep-module bar.
- [ ] ❌#8 inline credentialed/IO client — APPLICABLE: LGTM read-only standing creds + operator-token pass-through are injected at the seam (D-CT6), never constructed inline.
- [ ] ❌#9 time/randomness in projection layer — NOT APPLICABLE: console has no projection/read-model layer (stateless UI over LGTM); binds the build-prompt stories if any derived view appears.
- [ ] ❌#10 unbounded ceilings — NOT APPLICABLE: console defines no ceilings here; entitlement/quota VALUE is billing's SoR (D-CAP) and console only fronts-the-set — the cap contract is consumed, not defined in this pack.
- [ ] ❌#11 domain-logic-in-cmd/handler — NOT APPLICABLE: definition-only; console is a TS SPA/BFF (no Go `cmd/`), no wiring-vs-domain code authored in this pack — binds the build-prompt stories.
- [ ] ❌#12 `any`/`interface{}` type-laundering — NOT APPLICABLE: definition-only; the no-`any`-across-module-surface rule (TS SPA + BFF, eslint `no-explicit-any`) binds the build-prompt stories, not this pack. [CS §0]

**SE-Arch lenses** [SE-Arch 8sYi523i4t]

- [ ] Reliability — console is stateless/zero blast radius (G4); SDD asserts no tenant-serving path impact.
- [ ] Security — concentrated-privilege risk (all operators family-global until OQ-CT3 RBAC); break-glass coverage gap flagged.
- [ ] Cost governance — LGTM read-only standing creds only (D-CT6); operator-token pass-through everywhere.
- [ ] Operational excellence — the message-tracing-across-outbox gap is the SDD's owned operability debt.
- [ ] Performance/freshness — LGTM proxy guardrails bound query cost/latency.
- **ADR triggers this pack fires:** OQ-CT4 (cell rule-14), D-CTRL, A-FRONTEND/D-CT1 (go:embed), D-CT5, A-BREAKGLASS — all meet CS §9; Studio ADR numbering/parent TBD — defined by the Studio ADR registry. [Digest §6]

## 5. 🧪 Verification

- [ ] Adversarial review verdict `PACK-REVIEW: PASS` present (reviewer ≠ author).
- [ ] Every cited consumed contract tag exists in `orvex-studio-contracts` and its fixtures round-trip green in contracts CI.
- [ ] Build-prompt stories pass the `9VUHxAcoXw` H1–H17 FINAL SELF-AUDIT.
- [ ] SDD completeness check against the concept-to-service map + arch §3 route surface (all four rollout phases present).
- [ ] All five artifact drafts read back status=draft in space `orvexstudioconsole`.

**What NOT to fake** (not boxes): no self-review; no claimed-but-unverified consumed tag; no fabricated console OpenAPI (D-CT5 = repo-private); no SDD trimmed to the Phase-1 read-only slice; no invented NFR/SLO numbers (write "TBD — defined by console owner").

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module, design-it-twice on the workflows-proxy seam), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories bind the test plan — LGTM proxy + Temporal-via-proxy are remote-but-owned), §6 (tier placement: console = BFF/UI tier, LLM-free), §7 (seam map — pin the FR-C18 obs seam + the workflows-proxy seam), §8, §10, §11, §12 (wiki-first; pinned consumed contracts are contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules; flag the OQ-CT4/rule-14 conflict). **NO-MONGO override (D-S12):** any event/audit data = Postgres append/outbox → Kafka `studio-spine`; console is Redis-only/stateless — strike any Mongo or Postgres-state wording.

## 7. 🔗 References

- Program plan `5eFdxN3edd` — Phase 1 Definition Factory; Wave 3.
- P1 orchestrator `yXUWpQpRjx` — §3 (five artifacts), §4 (stage gate), Wave 3.
- Umbrella brief `rgBOQh31p3` — operator/observability features.
- Coding Standards `6aMAzsYeQb` — §0, §3, §4, §5, §6, §7, §12.
- SE-Arch `8sYi523i4t` — 5 lenses + fake-done gates.
- Issue Authoring `9VUHxAcoXw` — H1–H17 (build-prompt stories).
- ADR-0035 `QbEBPuKcGR` — Go↔TS bridge / TS client gen.
- Cell + tenancy contract `JGAUQRsw2g` — 14-rule cell-lint (rule 14).
- Console canon: existing PRD/arch in space `orvexstudioconsole`; digest `evidence/orvexstudioconsole.md`.
- program-status-2026-07-14 — §4 gate table (M13/ENG-1549 AC4).

## 8. 🔗 Dependencies

- **Project:** Orvex Studio Console · **Milestone:** P1 — Definition Factory.
- **Blocked by:** `wave2-gate` (Wave-2 packs certified before Wave-3 delta-packs author). ENG ids wired at filing.
- **Blocks:** `wave3-gate` (all 11 drained-service delta-packs certified + tagged before Wave 4).
- **Cross-pack lockstep:** the **workflows-proxy** ruling is shared with the `orvex-studio-workflows` pack (one ruling, not two); the entitlement/quota cap shapes are consumed from the W1 contracts pack + billing pack, not re-derived here.
- **Deferred work (born FROM this pack):** console build/test stories, the OQ-CT4 ADR, the D-CTRL/A-FRONTEND/D-CT5/A-BREAKGLASS ADRs — owned by the console build agent + the Studio ADR registry, filed after certification.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — Todo→In Progress; post agent + model; claim arbiter per ADR-0033 `yNFx3YyNap`.
2. **PLAN** — post a PLAN comment (artifact order + the seams to resolve).
3. **PROGRESS** — continuous comments as each artifact is drafted/landed + blockers.
4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes; Done is gate-owned).
5. **STAGE HANDOFF** — author → review.
6. **REVIEW** — reviewer posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden.
7. **TICK** — tick boxes only when genuinely verified (full-body read-modify-write; preserve every other byte).
8. **DONE** — ONLY the delivery orchestrator advances (author CANNOT self-advance — fake-done gate).
9. **ESCALATIONS** — as comments; judgment calls logged "orchestrator judgment under PO standing authority".

Writes via the `linearis` CLI (`lnr-tracking-adapter`); reads from `.cache/linear/`; never the Linear MCP.
