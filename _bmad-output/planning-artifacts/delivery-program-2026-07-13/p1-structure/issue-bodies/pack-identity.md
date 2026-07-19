## 1. 🎯 Issue

As the Phase-2 build orchestrator I want a certified Definition Pack for `orvex-studio-identity` so that build stories dispatch only against a frozen, reviewed contract for the family's authentication spine — the one surface every satellite's authenticated route verifies against.

This is a **Wave-3 delta-pack**: `orvex-studio-identity` is the **furthest-along satellite (M9 reported CLOSED 2026-07-12)**, so the PRD-delta reconciles against the **deployed artifact** — real Go, live deploy plumbing, 501-stub handlers — not the draft-heavy space canon. [P1 yXUWpQpRjx §2 reconciliation; Map current-state-map §1] The pack leaves the BUILD agent **zero architecture decisions** — that is what the pack is FOR.

**Definition of Done — the binary gate** (pack analog of the named DoD test; red on any = NOT done, no override):

- [ ] Adversarial pack review (reviewer ≠ author) verdict **PASS** posted as a Linear comment + mirrored on the pack's root wiki draft — *machine check: a comment containing `PACK-REVIEW: PASS` exists on this issue* [Source: P1 yXUWpQpRjx §4 stage gate]
- [ ] Contract landed in `orvex-studio-contracts` and **git-TAGGED**; fixtures round-trip green in contracts CI — *machine check: `git tag -l` non-empty for this service's tag; contracts CI green on the tag commit* [Source: P1 yXUWpQpRjx §3 artifact 2]
- [ ] All five artifacts exist as wiki drafts in space `orvexstudioidentity` — *machine check: `docmost-cli page get <slug-of-each> --no-daemon` returns status=draft pages* [Source: P1 yXUWpQpRjx §3]
- [ ] Build-prompt stories pass the `9VUHxAcoXw` FINAL SELF-AUDIT (H1–H17 all "yes") — *machine check: each story body carries the audit block with every row `yes`* [Source: Issue Authoring 9VUHxAcoXw H1–H17]
- [ ] SDD is complete (every eventual-need line present + evidenceable), not just the wave slice — *machine check: each SDD line maps to a concept-to-service-map entry or a canon cite* [Source: P1 yXUWpQpRjx §3 artifact 4]

## 2. ✅ Acceptance Criteria

- [ ] **AC1 — PRD-delta (reconciled).** Given the umbrella brief and the concept-to-service map, When the PRD-delta is authored, Then every added FR/NFR carries a brief/map cite and is reconciled against the **deployed** identity artifact (not the `status: draft` PRD). *Machine-checkable: the PRD-delta draft cites `rgBOQh31p3` on every added FR and names the reconciliation baseline as the live repo.* [Source: P1 yXUWpQpRjx §2; Map current-state-map §1]
- [ ] **AC2 — Frozen tagged contract.** Given the identity surface (`/v1/introspect`, `/v1/tokens`, `/v1/exchange` (FR-15), `/v1/whoami`, `/api/clerk/provision`+`/deprovision`, OIDC RP `/auth/oidc/*` + SCIM `/scim/v2/*`), When the OpenAPI + CloudEvents (`studio.*` on the ADR-0007 envelope) + golden fixtures land in `orvex-studio-contracts` and are tagged, Then the tag is the Phase-2 dispatch gate. *Machine-checkable: the tag exists and its fixtures round-trip green in contracts CI.* [Source: P1 yXUWpQpRjx §3 artifact 2; identity evidence §4]
- [ ] **AC3 — Identity-spine surface.** Given every satellite verifies its authenticated routes against this service, When the contract is frozen, Then it presents the IdP-agnostic principal `{idp, subject, tenant, org_or_realm, roles, token_scope}` over **dual first-class IdPs (Clerk + Keycloak/MyIDP)**. *Machine-checkable: the contract's principal schema enumerates all six fields and both IdP issuers.* [Source: SE-Arch 8sYi523i4t security lens; identity evidence §1/§3]
- [ ] **AC4 — Credential lanes bound.** Given ADR-0034 credential lanes, When the pack authors token/exchange/broker shapes, Then each auth shape is mapped to its ADR-0034 lane (user session vs MCP/agent token vs service-to-service). *Machine-checkable: the contract annotates every token-minting op with its ADR-0034 lane.* [Source: ADR-0034 12aDkq4iOd]
- [ ] **AC5 — Clerk-lifecycle seam must-resolve.** Given the deprovisioner/Clerk-webhook-ingestion ownership is split across `identity` and `orvex-studio-workflows` (F2/F-IDP), When the pack freezes, Then this seam is flagged as a review must-resolve and ruled **in lockstep with the workflows pack — one ruling, not two** — never silently chosen. *Machine-checkable: the PRD-delta contains a must-resolve item naming the identity-vs-workflows Clerk-lifecycle owner and cross-links the workflows pack.* [Source: Map current-state-map §3 risk 9, §5 P1-6/OQ-6]
- [ ] **AC6 — Reconciliation over stale canon.** Given the PRD is `draft` yet carries USER-locked decisions (D-S17 polymorphic tenancy, D-S3 native-login removal, D-S12 Mongo struck, D-S13 outbox+relay), When the delta reconciles, Then the deployed artifact + migration assessment win over stale "~90% unbuilt" canon. *Machine-checkable: the reconciliation note cites the live repo + migration-assessment as authority.* [Source: P1 yXUWpQpRjx §2; identity evidence §3]
- [ ] **AC7 — Rejection: untagged blocks dispatch.** Given a claimed-but-unverified tag, When Phase-2 attempts dispatch, Then dispatch is refused. *Machine-checkable: no `git tag` for the service ⇒ the pack DoD stays red.* [Source: P1 yXUWpQpRjx §7 fake-done]
- [ ] **AC8 — Rejection: REVISE bounces.** Given a review verdict of REVISE, When findings are posted, Then a fix pass runs and the verdict is never overridden. *Machine-checkable: a `PACK-REVIEW: REVISE` comment forbids advancing to Done until a later `PACK-REVIEW: PASS` exists.* [Source: P1 yXUWpQpRjx §4]
- [ ] **AC9 — Forward-compat.** Given a future wave adds token/registry features, When it lands, Then it MUST NOT reshape the frozen principal or exchange-token envelope without an ADR-0008 breaking-change + human ratify. *Machine-checkable: any envelope reshape carries an ADR + human-ratify record.* [Source: ADR-0008 change-authority]

## 3. 🔨 Tasks/Subtasks

- [ ] Read canon: brief `rgBOQh31p3`, plan `5eFdxN3edd`, ADR-0034 `12aDkq4iOd`, ADR-0035 `QbEBPuKcGR`, cell contract `JGAUQRsw2g`, SE-Arch `8sYi523i4t`, the identity evidence digest + current-state-map §2/§3/§5. (AC: 1,3,4,5)
- [ ] Draft **PRD-delta** into space `orvexstudioidentity` (page `identity-prd-delta`), reconciled against the deployed M9 artifact; cite every added FR/NFR. (AC: 1,6)
- [ ] Flag contested seam as a must-resolve, NOT a silent choice: **Clerk-lifecycle deprovisioner/webhook owner (identity vs workflows)** — cross-link the workflows pack. (AC: 5)
- [ ] Author **contract + golden fixtures** (OpenAPI for the `/v1/*` + `/api/clerk/*` + OIDC/SCIM surface; `studio.*` CloudEvents for provision/deprovision lifecycle) → land in `orvex-studio-contracts`, **cut the tag** (scheme per the W1 contracts pack), generate Go stubs + TS clients per ADR-0035. (AC: 2,3,4)
- [ ] Author **test plan** (page `identity-test-plan`): unit / store (testcontainers Postgres+Redis) / contract (fixture round-trip in CI) / crew-slot / family-E2E per CS §5; JWKS + OIDC + Clerk webhook are mocked as remote-but-owned/true-external. (AC: 2)
- [ ] Author **SDD** (page `identity-sdd`): full eventual surface (introspect/tokens/exchange/whoami, device-grant, OIDC RP, SCIM, org→cell registry, provision/deprovision), events, entitlement (tenant-key supply only — billing owns caps), cell-lint compliance, obs+SLOs, runbook, family-E2E. (AC: all)
- [ ] Author **per-agent build prompt** (page `identity-build-prompt`) whose STORIES meet the full 9-section H1–H17 `9VUHxAcoXw` standard incl. FINAL SELF-AUDIT. (AC: all)
- [ ] Request **adversarial review** (reviewer ≠ author); run fix pass if REVISE; tick boxes only when genuinely verified; hand to orchestrator for Done advance. (AC: 8)

## 4. 🧠 Dev Context

**Inputs table**

| Canon page/slug | What it feeds in this pack |
|---|---|
| Brief `rgBOQh31p3` | Product features the PRD-delta folds in (dual-IdP SSO, agent-token brokering) |
| Map `current-state-map` §2/§3 | Concept-to-service map; the Clerk-lifecycle contested seam |
| ADR-0034 `12aDkq4iOd` | Credential lanes that bind the auth/token shapes |
| ADR-0035 `QbEBPuKcGR` | TS-client generation for TS satellites off the contract tag |
| Cell contract `JGAUQRsw2g` | 14-rule cell-lint the pack declares compliance with |
| identity evidence digest | Deployed-artifact reconciliation facts (M9, 501 stubs, D-decisions) |

- **Wiki space slug:** `orvexstudioidentity`. **Evidence file:** `_bmad-output/planning-artifacts/briefs/brief-orvex-studio-2026-07-13/evidence/orvexstudioidentity.md`.
- **Live-repo-wins reconciliation:** the repo (real Go, live deploy, M9 closed) + migration assessment outrank the `draft`/"~90% unbuilt" space canon. [P1 yXUWpQpRjx §2]

**Contested seams this pack MUST resolve or flag**

- [ ] **Clerk-lifecycle owner (identity vs workflows):** deprovisioner/webhook ingestion is double-owned (F2/F-IDP) — flag as review must-resolve; rule in lockstep with the workflows pack. [Map §3 risk 9]
- [ ] **A-TOKEN freeze blockers:** OQ-I2 (Clerk token primitive machine vs M2M) + OQ-I6 (Keycloak tenant unit realm vs group) are security-load-bearing and unresolved — resolve or flag before freezing the token contract. [identity evidence §3/§6]

**❌ classic-mistakes (CS §0) — all 12 assessed**

| ❌# | Mistake (CS §0 canonical) | Assessment |
|---|---|---|
| ❌#1 | Domain logic in a handler / cmd/ / main.* | NOT APPLICABLE — definition-only; this row binds the build-prompt stories this pack authors (their handler code), carried into the build prompt as a guard, not the pack's own artifacts |
| ❌#2 | Raw store-driver calls outside their store package | NOT APPLICABLE — definition-only; binds the build stories' Repository seam (incl. tests), carried as a build-prompt guard, not the frozen contract |
| ❌#3 | Premature interface / seam | APPLICABLE — the pack pins the principal/exchange ports and the identity↔workflows Clerk-lifecycle seam; these sit at network seams where a port IS justified, and the contested seam is flagged must-resolve (not premature-abstracted) |
| ❌#4 | Mocking own packages | APPLICABLE — the pack's test plan freezes mock categories: own packages tested through the exported interface with real/in-memory substitutes; JWKS/Clerk/Keycloak are true-external, Postgres/Redis via testcontainers |
| ❌#5 | Horizontal slicing (all tests, then all code) | NOT APPLICABLE — definition-only; binds the build-prompt stories' RED→GREEN vertical tracer sequencing, carried as a build-prompt guard |
| ❌#6 | Big-upfront struct / schema | APPLICABLE — binds the principal + exchange-token + provision contract/schema shapes this pack freezes: only the fields the wave slice needs, with eventual needs tracked in the SDD, not baked into the frozen contract |
| ❌#7 | Shallow pass-through package | APPLICABLE — the tier/seam placement pins identity as a deep module (family auth verifier); guards against a pass-through wrapper over Clerk/Keycloak that would fail the deletion test (CS §3.1) |
| ❌#8 | Inline credentialed/IO client | APPLICABLE — the contract/SDD pin JWKS/Clerk/Keycloak clients as configured clients injected at the seam, credentials via env only |
| ❌#9 | Time/randomness in the projection layer | APPLICABLE — the studio.* provision/deprovision lifecycle events on the ADR-0007 envelope pin timestamps derived from event payloads; any org→cell registry read-model must stay deterministic |
| ❌#10 | Raising a ratified operational ceiling to make CI pass | APPLICABLE(guard) — identity supplies only the tenant key; caps/quotas/ceilings live in billing and are human-ratified (ADR + sign-off), never raised here to make CI pass |
| ❌#11 | Domain logic in cmd/ / handler files | NOT APPLICABLE — definition-only; binds the build-prompt stories' handler files (routing + marshalling only), carried as a build-prompt guard |
| ❌#12 | any / interface{} type-laundering across boundaries | APPLICABLE — the OpenAPI/CloudEvents contract + generated Go stubs/TS clients (ADR-0035) must carry concrete typed structs across the exported principal/token surfaces; unknown is the only sanctioned TS placeholder |

**SE-Arch lenses (all 5)**

- **Reliability:** livez/readyz split pinned (readyz = real Postgres/Redis/JWKS round-trip); `/healthz` demoted to doctor-alias. [identity evidence §4]
- **Security:** the identity spine every authenticated route verifies against; deny-by-default; break-glass scoped to console admin plane only. **This is the load-bearing lens.**
- **Cost governance:** identity holds no LLM/quota surface — supplies the tenant key; billing owns caps (❌#10 guard).
- **Operational excellence:** cell-lint compliance (`JGAUQRsw2g`); org→cell registry routing-only, not an entitlement authority.
- **Performance/freshness:** JWKS/issuer-registry read-path cache TTL (OQ-I7) named; deferred to build if unresolved.
- **ADR triggers this pack fires:** A-TOKEN/A-VERIFY, A-SESSION, A-CELL-REGISTRY (new external dependency + auth-flow change) — authored as drafts, human-ratified downstream. [identity evidence §3/§6]

## 5. 🧪 Verification

- [ ] Adversarial review verdict **PASS** (reviewer ≠ author) — *live-read the wiki drafts via `docmost-cli --no-daemon`, never the cache.* [Source: P1 yXUWpQpRjx §7]
- [ ] Contract tag **exists** in `orvex-studio-contracts` and its fixtures **round-trip green** in contracts CI — *a claimed tag is not a tag.* [Source: P1 yXUWpQpRjx §4]
- [ ] TS clients + Go stubs generate off the tag per ADR-0035. [Source: ADR-0035 QbEBPuKcGR]
- [ ] Build-prompt stories pass the H1–H17 FINAL SELF-AUDIT. [Source: 9VUHxAcoXw]
- [ ] SDD completeness checked against the concept-to-service map (every eventual-need line evidenceable). [Source: P1 yXUWpQpRjx §3 artifact 4]

**What NOT to fake:** no self-review (reviewer ≠ author is mandatory + non-overridable); no claimed-but-unverified tag; no SDD trimmed to the wave slice; no invented NFR/TTL numbers (write "TBD — defined by <owner>"); never silently pick the Clerk-lifecycle owner.

## 6. 📏 Guidance to follow

CS `6aMAzsYeQb`: §0 (12 ❌), §3 (deep-module + **design-it-twice on the identity/workflows Clerk seam**), §4 (TDD contract binds the build-prompt stories), §5 (mocking categories — JWKS/Clerk/Keycloak are true-external; Postgres/Redis testcontainers), §6 (tier placement — auth verifier is family-wide infra), §7 (seam map — this contract pins the principal + exchange-token + provision seams), §8, §10, §11, §12 (wiki-first; pinned contract is contract-shape law), §13. SE-Arch `8sYi523i4t`: all 5 lenses + decision trees + fake-done prevention. Cell-lint `JGAUQRsw2g` (14 rules). **NO-MONGO (D-S12):** persistence = Postgres (RLS + JSONB append) + Redis; event data via transactional outbox + relay direct-to-Kafka (D-S13) — strike any Mongo/Redis→Kafka-bridge wording.

## 7. 🔗 References

- Plan `5eFdxN3edd` (Phase 1 = Definition Factory; Wave 3) · P1 prompt `yXUWpQpRjx` (§2 reconciliation, §3 five artifacts, §4 stage gate, §7 fake-done)
- Brief `rgBOQh31p3` · Coding Standards `6aMAzsYeQb` (§0/§3/§4/§5/§6/§7/§12) · SE-Arch `8sYi523i4t` (5 lenses)
- Issue Authoring `9VUHxAcoXw` (H1–H17) · ADR-0008 (change-authority) · ADR-0034 `12aDkq4iOd` (credential lanes) · ADR-0035 `QbEBPuKcGR` (Go↔TS bridge)
- Cell + tenancy contract `JGAUQRsw2g` (14-rule cell-lint)
- Evidence: `evidence/orvexstudioidentity.md`, `evidence/current-state-map.md` §2/§3/§5, `evidence/migration-assessment.md`, `program-status-2026-07-14.md`

## 8. 🔗 Dependencies

- **Project:** Orvex Studio Identity · **Milestone:** P1 — Definition Factory
- **Blocked by:** Wave-2 gate (`wave2-gate` → ENG wired at filing) — Wave 3 opens only when Wave 2 certifies.
- **Blocks:** Wave-3 gate (`wave3-gate` → ENG wired at filing).
- **Lockstep counterparty:** the `orvex-studio-workflows` pack — the Clerk-lifecycle seam is ruled once across both, never twice.
- **Deferred work named with future owner:** per-service P1 milestone creation → PO (Linear-MCP human dependency); A-TOKEN/A-VERIFY/A-SESSION/A-CELL-REGISTRY ADRs → drafted here, human `doc-ratify` downstream; build/test story issues are born FROM this pack, not before it.

## 9. 📡 How to update Linear and behave — STAGE-BY-STAGE

1. **CLAIM** — move Todo→In Progress; post agent + model; resolve claim per ADR-0033 `yNFx3YyNap`. 2. **PLAN** comment. 3. **PROGRESS** comments continuously (each artifact drafted/landed; blockers). 4. **COMMITS** — every commit/PR body carries **"Part of ENG-NNN"** (links, never closes). 5. **STAGE HANDOFF** author→review. 6. **REVIEW** — reviewer (≠ author) posts `PACK-REVIEW: PASS|REVISE` + findings; REVISE bounces to a fix pass, never overridden. 7. **TICK** boxes only when genuinely verified (full-body read-modify-write; preserve every other byte). 8. **DONE** — ONLY the delivery orchestrator advances; author CANNOT self-advance (fake-done gate). 9. **ESCALATIONS** as comments; judgment calls logged "orchestrator judgment under PO standing authority". Writes via the `linearis` CLI; reads from `.cache/linear/`; never the Linear MCP.
