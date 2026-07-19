# Orvex Studio — Product Acceptance E2E: Test Architecture & Strategy

**Author:** Murat (Master Test Architect, bmad-tea) · **Date:** 2026-07-13 · **Status:** draft
**Mandate (PO, verbatim):** *"I don't want to find a buggy system… test clerk, onboarding new user, new interface parity with poc, demo system, absolutely everything."*
**Phase-1 done definition (MEMORY):** DONE = Orvex Wiki fully WORKS via every surface (api/mcp/cli/ai/rag/knowledge-sync) **and** the UI, reproduced on a fresh tenant with real data — **not** "gates green."

Borrowed mechanics are cited to the Houston E2E page (**houston / slug `N1ZdF21bWq`**, "E2E Testing — Playwright & Clerk"). Coding-Standards rules cite `CS §N` (`6aMAzsYeQb`). This is a *pointer* strategy — it reuses the wiring already in `orvex-studio-ui` and the POC, and adds only what the mandate requires.

---

## 0. Thesis and the honest starting line

The evidence is unambiguous (`current-state-map.md` §4; `migration-assessment.md`): **strong build, not migrated.** Every satellite is real deployed code on ONE dev cell first switched on 2026-07-13; prod runs vanilla Docmost with modules OFF; **no surface has a green, human-verified, real-data end-to-end pass**, and the exact integration gate (`TestM5KnowledgeE2E`) has a documented fake-done/RED history (`po-decisions/fake-done-forensics.md`). The PO's fear — *"a complete dump of code with nothing working"* — is the measured current state, not a hypothetical.

Therefore the E2E architecture is built around **three non-negotiables**:

1. **Reproduced, not reported.** A Linear "Done" or a gate-journal line is *not* evidence (six-surface protocol, `migration-assessment.md` §4). Every acceptance assertion drives the real round-trip against the dev cell with a fresh tenant, a real identity-minted token, and real data.
2. **Positive assertions, never vacuous ones.** Assert the *signed-in* state (nav chrome, product routes, a real BFF Bearer call landing) — never merely the absence of a "Sign in" button, which passes while Clerk is still `isLoading` (the exact trap `liveOnboardingSignIn.spec.ts` already documents; Houston "Writing new tests").
3. **Fake-done is the enemy the suite is designed to catch.** Skips are logged with their blocker and counted; a skipped acceptance step is **never** a pass. FAIL-never-SKIP for anything inside a gating tier (the POC's `all-real-hardening.spec.ts` / `whole-prd-demo-flow.spec.ts` posture, CS §11).

---

## 1. Suite architecture — tiers, cadence, gating

Four tiers. Each tier is a distinct Playwright project set (or vitest config) with its own trigger and its own gating verb. **A test lives in exactly one tier** — no spec is both a smoke test and a parity test.

| Tier | Purpose | Runtime budget | Trigger / cadence | Gating verb |
|---|---|---|---|---|
| **T0 — Smoke** | "Is the family alive?" — every surface boots, one page loads, no white screen, Clerk gate resolves | ≤ 3 min | Every PR (per-repo), every deploy to dev cell, pre-merge | **Blocks merge.** Red T0 = the PR does not merge. |
| **T1 — Critical-journey** | The revenue/trust spine: sign-up → onboarding → first skill → publish → import → the £7 gate | ≤ 12 min | Every PR touching a journey-owning service; nightly on dev cell | **Blocks merge** for the implicated service; nightly red **freezes merges** family-wide for that journey (the plan's ratchet). |
| **T2 — Full-parity** | The POC-parity matrix: every one of the ~35 POC surfaces reproduced on the DS, + the six-surface protocol, + demo world, Librarian loop, marketplace, sync, private memories, pricing | ≤ 45 min | Nightly on the dev cell (`crew-up.sh` full family); on every milestone-arming merge | **Ratchet, not per-PR gate.** A parity regression opens a defect + freezes the implicated surface's merges until green. |
| **T3 — Regression + non-functional** | Visual/screenshot sweep, dual-theme, WCAG AA (axe), perf budgets, the never-white-screen degradation sweep, flake-quarantine re-runs | ≤ 30 min | Nightly; pre-release; on any UI surface PR (visual + axe subset travels *with* the surface) | Visual/axe/perf **block the owning surface's merge**; the broad sweep is a nightly ratchet. |

**Design rules for the tiers**

- **T0 is the Houston bypass suite, generalized.** It boots each SPA/service and asserts the shell renders with *no credentials* where the surface is auth-independent (mock/edge data), exactly as Houston's `console.spec.ts` does (bypass mode, no Clerk dependency; houston `N1ZdF21bWq`). Fast, deterministic, zero secrets, runs on every PR. The target repo's `honest-empty-state.spec.ts` (M3, no-BFF) is the seed of this tier.
- **T1/T2 are the Houston authed suite, generalized.** They boot with the Clerk publishable key present, real gate live, and sign in programmatically (§2). The target repo's `liveOnboardingSignIn.spec.ts` and `m11SpaE2E.spec.ts` are the seeds.
- **Self-guarding, per Houston.** Each authed spec guards itself with `test.skip(...)` on missing secrets so a plain `playwright test` runs T0 green and *silently* skips authed specs when no secrets are present (houston "The two-mode strategy") — **but** inside a gating CI run the secrets are always present, so a guard that trips is a red build, not a green skip (FAIL-never-SKIP; the guard is a developer-ergonomics affordance, not a CI escape hatch).
- **The nightly ratchet is the anti-mess mechanism the program plan names** (Phase 2, "a red family run freezes merges"). T2 nightly is where "94% Done" is continuously re-converted into "proven working." Test the ratchet deliberately once (break a surface, watch merges freeze) — that test is itself an acceptance criterion of the E2E program.

---

## 2. The Clerk strategy (adapted from Houston `N1ZdF21bWq`)

Clerk is the hard part and the mandate names it first. The good news: `orvex-studio-ui` **already has the Houston pattern wired** — `@clerk/testing@2.2.6`, project-based `clerkSetup`, the ticket strategy against live `orvex.dev` (`playwright.liveOnboarding.config.ts` + `liveOnboardingSignIn.spec.ts`), and a password variant for the deployed stack (`playwright.m11.config.ts`). We standardize and extend it; we do not reinvent it.

### 2.1 Why programmatic sign-in is mandatory

Production Clerk is **OAuth-only** (Continue with Google) and **invitation/org-gated** — driving the login form is impossible (houston "Why Clerk makes this hard"). Two things gate the console: a Google-only first factor **and** org membership; a signed-in user with **no org is locked out by `OrganizationGate`** (houston Gotchas). Clerk **Testing Tokens bypass bot-detection only — they do NOT sign anyone in** (houston "Testing Tokens ≠ login"). So sign-in happens through the Backend/testing helpers, never the UI.

### 2.2 Token minting — the ticket strategy is our default

Adopt Houston's ruling: **for a strictly OAuth-only instance, use the `ticket` strategy** — mint a `sign_in_token` via `POST /sign_in_tokens` with the secret key and sign in with `{ strategy: 'ticket', ticket }`; it bypasses all configured first factors (houston "Choosing a sign-in strategy", table row 3; already implemented in `liveOnboardingSignIn.spec.ts::mintSignInTicket`). Rationale: it is the only strategy that survives production posture unchanged, so the same spec runs on the dev cell *and* against live `orvex.dev`.

- **Per test:** `setupClerkTestingToken({ page })` injects the Testing Token, then `clerk.signIn({ page, signInParams: { strategy: 'ticket', ticket } })`, then **re-`goto`** so `OrganizationGate` re-evaluates with the fresh session and drops into the app (houston step 2; `liveOnboardingSignIn.spec.ts`).
- **`email_code` (OTP `424242`) is the secondary strategy** for signup-*flow* tests that must exercise Clerk's own UI (the fixed test OTP needs no real inbox; houston table row 1). `+clerk_test` emails are mandatory for these.
- **`password` is retained only** where a spec must prove the custom full-page `/sign-in` email+password flow (the POC `visual-sweep.spec.ts` + target `playwright.m11.config.ts` path). Set `E2E_CLERK_USER_PASSWORD`.

### 2.3 Setup wiring — the two Houston gotchas are load-bearing

- **`clerkSetup()` MUST be a project-based dependency**, declared as a `dependencies` entry of the `chromium` project — a function `globalSetup` runs in a separate process and its env vars (`CLERK_FAPI`, `CLERK_TESTING_TOKEN`) **never reach the workers** ("Clerk Frontend API URL is required."; houston Gotchas + step 1). The target's `liveOnboarding.config.ts` already does this (`clerk-setup` project → `dependencies: ['clerk-setup']`). **Every** authed config must follow it.
- **Never add `--disable-web-security`** to Chromium launch args — it strips the `Origin` header, Clerk's FAPI rejects the environment-config request, and the auth components silently degrade (houston Gotchas; the `liveOnboarding.config.ts` comment already flags this). Any config that adds it fails review.

### 2.4 Storage-state reuse — the scale answer

Houston signs in per test. At ~35 surfaces × multiple principals that is too slow for T2. Extend the pattern: the **`clerk-setup` project persists a signed-in `storageState` per principal** (`playwright/.auth/{principal}.json`), and journey specs consume it via `use: { storageState }` — one ticket mint per principal per run, not per test. This is the standard Playwright auth-project pattern layered onto Houston's programmatic sign-in; the ticket mint stays in setup, the workers reuse the cookie. Storage-state files are git-ignored and rebuilt every run (never committed — they contain live session cookies).

### 2.5 Principals — org vs personal, and the firewall assertion

The platform is polymorphic `{user | org}` (cell/tenancy canon). The suite provisions **four standing test principals** per run (disposable, §4):

| Principal | Type | Purpose |
|---|---|---|
| `solo+clerk_test` | personal (no org) | Consumer surface; the personal-workspace journeys; the **personal→Teams upgrade** source |
| `teamowner+clerk_test` | org owner | Business surface; org-scoped writes; the upgrade *target* |
| `teammember+clerk_test` | org member (non-owner) | RBAC / entitlement-scope assertions inside the org |
| `intruder+clerk_test` | separate org | **The org firewall oracle** — must get *different* hits and *zero* cross-tenant reads |

- **Personal→Teams upgrade journey (T1).** Start as `solo` in a personal workspace; run the upgrade to a Teams org; assert (a) prior personal content is carried/visible per the product's migration contract, (b) the principal token now carries the org claim, (c) org-scoped BFF calls succeed. This exercises the real Clerk `org.created` webhook → CloudEvent → Temporal `ProvisionWorkflow` → wiki workspace path that `liveOnboardingSignIn.spec.ts` already proves for fresh provisioning — extended to the *upgrade* edge.
- **The org firewall assertion (T2, security-critical).** Two principals with different ACLs must get **different** results from the *same* query — the six-surface `rag` requirement: "two callers with different ACLs get different hits… no cross-tenant/over-expose leak" (`migration-assessment.md` §4). `intruder` attempts to read `teamowner`'s pages via api/rag/mcp and **must** fail-closed. A cross-tenant read is an **automatic REVISE** per the SE-Arch gate — so this assertion is a hard T2 gate, not a nice-to-have. Also assert the identity exchange-token path fail-closes on wrong key/iss/aud (six-surface cross-cutting seam).

---

## 3. Coverage matrix by risk

Risk = probability × blast-radius, scored against the current-state-map's top-10 program risks and the fake-done history. **Highest risk first; that is also the build order for the suite.** Each row names the tier, the oracle (how we know the right answer), and the anti-fake-done assertion.

### R1 — Clerk auth journeys · risk: CRITICAL (mandate #1; the "nothing works" symptom is an org-gate lockout)
- **T0:** gate resolves, no white screen, no Clerk error boundary, positive signed-in chrome (not absence-of-signin).
- **T1:** ticket sign-in past `OrganizationGate`; sign-out → sign-in → reload survives (POC `mb3-signout-signin-reload.spec.ts` parity); org-vs-personal principal lands in the correct surface; the exchange-token → engine `session/exchange` → session mint round-trip attaches a real Bearer to a BFF call (`liveOnboardingSignIn.spec.ts` `authorizedRequests > 0` assertion — the anti-vacuous oracle).
- **Oracle:** POC `ma4-auth-boundary.spec.ts`, `ma1-consent-session.spec.ts`; Houston authed suite.

### R2 — NEW-USER ONBOARDING · risk: CRITICAL (mandate #2; the first impression the PO is judged on)
Sub-journeys, each an explicit T1 acceptance step:
- **First-run state machine.** Fresh session → `/app/onboarding` → renders ≥3 `[data-wisp]`, **no** role-tiles, submit disabled-when-empty, type → `POST /api/memory/declare` fires with the description in body → navigate to `/app/onboarding/stream` (POC `onboarding.spec.ts` DoD contract, now runnable live). No dead-end state; every branch of the state machine has an exit.
- **FormSpec streaming < 3s + deterministic fallback.** Assert the streaming Memory-declaration first token/paint budget < 3s **and** that the deterministic fallback renders when the stream is slow/unavailable — the fallback is the *production* `withFallback` timeout-race adapter observed through the public interface, **never** a `vi.mock` (POC `whole-prd-demo-flow.spec.ts` AC2/AC5/AC14 posture, CS §11). A blank pane past 3s with no fallback = **fail** (never-white-screen, R11).
- **~8-persona demo-data selection.** The profession/persona picker offers the ~8 personas, selection seeds a coherent demo world, and the seeded world is internally consistent (skills reference real memory, marketplace shows the persona's items). Oracle: POC `visual-sweep.spec.ts` "seeds a demo world via the profession picker when offered" + `proto-onboarding/demoApi.ts`.
- **Tour ≤ 4 steps.** Assert the guided tour is present, is ≤ 4 steps, is dismissible, and does not trap focus (ties to R12 keyboard-loop). A 5th step is a fail against the product contract.

### R3 — POC PARITY · risk: HIGH (mandate #3; the interface migration is a ~17× rewrite onto a different stack — the highest-volume regression surface)
This is the load-bearing section and needs a **maintained artifact**, not prose.

- **Build the parity matrix as a checked-in file** (`e2e/parity/parity-matrix.yaml` in `orvex-studio-ui`), one row per POC surface. Seed it mechanically from the POC's ~35 routes (`/app/discover`, `/app/marketplace`, `/app/library`, `/app/collections`, `/app/memory`, `/app/librarian`, `/app/create/:skillId`, `/app/skill/:slug`, `/app/s/:skillId/{use,make,export}`, `/app/review`, `/app/drafts`, `/app/published`, `/app/following`, `/app/activity`, `/app/wiki`, `/app/u/:handle`, `/app/settings`, `/app/onboarding/*`, marketplace/discover/share public routes, …) crossed with the POC's e2e specs.
- **The POC's e2e specs ARE the parity oracle.** Each POC spec (`ma2-discovery-closer`, `ma3-viewer-builder-closer`, `mb3-library-closer`, `mb4-marketplace-closer`, `mb4-publish-lineage-closer`, `mb1-export-share-closer`, `mb7-wiki-closer`, `skill-detail/*`, `builder/*`) names the behavioral contract that surface must still satisfy after the rewrite. Parity = **behavior preserved, not markup preserved** (the port is Tailwind+Radix+CVA → DS-tokened; markup differs by design, per the plan). So each matrix row records: the POC spec that is the oracle, the target spec that reproduces it, and a **semantic-locator mapping** (`getByRole`/`getByText`/accessible name — never CSS/testid, per Houston "Writing new tests" and the POC's own no-`data-testid` posture where it holds).
- **Maintenance rule.** A surface is not "ported" until its matrix row has a green target spec whose assertions are the POC spec's assertions. The matrix is a T2 gate: an unported/red row blocks that surface's Wave from reporting Done. When the POC evolves a spec, the matrix row goes stale → re-derive. This is the parity ratchet.
- **Coverage note:** parity covers *behavior*; look-and-feel parity is R13 (visual/dual-theme), and the DS is the *new* contract there — we do **not** pixel-match the POC (different design system), we hold the "looks good AND works" delight bar.

### R4 — Six-surface product acceptance · risk: CRITICAL (this is the Phase-1 done definition itself)
Reproduce `migration-assessment.md` §4 as **T2 specs on the dev cell, fresh tenant, real token, real data** — one spec per surface, each asserting the exact contract:
- **api** — via `orvex-wiki-api /v1`: `save`→`get`→`edit` block-patch with `ifVersion`; a stale write returns **409 VERSION_MISMATCH**; receipt `{url,id,version,persisted:true}`; the write actually lands in the engine ydoc via the chokepoint (no partial writes).
- **mcp** — an agent over `/mcp` (Streamable-HTTP) round-trips a real read+write via a tool that fans out to wiki-api/knowledge/ai/identity; tool parity growing toward 73 (assert the count is monotonic, not that it is 73 today).
- **cli** — `orvex-cli`/`docmost-cli` writes+reads a page through `/v1` (not the legacy engine path); a **byte-faithful DfM round-trip** that survives — this directly disproves the edit-path-corruption memory (bold+code, table pipes); assert full-text+marks equality, not run-by-run (the coalesces-text-runs memory).
- **ai** — cited-ask returns `{answer, citations, confidence, unanswered, gapNote, followups}` with citations to *real* pages; the delegated scoped token is used for retrieval and for the inline-edit write-back (no elevated credential).
- **rag** — hybrid Turbopuffer query is tenant-namespaced + ACL∩token-scope filtered; the R2.5 firewall (two ACLs → different hits); `tsvector` genuinely gone.
- **knowledge-sync — THE linchpin, weakest link, fake-done history.** Mutate a page → one `wiki.page.content_updated` CloudEvent commits to the engine transactional outbox → relays to Kafka → knowledge indexes → searchable within SLA. Require an **end-to-end message trace** (closes the message-tracing-across-outbox gap). This spec re-earns `TestM5KnowledgeE2E` honestly — it is the single spec most likely to have been fake-done, so it gets the strictest FAIL-never-SKIP and a human-observed sign-off.
- **Cross-cutting:** identity exchange fail-closed on wrong key/iss/aud; billing **402 QUOTA_EXCEEDED** on both REST and collab paths; single-host ingress proves zero client-URL change across the split.

### R5 — Demo World + demo-data graduation · risk: HIGH (the "demo system" in the mandate)
- Seed the ~8-persona demo world (R2); assert it is coherent and browsable end-to-end (the POC `whole-prd-demo-flow.spec.ts` is the closing-gate oracle — 16 AC steps composing every milestone).
- **Graduation:** when the user creates real content, demo data must *graduate* correctly — demo items are clearly marked, do not leak into the user's published/marketplace footprint, and are removable. Assert the boundary between seeded-demo and user-real never blurs (a real trust risk for the "demo system").

### R6 — The Librarian loop · risk: HIGH (contested seam: Curator/api vs staging; today it's the ad-hoc `doc-librarian` skill)
Journey: **capture → intake → ritual → shelves → Memory/wiki.** T2 journey spec drives capture (via MCP `capture` verb / the `/app/librarian` surface), the intake queue, the ritual/review step, shelving, and confirms the artifact lands in Memory (`/v1/memory`) or the wiki. Oracle: POC `LibrarianSurface.tsx`/`LibrarianRoute.tsx` + the review specs (`round2d-claim-flow`, `round3-accept-reaches-readers`, `round3-publish-gate`). **Seam caveat in the spec header:** because ownership is mid-cutover (staging pre-build, Curator still in the BFF), the spec asserts the *behavior*, and is annotated with which service currently owns each step so it survives the cutover with only an owner-annotation change.

### R7 — Composer + task-first wizard · risk: HIGH (flagship "teaching" surface, brief centerpiece)
- Composer teaching flow and the task-first wizard produce a valid skill; the builder's deterministic render, delta-ops, and edit contracts hold (POC `builder/deterministic-render.spec.ts`, `builder/delta-ops.spec.ts`, `builder/edit.spec.ts`, `skill-detail/*` are the oracles). Assert deterministic render (same input → same output) and that Apply/Discard on the Improve-diff behaves (POC `copy-button-ENG999`, `whole-prd-demo-flow` AC steps).

### R8 — Marketplace + rating + reviews · risk: HIGH (revenue + trust surface)
- Publish → appears in marketplace with lineage; the **Orvex rating** renders and is honest (no fabricated scores); reviews can be written and are ACL-correct; fork/claim flows work (POC `mb4-marketplace-closer`, `mb4-publish-lineage-closer`, `skill-detail/fork.spec.ts`, `round2d-claim-flow`). Rating is a computed value — assert it against a known seeded input, never accept a placeholder.

### R9 — Chat import · risk: MEDIUM-HIGH (split seam: ETL in api `/v1/import`, indexing in knowledge)
- Import a chat history → `studio.conversation.imported` event → indexed → searchable/usable. Assert the pipeline round-trip and that imported content respects tenant isolation (feeds R4 rag). Oracle: POC `mb5` import/claim/sync milestone spec.

### R10 — Outbound sync · risk: MEDIUM-HIGH (per-vendor, with a hard caveat)
- Per-vendor outbound sync round-trips where the vendor allows it. **ChatGPT-blocked caveat:** the ChatGPT outbound path is expected-blocked by the vendor — the spec asserts the product **degrades gracefully and says so** (a clear "not available for ChatGPT" affordance), and is marked `expected-blocked`, **not skipped**. An `expected-blocked` result that starts *passing* (vendor unblocked) is a signal to revisit, not a silent state. This is the honest-degradation posture, not a coverage gap.

### R11 — Private memories consent gates · risk: HIGH (privacy = legal/trust blast radius)
- Private memories require an explicit consent gate before capture/exposure; assert the gate blocks capture until consented, that private items never surface in marketplace/rag/other-principal reads (ties to R2.5 firewall + R4 rag), and that revoking consent removes exposure. Oracle: POC `ma1-consent-session.spec.ts`. A private memory leaking to `intruder` is an automatic-REVISE-class failure.

### R12 — Pricing / tier gates · risk: CRITICAL (revenue correctness; the brief locked these and named a NO-CARD trial)
Explicit T1 acceptance steps, each asserting the exact contract:
- **Free caps** enforced; hitting a cap returns the **402 QUOTA_EXCEEDED** contract on REST *and* collab paths (R4 cross-cutting).
- **The £7 gate** — the paid feature is blocked below the tier and unblocks at/above it; the price is shown transparently (launch-readiness ADAPT item: price transparency).
- **402 surfaces** — every surface that can hit a cap renders a graceful 402 affordance (never a white screen; R11 never-white).
- **Free-month downgrade — NO CARD.** The free-month trial requires **no card**; at expiry the account **downgrades** (does not charge, does not hard-lock) to the free tier with caps re-applied. Assert: no payment method captured at trial start, no charge at expiry, correct downgrade state. This is the billing supersession the plan files (free-AI doctrine, no-card trial) — the spec is its acceptance oracle.

### R13 — Never-white-screen / graceful degradation · risk: CRITICAL (the "buggy system" the PO refuses to ship)
- **A cross-surface sweep:** for every surface, with the BFF/each upstream unavailable, the surface renders an honest empty/caution state — **never a white screen, never an unhandled error boundary.** Seed from the target's `honest-empty-state.spec.ts` (M3, no-BFF) and Houston's non-blocking `HealthBanner` caution-rail pattern (houston Gotchas). This is a *degradation* sweep run with upstreams deliberately down, distinct from the happy-path tiers.

### R14 — Dual-theme + WCAG AA + visual regression · risk: HIGH ("looks good AND works" bar; travels WITH each ported surface, never bolted on — plan §Phase-2)
- **axe WCAG AA** on every surface, both themes (target `a11y.axe.spec.ts` + POC `browser/aa-audit.spec.ts` are the seeds; `@axe-core/playwright` already wired both repos).
- **Keyboard loop / reduced-motion** ship-gate (POC `accessibility/keyboard-loop.spec.ts`).
- **Dual-theme** render correctness (POC `skill-page-both-themes.spec.ts`).
- **Visual/screenshot sweep** (POC `visual-sweep.spec.ts`, `state-trio-sweep.spec.ts`) — **NOT** pixel-matched to the POC (different DS); baselined against the *target* DS and diffed run-over-run for regressions. Design-token audit (`check-frontend-tokens.mjs` equivalent) travels with each surface.
- **Gate:** axe AA + keyboard-loop **block the owning surface's merge**; visual diffs open a defect and require a **human delight-check** sign-off (the plan's per-UI-surface exit criterion) — a machine cannot pass the "looks good" half.

---

## 4. Environments and data strategy

**Two environment classes, both real (CS §11 all-real, CS §5 mock-boundary only at sibling-service fixtures):**

- **Dev cell (shared) — the acceptance home.** The standing dev cell where the full microservices path runs. T2 six-surface acceptance and the nightly ratchet run here against real Postgres/Redis/S3/LiteLLM/Turbopuffer/Kafka. This is where "reproduced, not reported" is earned.
- **Crew envs (whole-family copies) — isolation + pre-merge.** `crew-up.sh` stands up a whole-family copy at `*.crew-{name}.orvex.dev`; `crew-slot.sh` routes ONE crew service into the shared dev flow (the real test-as-you-go mechanism, per the plan + cell/tenancy canon). A build wave runs its surface's T1/T2 against its crew copy before merge; the nightly full-family T2 runs against a fresh `crew-up.sh` family. The POC's `crew-start.sh` + ArgoCD `crew-applicationset.yaml` already generate `crew-{name}` namespaces — `orvex-studio-ui` matches, so **no new deploy plumbing** (plan exploration finding).

**Data strategy — disposable everything:**
- **Disposable tenants/users per run.** The four principals (§2.5) are minted fresh via the Clerk Backend API with `+clerk_test` emails (houston provisioning), their orgs Temporal-provisioned via the real `ProvisionWorkflow` (`liveOnboardingSignIn.spec.ts` — provision the ORG, not the user, through the real path). Nothing standing, nothing shared across runs → no cross-run contamination, no fake-done via stale seeded state.
- **Seeding = the product's own demo-world seeder** (the persona picker, R2/R5), never a back-door DB insert — because the seeder itself is under test. Where a sibling service must be faked for an *isolated* build, use contracts **golden fixtures** (CS §5), never `vi.mock` in an acceptance spec.
- **Cleanup:** `cleanupClerkUser` (POC `_helpers/clerk-test-mode.js`) tears down principals; crew namespaces are ephemeral (`crew-down`); storage-state files are git-ignored and rebuilt. A run that cannot clean up **fails loudly** (leaked tenant = a cost + isolation defect), it does not warn-and-continue (no-fallbacks memory: silent rot is the enemy).
- **Secrets** live in the cluster (External Secrets; e.g. the Houston `houston-clerk-credentials` pattern), pulled via `clerk env pull` without clobbering, **never committed** (houston "Running it"). `.env.m11.local` / `.env.example` are the seams; the real keys are cluster-side.

---

## 5. Flake policy + quarantine

Flakiness is treated as **the critical tech debt it is** (bmad-tea principle) — a flaky acceptance test is worse than no test because it teaches the team to ignore red.

- **Zero-retry in gating tiers by default.** T0/T1 run `retries: 0` (matching `liveOnboarding.config.ts`). A test that needs retries to be green is not green — it is a defect (either in the test's synchronization or in the product's timing).
- **The one legitimate retry:** `trace: 'on-first-retry'` for *diagnosis* on the nightly T2/T3 ratchet only, never as a pass-laundering mechanism in a merge gate.
- **Quarantine rule.** A test that flakes twice in a rolling 10-run window is moved to a `@quarantine` project — it **still runs** (visibly, nightly) but does not gate merges, and it **opens a defect ticket** with the trace. Quarantine has a **7-day SLA**: fixed or deleted, never left to rot. A quarantined *acceptance* test (R4/R12/R11 critical rows) escalates immediately — those cannot be quarantined silently because they guard revenue/privacy/isolation.
- **Root-cause taxonomy** the ticket must classify: (a) test synchronization (assert on visible outcome, not implementation — houston "Writing new tests"; the `isLoading`-race and hard-reload-vs-client-nav traps `liveOnboardingSignIn.spec.ts` already documents are the canonical two); (b) real product non-determinism (a genuine bug — the good outcome); (c) environment/infra (crew pod, Kafka lag) — fix the harness, not the test.
- **No `--disable-web-security`, no `PERF_RELAX`, no `DEMO_OFFLINE`, no budget-softening flag** may be added to make a test pass — these are the fake-done vectors the POC gates explicitly forbid (`whole-prd-demo-flow.spec.ts`; houston Gotchas).

---

## 6. CI wiring (CS §13)

- **Self-hosted runners only; no images built or pulled in CI** (CS §13). The E2E jobs run on the self-hosted ARC runners against the crew/dev-cell stacks; Playwright drives the **system `google-chrome` (`channel: 'chrome'`)** already present in the crew/CI image — no per-run browser download (the POC `playwright.config.ts` pattern: `channel: 'chrome'`, `--no-sandbox --disable-dev-shm-usage --disable-gpu` for in-container headless).
- **Tekton builds** produce the deployable; the E2E gate runs *after* deploy-to-crew, *before* merge (Foundation Orchestrator M3/M4 smoke+CI stages; the deterministic Done gate: ACs ∧ PRs merged ∧ milestone integration tests ∧ **E2E** ∧ SE-Arch PASS).
- **Per-tier CI mapping:**
  - **T0** — per-repo PR check, self-hosted, no secrets, bypass mode.
  - **T1** — per-repo PR check on journey-owning services, secrets injected (Clerk keys via External Secrets), crew copy.
  - **T2** — **nightly** scheduled job on the dev cell + on milestone-arming merges; publishes to a living dashboard page (plan §Phase-2); **a red run posts a merge-freeze** for the implicated services (the ratchet — the auto-close-on-merge Linear hazard means the freeze is enforced by the E2E gate, not by trusting Done transitions).
  - **T3** — nightly + pre-release; axe/visual/perf subsets attach to UI-surface PRs.
- **Reporting:** `[['github'], ['list']]` in CI (matching `liveOnboarding.config.ts`); JSON report artifact for the dashboard (the `accept4.config.ts` JSON-reporter pattern). SE-Arch PASS/E2E result mirrored to the PR **and** Linear.
- **The ghost-runner hazard** (MEMORY: ARC ghost registrations wedge jobs queued-forever) is a known operational risk — if E2E jobs hang queued, delete the AutoscalingRunnerSet so the finalizer clears them; do not misread a wedged queue as a red suite.

---

## 7. What is deliberately NOT e2e-tested (so the suite stays fast and honest)

E2E is expensive and flaky by nature; over-testing at this tier is how a suite rots. The following are **pushed down** to faster, more deterministic tiers — the E2E suite trusts them and does not re-prove them:

- **Field-level validation, DTO shapes, error vocab** → **contract tests** against contracts golden fixtures + Zod schemas (CS §5; the target already has `oneBffUpstream.contract.test.ts`, `cellBearingToken.test.ts`). E2E asserts the *journey*, not that every field validates.
- **Pure component logic, reducers, render determinism at unit level** → **vitest + RTL/jsdom** (both repos wired; the POC's `onboarding.spec.ts` correctly keeps the DoD proofs at unit level and defers only the browser-layout-dependent assertions to E2E). E2E does **not** re-test what jsdom already proves — it adds only the browser-only truths (real layout ≥48×48 tap targets, focus-trap, computed-style, actual paint timing).
- **Server-side business logic, quota math, ACL evaluation internals** → **service unit/integration tests** in each Go/TS satellite (the api repo's 40+ test files). E2E asserts the *observable contract* (402 returned, cross-tenant blocked), not the internal computation.
- **CAS/version-mismatch mechanics at the storage layer** → engine integration tests. E2E asserts the *receipt* (`409 VERSION_MISMATCH`, `persisted:true`), which is the api-surface's job (R4 api), and stops there.
- **Load/soak/throughput** → dedicated k6/perf runs, not the E2E tier (E2E perf budgets are *first-paint/journey-latency* thresholds only — POC `perf-budgets.spec.ts` scope — not throughput).
- **Cell-lint / tenancy static rules** → the 14-rule cell-lint CI gate (already binds every service). E2E proves the *runtime* firewall (R2.5), not the static rules.

**The honest boundary:** if a truth can be proven deterministically one tier down, it belongs there. E2E exists for the truths that **only** appear when the real family runs end-to-end on a real tenant with real data through a real browser and a real Clerk session — and that is exactly, and only, what the PO's mandate demands.

---

## Appendix A — Seed assets already in place (reuse, don't rebuild)

| Asset | Repo | Reuse as |
|---|---|---|
| `liveOnboarding.config.ts` + `liveOnboardingSignIn.spec.ts` (ticket strategy, project-based clerkSetup) | orvex-studio-ui | **The T1 authed harness template** (§2) |
| `playwright.m11.config.ts` + `m11SpaE2E.spec.ts` (deployed stack, password) | orvex-studio-ui | Deployed-stack variant + password-flow spec |
| `playwright.config.ts` + `honest-empty-state.spec.ts` (M3, no-BFF) | orvex-studio-ui | **T0 bypass + R13 degradation seed** |
| `a11y.axe.spec.ts` (`@axe-core/playwright` wired) | orvex-studio-ui | R14 axe baseline |
| `accept4.config.ts` (JSON reporter, throwaway probe pattern) | orvex-studio-ui | T2 dashboard-reporter pattern |
| `whole-prd-demo-flow.spec.ts` (16-AC closing gate, FAIL-never-SKIP) | POC | **R4/R5 closing-gate posture template** |
| `visual-sweep.spec.ts`, `state-trio-sweep.spec.ts`, `skill-page-both-themes.spec.ts` | POC | R14 visual + dual-theme |
| `ma*/mb*/mc*` milestone closers (~25 browser specs) | POC | **R3 parity oracle** (one row per spec) |
| `keyboard-loop.spec.ts`, `aa-audit.spec.ts` | POC | R14 keyboard/axe ship-gates |
| `crew-up.sh` / `crew-slot.sh` / `crew-applicationset.yaml` | family | §4 environments — no new plumbing |

## Appendix B — Build order for the suite itself (highest risk first)

1. **R1 + R2** (Clerk + onboarding) — the mandate's named first concerns and the "nothing works" symptom.
2. **R4** (six-surface acceptance) — the Phase-1 done definition; re-earn `TestM5KnowledgeE2E` honestly.
3. **R12 + R11** (pricing/no-card + private-memory consent) — revenue + privacy blast radius.
4. **R3** (parity matrix) — highest volume; build the matrix artifact, then fill it Wave-by-Wave as surfaces port.
5. **R5–R10, R13, R14** — round out the surface coverage and the "looks good AND works" bar, each traveling with its owning UI Wave.

**Deliberately test the ratchet once:** break a surface, confirm the nightly T2 red freezes merges. That is itself an acceptance criterion of this E2E program.
