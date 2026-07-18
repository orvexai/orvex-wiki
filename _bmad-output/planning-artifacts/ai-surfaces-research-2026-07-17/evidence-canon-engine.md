# Evidence map — orvex-wiki engine canon vs. deployed reality

Scope: the three requested wiki pages (`EPsdD7uK8e`, `twQ3BBzpTE`, `5eFdxN3edd`), the page that
actually supersedes one of them (`pVDJS0woHl`, discovered mid-task), and spot-verification
against the local `orvex-wiki` checkout (branch `fix/internal-export-title-space`, HEAD
`5572beeb`, 2026-07-17). Cache synced for both `orvexwiki` and `orvexstudio` spaces before
reading (`docmost-cli cache sync`, both returned `status:complete`).

**Headline finding: the requested "engine PRD" (`EPsdD7uK8e`) is `status=superseded`.** It is
not the live canon for the three AI surfaces question — `pVDJS0woHl` (a PRD-delta, filed
2026-07-15) is. That delta itself has a status contradiction worth flagging (see §2).

---

## 1. Page-by-page status table

| Slug | Title | Space | doc_type | status (metadata) | updated_at | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `EPsdD7uK8e` | PRD: orvex-wiki | orvexwiki | prd | **superseded** → `pVDJS0woHl` | 2026-07-15T21:20:51Z | Requested as "engine PRD" but is a dead link — the live PRD content is the delta page below |
| `twQ3BBzpTE` | Architecture: orvex-wiki | orvexwiki | architecture | **canonical** | 2026-07-12T16:16:39Z | Genuinely canonical; internally still says "draft — not canonical; ratify+supersede is a human action" in its own In-short line (leftover self-description text, contradicts the metadata status — minor doc hygiene issue, not a materially stale finding) |
| `5eFdxN3edd` | Delivery Program — Robust Tested Deployment (Phases 0–3) | **`orvexstudioarch`** (not `orvexstudio` as briefed) | technical-spec | **canonical** | 2026-07-15T11:09:59Z | This IS "the single 4-phase delivery plan" per its own title/shape, but it lives in the `orvexstudioarch` space, not `orvexstudio` — confirm this is the intended page if space-scoped tooling is used downstream |
| `pVDJS0woHl` | PRD-delta — orvex-wiki (Core Wiki Engine) — ENG-2103 (Wave 3) | orvexwiki | prd | **canonical** (metadata) | 2026-07-15T21:20:51Z | **Contradiction:** the page's own first line reads *"Status: DRAFT (metadata status=draft, doc_type=prd). Never ratified by an agent."* — i.e. the content asserts it is an unratified draft while the metadata field returned by the CLI says `canonical`. Treat the CONTENT's self-report as more trustworthy (per "certified ≠ current" — a status field can be wrong/stale) but flag the metadata/content mismatch itself as a doc-hygiene defect worth a ticket. |

**Embed-drop caveat (per task instruction):** `page get` (plain) reported dropping `[table]` on
`EPsdD7uK8e` and `[excalidraw, table]` on `twQ3BBzpTE`. `twQ3BBzpTE` in particular embeds an
excalidraw diagram (`:::dfm-opaque type=excalidraw id=15dba402-...`) illustrating the workload
topology / deploy architecture — **this diagram's actual content was not read** by this pass;
only its opaque placeholder was visible. `5eFdxN3edd` and `pVDJS0woHl` reported no dropped node
types. Any downstream consumer that needs the architecture diagram itself must re-fetch with
`--prosemirror` or `page mirror pull`.

---

## 2. `EPsdD7uK8e` (PRD: orvex-wiki) — SUPERSEDED, read as historical baseline only

Status: superseded 2026-07-15, superseded_by `pVDJS0woHl`. Still useful as the **FR-W1..FR-W25
baseline** that the delta page reconciles against — it is the fine-grained requirement set, just
not the current authority on deployed-state claims.

**Substantive commitments relevant to the three AI surfaces (api/mcp/cli):**

- **Non-goals section is the seam map**: composition/verb-grammar/DfM-grammar/cited-ask →
  **orvex-wiki-api**; search/RAG → **orvex-studio-knowledge**; chat/ask/inline-AI/model calls →
  **orvex-studio-ai** (except a named thin-UI carve-out, D-S4/FR-W18c, where the AGPL client
  keeps bubble-menu/Cmd+K/`/ai` slash/Ask-box/MCP+API settings pages as pure SSE-reading UI with
  **zero server AI code**); MCP gateway *logic* → **orvex-studio-mcp**; token
  mint/scope/verify/SSO → **orvex-studio-identity**.
- **F-QUOTA (FR-W10..FR-W15)** — this is the one genuinely NEW requirement class in this PRD
  (dated 2026-07-05). Full detail in §4 below (shared with the architecture page, which is the
  fuller of the two on this topic).
- **Engine API is internal-only, no Swagger** (FR-W25, D-S16/D-S18): **wiki-api fronts ALL
  wiki-shaped programmatic access** including history/diff/version, bulk import/export, binary
  attachments, comments — "no engine-direct residuals." The only exception is the wiki's own
  React client. This is the load-bearing rule for the CLI/API surface question: **the CLI and
  any programmatic API client should be talking to wiki-api, not the engine directly**, per this
  PRD's intent.
- **FR-W18 / FR-W18b** — the shared `@orvex/dfm` serializer library. Engine's own write path
  (`page.service.ts`, `collaboration.util.ts`) imports the AGPL TypeScript twin; **CLI and every
  closed satellite (ai/mcp/wiki-api/llms) must reach DfM via the closed Go twin
  (`orvex-studio-lib/pkg/dfm`) or a network call to wiki-api — never by importing the AGPL TS
  package** (this exact correction is stated more sharply in the architecture page's A-SEAMS
  decision, which explicitly says this PRD's earlier FR-W18 phrasing "ai/mcp/wiki-api/llms import
  `@orvex/dfm`" is **superseded** and must be corrected).
- **Rollout order** (§6): `orvex_page_meta` side table first → primitives + `apply-ops` collapse
  → F-QUOTA → outbox/event producer → auth (clean-room api-key, session-mint, §13 source-offer)
  → multi-tenant enablement → delete tsvector/pgvector → **delete the `/mcp` transport** (this
  last item is notable — the PRD explicitly plans to *remove* an in-engine `/mcp` transport, i.e.
  MCP logic is not meant to live in the engine at all, consistent with the non-goals row).

**Open questions still live at time of authoring** (OQ-W1, OQ-W2, OQ-W4) — OQ-W2 (billing↔engine
entitlement contract shape: push vs pull) and OQ-W4 (standalone service mandatory-set) are BOTH
still explicitly unresolved per the delta page's MR-W1/MR-W5 (see §3) — i.e. these open
questions from the superseded PRD were never closed, they were *carried forward* into the delta
as still-open MUST-RESOLVE items, not answered.

---

## 3. `pVDJS0woHl` — the ACTUAL current PRD content (ENG-2103, Wave 3, 2026-07-15)

This is what supersedes `EPsdD7uK8e` and is the page that should be treated as authoritative for
"what does the engine PRD currently say," despite the status-field ambiguity noted in §1.

### 3a. What it is
A **reconciliation delta**, not a full PRD rewrite: takes the Orvex Studio brief + the
concept-to-service map, reconciles them against (a) the old PRD `EPsdD7uK8e`, (b) the canonical
architecture `twQ3BBzpTE`, and (c) **the deployed artifact, verified live at dev HEAD `e1bf1ce4`
this session** (2026-07-15). Explicit method: "the LIVE CODE wins over the PRD prose."

### 3b. Five "read this first" reconciliation facts (§0)
1. **Prod is NOT vanilla** — contradicts the map's "prod = byte-parity vanilla, modules off"
   claim, which the delta calls "one day stale." Commit `725090bd` (PR #113, 2026-07-14) flipped
   `ORVEX_MODULES_ENABLED=true` in the BASE ConfigMap (i.e. what prod reads); PO-directed cutover
   drove prod to 8/8 accepted engine surfaces (health 200, real 402 QUOTA_EXCEEDED firing,
   session/exchange answering, outbox→Kafka live).
2. **ArgoCD Healthy ≠ working; 8/8-engine-surfaces ≠ product-done.** The PROGRAM 7-surface E2E
   re-baseline (`program-status.md`) is **1 PASS / 5 FAIL / 1 BLOCKED** — only `api` is a clean
   end-to-end pass. Defects ENG-2039..2054 filed and real.
3. **The old PRD both understates and overstates deployed maturity.** Concretely: FR-W7
   (api-key clean-room rebuild) is **now DONE-ish** — moved in-tree to `core/api-key`,
   `jwt.strategy.ts` imports it directly, no more dynamic EE load (the old PRD's "empty
   placeholder + ee/api-key runtime-required" text is stale). But FR-W8 (transaction-scoped RLS)
   is **STILL OPEN** — `grep -rl "ROW LEVEL SECURITY" apps/server` returns 0 at HEAD.
4. **The engine's contracts surface IS tagged (unlike workgraph)** but is mostly `x-status:
   draft` — "satisfied-on-existence, unsatisfied-on-freeze." Don't read tag-exists as
   frozen-and-safe-to-build-against.
5. **The engine is the AGPL exception** to cell-contract rule 7 (UUIDv7 new-schema) and runs the
   `solo` sentinel — do not hold it to greenfield cell rules; it IS still bound by rules 4/5/6/9/10/11.

### 3c. Six primitives (all pre-existing FR-W, deployed-verified) — §2a

| FR | What | Deployed state (measured @ `e1bf1ce4`) |
| --- | --- | --- |
| FR-W1 | `apply-ops` block-write chokepoint (typed PM-JSON ops, CAS `ifVersion`→409) | **REAL** — `POST /orvex/pages/:pageId/apply-ops` live (`OrvexApplyOpsController`), e2e spec present |
| FR-W2 | FR-13 ACL read primitive (`accessibleSpaceIds`/`filterAccessiblePageIds`) | Declared in `engine-primitives.yaml`, served via `InternalApiController` acl/filter; **`evalPage` page-level bug still open** (ENG-2482) |
| FR-W3 | Page lifecycle + `orvex_page_meta` side table (move 18 cols off `pages`) | `page-metadata` module real (22 files, 2358 LOC) with supersede/promote/status controllers; **the actual column move is still open** (ENG-2480) |
| FR-W4/18 | Export (markdown + `text_repr`) + export-authz IDOR fix | Contract declared; served via `InternalApiController pages/:id/export`; real audit-service binding still open (ENG-2483) |
| FR-W5 | Transactional outbox → Kafka CloudEvents | **REAL** — `OutboxWriterService` same-tx write, `OutboxRelayService` (unconditional `@Interval`) publishes `wiki.*` events; **proven on prod** |
| FR-W6 | Session-mint consume (RS256/JWKS), native login removed | **REAL** — `core/session-mint` + `orvex/session-mint`; `POST /orvex/session/exchange` live |
| FR-W10..15 | Quota enforcement at chokepoint | **ENFORCED** — `EntitlementService.assertWithinQuota` called at 6 sites incl. `page.service.ts`, `attachment.service.ts`, `workspace-invitation.service.ts`; 402 fires on prod. **`GET /orvex/quota` (FR-W15 read) is an honest 501 — enforcement ≠ read** |

### 3d. Net-new / re-framed requirements — §2b

| FR | What | State |
| --- | --- | --- |
| FR-W16 | Product-family portability + graceful degrade | No packaging artifact, no degradation path built → **MR-W1** |
| FR-W19 | AGPL §13 source-offer | **REAL** — `OrvexSourceController GET /orvex/source` — BUT the upstream `integrations/security/version.controller.ts` still coexists → residual two-endpoint reconcile (ENG-2500) |
| FR-W21 | Sever upstream Stripe seat-sync from AGPL core | **NOT severed** — still routes through `workspace-invitation.service.ts` → **MR-W2** |
| FR-W8 | Transaction-scoped fail-closed RLS | **OPEN** — 0 RLS policies at HEAD; app-layer ACL is the only wall today (ENG-2502) |
| FR-W37 | Distributed-cleanup contract (`workspace.deleted`/`user.deleted` purge events) | Contract declares `purge_events`; emission on removal is open (ENG-2497) |

### 3e. MUST-RESOLVE seam inventory — §4 (surfaced, explicitly NOT decided by this pack)

- **MR-W1** — standalone full-family stack: no packaging artifact, no absent-satellite
  degradation path, OQ-W4's mandatory-vs-optional service set unruled. Escalated, not
  implementer-decidable.
- **MR-W2** — engine still holds AGPL Stripe seat-sync logic (`workspace-invitation.service.ts`);
  severance is a cross-repo act with billing, not decidable engine-side alone (AGPL-cleanliness
  legal risk, P2-13 "confirm with counsel before prod"). Blocks ENG-2504.
- **MR-W3** — contract surface tagged (v0.1.0..v0.1.3: 29 `wiki.*` event schemas +
  `engine-orvex.yaml` 8 ops + `engine-primitives.yaml` 16 ops) but mostly draft: measured at
  contracts HEAD `4d323718` — engine-orvex 5 draft/3 pinned; engine-primitives 13 draft/3 pinned
  (25 ops total: **6 pinned / 19 draft**); **all 29 `wiki.*` event schemas are `x-status: draft`**.
  Freeze decision belongs to ADR-0008 + contracts repo, not this pack.
- **MR-W4** — the contract declares BOTH `engineProvision` and `engineDeprovision`; the engine
  serves only `POST /internal/principals/provision` — **0 `clerk/*` files in the engine, no
  deprovision route**. Clerk lifecycle ownership is contested identity-vs-workflows, unsettled.
  **Locally verified**: `find apps/server/src -iname "*clerk*"` returns nothing, confirming the
  claim.
- **MR-W5** — quota entitlement contract shape (push vs pull vs both) + interim-hardcode→SoR
  swap point is billing's to settle, not engine's. Blocks ENG-2489's cache-eviction contract.
- **MR-W6** — message-tracing-across-outbox is a known family-wide open gap (map risk-7); engine
  persists W3C trace-context on the outbox row and stamps the CloudEvent, but end-to-end trace
  continuity across outbox→relay→spine→knowledge is unsolved family-wide. Inherited, not this
  service's alone to fix.

### 3f. Local repo spot-verification (this session, HEAD `5572beeb`, branch
`fix/internal-export-title-space`, 2026-07-17 — one commit past the delta's cited `e1bf1ce4`)

| Claim in `pVDJS0woHl` | Verification command | Result |
| --- | --- | --- |
| "21 module dirs, 129 non-spec TS files" under `apps/server/src/orvex` | `find ... -maxdepth 1 -mindepth 1 -type d \| wc -l` / `find ... -name '*.ts' ! -name '*.spec.ts' \| wc -l` | **21 dirs, 130 files** (off by one vs. the delta's 129 — consistent with one file added since the delta's HEAD `e1bf1ce4`, not a material discrepancy) |
| "0 RLS policies at HEAD" (FR-W8 still open) | `grep -rl "ROW LEVEL SECURITY" apps/server` | **0 matches — confirmed still open** |
| "api-key moved in-tree to `core/api-key`, no more dynamic ee load" | `ls apps/server/src/core/api-key` vs `apps/server/src/ee/api-key` | `core/api-key` has 9 real files (`api-key.controller.ts`, `api-key.service.ts`, `orvex-bearer-auth.guard.ts`, clean-room spec, etc.); `ee/api-key` returns **nothing** — **confirmed** |
| "two orvex additions under `core/`: `core/internal-api`, `core/session-mint`, mounted unconditionally" | `find apps/server/src -ipath "*internal-api*"` / session-mint dirs | Both present exactly as described, under `core/`, not `orvex/` |
| "0 `clerk/*` files, no deprovision route" (MR-W4) | `find apps/server/src -iname "*clerk*"` / `grep -rn "eprovision" ...` | **0 matches for both — confirmed** |
| **Directly relevant to this branch's own pending commit** (`b2f60c22 feat(internal-api): return title + space slug + slug_id on /internal/pages/{id}/export`) | `grep -n "title\|spaceSlug\|slug_id" apps/server/src/core/internal-api/internal-api.service.ts` | Confirmed live: the export path now returns `title`, `space` (slug, not UUID), and `slugId` so a knowledge hit is "chainable back to a page" via `/s/{space}/p/{slug_id}` — this is exactly the FR-W4/FR-W18-adjacent addressing gap the delta's export row (§3c) flags as still needing the "real audit-service binding" (ENG-2483) rather than the addressing fields, which this branch's commit appears to close |

**Net read**: the delta page's "verified live" claims check out against the actual working tree
on every point spot-checked. This is a rare case where the wiki canon is *more* current than a
naive PRD read would suggest, precisely because it did the reality-probe the "certified ≠
current" memory note demands. The one item worth a follow-up ticket is the **status-field vs.
content mismatch on `pVDJS0woHl` itself** (metadata says canonical, first line says draft/never
ratified) — this is a live instance of the same failure class (doc metadata drifting from doc
truth) that the delta page is itself warning about for OTHER pages.

---

## 4. F-QUOTA (fullest version is in `twQ3BBzpTE` architecture page, A-QUOTA + A-QUOTA-HARDENING)

- **Enforced surfaces**: page create, attachment upload, member add — engine-level and
  non-bypassable because both the REST API *and* the Hocuspocus collab persistence path
  (`persistence.extension.ts`) can create pages/attachments; a REST-only check would be silently
  bypassed by the Yjs store.
- **Mechanism**: Redis fast-counters (`quota:pages/bytes/files/members:{tenant}`, INCR-on-write,
  O(1) pre-flight check, never a per-request COUNT/SUM scan) + a background O(changed)
  reconciliation sweep. On Redis loss: **fails closed for storage bytes/files, fails open for
  cheap resources (pages/members)** until reconciled — a deliberate availability-over-cost
  tradeoff the architecture page itself flags (A-QUOTA-HARDENING, finding F6) as **not yet filed
  as an ADR**, despite meeting all three CS §9 triggers for requiring one.
- **Entitlement values**: owned by billing, never hardcoded by the engine except as an
  interim-only Free-tier constant behind an entitlement-reader interface, which **must swap to
  the billing system-of-record before any paid plan is sold**.
- **Reference tiers** (billing-owned, cited for context): Free = 200 pages/1 GiB/10 MB-file/2,000
  files/25 members/`min(10,180d)` history; £7 Personal = 20,000 pages/50 GiB/50 MB-file/20,000
  files/25 members/`min(100,730d)`.
- **Contract**: `402 QUOTA_EXCEEDED` frozen error code — never 429, never a delete; reads/exports/
  deletes always succeed; SSO/SCIM JIT allowed to 110% of member cap; manual invites blocked at
  cap.
- **Deployed-verified (per the delta)**: `EntitlementService.assertWithinQuota` is real, called
  at 6 sites, 402 fires on prod. The **read side (`GET /orvex/quota`, FR-W15) is an honest 501** —
  enforcement shipped ahead of the usage-meter read endpoint.
- **Still-open architecture item**: the `402` **verdict-computation** must live in a
  domain/service function (`orvex/quota`), with `page.controller.ts` only marshaling the verdict
  — this is stated as a correctness requirement (A-QUOTA-HARDENING, finding F9) rather than
  something confirmed built; the delta page does not re-verify this specific decomposition.

---

## 5. Which phase covers the api/mcp/cli AI surfaces (`5eFdxN3edd`)

The delivery plan (`orvexstudioarch` space, canonical, updated 2026-07-15) runs **Phase 0 → 1 →
2 → 2.5 → 3**, each launched by its own orchestrator prompt page (Phase 1: `yXUWpQpRjx` · Phase
2: `Ng66su4dVG` · Phase 2.5: `ErYdXzIj6g`).

- **Phase 0 (stabilize)** — item 4, "the Acceptance Re-baseline," is the **six-surface
  protocol** explicitly named as `api / mcp / cli / ai / rag / knowledge-sync` — i.e. this is
  where the three surfaces in question get their first honest pass/fail baseline, on the dev
  cell, fresh tenant, real identity-minted token, human-observed. Per §3b above, the delta page
  reports this baseline (renamed here "program 7-surface E2E re-baseline") already ran and
  returned **1 PASS (api) / 5 FAIL / 1 BLOCKED** as of 2026-07-15, with defects ENG-2039..2054
  filed.
- **Phase 1 (Definition Factory)** — per-service Service Definition Packs (PRD delta + frozen
  contract + test plan + Service Done Definition + agent build prompt), factory order: (1)
  contracts+lib+bridge, (2) staging+workgraph, (3) **delta-packs for the drained services
  including explicitly "wiki, wiki-api, cli, ... mcp"** covering brief-new features (Composer +
  wizard, Orvex rating, outbound sync, etc.), (4) UI surface waves. `pVDJS0woHl` (ENG-2103, Wave
  3) is itself one of these Phase-1 definition-pack outputs for the wiki engine specifically.
- **Phase 2 (isolated builds)** — contract-first dispatch rule (a story is frontier-eligible
  only if its service's contract tag ≥ the pack's named tag — directly relevant given MR-W3's
  finding that the wiki's contract tag exists but is mostly `x-status: draft`), continuous
  family-E2E cadence (red run freezes merges for implicated services).
- **Phase 2.5 (Product Acceptance E2E)** — full user-journey acceptance distinct from the
  six-surface engineering protocol; includes new-interface parity against the POC's ~35 surfaces.
- **Phase 3 (cutover)** — prod cutover ladder, engine Stripe severance (directly = MR-W2 above),
  monolith strangle completion.

**Parity/fold-in explicit statement**: Program exit ("Phase-1-done definition," cited verbatim in
the plan's Verification section) = "every surface — api/mcp/cli/ai/rag/knowledge-sync + the UI —
passes a real product-acceptance run on a fresh tenant with real data, reproduced not reported,
and prod runs with modules ON." Per the delta page, **prod already runs with modules ON**
(since 2026-07-14, `725090bd`) — so the plan's stated exit gate's infra-precondition is met, but
the acceptance-run itself is currently 1/7 passing, not exit-clean.

**Linear tracking note**: the plan (authored 2026-07-13) references Linear ticket IDs throughout
(ENG-2033..2037, the M0-M14 gate ladder, etc.). Per the task brief for this evidence-mapping
exercise, **Linear integration is being dropped entirely** from the family's plans — this plan
page as currently written is Linear-native and has not been updated to reflect that decision;
treat every Linear-ticket reference in this plan as needing a rewrite/strip pass, not as current
tracking truth.

---

## 6. Stale-vs-live flags (summary)

| Item | Stale claim | Live reality | Source |
| --- | --- | --- | --- |
| Requested "engine PRD" `EPsdD7uK8e` | Treating it as the current PRD | **Superseded** by `pVDJS0woHl` (2026-07-15) | metadata `status`/`superseded_by` fields |
| "Prod is byte-parity vanilla, modules off" (map + migration-assessment docs) | Claimed current | **Stale by 1 day** — prod modules-ON since `725090bd` (2026-07-14), PO-directed cutover, 8/8 engine surfaces accepted | `pVDJS0woHl` §0.1, cross-checked against `deploy/kustomize/app-manifests/configmap-env.yaml` on `dev` and `origin/main` (per the delta's own citation — not independently re-verified this pass) |
| FR-W7 api-key "empty placeholder, EE-derived, high licensing risk" (old PRD `EPsdD7uK8e`) | Was true when written | **DONE-ish** — clean-room rebuild landed in `core/api-key`, `ee/api-key` no longer referenced | Locally verified: `ee/api-key` has 0 files, `core/api-key` has 9 real files incl. `api-key-clean-room.static.spec.ts` |
| FR-W8 RLS | Architecture page (`twQ3BBzpTE`) frames it as a launch gate | **Still 0 policies at HEAD** — genuinely still open, not stale-vs-live, this one is accurate | Locally verified: `grep -rl "ROW LEVEL SECURITY" apps/server` → 0 |
| Contract tag "exists" being read as "frozen" | Stories say "dispatch-blocked until tag exists (ENG-2103)" implying tag=safe | Tag exists but **19/25 ops and all 29 event schemas are `x-status: draft`** — MR-W3 explicitly warns against reading tag-exists as freeze | `pVDJS0woHl` §4 MR-W3, measured at contracts HEAD `4d323718` |
| `pVDJS0woHl` itself | metadata `status: canonical` | content's own first line: **"Status: DRAFT ... Never ratified by an agent"** | direct content/metadata mismatch, this evidence pass |
| ArgoCD-Healthy / 8/8-surfaces-green reading | Could be read as "engine done" | Program-level 7-surface E2E is **1 PASS / 5 FAIL / 1 BLOCKED** — engine's own surfaces passing does not mean the product surfaces (api/mcp/cli/ai/rag/knowledge-sync) pass | `pVDJS0woHl` §0.2, consistent with memory note "signals are not observation" |
| Delivery plan space | Task briefed `orvexstudio` | Page actually lives in **`orvexstudioarch`** | `page get -o json` `space_slug` field |
| Delivery plan's Linear-nativity | Plan text is full of Linear ticket IDs as live tracking | Family decision (per this task's own brief) is to **drop Linear entirely** | Cross-referenced against task instructions, not the wiki itself |

---

## 7. Method notes / limitations of this pass

- `docmost-cli cache sync --space orvexwiki` and `--space orvexstudio` both ran and returned
  `{"status":"complete"}` before any reads.
- All three requested pages were fetched via `page get <slug> --no-daemon` (force-fresh, bypasses
  cache) rather than the cached daemon read, per the task's emphasis on live-not-cached truth.
- The discovery of `pVDJS0woHl` (the actual superseding page) was NOT part of the original task
  list — it surfaced only because `EPsdD7uK8e`'s JSON record carries a `superseded_by` field.
  Anyone re-running just "page get the three named slugs" without checking `status`/
  `superseded_by` would silently report on a dead PRD.
- The excalidraw diagram embedded in `twQ3BBzpTE` was not read (dropped by plain `page get`); if
  the workload-topology or deploy-delta diagram matters for downstream work, re-fetch with
  `--prosemirror`.
- Local repo verification was scoped to targeted `grep`/`find` spot-checks cited inline, not a
  full audit; it corroborates the delta page's specific measured claims, it does not
  independently re-derive them from scratch.
- Two `PRD-delta`/superseding-chain hops were followed (`EPsdD7uK8e` → `pVDJS0woHl`); no further
  supersession was checked on `pVDJS0woHl` itself (its own `superseded_by` field was not
  inspected — worth a follow-up if this file is reused later than 2026-07-17).
