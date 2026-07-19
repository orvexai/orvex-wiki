## 🎯 Story

**Audit: already implemented** (evidence in §4) — this story is VERIFY + harden: prove the ADR-0020 routing behaviour via the named DoD test + adversarial review; do not rebuild the resolver.

**As the** MCP transport, **I want** cell-discovery routing to honor ADR-0020 (`9KcwAG5SRg`) decisions 1–6: a discover-once-then-pin resolver keyed by account, a `308` permanent redirect to the owning cell, `421 Misdirected Request` self-heal that re-discovers and re-pins, a `SOLO_CELL` short-circuit that skips discovery, and `CELL_UNRESOLVED` / `CELL_DISCOVERY_UNAVAILABLE` fail-closed errors — **so that** a request is never silently served by the wrong cell and a discovery outage denies rather than guesses.

**Definition of Done:** one named test `TestAccountPinnedCellRoutingAndSelfHeal` (integration — assert the resolver discovers once then pins per account, that a `308` is emitted for a non-owning cell, that a `421` re-discovers and re-pins, that `SOLO_CELL` short-circuits discovery, and that both `CELL_UNRESOLVED` and `CELL_DISCOVERY_UNAVAILABLE` fail closed). *Final routing contract tag (status codes, error shapes, SOLO_CELL env) is pinned at pack certification (ENG-2102); this story is dispatch-blocked until that tag exists.*

## ✅ Acceptance Criteria

- [ ] **AC1** — Given two requests for the same account, When the resolver runs, Then it calls discovery once and pins the result; the second request reuses the pin. *assert: discovery client invoked exactly once per account; second call served from the pin* [Source: ADR-0020 `9KcwAG5SRg` decision 1]
- [ ] **AC2** — Given a request landing on a non-owning cell, When routing resolves the owner, Then a `308` permanent redirect to the owning cell is emitted. *assert: response status == 308; Location targets the owning cell* [Source: ADR-0020 `9KcwAG5SRg` decision 2]
- [ ] **AC3** — Given a pinned account whose cell has moved, When the upstream returns `421`, Then the resolver drops the stale pin, re-discovers, and re-pins. *assert: post-421 discovery re-invoked; new pin replaces the stale one* [Source: ADR-0020 `9KcwAG5SRg` decision 3]
- [ ] **AC4** — Given `SOLO_CELL` is set, When the resolver runs, Then discovery is short-circuited and the local cell is used. *assert: discovery client never called; local cell resolved* [Source: ADR-0020 `9KcwAG5SRg` decision 4]
- [ ] **AC5** — Given discovery returns no owning cell, When resolution completes, Then the request fails closed with `CELL_UNRESOLVED` (no default-cell fallback). *assert: error == CELL_UNRESOLVED; no request forwarded* [Source: ADR-0020 `9KcwAG5SRg` decision 5]
- [ ] **AC6** (negative) — Given the discovery backend is unreachable, When resolution is attempted, Then the request fails closed with `CELL_DISCOVERY_UNAVAILABLE` (never a silent local-serve). *assert: error == CELL_DISCOVERY_UNAVAILABLE; no local fallback serve* [Source: ADR-0020 `9KcwAG5SRg` decision 6]

## 🔨 Tasks

- [ ] RED: write `TestAccountPinnedCellRoutingAndSelfHeal` covering AC1–AC6 against a fake discovery client + upstream.
- [ ] VERIFY: exercise `src/routing/cell-resolver.ts` discover-once-then-pin and `discovery-client.ts` against the test; confirm the pin cache keys on account (AC1).
- [ ] VERIFY: exercise the 308 emit path and the 421 self-heal re-discover/re-pin path (AC2, AC3).
- [ ] VERIFY: exercise `SOLO_CELL` short-circuit and both fail-closed error branches (AC4, AC5, AC6).
- [ ] HARDEN: close any branch the audit test surfaces as unasserted (e.g. concurrent same-account discovery collapse, pin eviction on 421).

## 🧠 Context

**🧾 Gap provenance (2026-07-14):** filed by the post-decomposition gap-hunt (adversarially verified) — ADR-0020's cell-discovery routing shipped but no story AC verifies any of decisions 1–6; missed because E5-S3 scoped only the day-1 cell contract and E7-S2 only shim-overhead/lag, so the routing resolver fell through the decomposition seam.

**🧾 Code audit (origin/main @ be3cd8b, 2026-07-14):** present — discover-once-then-pin resolver + 308/421 routing in `src/routing/cell-resolver.ts` and `src/routing/discovery-client.ts`; `SOLO_CELL` short-circuit and `CELL_UNRESOLVED` / `CELL_DISCOVERY_UNAVAILABLE` fail-closed errors exist in the resolver. This story is VERIFY + harden, not build.

Tier: MCP transport routing (Arch cell-discovery seam). Seam: MCP↔cell-discovery backend (resolve owner), MCP↔upstream cell (308/421). Sibling deps: E5-S3 (day-1 cell contract), E7-S2 (shim-overhead/lag).

## 🧪 Testing

`TestAccountPinnedCellRoutingAndSelfHeal` (integration). Tiers: unit (pin-cache keying, error mapping) + integration (308/421 round-trip via fake upstream). CS §5: fake discovery client + fake upstream from fixtures; never mock the resolver's own pin/error logic.

## 📏 Guidance

CS `6aMAzsYeQb` §§0/3/4/5/6/7/10/11; SE-Arch `8sYi523i4t` (fail-closed + cell-isolation lenses — no default-cell fallback, no silent local-serve on discovery outage).

## 🔗 References

ADR-0020 `9KcwAG5SRg` (Canonical 2026-07-10) decisions 1–6; code `src/routing/cell-resolver.ts`, `src/routing/discovery-client.ts` @ be3cd8b.

## 🔗 Dependencies

Blocked by: ENG-2102 (routing contract TAG — status codes, error shapes, `SOLO_CELL` env). Project: Orvex Studio MCP; Milestone: B5 — Statelessness, revocation consumer & day-1 cell contract. Intra-service must-resolve: E5-S3 (day-1 cell contract), E7-S2 (shim-overhead/lag).

## 📡 Protocol

CLAIM→PLAN→PROGRESS→COMMITS ("Part of ENG-NNN", never closes)→HANDOFF→REVIEW (reviewer ≠ author)→TICK→DONE (orchestrator-only)→ESCALATE.
