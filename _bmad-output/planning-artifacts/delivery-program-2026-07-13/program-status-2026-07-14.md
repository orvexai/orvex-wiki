# Phase-0 Program Status — LIVE delta (2026-07-14)

**Supersedes the environment/verdict sections of `program-status.md` (2026-07-13 14:40).** Compiled from a 10-probe live re-baseline of the dev cell (`phase0-live/` evidence), the ratify verification (`ratify/ratify-report.md`), and a fresh Linear re-sync. Method: adversarial, read-only, tick-only-proven — a Linear "Done" or a fixer self-claim is not evidence.

## TL;DR

- **Phase 0 is well underway but NOT complete.** Steps 2 (re-sync/M5) and 5 (P0 ADRs + pricing supersessions) are **done**. Step 1 (kill the fake-done factory) is **human-only** and still pending. Steps 3 (gates) and 4 (acceptance→defects) are the remaining work.
- **The night waves fixed the ENVIRONMENT, not the surfaces.** D1 (engine instability) fixed; D16 build-provenance fixed (correct thin-AGPL+modules engine now deployed, stable, seams wired); D14 quota un-blocked. **But 0 of 12 surface code defects are fixed** — the six-surface verdict is unchanged: **1 PASS (api) / 5 FAIL / knowledge-sync + cross-cutting PARTIAL.**
- **Two systemic hazards surfaced:** (1) **nothing is on `main`** — every night fix is dev-only (knowledge dev 73 commits ahead; M5 gate absent from main) → "green on merged code" unmet (filed **ENG-2069**); (2) **Clerk dev instance at its 100-user quota** → blocks fresh-tenant acceptance re-runs (human-ledger).
- **Defect suite completed:** D6 filed as **ENG-2068** (was missing). D1–D16 now fully ticketed.

## 1. Environment deltas (the enablers — what the night waves changed)

| Item | 2026-07-13 re-baseline | LIVE 2026-07-14 | Ticket |
|---|---|---|---|
| Engine stability (D1) | flapping, ~10-min ReplicaSet re-rolls, `/api/health` hangs → 502 | **FIXED**: pod 9h/0-restarts, churn stopped, endpoint wired, health 200 ~20ms, `ee.module` caught (FR-W20) | ENG-2039 (stays Todo: no stress-test, dev-only) |
| Build provenance (D16) | dev cell = CLERK_TENANCY monolith, modules off, seam 404 | **FIXED (routing half remains)**: thin-AGPL+modules engine deployed, seams wired, `/api/orvex/session/exchange` mounted (400 vs monolith 404) | ENG-2040 (partial) |
| Quota wiring (D14) | modules off + billing unwired → chokepoint inert | **ARMED**: modules-on + `ORVEX_BILLING_API_URL` wired, live cap projections, 402-pre-write + fail-closed 503 | ENG-2053 (402 unproven-live) |

## 2. Six-surface verdict — LIVE 2026-07-14

| Surface | Verdict | Δ | Open defects |
|---|---|---|---|
| **api** | **PASS** | unchanged; health-hang gone | — |
| mcp | FAIL | 502 fixed → now silent no-op (`persisted:false`) + CAS `serverVersion:0` | D2/ENG-2041, cluster-local URL leak |
| cli | FAIL | unchanged (DfM untouched) | D4/ENG-2043, D5/ENG-2044, D6/ENG-2068, D16/ENG-2040 |
| ai | FAIL | corpus 112→228 w/ bodies, but `extraction_state=''` → 0 citations | D9/ENG-2048, D12/ENG-2051, D13/ENG-2052 |
| rag | FAIL | unchanged; **v2 rejects `include_vectors` → fix must drop `Hit.Vector`** | D7/ENG-2046, D8/ENG-2047 |
| knowledge-sync | PARTIAL | `content_updated` now flows→indexes (D3/`acc10bff`); bodies resolved | D8, D10/ENG-2049, D11/ENG-2050 |
| cross-cutting | PARTIAL | identity fail-closed proven on **real split seam** (5 forged→401); quota armed | D14 (402 unproven), D15/ENG-2054 |

**Genuinely tickable on ENG-2033: 1/8 (api) — unchanged.** PO observation + sign-off (final box) is human-only, not recorded.

## 3. Doc-side (verified done)

- **ENG-2035 P0 ADRs — Done is DEFENSIBLE (5/7 proven).** ADR-0033/0034/0035 canonical + "Status: Accepted" (ratified 2026-07-13, live-verified). Orchestrator-prompt §2 + contracts-canon reconciliations **applied** (old refuse-gate gone, ADR-0008 cited, ADR-0001 refs removed). Residual: lib verifier plan carried by ENG-2037; minor doc-ratify cleanups (below).
- **ENG-2036 pricing supersessions — 3/4 tickable.** billing PRD `Blcvui4UIn` + ai PRD `pbKI3BpQmY` canonical (ratified). Only contracts entitlement/cap SHAPE update remains → ENG-2037 (Definition Factory, Phase 1).

### Minor human doc-ratify cleanups (non-blocking)
1. ADR-0034 (`12aDkq4iOd`) References l.88 still labels ADR-0029 "canonical" → should be "draft" (matches ADR-0035; F35-4 intent).
2. ADR-0029 (`WZWmazrlS0`): page status=canonical contradicts its masthead "Draft — pending PO doc-ratify". Decide + flip.
3. Orchestrator prompt `gkkUDzn277` residual stale strings (l.284 "No Studio ADRs filed"; l.325/395 list now-settled decisions as OPEN).

## 4. Gate ladder (Phase-0 step 3)

All 4 open gates are **full E2E closing runs with 0/N checkboxes** — not started, and gated on the acceptance defects + green-on-merged:

| Gate | Ticket | Boxes | Open blocker |
|---|---|---|---|
| M2 Identity GA | ENG-1574 | 0/29 | ENG-1501 (Keycloak — PO-deferred) |
| M11 Studio SPA E2E | ENG-1571 | 0/31 | ENG-1950 (UI, In Progress) |
| M13 Console & Obs E2E | ENG-1549 | 0/7 | **none open** — nearest to closeable; needs its console-E2E run + `/v1/workflows` proxy (AC4) |
| M14 Launch closing | ENG-1578 | 0/35 | ENG-1953 (API, In Progress) |

## 5. Next actions (ordered) — commencing Phase-0 execution

1. **[HUMAN] Kill the fake-done factory** (step 1): Linear → Settings → Team: Engineering → Workflow → Git automations → set "PR merged → Done" to a non-terminal state or Off. No API/CLI/MCP path.
2. **[HUMAN] Raise the Clerk dev user quota** (or prune test users) — unblocks fresh-tenant acceptance + the M5 gate harness.
3. **Land dev→main (ENG-2069)** via PR + CI + SE-Arch review, *after* (1), so merges don't fake-done their tickets. Re-verify D1/D3/M5 on merged code.
4. **Fix-wave the 12 open surface defects** (orchestrator Act-3, worktree-isolated, TDD, adversarial review, deterministic Done gate). Highest-leverage first: **D7/ENG-2046** (drop `Hit.Vector` → unblocks M5 gate D11), **D2/ENG-2041** (mcp modify-existing), **D9/ENG-2048** (knowledge extraction pipeline), **D4+D5** (DfM converters), **D12/D13** (ai error-mapping).
5. **Re-run each FAIL surface** against the stable, merged engine on a fresh tenant, human-observed → convert FAIL→PASS.
6. **Close the gates** (M13 first) once their constituents + defects clear.
7. **PO sign-off** on ENG-2033 → then the Phase-0 exit action: launch the Phase-1 orchestrator prompt (`yXUWpQpRjx`).

_Compiled by orchestrator under PO standing authority (2026-07-14)._
