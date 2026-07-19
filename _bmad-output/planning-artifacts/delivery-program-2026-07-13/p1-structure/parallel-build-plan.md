# Orvex Studio — Parallel Build Plan (team allocation)

The point of the 17-microservice split is exactly what you said: **services couple only through
pinned contracts, never through each other's code.** That is what makes parallel teams possible.
The plan below turns that into a concrete allocation.

## The one unlock: the contract tag

Every build story is `blocked-by` its service's Definition Pack, and the pack's job ends in a
**git-tagged contract** in `orvex-studio-contracts`. Once a service's seam is frozen and tagged:

- its team generates typed clients from the tag (Go stubs + TS clients, ADR-0035),
- it **fakes every sibling from the contract's golden fixtures** (CS §5) — so it never needs
  another team's running code,
- it builds and tests in isolation, proven live via a **crew-slot** (one service dropped into the
  shared dev flow).

So parallelism is not "wait for all contracts, then go." It unlocks **service-by-service as each
tag lands**. The critical path is therefore: *freeze + tag the seams fast*, then fan out.

## Phase A — Foundation (small, heavy, first)  ⟶ the critical path

One dedicated **Platform team** owns the bottleneck the whole family waits on:

| Own | Stories | Why first |
|---|---|---|
| **orvex-studio-contracts** (35) + the seam-landing tickets | freeze every OpenAPI + CloudEvent seam, cut per-service tags, land the extension delivery seam | every other team's dispatch gate |
| **orvex-studio-lib** (31) | the deny-by-default verifier + typed fail-closed clients + DfM twin | imported by every Go service; the 52-byte scaffold blocks all Go satellites today |
| the **Go↔TS bridge proof** (ENG-2093) | prove one seam end-to-end before the family depends on it | de-risks the whole codegen model |

While Phase A runs, every other team does **non-claiming pre-work** (capacity-floor rule): fixture
surveys, readiness analysis, and — highest-value — the **180 "verify + harden" stories**, which
need no new contract (they prove already-shipped code with its named test + adversarial review).
That keeps 8 teams productive on day one instead of idling behind contracts.

## Phase B — Eight service teams in parallel (contract-gated)

As each seam tags, its owning team starts. Teams are grouped by **domain affinity + shared
contested seams**, so the few cross-service handshakes stay *inside* one team wherever possible:

| Team | Services (stories) | Shared seam kept in-team |
|---|---|---|
| **1 · Platform** | contracts (35), lib (31) → then cross-cutting | the seam everyone else consumes |
| **2 · Identity & Workflows** | identity (44), workflows (36) | the Clerk-lifecycle contested seam (identity↔workflows) — one ruling, not a cross-team negotiation |
| **3 · Knowledge & AI** | knowledge (41), ai (49) | memory retrieval + the Orvex-rating share + metering/cap consumption |
| **4 · Product BFF & Billing** | api (40), billing (36) | entitlements + the BFF that fans out to everyone |
| **5 · Wiki engine** | wiki (35), wiki-api (33) | the AGPL engine + its Go front door (fork-surface discipline) |
| **6 · Agent surfaces** | mcp (28), cli (35) | both thin clients over the same wiki-api/knowledge/ai/identity contracts |
| **7 · Staging & Workgraph** | staging (36), workgraph (35) | the workgraph→staging promotion edge + the Librarian loop |
| **8 · Human surfaces** | ui (40), console (36), extension (67) | the three human-facing surfaces + the extension's own client/server split |

Each team is internally sequenced by its own milestones (B1 foundation → … → B_n), and can run
2–4 agents concurrently within its services. Total live agents scale to the capacity ceiling (32).

**Cross-team seams that need a contract handshake (not code coupling)** — these are already
ticketed, and each is a *contract-first* dependency, meaning Team X publishes/pins the shape and
Team Y builds against the pinned shape + a fake, in parallel:

- extension server halves (Team 8 client) ↔ api/identity endpoints (Teams 4 & 2) — the delivery seam
- memory loop: capture (Team 3 ai) → store (Team 4 api) → retrieve (Team 3 knowledge) → deliver (Team 8)
- billing entitlement/cap push (Team 4) → ai metering (Team 3)
- wiki outbox events (Team 5) → knowledge indexing (Team 3)
- workflows lifecycle (Team 2) → identity provisioning (Team 2, in-team) + knowledge rebuild (Team 3)

Because every one of these crosses a **pinned contract seam**, neither side waits on the other's
implementation — only on the *tag*. That is the microservice payoff.

## Phase C — Continuous integration & the E2E tail (one standing team)

An **Integration team** runs the whole time, not just at the end:

- the **nightly family-E2E** (ENG-2034) on the dev cell; a red run freezes merges (ratchet).
- per-service **crew-slot** live checks as each service reaches a milestone.
- the **P2.5 Product Acceptance** run (ENG-2687): every surface, fresh tenant, real data,
  human-observed, prod modules ON — the definition of "delivered."

## Load-balancing note (from the audit)

Story counts are uneven and the audit mix matters for staffing:

- **Heaviest greenfield** (mostly "absent", need full build): staging (30 absent), workgraph (31),
  workflows (24), api (23), ui (22), extension (20) → give these the largest teams / most agents.
- **Mostly verify-harden** (cheap, fast wins): mcp (24 present), wiki-api (24), wiki (18), cli (16),
  ai (20) → these teams can start immediately on verify work even before their contract re-tags.
- **Balanced**: identity, knowledge, contracts, lib, billing, console.

So the natural staffing is: front-load Team 1 (Platform) to clear the critical path; give Teams 7
(staging/workgraph) and 8 (ui/console/extension) the most build capacity; let Teams 5 & 6
(wiki/wiki-api, mcp/cli) bank early verify-harden wins while contracts freeze.

## What makes this safe (not just fast)

- No team can advance its own tickets to Done — the deterministic gate (named test green ∧ all PRs
  merged ∧ adversarial review PASS ∧ contract tag present) is orchestrator-owned.
- Collisions resolve at each repo's PR gate by rebase, never prevented at dispatch (per-repo branch
  protection is the only serialization point).
- A team that finishes early pulls the next unblocked service or joins the Integration team's E2E lane.
