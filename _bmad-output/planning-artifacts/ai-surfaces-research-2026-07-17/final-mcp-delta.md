# FINAL — The MCP ⊇ CLI Delta List (PO-D1) — merge of draft-mcp.md + challenge-mcp.md

Merge pass, 2026-07-17. Base = `draft-mcp.md`. All 11 findings in `challenge-mcp.md` (C1–C11) were
independently spot-verified against primary evidence files (not taken on faith) and **all 11 held up** —
every correction below is evidence-backed and applied. Additionally cross-checked against
`wiki-study/atlas.md` (confirmed present, 262 lines — the draft's claim that it "does not exist" was
itself stale; it now exists and adds one net-new finding, F1, plus corroborating evidence for C2/C11).

---

## Executive summary

- **Rows: 25 total** — 10 P0, 9 P1, 6 P2 (was 23/9/9/6 pre-merge; +2 rows added, C3/C4).
- **Dispositions: 15 adopt/adopt-reshaped · 5 rethink · 2 drop · 10 CLI-only exceptions** (§4, unchanged).
- **11/11 challenger findings CONFIRMED** on spot-check (0 rejected) — see Verification Log. This list
  therefore carries **zero "challenge rejected" appendix entries**; every disagreement in `challenge-mcp.md`
  was checked against primary evidence (`evidence-mcp.md`, `evidence-fork-server.md`, `evidence-docmost-cli.md`,
  `evidence-orvex-cli.md`, `synthesis-parity.md`) and the challenger was right each time.
- **Headline gap 1 — two delivered CLI verb-groups had ZERO disposition row** (C3: duplicate/scaffold/tree-apply;
  C4: spec-gate) despite being real, tested capabilities. Both now have rows; PO-D1's "default is parity" was
  silently violated by omission, not by a wrong verdict.
- **Headline gap 2 — a canon-violating serving assignment reached a P0 row**: Ratify was labeled "wiki-api
  mint" against the settled chain *engine mints → wiki-api transports verbatim → MCP/CLI never mint* (goggles
  P8, `synthesis-parity A.4/A.7`, and now also `atlas.md` B38). Fixed; the adjacent supersede/status row is now
  worded uniformly.
- **Headline gap 3 — one hero-adjacent current-state claim was fabricated by inheritance**: "AI image
  generation" cited `generate_image` as an MCP *scaffold*; at HEAD the tool is **absent entirely** (zero hits
  in `evidence-mcp.md`'s 52-tool inventory), not one of the 30 registered stubs. Corrected to "absent, not
  scaffolded" — this changes what greenfield work the row implies (name/schema/category are all undecided,
  not already reserved).
- **NEW (atlas, F1) — the staging hard-cut (B43) is an unflagged blast-radius risk for this whole list.**
  Every P0/P1 write-shaped row above (delete, move, supersede/ratify, comment-post, label mutate, attachment
  upload, import) sits on `wiki_save`/future write verbs that are **sequenced for a 403-and-redirect to
  `staging_*` for agent-class creds** once staging's apply path lands (FR-STG25, unexecuted). No row in the
  draft accounted for this; added as open question §(c)Q11.
- **Serving-service corrections (PO-D4 compliance):** Ratify (C2, engine mints not wiki-api), Comments (C6,
  wiki-api front not studio-api family-wide), AI usage/cost (C9, ai for usage-read + billing for
  entitlement-cap, not "billing" alone), AI chat/inline (C7, split — inline is ai-generate, not
  ask+wiki_save overlap).
- **Missing-row fixes:** structural create (duplicate/scaffold/tree-apply, C3) and wiki-first spec-gate (C4)
  now have first-class rows instead of living only in open questions.
- **Reorg:** support-issue relay moved P2→P1 and disposition rethink→adopt-reshaped (C8 — it's a *Done* CLI
  capability; PO-D1 makes reachability the floor, only the Linear-naming question is open).
- **Net verdict carried forward from the challenge:** the list was already structurally sound (framing,
  §4 exceptions, most ticket citations); the defects were concentrated in 2 missing rows, 1 wrong current-state,
  1 wrong serving assignment, and several under-argued dispositions — all now closed.

---

## 0. Reading rules — what "reachable" means, and the two ceilings this list is written against

1. **PO-D1 default is parity; reachable, not hero.** Per PO-D1 (`po-decisions/2026-07-17.md:10-37`) every
   capability the CLI can do must be reachable through the MCP — but "reachable" = *behind progressive
   disclosure* (`list_tools(category)`) or a token-gated governance verb, **not** "in the always-loaded hero
   set." A justified CLI-only exception list is allowed but must be short and argued (§4).

2. **A `NOT_AVAILABLE_YET` scaffold is NOT reachable; an ABSENT tool is a step further back than a scaffold.**
   The MCP registers **52** tool names total: **21 REAL** (backed by a live upstream call) + **30 permanent
   scaffolds** returning `NOT_AVAILABLE_YET` (including 7 of the 13 hero seats: `memory_recall`, `staging_*`,
   `workgraph_*`) + **1** confirmation-gated-but-substrate-absent (`marketplace_publish` — real elicitation
   wiring, `NOT_AVAILABLE_YET` result) = **21 + 30 + 1 = 52**, so **31 of 52 registered tools cannot succeed at
   HEAD** *(corrected arithmetic — the draft's "52 = 21 + 30" undercounted by 1; C10, `evidence-mcp.md §1/§14`)*.
   A capability with **no registered tool name at all** (e.g. `generate_image`, C1) is a distinct, earlier-stage
   gap than a scaffold: the name/schema/category are still fully open, not already reserved.

3. **The hero-13 ceiling is hard and the golden-tape KPI is the reason.** `standalone-boot.test.ts` asserts the
   default `tools/list` equals the hero-13 array exactly; adding a 14th needs an ADR to retire one
   (`evidence-mcp.md §2`; `evidence-canon-mcp.md:58,218`; `ZGjLctEnGH.txt:146`). The connect-schema budget is
   **5,303 tokens** inside a ~4.5–5.5k ceiling, a required CI gate. **No delta row below claims a new hero
   seat.** Parity lands on-demand + token-gated so the always-paid surface never grows. (The one lever that
   *could* free hero seats — demoting the 7 scaffold heroes per goggles fix-A — is a design question, §5(c)Q1,
   not a parity requirement.)

4. **PO-D4: every row names its SERVING service.** The engine is SoR for writes+collab, never the AI path
   (`po-decisions:83-107`). Reads *may* be served from the knowledge index — an OPEN question (§5(c)Q5), so
   wiki reads are provisionally attributed to wiki-api. Governance token *minting* is **engine-only**;
   wiki-api/MCP/CLI transport verbatim, never mint (`atlas.md` B38, `synthesis-goggles §1 P8` — this rule was
   violated in one draft row, C2, now fixed). Serving legend: `wiki-api` (composition tier over engine
   primitives) · `knowledge` · `ai` · `identity` · `audit` · `billing` · `console` · `engine` (SoR, internal-only,
   mints tokens, never the AI path).

5. **Disposition (PO-D2, argued from first principles):** `adopt` = take the capability, reshape only to
   envelope/naming · `adopt-reshaped` = same capability, materially different agent-native shape (fold N verbs
   → 1, add a token gate) · `rethink` = challenge whether it belongs on the agent surface at all · `drop` =
   deliberately not on the MCP (justified exception or superseded).

6. **What is already REACHABLE (not a delta row):** page read (`wiki_get` ladder), page create/update/
   upsert/edit/patch/replace (`wiki_save` upsert+block-patch), keyword/semantic/hybrid search
   (`knowledge_search`), related (`knowledge_related`), cited ask (`ai_ask`), identity/space probe (`whoami`),
   tree/neighborhood/changes nav (`wiki_get_tree`/`_neighborhood`/`_changes`), self-onboarding
   (`get_capabilities`/`list_tools`), locator resolve-slug (server-side dialect auto-resolve, no verb needed).
   Everything else in the CLI inventory is below.

7. **NEW (atlas F1) — every write-shaped row below is sequenced for a hard-cut it must not be designed around
   as permanent.** B43 (`atlas.md §2.11`, FR-STG25, unexecuted): agent-class `wiki_save`/edit writes are slated
   to 403 at wiki-api ingress and redirect into `staging_*`/`orvex-cli staging` once staging's apply path
   lands. This is *sequenced last* and gated on non-501 ai/knowledge — it has **not landed** — but any new
   write verb this delta proposes (delete, move, lifecycle, comment-post, label-mutate, attachment-upload,
   import) must be designed as a clean swap-in for that redirect, not an architecture the cut has to break.
   See §(c)Q11.

---

## P0 — table-stakes wiki operations an agent must be able to reach

| Capability | Precedent (file-cited) | Serving service (PO-D4) | Current state @HEAD | Disposition | One-line rationale |
|---|---|---|---|---|---|
| **Page delete / trash / purge / restore-from-trash** | docmost-cli `page delete\|trash\|purge\|restore` (`evidence-docmost-cli §1a`); orvex-cli `wiki page delete/trash/purge` real but 404-risk (`evidence-orvex-cli §3`) | wiki-api → engine | **missing** — `wiki_save` is upsert+block-patch only; no delete/trash verb (`evidence-mcp §3a,§6`) | **adopt-reshaped** | Destructive lifecycle is core; one `confirm_token`-gated `wiki_delete` on-demand, never hero. |
| **Page move / reparent** | docmost-cli `page move` (`§1a`); wiki-api `POST /v1/pages/bulk` (`synthesis-parity A.4`, ENG-1467 In Progress) | wiki-api → engine | **missing** — no MCP structural-move verb | **adopt-reshaped** | Reparenting is a structural write agents need; on-demand `wiki_move` (or a `wiki_save` structural op). |
| **Structural create: duplicate / scaffold / tree-apply** *(NEW — C3)* | orvex-cli `wiki page duplicate/scaffold` **REAL, done handlers** (`evidence-orvex-cli:47,215`; `synthesis-parity:217` "core CRUD… done — real handlers"); docmost-cli `page duplicate`, `page scaffold <title>`, `page tree … apply <file>` (`evidence-docmost-cli:63,71,75`) | wiki-api → engine | **missing** — no MCP verb; not even named as a scaffold (`evidence-mcp §3`) | **adopt-reshaped** | Clone-from-existing (template instantiation) is distinct from `wiki_save` create/upsert and is *already delivered* on the CLI side — PO-D1 floor, not optional; on-demand `wiki_duplicate`/scaffold-mode, tree-apply rides the async-batch home (§5(c)Q8). |
| **Lifecycle status transition (draft/canonical/deprecated/superseded/archived) + supersede** | docmost-cli `page supersede`, `--status` transitions (`§3.3`); orvex-cli `wiki governance supersede/status` real (`evidence-orvex-cli §3`); engine mutations ENG-1434 Done | wiki-api (transport) / **engine (mints tokens)** | **partial** — publish-path gate returns `NEEDS_HUMAN_PUBLISH` *inside* `wiki_save` but there is **no explicit `wiki_status`/`wiki_supersede` verb** (`evidence-mcp §6`) | **adopt-reshaped** | PO-D1's headline case: token-gated governance verb, `needs_human_publish` absent a human token, byte-verbatim relay when present (P6/FR-M13). |
| **Ratify draft → canonical** | docmost-cli `page ratify` + `--force-self-ratify` (`§3.3`); ratify-token guard (memory) | **engine (mints, D-A8)** / wiki-api (transports verbatim) *(corrected — C2)* | **partial** — verbatim `ratify_token` relay in the `wiki_save` publish gate; no standalone `wiki_ratify` verb (`evidence-mcp §6`; `canon-mcp §5.5`) | **adopt-reshaped** | Same server human-token gate as the CLI; AI never self-promotes — a transport verb, not an authority grant. *Corrected from "wiki-api mint," which broke the settled mint chain and conflicted with the sibling row above — `synthesis-goggles §1 P8`, `synthesis-parity A.4/A.7`, `atlas.md` B38, `evidence-mcp.md §6` "never minted by the MCP" (FR-M11).* |
| **Comment read / list / resolve / unresolve / rm** (full CRUD+resolve) | docmost-cli `comment add\|edit\|get\|list\|resolve\|rm` (`§12`); orvex-cli `wiki comment` (404-risk, `§3`) | **wiki-api (front) over the engine comment/resolve primitive** — D-S16 *(corrected — C6)* | **partial** — only `wiki_comment_post` (write-only, studio-api-conditional, R-SEAM-1 exception for that one verb) is reachable; **no read/list/resolve/rm** (`evidence-mcp §3c`) | **adopt** | Collaboration is table-stakes; complete the `wiki_comment_*` family on-demand as a wiki-api locator sub-resource (`/v1/wiki/{loc}/comments`), not by extending the studio-api `/v1/social` exception family-wide. *Corrected — `evidence-fork-server §3.11` D-S16 ("programmatic agent access to comments routes through wiki-api, not engine-direct"), `synthesis-parity A.9`, `synthesis-goggles Q8`; the draft's "studio-api `/v1/social`" was generalizing a single sanctioned exception (the post verb) into the whole family.* |
| **Attachments get / list / upload / rm / search** | docmost-cli `attachment get\|list\|orphans\|rm\|search\|upload` (`§12`); orvex-cli `wiki attach` (404-risk, `§3`) | wiki-api (binary) + knowledge (full-text attach-search) | **missing** — `wiki_attachment_get`/`_save` are **SCAFFOLD `NOT_AVAILABLE_YET`** (`evidence-mcp §3b`; R-SEAM-8a) | **adopt-reshaped** | Attachments are core content; on-demand once wiki-api serves the sub-resource (§5(c)Q3); attach-search → knowledge. |
| **Labels list / pages / add / rm** | docmost-cli `label`, `page label add\|list\|rm` (`§12`); orvex-cli `wiki label` (404-risk) | engine + wiki-api front | **missing** — no MCP label verb (`evidence-mcp §3`) | **adopt** | Labels drive taxonomy + retrieval; cheap on-demand `wiki_label_*`. |
| **History list / diff / version / revert / restore-content** | docmost-cli `page history\|diff\|version\|revert\|restore-content` (`§1a`); orvex-cli `wiki history` real (`§3`); engine ENG-1369 Done | wiki-api → engine | **missing** — no MCP history/diff/revert verb | **adopt** | Version navigation on-demand reads (`wiki_history`/`wiki_diff`) + a `confirm_token`-gated `wiki_revert` (destructive). |
| **Space CRUD + members + permissions + confirm-gate** | docmost-cli `space create\|delete\|get\|list\|update\|permissions\|member\|confirm-gate` (`§12`); orvex-cli `wiki space` **permanently stubbed — wiki-api serves no spaces resource** (`evidence-orvex-cli §3`) | wiki-api (needs NEW resource) + engine | **missing (server gap, not just MCP)** — no spaces resource anywhere (`synthesis-parity C`, `(c)`) | **adopt-reshaped** | Space org is core; blocked upstream by the missing spaces resource; member/permission mutations token-gated. |
| **Duplicate detection** (dedup cluster find) | docmost-cli `verify duplicates`, `search duplicates`, `page-duplicate-check` (`§4`, `synthesis-parity A.2`) | knowledge | **missing** — `knowledge_search`/`_related` live but **no duplicates verb** (`evidence-mcp §3a`) | **adopt** | Dedup is a first-class librarian job (doc-consolidate); knowledge-served on-demand `knowledge_duplicates`. |

---

## P1 — important secondary capabilities (authoring depth, QA, AI product, memory, audit, support)

| Capability | Precedent (file-cited) | Serving service (PO-D4) | Current state @HEAD | Disposition | One-line rationale |
|---|---|---|---|---|---|
| **Typed block/embed authoring (21 non-Linear types)** | docmost-cli `page block`/`pb` 28 subtypes (`§5`); orvex-cli block authoring Todo (ENG-2556); wiki-api registry real (`synthesis-parity A.3`, ENG-1465) | wiki-api | **partial** — `wiki_save` block-patch (`string_patch`\|`block_patch`\|`batch`) already writes DfM blocks; no typed per-embed helper (`evidence-mcp §6`) | **adopt-reshaped** | Keep ONE `wiki_save` block grammar; expose the block-schema catalog via `get_capabilities`, not 21 verbs (KPI-protective). |
| **Bulk markdown import (scan / apply / verify)** | docmost-cli `migrate` (`§7`); orvex-cli `migrate` real (`evidence-orvex-cli §8`); wiki-api `POST /v1/import` | wiki-api | **missing** — no MCP import/batch verb; async-batch seam only reserved (`synthesis-goggles §3.2 Q12`; Wave-2 `TaskHandle` seam) | **adopt-reshaped** | Doc-migration is a real agent sweep; on-demand async `wiki_import` (submit→poll), off the live-turn path. |
| **Drift verification (living-wiki)** | docmost-cli `verify drift` (`§4`); wiki-api `verifyPage`/`getDrift` REAL (`synthesis-parity A.7`, ENG-1464 Done) | wiki-api | **missing** — server-real, MCP-unreachable (no `wiki_drift` verb) | **adopt** | Drift is the doc-governance value-prop; on-demand `wiki_drift`. |
| **Wiki-first spec-gate** *(NEW — C4)* | docmost-cli `spec gate check <story-id>` — exit 9 `GATE_UNSATISFIED` (`evidence-docmost-cli §6`); orvex-cli `wiki spec gate check` stub (`evidence-orvex-cli §3`); fork-server spec-gate moved to wiki-api under **D-S8** (`evidence-fork-server:174`) | wiki-api (D-S8) | **missing, server-side too** — wiki-api endpoint is 501 (ENG-2537 Todo), CLI is a stub, MCP has no verb at all (`synthesis-parity:109,270`) | **rethink → adopt-reshaped** | A real, exit-coded CLI capability with no disposition in the original list — PO-D1's default is parity even when the *current state* is "stub on both sides." Pending: does wiki-first gating belong on the agent door at all (§5(c)Q10), but the row itself must exist, not live only as an open question. |
| **Verify suite (lint / links / orphans / render / staleness / ia-conformance)** | docmost-cli `verify *` (`§4`); orvex-cli mostly stub (`evidence-orvex-cli §3`); wiki-api content-health ENG-1959 Done | wiki-api (content-health) + knowledge (link/orphan graph) | **missing** — no MCP verify verb | **adopt-reshaped** | Fold into ONE parameterized on-demand `wiki_verify(check)` — not one tool per check. |
| **Nav: backlinks / breadcrumbs / permissions / watchers / transclusion-impact / mentions / recent** *(expanded — C5)* | docmost-cli `page permissions\|mentions\|transclusion-impact` (`§1a`); orvex-cli `wiki nav` **real: tree, outline, breadcrumbs, backlinks, recent, resolve-slug, watchers, permissions, transclusion** (`evidence-orvex-cli:49`); engine FR-10/FR-13 Done | **knowledge** (link/orphan graph, consistent with the verify row) or wiki-api → engine | **partial** — tree/neighborhood/changes reachable; **backlinks/breadcrumbs/permissions/watchers/transclusion-impact/mentions not** (`evidence-mcp §3a`) | **adopt-reshaped** | Backlinks ("what links here") is a distinct inbound-reference read — `wiki_get_neighborhood` is structural parent/children/siblings only, `wiki_get_tree` is hierarchy; neither returns inbound links. Backlinks + transclusion-impact are both SAFETY reads before a destructive edit — must be reachable; fold into a `wiki_inspect`/`wiki_get_neighborhood` option. *Row expanded from the draft's transclusion-only framing — `backlinks` was a delivered, undisposed CLI verb (`evidence-orvex-cli §3`).* |
| **AI image generation** | docmost-cli `ai image generate` (`§8`); orvex-cli `ai image` real (`evidence-orvex-cli §5`) | ai | **absent — no `generate_image`/`ai_image` tool registered at HEAD** *(corrected — C1)*; not one of the 30 scaffolds nor the 21 real tools (zero hits, `evidence-mcp.md §1/§3b/§14`); ENG-2802 is a build-it ticket ("*wire* `generate_image`," `evidence-linear:229`), confirming the tool doesn't exist yet | **adopt** | Generation is core AI; ai-served, currently fully greenfield (name/schema/category undecided, not a reserved scaffold seat) — on-demand `ai_image`. |
| **AI chat** *(split from "AI chat / inline edit" — C7)* | fork `ai-chat` product (`synthesis-parity A.1`); orvex-cli `ai chat` stub (`evidence-orvex-cli §5`) | ai | **missing** — no MCP verb; CLI stub too | **rethink** | Interactive multi-turn chat isn't obviously agent-native; the original "overlaps ai_ask" argument holds here specifically. |
| **AI inline edit / generate** *(split from "AI chat / inline edit" — C7)* | fork `ai-inline`/`/ai`/Cmd+J (`evidence-fork-client §4.2` — InlineAiPrompt streams a generation with Insert/Save-to-draft/Discard); D-A12 ai owns the full generation loop (`evidence-fork-server §3.1`) | **ai** | **missing** — no MCP verb | **adopt-reshaped** | Not an overlap with `ai_ask` or `wiki_save`: `ai_ask` is cited Q&A that "never fetches a body" and returns a K5 verdict, not content (`evidence-mcp.md §3a`); inline edit *produces* prose. This is a genuine content-generation gap — evaluate an `ai_generate`/transform verb (produce content → hand to `wiki_save`), served by ai because the engine is never the AI path (PO-D4). |
| **AI cost / usage read** | docmost-cli `ai cost` (`§8`); orvex-cli `ai cost` real | **ai (usage/spend read, `ai-usage.controller.ts`) + billing (cap/entitlement)** *(corrected — C9)* | **missing** — `billing_usage`/`billing_plan` SCAFFOLD (`evidence-mcp §3b`) | **adopt** | Spend visibility. *Corrected from "billing (+ai spend)": the usage/spend dashboard is fork-homed to **ai** (`evidence-fork-server §3.1`, `synthesis-parity A.1`), not billing — billing owns entitlement caps, ai owns the usage read. The `billing_usage`/`billing_plan` scaffold names should not silently decide the owner; flag as a naming reconcile item.* |
| **Memory recall / propose** | fork `ai-memories`; re-baseline hero `memory_recall` + on-demand `memory_propose` (`ZGjLctEnGH`); highest force-matrix score (`research §B`) | **ai (ai-memories write-leg)** / knowledge (read-leg, ENG-2800) — write-leg naming + product-boundary still open *(expanded — C11 + atlas F1 corroboration)* | **missing** — hero `memory_recall` is a SCAFFOLD (`evidence-mcp §2`, ENG-2471 unstarted) | **adopt** | The KPI-worst case: an *advertised hero stub*. Make it real or demote it; do not ship an always-loaded tool that always fails. *Serving expanded: read-leg → knowledge is settled (ENG-2471/ENG-2800); the write-leg (`memory_propose`, `staged`/`direct` tenant gate, `evidence-mcp.md §3b`) has no named owner and sits inside a live 3-way "memory" naming collision — fork `ai-memories` vs studio-api Memory product (`studio_memory_get`/`_save`, `evidence-mcp.md §3c`) vs workgraph coordination (`atlas.md` B42, "MCP tool names using 'memory' must disambiguate"). Atlas also flags an unreconciled canon split (B41/atlas §3.A C2/C3): MCP's memory role is framed read-only/retrieval in the Memory Architecture Spine (AD-5b, "not a compose adapter") but the 2026-07-17 MCP re-baseline puts a write-leg (`memory_propose`) directly in the surface (R-SEAM-2) — later-and-ratified favors the write-leg existing, but it must be understood as the staged/direct proposal path, not the unowned browser-extension compose port. File this reconcile alongside ENG-2800, not silently resolved either way.* |
| **Audit query (read)** | docmost-cli `audit log\|summary` (`§3.4,§12`); orvex-cli `audit` stub | audit (R16/R25, PRD `vhC5XXCYkC`) | **missing** — `audit_query` SCAFFOLD (`evidence-mcp §3b`, R-SEAM-9a) | **adopt** | Compliance read; audit-service-owned; on-demand once its scope model lands. |
| **Support-issue relay (`wiki issue create`)** *(moved P2→P1 + disposition raised — C8)* | orvex-cli `wiki issue create` **REAL and Done** (ENG-1484, `evidence-orvex-cli §3,§13`; `evidence-linear.md:258`); wiki-api server-held-key relay (ENG-1483) | wiki-api (support) | **missing** — no MCP verb | **adopt-reshaped** | PO-D1 makes reachability a *floor* for a delivered CLI capability, not an option to weigh — the only legitimate open question is the Linear-naming (Q10: rename to `support_report`/`/v1/support/issues`), not whether the capability exists. "Drop" would itself require dropping the (currently Done) CLI verb first, which is not on the table here. |

---

## P2 — admin / org / niche surfaces (mostly rethink → console/identity, or drop)

| Capability | Precedent (file-cited) | Serving service (PO-D4) | Current state @HEAD | Disposition | One-line rationale |
|---|---|---|---|---|---|
| **Bulk page ops (batch move/archive/delete/relabel)** | wiki-api `POST /v1/pages/bulk` (`synthesis-parity A.4`, ENG-1467) | wiki-api | **missing** — no MCP verb | **adopt-reshaped** | Shares the async `wiki_import`/batch home; token-gated for the destructive legs. |
| **AI re-embed / reindex (admin)** | docmost-cli `ai reembed`; `ai-bulk-reembed` (`synthesis-parity A.2`); orvex-cli `admin reembed/reindex` stub | knowledge (admin) | **missing** — no MCP verb | **rethink** | Bulk re-embed is an OPERATOR maintenance task, not an agent capability; likely console/knowledge-admin, not the agent door. |
| **AI availability / model list** | docmost-cli `ai avail`; `ai models` (`§8`); orvex-cli `ai models` stub | ai | **missing** — `ai_models` SCAFFOLD (`evidence-mcp §3b`) | **adopt** | Capability discovery for the ai leg; cheap on-demand `ai_models`. |
| **admin user (get/invite/activate/deactivate/delete/list/search)** | docmost-cli `user *` (`§12`); orvex-cli `admin user` stub (`evidence-orvex-cli §7`) | identity + console | **missing** — no MCP verb | **rethink** | Org user-lifecycle is an identity/console admin surface; least-privilege says keep mutations out of the agent door — read-only `identity_user_get` at most. |
| **admin workspace (info/integrations/invitations/settings)** | docmost-cli `workspace *` (`§12`); orvex-cli `admin workspace` stub | identity + console | **missing** — no MCP verb | **rethink** | Settings mutation is console; a read probe overlaps `whoami`/`get_capabilities` — mostly not agent-native. |
| **admin events (settings/connections/log)** | fork `ee/events`; orvex-cli `admin events` stub (`evidence-orvex-cli §7`) | console (over knowledge) | **missing** — no MCP verb | **drop** | Event-stream admin is an operator console job, not an agent capability. |
| **AI prompts library / settings / usage-dashboard** | fork `ai-prompts`/`ai-settings`/`ai-usage`; client suites (`synthesis-parity A.1,B`) | ai + console | **missing** — no MCP verb (satellite, uncensused) | **rethink** | Provider config + prompt-library are product/console surfaces; only the *effect* (ask/generate/models) belongs on the agent door. |
| **Audit emit / dual-write** | docmost-cli audit dual-write (`§3.4`); orvex-cli `audit record` stub | audit (emit) | n/a — MCP already stderr-audits every mutation (`evidence-mcp §6`) | **drop** | The MCP is an audit *source*, not an audit-write *client*; a caller-driven emit verb invites forged rows — server emits from the write it observes. See §(c)Q6 for the distinct, still-open question of whether MCP is a *named producer* in the audit architecture at all (`atlas.md` B31) — that's an integration-wiring question, not a reason to add a caller-facing emit tool. |

---

## 4. Justified CLI-only exceptions — deliberately NOT on the MCP surface (short + argued, per PO-D1)

Unchanged from the draft; the challenge raised no findings against this section and it independently checked
out clean (see Verification Log). These stay CLI-only because the MCP is a **stateless network capability
shim** (no filesystem, no persistent store, no shell, no browser, never mints tokens) — an MCP tool exposing
them would be nonsensical or unsafe, not merely redundant. This is the whole exception list; everything else
is parity.

| CLI capability | Precedent | Why CLI-only (first-principles) |
|---|---|---|
| `config edit/get/set/show/unset` | docmost-cli `§12`; orvex-cli `§9` | Client-local config of a CLI binary; the MCP has no per-user config store (statelessness invariant, `evidence-mcp §12`). |
| `daemon run/status/stop/start/restart/install` | docmost-cli `§10`; orvex-cli `§9` | A local SSE-reconcile daemon + systemd unit; meaningless over a stateless request/response MCP. |
| `cache sync/check/clear/diff/info/mirror` | docmost-cli `§10`; orvex-cli `§9` | Client-local SQLite cache; the MCP holds no persistent store — freshness is the caller's/server's, not the shim's. |
| `wiki mirror pull/push/watch` + `link`/`unlink` | docmost-cli `§9,§12`; orvex-cli `§3` | Filesystem↔wiki sync + symlink materialization; **the MCP has no filesystem**. This is the CLI's reason-to-exist, not a parity gap. |
| `doctor` | docmost-cli `§12`; orvex-cli `§9` | Local endpoint-health diagnostic; the MCP self-describes via `whoami`+`get_capabilities`+`/healthz` — same intent, different (already-reachable) shape. |
| `completion bash/zsh/fish/powershell` | docmost-cli `§12` | Shell completion — N/A to a tool-calling protocol. |
| `auth login/logout/use/list-profiles` | docmost-cli `§11`; orvex-cli `§6` | OIDC RP browser flow + local keyring/profile store; the MCP **never mints** and receives a verbatim host-supplied bearer (FR-M11/FR-M12). Auth is an identity + host concern; `whoami` covers the only agent-relevant read. |
| `screenshot manifest/refresh/shot` | docmost-cli `§12`; orvex-cli `§3` | Headless-Chromium capture, `orvex-full` build only — a heavy local-toolchain affordance, not a stateless network verb. Revisit only if a render *service* appears (§5(c)). |
| `code graph` (tree-sitter) | docmost-cli `§12`; orvex-cli `§3` | Local source-tree analysis; not a wiki capability at all. |
| `version` | docmost-cli `§1`; orvex-cli `§9` | Build stamp; server version already in `get_capabilities`. |

**Net exception surface: 10 client-local/host-owned/heavy-toolchain groups.** All the *content* and
*governance* capabilities remain parity targets. This satisfies PO-D1's "default is parity, exceptions short
and argued."

---

## (a) Delta capabilities with NO Linear ticket (in the MCP project)

Cross-referenced against `evidence-linear.md §3` (Orvex Studio MCP: ENG-2449–2475, 2707, 2800–2802). The MCP
backlog was built around the pre-parity hero surface; **most of the parity delta is unticketed on the MCP
side:**

- **Page delete / trash / purge / move** — ENG-2454 is the `save_page/edit` chokepoint only; **no delete/move
  verb ticket.** `[no MCP ticket]`
- **Structural create (duplicate/scaffold/tree-apply)** *(now disposed, C3)* — **no MCP ticket at all**, and no
  wiki-api ticket for a duplicate/clone endpoint beyond core CRUD. `[no MCP ticket]`
- **Governance `wiki_status`/`wiki_supersede`/`wiki_ratify` verb** — ENG-2464 covers *transport* of
  `needs_human_*`/RATIFY/CONFIRM but **not an explicit lifecycle verb.** `[partial — transport only]`
- **Comment read/list/resolve/rm** — ENG-2469 (six `studio_*` tools) fronts `wiki_comment_post` (write);
  **no comment-read ticket**, and no ticket reflects the wiki-api-front target either. `[no MCP ticket]`
- **Attachments (get/list/upload/rm/search)** — scaffold under R-SEAM-8a; **no ENG.** `[no MCP ticket]`
- **Labels (list/add/rm)** — **no MCP ticket.** `[no MCP ticket]`
- **History / diff / revert / version** — **no MCP ticket.** `[no MCP ticket]`
- **Spaces (CRUD/members/permissions)** — **no MCP ticket AND no wiki-api spaces-resource ticket** (double
  gap, `synthesis-parity (c)`). `[genuinely no ticket, server + MCP]`
- **Duplicate detection (dedup) verb** — ENG-2460 routes search/related/neighborhood to knowledge but **omits
  duplicates.** `[no MCP ticket]`
- **Wiki-first spec-gate** *(now disposed, C4)* — **no MCP ticket**; wiki-api side is ENG-2537 Todo (server
  501); CLI side is a stub with no tracked ticket in the MCP project. `[no MCP ticket]`
- **Drift / verify suite** — **no MCP ticket** (server-side wiki-api ENG-2536/2537 exist; MCP has none).
  `[no MCP ticket]`
- **AI cost / usage (`billing_usage`)** and **`ai_models`** — scaffolds; **no ENG.** `[no MCP ticket]`
- **Audit query** — scaffold under R-SEAM-9a; **no ENG.** `[no MCP ticket]`
- **Bulk import / async batch** — **no MCP ticket.** `[no MCP ticket]`
- **Support-issue relay verb** — **no MCP ticket** (CLI side is ENG-1484, misaligned — see (b)).
  `[no MCP ticket]`

**HAS a ticket:** memory (`ENG-2471`), AI image *wiring* (`ENG-2802` — note: wires an absent tool, C1, not a
scaffold), memory read-leg carve-out (`ENG-2800`, canon-drift). **Structural finding, strengthened by the
merge:** parity is a *requirements floor the MCP backlog was never written to* — the redo must file the
missing verbs, not assume the ENG-24xx cluster covers them. This now explicitly includes two capability
groups (structural-create, spec-gate) that had no ticket AND no disposition row until this merge.

## (b) OBE / misaligned tickets (evidence-linear.md §6)

- **MCP ENG-2449–2475, 2707, 2801–2802 (33 Todo) — largely OBE.** Re-proposes a server that is already live
  hero-13 on `mcp.orvex.dev` (`evidence-linear §6.1`): ENG-2449 "server core", 2450 "hero surface + list_tools",
  2451 "whoami", 2453 "get_page ladder", 2454 "save/edit chokepoint", 2472 "golden-tape harness" all restate
  already-Done ENG-1404-1407/1499/1500. **But the 2026-07-17 hero-13 re-baseline (`ZGjLctEnGH`) is a genuine
  v2** — some (2450 hero-13, 2801 tools.ts tier-split) are re-scoped, not dup. **Per-ticket reality-probe
  against dev HEAD `8076395` before scheduling.**
- **ENG-2470 "Re-home marketplace_search/skill_get onto knowledge (fold)" — MISALIGNED / REVERSED.** R-SEAM-3
  (2026-07-17) ruled these stay **separate** tools, explicitly reversing the fold (`canon-mcp §2.1`,
  `evidence-mcp §3c`). Ticket now contradicts ratified canon.
- **ENG-2455 "get_changes pull-based (no SSE)" vs R21 streaming — reconcile.** R21 folds streaming into
  ask/edit verb *classes*; `get_changes` staying non-SSE is correct, but the ADR-0038 streaming-scope tension
  is **still open** (`canon-mcp §3.5,§7`; `atlas.md` S6 confirms ADR-0038's "two-tool-only" framing is
  narrower/stale relative to R21) and must be closed before the surface count is frozen.
- **ENG-1483 / ENG-1484 (Done) — MISALIGNED with drop-Linear.** Both built the Linear support-issue relay
  (`evidence-linear §6.4`); the endpoint `POST /api/integrations/linear/issues` still ships. Per the P1 support
  row's corrected disposition (C8, adopt-reshaped), this capability survives on the MCP but **must be renamed
  off Linear** — both tickets are rename/removal-owed, not "keep as-is."
- **ENG-2800 (canon-drift, valid)** — PRD `k1sWjtJq3x` FR-M19 doesn't carve out `memory_get`'s read-leg-to-
  knowledge; blocks a clean memory disposition. Pre-existing, keep. *(See the expanded memory row above — atlas
  surfaces a second, distinct unreconciled split here: MCP's memory role as read-only-retrieval (AD-5b) vs. the
  re-baseline's write-leg (R-SEAM-2) — file alongside ENG-2800, do not conflate the two.)*

## (c) Open design questions this delta surfaces

1. **Reclaim the 7 scaffold hero seats, or keep all parity verbs on-demand?** Hero-13 is full but 7 seats
   (`memory_recall`, `staging_*`, `workgraph_*`) are `NOT_AVAILABLE_YET` stubs — an advertised-but-unreachable
   set that already dents the golden-tape KPI (`synthesis-goggles §2.2 #3`). Demoting them (goggles fix-A) is
   the *only* lever that frees hero seats for live wiki verbs; parity itself needs none. **Ruling needed:** are
   wiki-domain verbs (delete/history/comments) ever hero-worthy, or permanently on-demand?
2. **One `confirm_token`-gated `wiki_lifecycle` verb, or per-op verbs** for delete/purge/supersede/status/
   revert/space-delete? Verb-count (KPI) vs. clarity. The CLI has ~8 distinct destructive verbs + per-op
   force-gates (`evidence-docmost-cli §3.3`); the MCP should not mint 8 tools.
3. **Does wiki-api get comment/label/attachment/space sub-resources?** (goggles Q8.) This is the *server* gap
   that blocks MCP parity for 4 P0 rows — the CLI already ships 404-ing clients against non-existent routes
   (`evidence-orvex-cli §3`). MCP parity here is downstream of a wiki-api decision, not an MCP-only fix.
4. **Is the support-issue relay kept (renamed off Linear) or dropped?** (Q10.) The parity floor now reads
   "kept, renamed" (C8) — this question is narrowed to *what it's renamed to*, not whether it survives, unless
   the CLI capability itself is dropped first (a separate ruling).
5. **Agent document reads: knowledge index vs engine round-trip** (PO-D4 open question, `po-decisions:99-104`).
   If `wiki_get` for agents reads from a knowledge read-replica, the serving-service column for *every read
   row* above flips from wiki-api to knowledge — and freshness/ACL-enforcement-point/lossless-fidelity
   trade-offs must be settled before the read verbs are specced.
6. **Is the MCP ever an audit-WRITE client, or only an audit SOURCE?** The audit-emit row above argues drop
   (the MCP already stderr-audits mutations) — that's about a caller-driven emit tool. A **narrower, still-open**
   question sits underneath it (`atlas.md` B31, C10): MCP is **not among the audit service's 7 named
   producers** at all — no page rules it in or out of the wiring, so today MCP-layer denials that never reach
   wiki-api's audited `/v1` have **zero audit coverage**. The redo must state explicitly whether MCP inherits
   coverage transitively via wiki-api or becomes an 8th named producer — confirm against the audit-service
   design (Daniel's incoming, R16/R25).
7. **Block authoring: schema-in-`get_capabilities` vs typed per-embed verbs.** This delta disposes it as one
   `wiki_save` grammar + a discoverable block-schema catalog; confirm no per-embed tools (21 verbs would blow
   the KPI).
8. **Async batch home** for import / bulk-page-ops / tree-apply / verify sweeps — build the Wave-2 `TaskHandle`
   submit→poll seam now, or defer until the doc-migration/consolidate workloads move onto `/v1`? (goggles Q12.)
9. **Are org-admin surfaces (user/workspace/events/reindex) in scope for the MCP at all?** PO-D1's default is
   parity, so "console/identity-only" needs an *explicit* justified-exception ruling — this delta files them
   as `rethink`, not yet a sanctioned exception. Without a ruling they are open parity gaps.
10. **Does a de-Linearized spec-gate survive as an agent verb?** Server-side is 501 (ENG-2537 Todo) and its
    post-Linear scope is unsettled (`synthesis-parity A.7`); now has a first-class row (C4) with disposition
    `rethink → adopt-reshaped` — this question is the ruling that resolves the arrow, not a reason to omit the
    row.
11. **NEW (atlas F1) — does the staging hard-cut (B43/FR-STG25) change how any write verb above should be
    designed today?** Every destructive/creative write row in P0/P1 (delete, move, structural-create,
    lifecycle/supersede/ratify, comment-post, label-mutate, attachment-upload, import) currently lands on
    `wiki_save`-adjacent verbs that are slated to redirect agent-class callers into `staging_*` once staging's
    apply path is non-stub. Unexecuted and sequenced last — but if this delta's PRD-facing verb shapes assume
    a direct wiki-api write forever, the hard-cut becomes a re-architecture instead of a swap-in. Needs an
    explicit "designed for the redirect" acknowledgment per write verb, not a silent assumption either way.

---

## Verification Log — how the 11 challenge findings were checked (not taken on faith)

Every finding below was checked against a primary evidence file with a direct grep/read, not just re-read from
the challenge doc. All 11 CONFIRMED; **zero rejected**.

| # | Claim checked | Check performed | Result |
|---|---|---|---|
| C1 | `generate_image` is absent, not scaffolded | `grep generate_image evidence-mcp.md evidence-canon-mcp.md` | **0 hits in both** — confirmed absent |
| C2 | Mint chain is engine-mints/wiki-api-transports, not "wiki-api mint" | `grep mint evidence-mcp.md`; read `synthesis-goggles`/`synthesis-parity` mint-chain lines; `atlas.md` B38 | Confirmed — "never minted by the MCP" (FR-M11); B38 independently states the same chain |
| C3 | `duplicate`/`scaffold`/`tree apply` are real, undisposed CLI verbs | `grep` docmost-cli §1a and orvex-cli — real `RunE` handlers, `synthesis-parity:217` "done" | Confirmed real and absent from every P0/P1/P2 row pre-merge |
| C4 | Spec-gate is a real capability, undisposed | `grep` docmost-cli §6, fork-server D-S8, orvex-cli stub | Confirmed — exit-9 `GATE_UNSATISFIED`, wiki-api target D-S8, no row existed |
| C5 | `backlinks`/`breadcrumbs` are real orvex-cli nav verbs missing from the nav row | `grep backlinks evidence-orvex-cli.md` | Confirmed REAL, line 49; row only listed transclusion-impact/permissions/mentions |
| C6 | Comment family should be wiki-api-front (D-S16), not studio-api family-wide | `grep D-S16\|comments evidence-fork-server.md` | Confirmed — D-S16 explicit: "programmatic (agent) access to comments routes through wiki-api, not engine-direct" |
| C7 | `ai_ask` never returns body; inline edit is a distinct generation verb | `grep ai_ask evidence-mcp.md` | Confirmed — "never fetches a body," K5 verdict shape only |
| C8 | Support-issue relay is Done/real, not "rethink → drop" | `grep` evidence-orvex-cli / evidence-linear ENG-1484 | Confirmed Done, tested, SSO-delegated |
| C9 | Usage/spend dashboard is ai-homed, not billing | `grep` "usage.*dashboard" evidence-fork-server.md | Confirmed — `orvex/ai/ai-usage.controller.ts` → ai |
| C10 | 52 = 21+30+1 (not 21+30); 31 of 52 cannot succeed | `grep marketplace_publish\|52\b evidence-mcp.md` | Confirmed — arithmetic explicit at `evidence-mcp.md §1/§14` |
| C11 | Memory write-leg owner unnamed; 2-way (now 3-way, per atlas) naming ambiguity | `grep studio_memory\|memory_propose evidence-mcp.md`; `atlas.md` §2.10/§3.A | Confirmed — `studio_memory_get/_save` on studio-api distinct from `memory_propose`; atlas adds workgraph as a third collision (B42) and a retrieval-vs-write-leg canon split (B41 vs R-SEAM-2) |

**§4 (CLI-only exceptions) and the "what held up" spot-checks in the challenge** (hero-13/KPI numbers, 7-of-13
hero scaffolds, scaffold current-states for attachments/ai_models/billing/audit_query, comment write-only
reachability, ticket citations ENG-2470/2460/2469/2455/2464/1483/1484) were re-confirmed accurate on this pass
and required no changes.

**No challenger findings were rejected on this pass.** Where the challenge offered two framings (e.g. C8's
"adopt-reshaped… or drop if the CLI capability itself is dropped"), the merge took the floor reading required
by PO-D1 (capability is Done → reachability is required) and preserved the conditional as an open question
rather than a rejection.
