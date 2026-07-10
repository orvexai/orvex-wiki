# project-context.md — orvex-wiki (Core Wiki Engine, AGPL)

<!-- provenance: carried copy of the family Coding Standards.
     cs-source: 6aMAzsYeQb
     cs-source-sha256: 3a3ca94549aa400ffaa6c03121afe0b00151a743997626a3725579b4064f5945
     materialized: 2026-07-10
     Freshness is CI-gated by scripts/check-context-freshness.sh (make context-check):
     it fails the build when the CS page's sha256 drifts from the pin above, so a
     human folds the delta in (preserving this repo's overrides) and re-pins.

     2026-07-10 re-pin review (prior pin 691fde22...a3, materialized 2026-07-07):
     walked the full CS edit history (docmost-cli page history/diff) from the
     2026-07-07 materialization point to HEAD. The only substantive (non-cosmetic)
     content change in that window is confined to CS §13 (Build/CI substrate) —
     the runner-label correction splitting private repos (shared `runners` group)
     from the public `orvex-wiki` repo (dedicated `public-runners`/`public-dind-runners`
     groups). This repo's project-context.md does not carry §13 content (out of
     this carried copy's scope), and .github/workflows/ci.yml already uses
     `public-runners`/`public-dind-runners` throughout — so no rule text below
     needed updating. No other CS section changed substantively in that window
     (remaining diff hunks were embed-mention JSON re-encoding only, byte-identical
     prose). Full diff kept out-of-repo in the review log. -->

**Carried doctrine (CS §9).** This file is the always-loaded copy of the family
**Coding Standards** so the rules bind every agent at *planning* time, not only
at review time. It is a concise carried copy — the wiki page is the single
source of truth; never let this drift silently. Drift is caught by the
freshness gate (`make context-check`); if it fails, refresh from the CS page
below and re-pin the `cs-source-sha256` in the provenance header above.

- **Coding Standards (CS)** — `orvexstudioarch`, slug **`6aMAzsYeQb`**
  `docmost-cli page get 6aMAzsYeQb --no-daemon`
- **SE Architect — Review Agent** (adversarial review lenses + Done gate) — slug **`8sYi523i4t`**
- **This service — PRD: orvex-wiki** — slug **`EPsdD7uK8e`**
- **This service — Architecture: orvex-wiki** — slug **`twQ3BBzpTE`**

> **CRITICAL PLATFORM OVERRIDE — D-S12 / D-S28: NO MONGODB.** The CS and
> SE-Architect pages are Houston-adapted drafts that still name MongoDB as the
> event-data store. **Daniel's locked decision D-S12 struck Mongo from the
> platform entirely. Postgres wins.** Event data + projections + usage journals
> live in **Postgres** (append / range-partitioned tables, retention = DROP
> PARTITION). There is **no `internal/store/mongo/`** and **no Mongo anywhere**.
> Wherever CS/SE-Architect say "MongoDB event store / `internal/store/mongo/` /
> event data → Mongo / projections served from Mongo," read it as the **Postgres
> event-data store**. In this repo the engine's event data is the transactional
> **`orvex_outbox`** Postgres table drained by the relay to the Kafka
> studio-spine.

---

## ❌ Classic LLM mistakes (each one = a build failure)

The anti-slop core — every row is a hard constraint. An agent that does any of
these has failed the Issue regardless of whether tests pass.

| # | Mistake | Corrected path |
| --- | --- | --- |
| 1 | **Domain logic in a handler / `cmd/` / `main.ts`** | Verdicts, transforms, entitlement/cap mapping, projection logic — all domain logic — live in the owning service/module, **never** in a controller/handler. In this engine: the `402 QUOTA_EXCEEDED` verdict is computed by `orvex/quota` (domain); a controller/collab hook only **marshals** it. When a flow needs ≥2 domain packages in sequence, that sequencing is a workflow-tier concern, never the handler. |
| 2 | **Raw store-driver calls outside their store package** | Store access is confined. **No `pgx`/`database/sql`/raw Kysely driver leakage outside the repository/query layer** — including tests. Callers depend on a `Repository`-shaped seam, never the driver. **(Postgres override: there is no Mongo; the ex-Mongo "event data" store is the Postgres append/outbox table.)** |
| 3 | **Premature interface / seam** | Do NOT introduce an interface at an **in-process / local-substitutable** seam until ≥2 real implementations exist. An interface/port **IS** justified at a **network seam** by the boundary itself. |
| 4 | **Mocking own packages** | Never `jest.mock` (TS) / `mockery`/`testify/mock` (Go) a module you own. Test through the exported interface with a real or in-memory substitute. |
| 5 | **Horizontal slicing** (all tests, then all code) | Banned. Vertical tracer bullets: one RED test on the exported interface → minimal GREEN → refactor → next. |
| 6 | **Big-upfront struct / schema** | Only the fields the current Issue needs — Postgres columns/migrations, CloudEvent payload fields, TS interfaces. Speculative fields are a smell (see `orvex_page_meta`: only the stamp + concurrency columns actually kept). |
| 7 | **Shallow pass-through package** | Banned if every exported fn body is a single unchanged call to another package AND fewer than 2 callers would duplicate it → inline it. |
| 8 | **Inline credentialed/IO client** | Never construct a Redis / pg / Kafka / Stripe / identity / billing client **inside** a domain function. Configured clients are **injected at the seam** (NestJS DI at construction). Credentials ride the injected client only, sourced per §10. |
| 9 | **Time/randomness in the projection layer** | Read-model & projection functions must be deterministic: no `Date.now()`/`time.Now()`, no `rand`, no `os.Getenv`, no side-effects. Derive timestamps from event payloads passed in. (Event *production* — e.g. the CloudEvent envelope's `time`/`id` — is not a projection; inject the clock/id-gen so golden-fixture round-trips stay deterministic.) |
| 10 | **Raising a ratified operational ceiling to make CI pass** | Plan caps/entitlements (billing is SoR), rate limits, quota/concurrency ceilings are human-ratified. Changing one needs an ADR + human sign-off. The **A-QUOTA fail-open-on-Redis-loss for cheap resources** ceiling meets all three §9 ADR triggers → it must be ratified in a filed ADR, not an inline design line. |
| 11 | **Domain logic in `cmd/` / handler files** | Handlers hold routing + middleware wiring ONLY. If a function changes behaviour when a domain input changes → move it into the domain module. |
| 12 | **`any` / `interface{}` type-laundering across boundaries** | TS (this engine + React fronts): **no `any` or unchecked cast crossing an exported module surface.** Go: no `any`/`interface{}` crossing an exported surface — concrete typed structs (or `json.RawMessage` at the true API edge). `unknown` (type-safe top type that forces narrowing) is the sanctioned scaffold placeholder for a DB-tx handle or JSON payload that cannot be typed without importing across the AGPL boundary — it is **not** `any`. |

**Adversarial review is the binding gate before Done** (reviewer ≠ implementer,
profile `8sYi523i4t`): checks every ❌ row, the tier prohibitions, the
mock-boundary table, the TDD contract, the depth checks (§3.1 deletion-test;
§3.6 minimize-surface; §3.7 design-it-twice), and module-size. Verdict
(PASS/REVISE + findings) recorded on the PR. A failing review = Issue NOT done,
no override.

---

## The six-tier per-service model (Postgres-only) — family reference

Applies **per Go service**. `orvex-wiki` is **not** a Go six-tier service — it is
the NestJS engine (see the engine tier-mapping below) — but every agent must
know the family shape it interoperates with:

| Tier | Location (per Go service) | Contains | Prohibited |
| --- | --- | --- | --- |
| **HTTP handler** | wired in `cmd/<svc>/main.go` | authn/authz → parse & validate → call **exactly one** domain fn or workflow → marshal | business logic; store access; broker calls |
| **Workflow** | `internal/workflow/` | sequences ≥2 domain packages; impure; **liveness branching only** (deadline, retry, fallback, request-id) | any conditional/loop shaping domain data |
| **Domain** | `internal/<domain>/` | pure, DI'd, result-returning; accepts store/event/cache interfaces | I/O; side-effects; driver imports; credentialed clients |
| **Store** | `internal/store/postgres/` | `Repository` impl — **relational AND event-data append/partitioned tables (NO `internal/store/mongo/`, D-S12)**; forward-compatible migrations | domain logic; leaking driver types to callers |
| **Event** | `internal/event/` | Kafka (studio-spine) produce/consume; CloudEvents against the contracts catalog; **outbox** relay; `Publisher`/`Consumer` ports | domain logic; broker access from any other package |
| **Cache** | `internal/cache/` | Redis; **event-evicted** invalidation (not TTL guesswork); `Cache` port | domain logic; treating cache as system of record |

**Cross-service rule:** services **NEVER share a database**. Every cross-service
interaction crosses the pinned **orvex-studio-contracts** seam (OpenAPI or a
CloudEvent on studio-spine). Reaching into another service's Postgres is a build
failure, in prod code AND tests.

---

## Mock boundaries (mock ONLY true boundaries)

| Category | Examples | Test strategy | Port? |
| --- | --- | --- | --- |
| **In-process** | quota-verdict logic, DfM serialization, CloudEvent envelope building, ACL evaluation | test directly through the exported fn; **no mock** | No |
| **Local-substitutable** | **PostgreSQL** (CNPG — relational **and** event-data/outbox append tables) | real engine via testcontainers, **inside the repository/store package's tests only**; callers depend on the `Repository` seam, never the driver | Internal seam, no port |
| **Remote-but-owned** | **Kafka** (studio-spine), **Redis** (event-evicted cache + quota counters), a **sibling Studio service** over the contract seam | interface/port + real adapter (prod) + in-memory/`miniredis`/test-container adapter (tests); a sibling is faked from **contracts golden fixtures** | **Yes** |
| **True-external** | **Clerk, Keycloak/MyIDP, Stripe, Linear, GitHub, LiteLLM, Turbopuffer** | injected port + `httptest`/replay of a **committed real response**; hand-authored responses are a defect | **Yes** |

> **No Mongo row.** The CS/cheat-sheet "MongoDB (event data) — local-substitutable"
> row is **struck (D-S12)**: event data is the Postgres append/outbox table, tested
> with the same Postgres testcontainers strategy as the relational store.

**Determinism/contract gates (static — the gate reads code, never runs it):**
driver confined to its package; no `Date.now()`/`time.Now()` in projection fns;
handler calls exactly one domain fn; a service's published OpenAPI/CloudEvent
surface round-trips against the pinned contracts golden fixtures.

---

## This repo's tiers (NestJS engine mapping) — orvex-wiki

`orvex-wiki` is the **only AGPL artifact** — vanilla **Docmost v0.95.0** (NestJS /
Fastify / Kysely + React / TipTap / Yjs) with a **frozen 13-row inline-edit
allow-list** onto upstream files plus additive `apps/server/src/orvex/*` modules
and `packages/@orvex/*`. **Keep the fork surface minimal** — prefer composing new
behaviour in orvex-wiki-api (Go) over deep engine edits; every engine divergence
is upstream-merge debt (the FR-30 weighted-hunk gate). The engine holds only
irreducible primitives; everything else crosses a network boundary.

**Tier prohibitions map onto the engine's structure (CS §6 wiki-engine note):**

- **Controllers thin** — authn/z → parse → **one** service call → marshal. The
  quota/provenance controller edits (an A-THIN allow-list line) only *call the
  quota service and translate its verdict* into `402 QUOTA_EXCEEDED`; they never
  embed the entitlement-vs-usage comparison.
- **Domain in services** — `orvex/quota` computes the over-quota verdict
  (A-QUOTA-HARDENING F9); DfM serialization logic lives in `@orvex/dfm`.
- **DB in the repository/query layer** — the additive tables (`orvex_page_meta`,
  `orvex_outbox`, quota state) are reached through their service/repo seams
  (`PageMetaService`, `OutboxService`), which run inside the same
  transaction-scoped RLS as the mutation. No raw Kysely driver leaks to callers.
- **No `any`-laundering across module surfaces** (❌#12); `unknown` is the
  sanctioned placeholder for the DB-tx handle / JSON payload that cannot be typed
  without importing `@docmost/db` across the boundary.
- **Postgres-only** — the engine's event data is the transactional `orvex_outbox`
  Postgres table (D-S12/D-S13: outbox → Kafka **direct**, no Redis→Kafka bridge).

**Which tiers this repo has:** it is a NestJS engine, **not** a Go six-tier
service — it has **no `internal/{workflow,domain,store,event,cache}` layout** and
**no `cmd/`**. Its analogues: *handler* = Nest controllers (upstream + the
allow-listed edits); *domain* = `orvex/*` services + `@orvex/dfm`; *store* = the
Kysely repository/query layer over Postgres (relational + the outbox event-data
table); *event* = `orvex/outbox` + `orvex/cell` (transactional outbox + relay +
CloudEvent envelope to studio-spine); *cache/quota-counters* = Redis seams. There
is **no in-engine broker/DB client construction inside a domain function** — every
external client is injected at its seam.

### Additive seam inventory (`apps/server/src/orvex/*`, behind one inert `OrvexRootModule`)

> **Status (2026-07-06, post-foundation): this table is the TARGET seam set, not
> the current tree.** The foundation run rebuilt the additive surface from
> scratch: `session-mint/` carries a real RS256/JWKS `ExchangeTokenVerifier`
> (M7); `config/`, `http/` (the OpenAPI-contracted 501 no-op skeleton), and
> `not-implemented.ts` exist (M8); `page-meta/`, `quota/`, `outbox/`, `cell/`,
> `api-key/`, `migrations/` are **delivery-pending** (not yet in the tree). The
> authoritative current-state list is `contracts/openapi.yaml` +
> `docs/delivery-checklist.md` (generated from the 501 marker set). Rows below
> describe where each seam lands, not what is built today.

| Dir | Primitive | PRD / ADR |
| --- | --- | --- |
| `config/` | product-family-agnostic endpoint seam (`ORVEX_<SVC>_URL`) + cell contract; **env-only, no hardcoded secrets** (§10) | A-PORTABLE / A-CELL |
| `page-meta/` | the `orvex_page_meta` side table (stamps off upstream `pages`); UUIDv7 PK, workspace-keyed, no `cell_id` | FR-W3 / A-CELL #7 |
| `quota/` | write-chokepoint quota enforcement vs billing entitlements; **verdict is domain** (`QuotaService`), counters (Redis) + entitlement-reader (billing) are injected seams | F-QUOTA / A-QUOTA / A-QUOTA-HARDENING |
| `outbox/` | transactional outbox (Postgres) + relay → Kafka studio-spine **direct** (no bridge) | FR-W5 / A-EVENTS |
| `cell/` | own small CloudEvent envelope builder (`orvexcell` ext + `cell`/`cell_epoch` wire names), proven against contracts golden fixtures — **not** imported across the AGPL boundary | A-CELL #6/#2 / A-SEAMS |
| `api-key/` | clean-room AGPL api-key rebuild off `ee/api-key` (high-licensing-risk launch gate) | FR-W7 / A-AUTH |
| `session-mint/` | consume identity exchange token → mint session (RS256/JWKS); **no native login (D-S3)** | FR-W6 / A-AUTH |
| `boot/` | CLOUD-clean boot decouple (no `process.exit(1)` when `ee/` is absent) | FR-W20 / A-BOUNDARY |
| `migrations/` | separate `orvex_migrations` ledger + `pg_advisory_xact_lock` runner | FR-W22 / A-IMPORT |
| `types/` | single declaration-merge file for additive columns (upstream `db.d.ts` stays verbatim) | A-BOUNDARY type hygiene |

**Prime directive — never break the vanilla boot.** `OrvexRootModule.register()`
is OFF unless `ORVEX_MODULES_ENABLED=true`; with the flag unset (deployed
default) it contributes nothing and runtime is byte-for-byte vanilla v0.95. No
`orvex/*` or `@orvex/*` file **statically imports** `@docmost/*` or `ee/*` (AGPL
import-guard + FR-30). The AGPL **`@orvex/dfm` TS package is imported ONLY by the
AGPL engine**; closed satellites reach DfM through the Go twin
(`orvex-studio-lib/pkg/dfm`) or a network call to wiki-api — never by importing
the AGPL TS package (A-SEAMS / canon P10).

---

## Operability & Zero-Trust baseline (§10)

- **Secrets via env only** — no credential hardcoded/committed; ExternalSecrets
  on the my-idp clusters. **No Stripe secret lives in the engine** (FR-W21).
- **Timeouts / graceful degradation** — every external call has a deadline; a
  knowledge/ai/billing outage degrades search/AI/entitlement-refresh, never page
  editing. Never white-screen.
- **Per-role liveness** (A-OBSERVE) — api `/api/health`; **worker relay
  liveness + lag heartbeat** (a dead outbox relay must never read green); collab
  WS liveness. `/api/health` echoes `CELL_ID` + `CLUSTER_NAME`. Correlation ID
  threaded ingress → outbox CloudEvent → consumer.
- **Fabricate nothing** — omit unsourced data; honest empty / `Ready` / `Waiting`
  states; no "% done" not derived from actual gate outcomes.
- **Telemetry split** — metrics → Mimir (OTLP); ops logs → Loki (structured
  JSON); **domain events are CloudEvents on studio-spine, not logs.**

## ADR process (§9)

ADRs live on the wiki (this service's space for service-scoped decisions;
`orvexstudioarch` for family-wide), named `NNNN-kebab`, masthead **Status · Date
· Deciders**, body **Context · Decision · Consequences · References**. Write one
when **all three** hold: costly to reverse AND a reasonable engineer would differ
AND it constrains future work. Load-bearing rulings still owed as filed ADRs
(A-ADR): D-S13 outbox→Kafka-direct, D-S17 polymorphic tenancy, D-S3 native-login
removed, the frozen `402 QUOTA_EXCEEDED` contract, the A-QUOTA fail-open
tradeoff, D-S27 URL ordering — **blocked** on the Studio Decision-Records parent +
fresh `0001` registry (TBD Act-1).

## Dependency updates — authoritative stable sourcing (§14)

**"Stable" is the maintainer's authoritative release channel, NOT the
highest-published version number.** Pre-releases publish *above* the stable tag,
so "take the newest number" overshoots into an unratified channel — a build
failure. When bumping a dependency, resolve the target from the ecosystem's
authoritative stable channel, never the numerically-highest version the registry
lists:

- **npm / pnpm** (this engine + the React fronts) — the `latest` **dist-tag**
  (`npm view <pkg> dist-tags.latest`); never `beta`/`rc`/`next`/`canary`/
  `experimental`/`insiders`.
- **Go** (the wiki-api twin, sibling services) — the highest **non-prerelease**
  module-proxy tag (`go list -m -versions`); no `-rc`/`-beta`/`-alpha`.
- **Python** — PyPI's latest **stable** release (pre-releases excluded).

A **conforming bump** targets that stable tag, **resolves its full peer set**,
**clears the supply-chain minimum-release-age window** (≥~24h since publish —
never adopt a just-cut release), records the exact resolved version in
`package.json`/`go.mod` (§5 names exact versions), and **passes the repo's real
gate suite (§0/§13) before merge**. Dependabot PRs are held to the same bar —
group them, and retarget any that grabbed a prerelease onto the `latest` tag.

---

*Scaffold status: this repo is a **compiling skeleton**. Full TDD /
BUILD-EVERYTHING binds the later delivery Issues (fold-in plan `qJojHbWJni`); the
structure above is CS-correct so delivery builds into the right shape.*
