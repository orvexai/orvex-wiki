## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-studio-workflows` so that build stories dispatch only against a frozen, reviewed contract for the family's **single Temporal control plane** — the one durable-workflow home every satellite delegates to.

This is a **Wave-3 delta-pack**: `orvex-studio-workflows` has a **canonical, unusually-mature architecture but a `status: draft` PRD**, and ships real production code (clerk-lifecycle domain live), so the PRD-delta reconciles against the **deployed artifact** — real Go, live webhook, baseline CI — not the draft-heavy space canon. [P1 yXUWpQpRjx §2 reconciliation; Map current-state-map §1] The pack leaves the BUILD agent **zero architecture decisions** — that is what the pack is FOR.

**Definition of Done — the binary gate** (pack analog of the named DoD test; red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [Source: P1 yXUWpQpRjx §4 stage gate]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for this service's tag; contracts CI green on the tag commit* [Source: P1 yXUWpQpRjx §3 artifact 2]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudioworkflows` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [Source: P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body carries the audit block with every row `yes`* [Source: Issue Authoring 9VUHxAcoXw H1–H17]
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the wave slice — *machine check: each SDD line maps to a concept-to-service-map entry or a canon cite* [Source: P1 yXUWpQpRjx §3 artifact 4]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 — PRD-delta (reconciled).** Given the umbrella brief and the concept-to-service map, When the PRD-delta is authored, Then every added FR/NFR carries a brief/map cite and is reconciled against the **deployed** workflows artifact (live clerk-lifecycle domain), not the `status: draft` PRD. *Machine-checkable: the PRD-delta draft cites `rgBOQh31p3` on every added FR and names the reconciliation baseline as the live repo.* [Source: P1 yXUWpQpRjx §2; workflows evidence §5/§6]
- [ ] **AC2 — Durable-workflow home pinned.** Given D-WF-1 (all durable workflows live centrally; every satellite stays workflow-free), When the pack authors tier placement, Then durable, restart-surviving workflows are pinned to Temporal in THIS service and satellites expose only idempotent step-APIs that central activities call. *Machine-checkable: the SDD + build-prompt name Temporal as the sole durable-workflow tier and assert zero satellite-side workers.* [Source: CS §6 workflow tier; workflows evidence §1; must_carry #1]
- [ ] **AC3 — Frozen tagged contract.** Given the surface is CloudEvents-on-the-spine + one Svix webhook + internal step-APIs (`POST /webhooks/clerk`, `/internal/v1/*`, the console read-only Temporal-view endpoint), When the OpenAPI + CloudEvents (`studio.*` / `clerk.*` on the ADR-0007 envelope, ADR-0010 taxonomy) + golden fixtures land in `orvex-studio-contracts` and are tagged, Then the tag is the Phase-2 dispatch gate — replacing today's local `internal/events` constants with no round-trip (F-SEAM). *Machine-checkable: the tag exists and its fixtures round-trip green in contracts CI.* [Source: P1 yXUWpQpRjx §3 artifact 2; workflows evidence §4]
- [ ] **AC4 — No start-workflow HTTP surface.** Given A-W10 (no start-workflow HTTP API by design; the Svix webhook is the only authenticated inbound HTTP), When the contract freezes, Then the only inbound surfaces are the Svix webhook + the admin-authenticated read-only console Temporal-view endpoint — **no write/signal/start surface, ever**. *Machine-checkable: the OpenAPI declares zero write/start operations; every non-webhook enqueue is a spine CloudEvent.* [Source: workflows evidence §4]
- [ ] **AC5 — Clerk-lifecycle seam must-resolve.** Given Clerk-webhook ingestion + Clerk Management-API contact is contested across `orvex-studio-workflows` and `identity` (F-IDP / Principle-4 conflict), When the pack freezes, Then this seam is flagged as a review must-resolve and ruled **in lockstep with the identity pack — one ruling, not two** — never silently chosen. *Machine-checkable: the PRD-delta contains a must-resolve item naming the identity-vs-workflows Clerk-lifecycle owner and cross-links the identity pack.* [Source: Map current-state-map §3 risk 9; workflows evidence §3; must_carry #2]
- [ ] **AC6 — Temporal test-env strategy.** Given the test plan spans unit / store / contract / crew-slot / family-E2E, When the plan classifies the Temporal dependency, Then Temporal is treated as **remote-but-owned** (a real Temporal server for `WorkflowReplayer` histories + determinism replay), NOT mocked as true-external. *Machine-checkable: the test plan's mocking table places Temporal in the remote-but-owned category and specifies a real-server harness for history replay.* [Source: CS §5; workflows evidence §5 NOT-YET-BUILT replayer; must_carry #3]
- [ ] **AC7 — Retry taxonomy + entitlement step.** Given the AUTHORITATIVE (`MaximumAttempts:0`, unbounded) vs BEST-EFFORT (3 attempts) taxonomy and FR-W18 (Free-plan entitlement provisioning folded into lifecycle; billing = SoR, AUTHORITATIVE step), When the pack authors activity contracts, Then each activity declares its retry class and the billing create-Free/revoke step-API is named (OQ-W10). *Machine-checkable: every activity in the contract carries a retry-class annotation; the as-built 10-attempt cap defect is called out as a build task, not shipped.* [Source: workflows evidence §3/§5]
- [ ] **AC8 — Rejection: untagged blocks dispatch.** Given a claimed-but-unverified tag, When Phase-2 attempts dispatch, Then dispatch is refused. *Machine-checkable: no `git tag` for the service ⇒ the pack DoD stays red.* [Source: P1 yXUWpQpRjx §7 fake-done]
- [ ] **AC9 — Rejection: REVISE bounces.** Given a review verdict of REVISE, When findings are posted, Then a fix pass runs and the verdict is never overridden. *Machine-checkable: a `PACK-REVIEW: REVISE` comment forbids advancing to Done until a later `PACK-REVIEW: PASS` exists.* [Source: P1 yXUWpQpRjx §4]
- [ ] **AC10 — Forward-compat.** Given a future wave adds knowledge-rebuild / ai-tool-loop / personal→Teams org-conversion domains, When it lands, Then it MUST reuse the ingest→dispatch→workflow→activity template and MUST NOT reshape the frozen CloudEvent envelope or step-API contract without an ADR-0008 breaking-change + human ratify. *Machine-checkable: any envelope/step-API reshape carries an ADR + human-ratify record.* [Source: ADR-0008 change-authority; workflows evidence §1]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, plan `5eFdxN3edd`, ADR-0034 `12aDkq4iOd`, ADR-0035 `QbEBPuKcGR`, cell contract `JGAUQRsw2g`, SE-Arch `8sYi523i4t`, CS `6aMAzsYeQb` §5/§6, the workflows evidence digest + current-state-map §2/§3. (AC: 1,2,5,6)
- [ ] Draft **PRD-delta** into space `orvexstudioworkflows` (page `workflows-prd-delta`), reconciled against the deployed clerk-lifecycle artifact; cite every added FR/NFR; fold the four-role template extensions (knowledge-rebuild, ai-tool-loop, personal→Teams conversion). (AC: 1,2)
- [ ] Flag contested seam as a must-resolve, NOT a silent choice: **Clerk-lifecycle webhook/Management-API owner (workflows vs identity, F-IDP)** — cross-link the identity pack; rule once. (AC: 5)
- [ ] Author **contract + golden fixtures** (OpenAPI for `POST /webhooks/clerk` + `/internal/v1/*` step-APIs + console read-only Temporal-view; `clerk.*`/`studio.*` CloudEvents for provision/deprovision/reconcile lifecycle) → land in `orvex-studio-contracts`, **cut the tag** (scheme per the W1 contracts pack), generate Go stubs + TS clients per ADR-0035 (console is TS). Resolve OQ-W3 five-type `clerk.*` enumeration or flag (mutually blocking with OQ-C6). (AC: 3,4,7)
- [ ] Author **test plan** (page `workflows-test-plan`): unit / store (testcontainers Postgres for outbox) / contract (fixture round-trip in CI) / crew-slot / family-E2E per CS §5; **Temporal = remote-but-owned** (real-server `WorkflowReplayer` history harness + determinism replay); Svix/Clerk = true-external. (AC: 6)
- [ ] Author **SDD** (page `workflows-sdd`): full eventual surface (all four template domains, retry taxonomy, DLQ + liveness guard FR-W2, entitlement step FR-W18, cell-lint singleton-exception compliance, obs+SLOs via OTLP→Tempo/Loki/Mimir, runbook, family-E2E). (AC: all)
- [ ] Author **per-agent build prompt** (page `workflows-build-prompt`) whose STORIES meet the full 9-section H1–H17 `9VUHxAcoXw` standard incl. FINAL SELF-AUDIT; enumerate the as-built defect backlog (10-attempt cap, dispatcher NACK loop, `default` vs `studio-spine` broker, `OrgName` payload violation, non-derived ce-id, rename debt) as build tasks. (AC: all, 7)
- [ ] Request **adversarial review** (reviewer ≠ author); run fix pass if REVISE; tick boxes only when genuinely verified; hand to orchestrator for Done advance. (AC: 9)

## 4. 🧠 Dev Context

**Inputs table**

| Canon page/slug | What it feeds in this pack |
|---|---|
| Brief `rgBOQh31p3` | Product features the PRD-delta folds in (durable orchestration for knowledge-rebuild, ai-tool-loop, org-conversion) |
| Map `current-state-map` §2/§3 | Concept-to-service map; the Clerk-lifecycle contested seam (risk 9) |
| ADR-0034 `12aDkq4iOd` | Credential lanes — the Svix webhook secret + Clerk Management-API key lane |
| ADR-0035 `QbEBPuKcGR` | TS-client generation for the TS console consumer off the contract tag |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint; the global-Temporal singleton is a sanctioned rule-14 whitelist exception |
| workflows evidence digest | Deployed-artifact reconciliation facts (clerk-lifecycle live, D-WF-1, F-SEAM, defect backlog) |

- **Wiki space slug:** `orvexstudioworkflows`. **Evidence file:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudioworkflows.md`.
- **Live-repo-wins reconciliation:** the repo (real Go, `go build/test` green, clerk-lifecycle in production, baseline CI enforced) + migration assessment outrank the `draft` PRD + stale space canon. [P1 yXUWpQpRjx §2]

**Contested seams this pack MUST resolve or flag**

- [ ] **Clerk-lifecycle owner (workflows vs identity):** webhook ingestion + Clerk Management-API contact is double-owned (F-IDP; Principle-4 conflict) — flag as review must-resolve; rule in lockstep with the identity pack, one ruling not two. [Map §3 risk 9; must_carry #2]
- [ ] **Contracts five-type enumeration (OQ-W3/OQ-C6):** which of five `clerk.*` CE types become family-consumable spine catalog entries is mutually blocking with the contracts catalog — resolve or flag before freezing. [workflows evidence §3/§6]
- [ ] **No-public-host tension:** roster lists workflows as "(no public host)" yet a public Clerk webhook exists — resolved only if F-IDP moves ingestion to identity; flag against the identity ruling. [workflows evidence §6]

**❌ classic-mistakes (CS §0) — all 12 assessed**

| # | Canonical mistake (CS §0) | Assessment |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only; the row binds the build-prompt stories this pack authors — Clerk-lifecycle domain rules stay in the owning workflow/activity package, never the Svix webhook handler. |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — definition-only; binds the authored outbox/store stories — Postgres/outbox access stays behind the Repository seam, including tests. |
| ❌#3 | Premature interface / seam | APPLICABLE — the pack pins the step-API network seam (a port IS justified there) and flags the workflows/identity Clerk seam as a must-resolve; no in-process interface pinned without ≥2 real impls. |
| ❌#4 | Mocking own packages | APPLICABLE — the test-plan mocking table this pack freezes binds it: Temporal = remote-but-owned real server, Svix/Clerk = true-external, no owned-module mocks (test through the exported interface). |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — definition-only; the H1–H17 build-prompt stories this pack authors mandate vertical RED→GREEN tracer bullets. |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the CloudEvent + step-API contract shapes this pack freezes: only the fields the current Issue needs (design-it-twice). |
| ❌#7 | Shallow pass-through package | NOT APPLICABLE — definition-only; binds the authored stories — each layer of the ingest→dispatch→workflow→activity split must earn its keep per the deletion test (CS §3.1). |
| ❌#8 | Inline credentialed/IO client | APPLICABLE — the pack pins the Svix-webhook-secret + Clerk Management-API key lanes (ADR-0034) as clients injected at the seam, credentials via env only. |
| ❌#9 | Time/randomness in the projection layer | APPLICABLE — binds the frozen contract: workflow/projection determinism, ce-id + timestamps derived from Clerk event payloads (non-derived ce-id named as a build defect); the WorkflowReplayer determinism harness is pinned. |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE — binds the retry/entitlement ceiling shapes: the 10-attempt AUTHORITATIVE cap is a baked-ceiling defect (change needs ADR + human sign-off); FR-W18 entitlement caps stay in the billing SoR. |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; binds the authored stories — the webhook handler + console read-only endpoint hold routing + marshalling only. |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — binds the frozen exported surface: concrete typed structs across the CloudEvent/step-API boundary (OrgName payload violation named); `unknown` is the sanctioned TS placeholder in the ADR-0035 console client. |

**SE-Arch lenses (all 5)**

- **Reliability:** retry taxonomy + DLQ + FR-W2 liveness guard against the live ordering race (`organizationMembership.created` after `organization.deleted` re-activating a deprovisioned principal); `WorkflowReplayer` determinism harness pinned. [workflows evidence §5/§6]
- **Security:** Svix-verified webhook is the ONLY authenticated inbound; the Clerk Management-API secret-key lane (ADR-0034) is the Principle-4 crux driving the F-IDP seam. **This is the load-bearing lens.**
- **Cost governance:** workflows holds no LLM surface; FR-W18 provisions Free-plan entitlement but billing is SoR/AUTHORITATIVE — no caps baked here (❌#10 guard).
- **Operational excellence:** cell-lint compliance with the sanctioned singleton exception; `orvexcell` extension stamped on every publish; OTLP→Tempo/Loki/Mimir + Temporal OTel interceptor real.
- **Performance/freshness:** namespace-local `default` vs `studio-spine` broker defect + non-derived ce-id (missing Idempotency-Key layer) named as build tasks, not shipped. [workflows evidence §5]
- **ADR triggers this pack fires:** F-IDP (Clerk-ingestion relocation), cell-routing model, OQ-W3 CE-type catalog, retry-taxonomy correction (topic-schema + external-dependency changes) — authored as drafts (Studio Act-1 sequence from 0001), human-ratified downstream. [workflows evidence §3]

## 5. 🧪 Verification

- [ ] Adversarial review verdict **PASS** (reviewer ≠ author) — *live-read the wiki drafts via `docmost-cli --no-daemon`, never the cache.* [Source: P1 yXUWpQpRjx §7]
- [ ] Contract tag **exists** in `orvex-studio-contracts` and its fixtures **round-trip green** in contracts CI — *a claimed tag is not a tag.* [Source: P1 yXUWpQpRjx §4]
- [ ] TS clients (console) + Go stubs generate off the tag per ADR-0035. [Source: ADR-0035 QbEBPuKcGR]
- [ ] Test plan classifies Temporal as **remote-but-owned** with a real-server replay harness — *no true-external mock stands in for history replay.* [Source: CS §5; must_carry #3]
- [ ] Build-prompt stories pass the H1–H17 FINAL SELF-AUDIT. [Source: 9VUHxAcoXw]
- [ ] SDD completeness checked against the concept-to-service map (every eventual-need line evidenceable). [Source: P1 yXUWpQpRjx §3 artifact 4]

**What NOT to fake:** no self-review (reviewer ≠ author is mandatory + non-overridable); no claimed-but-unverified tag; no SDD trimmed to the clerk-lifecycle slice (the other three template domains are eventual-need lines); no invented NFR/SLO/TTL numbers (write "TBD — defined by <owner>"); never silently pick the Clerk-lifecycle owner; never mock Temporal as true-external.

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module + **design-it-twice on the workflows/identity Clerk seam**), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories — **Temporal = remote-but-owned**, Svix/Clerk = true-external, Postgres testcontainers for outbox), §6 (**tier placement — durable workflows are THIS service's Temporal tier; satellites are workflow-free step-APIs**), §7 (seam map — this contract pins the CloudEvent + step-API + webhook seams), §8, §10, §11, §12 (wiki-first; pinned contract is contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules; global-Temporal singleton = sanctioned rule-14 exception). **NO-MONGO (D-S12/D-S13):** event data = Postgres append/outbox tables relayed direct-to-Kafka (Redis→Kafka bridge retired) — strike any Mongo or Redis-bridge wording.

## 7. 🔗 References

- Plan `5eFdxN3edd` (Phase 1 = Definition Factory; Wave 3) · P1 prompt `yXUWpQpRjx` (§2 reconciliation, §3 five artifacts, §4 stage gate, §7 fake-done)
- Brief `rgBOQh31p3` · Coding Standards `6aMAzsYeQb` (§0/§3/§4/§5/§6/§7/§12) · SE-Arch `8sYi523i4t` (5 lenses)
- Issue Authoring `9VUHxAcoXw` (H1–H17) · ADR-0008 (change-authority) · ADR-0034 `12aDkq4iOd` (credential lanes) · ADR-0035 `QbEBPuKcGR` (Go↔TS bridge)
- Cell + tenancy contract `JGAUQRsw2g` (14-rule cell-lint)
- Evidence: `evidence/orvexstudioworkflows.md`, `evidence/current-state-map.md` §2/§3, `evidence/migration-assessment.md`, `program-status-2026-07-14.md`

## 8. 🔗 Dependencies

- **Project:** Orvex Studio Workflows · **Milestone:** P1 — Definition Factory
- **Blocked by:** Wave-2 gate (`wave2-gate` → ENG wired at filing) — Wave 3 opens only when Wave 2 certifies.
- **Blocks:** Wave-3 gate (`wave3-gate` → ENG wired at filing).
- **Lockstep counterparty:** the `orvex-studio-identity` pack — the Clerk-lifecycle seam is ruled once across both, never twice.
- **Deferred work named with future owner:** per-service P1 milestone creation → PO (Linear-MCP human dependency); F-IDP / cell-routing / OQ-W3 CE-catalog ADRs → drafted here, human `doc-ratify` downstream; ai-tool-loop domain stays charter-level, blocked on the `orvex-studio-ai` PRD (OQ-W4); build/test story issues are born FROM this pack, not before it.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — move Todo→In Progress; post agent + model; resolve claim per ADR-0033 `yNFx3YyNap`. 2. **PLAN** comment. 3. **PROGRESS** comments continuously (each artifact drafted/landed; blockers). 4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes). 5. **STAGE HANDOFF** author→review. 6. **REVIEW** — reviewer (≠ author) posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden. 7. **TICK** boxes only when genuinely verified (full-body read-modify-write; preserve every other byte). 8. **DONE** — ONLY the delivery orchestrator advances; author CANNOT self-advance (fake-done gate). 9. **ESCALATIONS** as comments; judgment calls logged "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP.
