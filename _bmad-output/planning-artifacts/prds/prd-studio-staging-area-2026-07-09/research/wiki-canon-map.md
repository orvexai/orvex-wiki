# Wiki Canon Map — Orvex Studio (for the two new PRDs)

Research date: 2026-07-09 · Read-only pass over the Docmost wiki (`docmost-cli`, cache synced).
Scope: locate the family canon, the PRD/parenting conventions, and prior art for two new capabilities —
**(1) Agent Staging Area** and **(2) Cross-Agent Memory service** — and return a find-before-create verdict.

> **Headline:** Neither capability has a dedicated PRD in the family canon. BUT both already exist as
> **product features of Orvex AI Studio** — the "Agent Staging Area" is the **Curator / Card Contract v1 /
> `engineGate()`** owned by `orvex-studio-api`, and "Cross-Agent Memory" is **Memory (FormSpec)** owned by
> `orvex-studio-api` plus **ai_memories recall** in `orvex-studio-ai`. Both are also fully specced-and-**built**
> in the `OPS` (Orvex Prompt Studio) space. The new PRDs are therefore *promotions/generalizations* of
> single-product features into platform-level capabilities — not greenfield — and must reconcile ownership
> with those existing owners.

---

## 1. Space inventory (canonical spaces only; ~hundreds of per-user `studiouser*` spaces omitted)

**The Orvex Studio family (the target canon):**

| Slug | Name | Purpose (one line) |
| --- | --- | --- |
| **orvexstudioarch** | Orvex Studio Architecture | **Family-wide canon**: principles, roster, event spine, ADRs, cross-service capability pages. *Authority root.* Target space for both new PRDs. |
| orvexstudioknowledge | Orvex Studio Knowledge | Content projection + Turbopuffer hybrid search/RAG + SSE fan-out; the central read-optimized replica. |
| orvexstudioidentity | Orvex Studio Identity | Dual-IdP auth spine (Clerk + Keycloak), token authority, tenant→cell registry, OIDC RP + SCIM. |
| orvexstudioai | Orvex Studio AI | Chat/ask/inline brain; LiteLLM bridging; embeddings; **memory recall (ai_memories)**; usage metering + caps. |
| orvexstudiomcp | Orvex Studio MCP | MCP gateway (streamable-HTTP /mcp); routes to knowledge via wiki-api + ai; the only real-code satellite besides workflows. |
| orvexstudioconsole | Orvex Studio Console | Admin console + observability front end over LGTM (Loki/Mimir/Tempo) + Temporal. |
| orvexstudiobilling | Orvex Studio Billing | Stripe billing + the plan→entitlement→cap system-of-record for both products. |
| orvexstudiocontracts | Orvex Studio Contracts | The pinned seam: OpenAPI, CloudEvent catalog, SSE wire contract, golden fixtures, drift gates (Apache-2.0). |
| orvexstudiolib | Orvex Studio Lib | Shared Go library: events, auth ceiling, typed clients, clean-room DfM↔ProseMirror serializer (pkg/dfm). |
| orvexstudioworkflows | Orvex Studio Workflows | Central Temporal control plane; all durable workflows. (Real code today.) |
| orvexstudioapi | Orvex Studio API | Orvex AI Studio **product BFF** (TS/Hono) strangled from `orvex-prompt-studio-poc`; **OWNS Memory + the Curator/`engineGate`**. |
| orvexstudioui | Orvex Studio UI | Orvex AI Studio front end — thin React/Vite SPA over orvex-studio-api. |
| orvexwiki | Orvex Wiki | The Core Wiki Engine (AGPL, renamed from docmost); primitives only after the wiki-api split. |
| orvexwikiapi | Orvex Wiki API | Wiki composition tier (Go): verb grammar, block-patch, cited-ask, **drift + spec-gate**, history/diff, import/export. |
| orvexcli | Orvex CLI | THE platform CLI (successor to docmost-cli): `wiki`/`search`/`ai`/`auth`/`admin` namespaces. |

*(No plain `orvexstudio` space exists — that expectation from the brief is absent; `orvexstudioapi`/`orvexstudioui` are the Studio product homes.)*

**Prior-art / adjacent spaces (NOT the current family canon, but load-bearing for these two PRDs):**

| Slug | Name | Relevance |
| --- | --- | --- |
| **OPS** | Orvex Prompt Studio | **LIVE (not archived).** Home of "Orvex AI Studio — Phase 2" planning + **The Librarian/Curator** and **Memory** — fully specced AND built (Phase 1 shipped, 83/83 stories). The single richest prior-art trove for BOTH new PRDs. |
| **houston** | Houston | Beads/Dolt prior art — Decisions 0021 (bd-over-Dolt via go-sql-driver/mysql), 0014 (dedicated-store Beads hosting + tenant isolation), 0005 (Dolt access-token). The "beads-inspired" reference for the memory service. |
| **IAE** | IDP AI Engine (**Archived**) | Older engine with a Memory subsystem (Memory Spec/Mvp/Full/pillar, Reasoning Bank, Personal Agents). Archived prior art. |
| docmost / docmostcli | (Archived) | Pre-fork wiki + CLI. Salvage only. |
| houstoncli, lwlab, lwdemo, general, CCMS, FAD, LT, LS(Arch), OPS-siblings | — | Peripheral; not relevant to these PRDs. |

---

## 2. orvexstudioarch — DEEP

### 2.1 Full tree (status column not surfaced by this CLI build; read from in-page banners)

Top-level canon:
- **`CxjFpIVUZY` — Orvex Studio — Architecture & Principles** (the canon root; 13 principles, family roster, system diagram, authority order)
  - `AqPkQypf5a` Architecture Audit — Family Rollup (2026-07-05)
  - `6aMAzsYeQb` Coding Standards (CS §0–13)
  - `nmL9vLUCfA` Fork Change → Ticket Ledger
  - `JGAUQRsw2g` Multi-Region Cells, Failover & the Day-1 Cell Contract
  - `8sYi523i4t` SE Architect — Review Agent
  - `86CiGucQwU` URL, Environment & Multi-Region Scheme
- **`32Huug8U4B` — Decision Records — Orvex Studio** (the ADR registry; ADR-0001…0016, next free = 0017)
- **`cpeenW2R9t` — Doc Governance — Drift & Spec-Gate (owned by wiki-api)** ← **the precedent** for a cross-service capability page living in arch
- `GmKOk6xz0J` Index — Orvex Platform Canon
- `cLWfnuXCWb` Delivery Overview — Orvex AI Studio (+ M0–M14 milestone dashboards, Delivery Prompts)
- `REgcVseTR5` Deployment Status — What's Live Today (eu1)
- `cjv9Q4RuyI` Studio Family Foundation Rollup (2026-07-06)
- ADR-0001…0016 pages (`K5rumy9a8c` … `akzWiopQBD`) — some render under an `[ORPHAN]` node in the tree
- `GmKOk6xz0J`, plus scratch/test pages (`TPP9CAYINM` zz-scratch, `bnhcOFDsBJ` DELETE ME)

### 2.2 Product shape
A family of small **closed Go** services around a **thin AGPL wiki engine** (orvex-wiki, a Docmost fork),
integrated by a **Kafka event spine** (`studio-spine`, Knative Broker) and a **pinned contract seam**
(orvex-studio-contracts). **Two products** ride the shared services as peer first-class tenants —
**orvex-wiki** (the wiki) and **Orvex AI Studio** (ui + api). Neither product is the platform; each is a thin shell.

### 2.3 Microservice roster + event spine + tenancy
- **Roster:** see §1. The shared services are ai, knowledge, mcp, identity, console, billing, workflows,
  contracts, lib; products are (wiki-engine + wiki-api) and (studio-api + studio-ui); one CLI (orvex-cli).
- **Event spine:** every mutation lands one typed **CloudEvent** on the Kafka-backed Knative Broker
  `studio-spine`. Engine writes a **transactional outbox** → relay → Kafka (no Redis→Kafka bridge). Named event
  types incl. `wiki.page.*`, `ai.usage.recorded`, `ai.cap.*`, `billing.entitlement.changed`, and — **directly
  relevant** — **`studio.{skill,memory,chat}.*`** ("Produced by studio, Consumed by knowledge — project the
  Studio corpus for search/RAG"). ADR-0010 fixes the `studio.<subdomain>.<event>` taxonomy; the **`memory`
  subdomain is already reserved on the spine.**
- **Tenancy:** polymorphic **`{user | org}`** principal (ADR-0001/0012). Personal users are user-keyed tenants
  (no Clerk org); Teams are real Clerk orgs. Cell-pinned; tenant→cell registry is the only global component (ADR-0011).

### 2.4 Doc-type / status / ADR conventions (from Decision Records + Doc Governance)
- **ADRs:** title `ADR-NNNN: <title>`, **doc-type `adr`**, created at **status `draft`**, sections
  Context/Decision/Consequences/Alternatives/References. Promotion draft→canonical is **human-only doc-ratify**
  (agents only under explicit PO batch approval via audited **force-self-ratify**; never self-asserted).
- **Status banner (in-page):** a bold line near the top — e.g. `**Page status: CANONICAL** — ratified 2026-07-06
  (PO batch approval)` / `**STATUS: CANONICAL.** Ratified 2026-07-08`. A new page ships with a **DRAFT** banner.
- **doc_type is a real metadata field** but is **not surfaced by `page list --fields` in this CLI build**;
  PRD pages almost certainly carry doc_type `prd` (inferred from the `adr` precedent — not directly confirmable here).

### 2.5 Candidate parent node(s) for the two new PRD pages
- **Best fit: top-level in `orvexstudioarch`, as siblings of `cpeenW2R9t` "Doc Governance — Drift & Spec-Gate".**
  That page is the exact precedent — a **cross-service capability** page that lives in arch *because* it spans
  every service ("This canon lives in the shared-arch space because the governance is cross-service… it is
  cross-service tooling, so its canon lives in `orvexstudioarch` rather than in any single project space").
  Both new capabilities are likewise cross-service (staging spans mcp+wiki-api+knowledge+ai; memory spans
  ai+mcp+knowledge+cli), which *justifies* placing them in arch rather than a satellite.
- Optional: parent under the canon root `CxjFpIVUZY`, but Doc Governance is top-level (not nested), so top-level matches precedent.

---

## 3. Librarian & knowledge status quo (how it is CURRENTLY documented)

1. **The full concept is documented and BUILT in `OPS` (Orvex Prompt Studio) as "The Librarian" (renamed "the
   Curator" in Phase 2).** Pages: `yHnxCDuZ6O` **Feature PRD: The Librarian**, `m93DraUfSE` **Memory & The
   Librarian — how they work**, `dvQn0HrpOu` Architecture, `MEcmPZvEdV` **Card Contract v1 (FROZEN)**,
   `FTvQLOYrVH`/`DzildKswk3`/`hHfBG7faIj` briefs, `5LT8G9oFGA` epics, `tUOSWHrWE8` **Autonomous Build Report**
   (built Waves 0–5, 736 tests green), `TeaMBF6Wz6`/`3RKKioGvr9` final-gate/hand-off.
2. **The loop = the Agent Staging Area, verbatim:** *capture → **Intake** (append-only change queue,
   `status='intake'`, "nothing in the wiki yet, never interrupts") → **engine gate** (find-before-create →
   op-reclassify → sensitivity → dedup → divert ladder) → **tidy-up** (propose disposition + destination per
   card, human confirm) → **shelves/router** (Wiki · Memory · Trash).* A **card = a proposed change** (add /
   edit / delete) with strict outside-proposed vs inside-resolved field authority; the submit schema is
   `.strict()`. "The engine gate — not the ritual — is the single safety boundary; there is no bypass." This is
   exactly the brief's "agents submit adds/section-edits/replacements/deletions to a staging store outside the
   wiki; a librarian routes staged content in." The **per-customer-tweakable prompt** maps to the
   **per-credential trust dial** + the curation/classification engine.
3. **In the current family canon it re-homes to `orvex-studio-api` as "the Curator":** studio-api PRD
   (`85qj2wwU2L`) FR-SA12–16 — **`engineGate()` lives in studio-api**, the **FROZEN Card Contract v1**,
   capture (MCP submit/import/native-pull) → CardProposal → stage/divert; sensitivity classification delegated
   to `orvex-studio-ai`, dedup/find-before-create candidates from `orvex-studio-knowledge`. It is framed as a
   **Studio-product feature**, user-keyed, not a platform service.
4. **Doc governance is the adjacent family-canon write-path node** (`cpeenW2R9t`, CANONICAL): drift + spec-gate
   live in **orvex-wiki-api**; the engine keeps only `orvex_page_meta` stamps; **CLI + MCP** surface them; the
   `DUPLICATE_CANDIDATE` guard + `doc-amend` (find-before-create, CAS, draft→ratify, supersede) are the existing
   write-gate primitives the staging area overlaps. (Note: spec-gate is DROPPED-pending-Linear; drift is active.)
5. **Knowledge routing / draft-ratify:** `orvex-studio-knowledge` PRD (`dCbFzRQGDr`) is the one search substrate;
   the `studio.skill.*/memory.*/chat.*` corpora index here (see R-9 Search-Stack Consolidation, `0mFImku9Gp`).
   Draft→ratify is the wiki-wide doc lifecycle (doc-ratify skill; human-only promotion).

**Tree of the three related satellites:**
- **orvexstudioknowledge:** Architecture (+ audit, R-9 Search-Stack Consolidation) · **PRD** (+ PRD Addendum).
- **orvexstudiomcp:** Architecture (post-split, +audit) · Docmost Server Requirements · Brainstorm Canon ·
  Deploy/Secret Runbook · Three-Repo Runbook · **PRD (post-split repoint)** · Studio↔MCP Contract · Thin-MCP
  Build Plan · Wiki&KB MCP Servers — Technical Research.
- **orvexstudioai:** Architecture (+audit) · **PRD** (FR-AI11 = per-user/per-space **Memories CRUD + recall**,
  GDPR opt-in, recall degrades to empty).

---

## 4. FIND-BEFORE-CREATE verdict (critical)

### (a) Agent Staging Area PRD — **ABSENT as a dedicated/platform PRD; RICH prior art exists**
- **In `orvexstudioarch`:** no staging-area page (the only "staging" hit is `j5nximbF8D` Crew Environments —
  unrelated dev stacks). **Verdict: create new** (as cross-service canon).
- **Prior art that MUST be cited/reconciled (this is NOT greenfield):**
  - `OPS/yHnxCDuZ6O` **Feature PRD: The Librarian** (full FR set; status: shipped-and-built) — full PRD.
  - `OPS/MEcmPZvEdV` **Card Contract — The Librarian (contract_version: 1, FROZEN)** — the staging card schema.
  - `OPS/m93DraUfSE`, `OPS/dvQn0HrpOu` (Architecture), `OPS/tUOSWHrWE8` (Build Report) — full designs, built.
  - `orvexstudioapi/85qj2wwU2L` **PRD: orvex-studio-api** FR-SA12–16 — the same concept as the "Curator",
    **already owned by studio-api** (`engineGate()` lives there). **Ownership tension to resolve:** does the new
    platform Staging Area **supersede/generalize** studio-api's Curator, or sit beneath it? This is the #1 open question.
  - `orvexstudioarch/cpeenW2R9t` Doc Governance + the wiki-api write-path (`doc-amend`, DUPLICATE_CANDIDATE, CAS).

### (b) Cross-Agent Memory PRD — **ABSENT as a dedicated/platform PRD; RICH prior art exists**
- **In `orvexstudioarch`:** no memory PRD. The `memory` subdomain is only *reserved* on the spine (ADR-0010,
  `studio.memory.*`) and named in the roster. **Verdict: create new** (as cross-service canon).
- **Prior art that MUST be cited/reconciled:**
  - `OPS/m93DraUfSE` **Memory & The Librarian — how they work** — the definitive Memory design (living portrait,
    typed atoms, areas, 4 capture on-ramps, privacy spine, **Cross-AI Sync = parked/vision**).
  - `OPS/P2mbhAv7SI` Memory, Reimagined — UX Design · `OPS/psnxt8NlAL` Design Brief — Memory, Reimagined.
  - `orvexstudioapi/85qj2wwU2L` FR-SA5–11 — **Memory (FormSpec) is owned by studio-api today** (9-type palette,
    3-state privacy, FR-31 weave). **Ownership tension:** the new *hosted, cross-agent* service generalizes this.
  - `orvexstudioai/pbKI3BpQmY` FR-AI11 — **ai_memories CRUD + recall** (a delegated primitive).
  - `houston` Beads/Dolt decisions (0021/0014/0005) — the **"beads-inspired, hosted"** substrate reference
    (a separate subagent is auditing beads/Dolt deeply — defer the storage-engine detail there).
  - `IAE` (archived) Memory Spec/Mvp/Full, Reasoning Bank — older prior art.

**Net:** both are genuinely new **at the platform/family-canon level**, but both are **generalizations of shipped
Orvex-AI-Studio product features**. The PRDs' central job is to (1) reconcile ownership with studio-api/studio-ai,
and (2) reuse the FROZEN Card Contract v1 and the Memory design rather than reinvent them.

---

## 5. Conventions for our new pages

- **Title pattern.** Two live conventions:
  - Satellite service PRD: `PRD: orvex-studio-<name>` (e.g. `PRD: orvex-studio-knowledge`), paired with
    `Architecture: orvex-studio-<name>`. Lead = bold **`In short:`** one-paragraph callout; sections
    Context → Goals (G1…) → Non-goals → Functional requirements (FR-<PREFIX>N, e.g. FR-SA/FR-AI/FR-K).
  - Cross-service capability page in arch: **descriptive title + ownership tag**, e.g.
    `Doc Governance — Drift & Spec-Gate (owned by wiki-api)`; lead = bold **`STATUS:`** then **`In short —`**.
  - **Recommended for these two** (they live in arch as cross-service canon): follow the arch/descriptive style
    while keeping "PRD" legible, e.g.
    **`PRD: Agent Staging Area — staged agent writes + the Librarian router`** and
    **`PRD: Cross-Agent Memory Service — hosted, beads-inspired (MCP + CLI)`**.
    (If instead they are to become deployable satellites, the family convention would mint dedicated spaces
    `orvexstudio<staging|memory>` with `PRD:`+`Architecture:` pairs — see the open question below.)
- **TL;DR / lead-callout.** Mandatory. Every canon page opens with a single bold lead: `**TL;DR** — …` (arch root,
  index) or `**In short:** …` (PRDs). One dense paragraph: what the thing is, what it owns, what it delegates.
- **doc_type.** Use **`prd`** (parallels the confirmed `adr` value; exact string not surfaced by this CLI build).
- **status.** Create at **`draft`** with an in-page `**Status: DRAFT**` banner. **Never author as canonical** —
  promotion is human-only doc-ratify (agents only via audited force-self-ratify under an explicit PO batch approval).
- **Authority-order rule a feature PRD must respect.** `family canon (orvexstudioarch) → project's own space
  (PRD + architecture) → engine space orvexwiki`. Placing a PRD **in arch asserts it is shared cross-service
  canon**, not a single-service concern — legitimate here (Doc Governance precedent), but the PRD must say so
  explicitly and must not duplicate what a satellite PRD owns; it links to them.

### Open question to route to the human (find-before-create escalation)
Both capabilities **already have owners** in the current canon (`orvex-studio-api` for the Curator/`engineGate`
and Memory/FormSpec; `orvex-studio-ai` for ai_memories). Before authoring, confirm the **intended relationship**:
platform capability that **supersedes/absorbs** the studio-api features (then supersession links + an ADR are
needed), vs. a **new peer service** the products delegate to (then dedicated `orvexstudio*` spaces, not arch).
This decision picks both the parent node and the title convention.
