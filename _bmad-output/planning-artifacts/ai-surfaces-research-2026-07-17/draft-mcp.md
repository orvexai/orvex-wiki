# TRACK 1 — The MCP ⊇ CLI Delta List (PO-D1)

**Every CLI capability not yet *reachable* through the MCP wiki surface, with how it should land.**

Synthesized 2026-07-17 for the WIKI-domain re-baseline. LEFT side (the parity floor) = the docmost-cli baseline (`evidence-docmost-cli.md`) reshaped per PO-D2/D4, plus the orvex-cli successor scope (`evidence-orvex-cli.md`, `evidence-canon-cli`). RIGHT side (reachability today) = the live MCP tool surface (`evidence-mcp.md` @ `4f81b48`), the 2026-07-17 hero-13 WDS re-baseline + on-demand addendum + governance model (`evidence-mcp-research-corpus.md`, `evidence-canon-mcp.md` `ZGjLctEnGH`). Ticket state from `evidence-linear.md` (local cache). `wiki-study/atlas.md` was checked — **does not exist**; the per-service wiki-study maps were used instead for PO-D4 serving-service bindings.

---

## 0. Reading rules — what "reachable" means, and the two ceilings this list is written against

1. **PO-D1 default is parity; reachable, not hero.** Per PO-D1 (`po-decisions/2026-07-17.md:10-37`) every capability the CLI can do must be reachable through the MCP — but "reachable" = *behind progressive disclosure* (`list_tools(category)`) or a token-gated governance verb, **not** "in the always-loaded hero set." A justified CLI-only exception list is allowed but must be short and argued (§4).

2. **A `NOT_AVAILABLE_YET` scaffold is NOT reachable.** The MCP registers 52 tool names but only **21 are REAL**; 30 are permanent scaffolds that can never succeed (`evidence-mcp.md §1, §14`), including **7 of the 13 hero seats** (`memory_recall`, `staging_propose`, `workgraph_*`). A scaffold is a *promise*, not a capability — every scaffold that stands in for a CLI capability is a delta row here, not a "covered" one.

3. **The hero-13 ceiling is hard and the golden-tape KPI is the reason.** `standalone-boot.test.ts` asserts the default `tools/list` equals the hero-13 array exactly; adding a 14th needs an ADR to retire one (`evidence-mcp.md §2`). The connect-schema budget is **5,303 tokens** inside a ~4.5–5.5k ceiling, a required CI gate (`ZGjLctEnGH`). **No delta row below claims a new hero seat.** Parity lands on-demand + token-gated so the always-paid surface never grows. (The one lever that *could* free hero seats — demoting the 7 scaffold heroes per goggles fix-A — is a design question, §5(c)Q1, not a parity requirement.)

4. **PO-D4: every row names its SERVING service.** The engine is SoR for writes+collab, never the AI path (`po-decisions:83-107`). Reads *may* be served from the knowledge index — an OPEN question (§5(c)Q5), so wiki reads are provisionally attributed to wiki-api. Serving legend: `wiki-api` (composition tier over engine primitives) · `knowledge` · `ai` · `identity` · `audit` · `billing` · `console` · `engine` (SoR, internal-only).

5. **Disposition (PO-D2, argued from first principles):** `adopt` = take the capability, reshape only to envelope/naming · `adopt-reshaped` = same capability, materially different agent-native shape (fold N verbs → 1, add a token gate) · `rethink` = challenge whether it belongs on the agent surface at all · `drop` = deliberately not on the MCP (justified exception or superseded).

6. **What is already REACHABLE (not a delta row):** page read (`wiki_get` ladder), page create/update/upsert/edit/patch/replace (`wiki_save` upsert+block-patch), keyword/semantic/hybrid search (`knowledge_search`), related (`knowledge_related`), cited ask (`ai_ask`), identity/space probe (`whoami`), tree/neighborhood/changes nav (`wiki_get_tree`/`_neighborhood`/`_changes`), self-onboarding (`get_capabilities`/`list_tools`), locator resolve-slug (server-side dialect auto-resolve, no verb needed). Everything else in the CLI inventory is below.

---

## P0 — table-stakes wiki operations an agent must be able to reach

| Capability | Precedent (file-cited) | Serving service (PO-D4) | Current state @HEAD | Disposition | One-line rationale |
|---|---|---|---|---|---|
| **Page delete / trash / purge / restore-from-trash** | docmost-cli `page delete\|trash\|purge\|restore` (`evidence-docmost-cli §1a`); orvex-cli `wiki page delete/trash/purge` real but 404-risk (`evidence-orvex-cli §3`) | wiki-api → engine | **missing** — `wiki_save` is upsert+block-patch only; no delete/trash verb (`evidence-mcp §3a,§6`) | **adopt-reshaped** | Destructive lifecycle is core; one `confirm_token`-gated `wiki_delete` on-demand, never hero. |
| **Page move / reparent** | docmost-cli `page move` (`§1a`); wiki-api `POST /v1/pages/bulk` (`synthesis-parity A.4`, ENG-1467 In Progress) | wiki-api → engine | **missing** — no MCP structural-move verb | **adopt-reshaped** | Reparenting is a structural write agents need; on-demand `wiki_move` (or a `wiki_save` structural op). |
| **Lifecycle status transition (draft/canonical/deprecated/superseded/archived) + supersede** | docmost-cli `page supersede`, `--status` transitions (`§3.3`); orvex-cli `wiki governance supersede/status` real (`evidence-orvex-cli §3`); engine mutations ENG-1434 Done | wiki-api (engine mints tokens) | **partial** — publish-path gate returns `NEEDS_HUMAN_PUBLISH` *inside* `wiki_save` but there is **no explicit `wiki_status`/`wiki_supersede` verb** (`evidence-mcp §6`) | **adopt-reshaped** | PO-D1's headline case: token-gated governance verb, `needs_human_publish` absent a human token, byte-verbatim relay when present (P6/FR-M13). |
| **Ratify draft → canonical** | docmost-cli `page ratify` + `--force-self-ratify` (`§3.3`); ratify-token guard (memory) | wiki-api mint / engine (D-A8) | **partial** — verbatim `ratify_token` relay in the `wiki_save` publish gate; no standalone `wiki_ratify` verb (`evidence-mcp §6`; `canon-mcp §5.5`) | **adopt-reshaped** | Same server human-token gate as the CLI; AI never self-promotes — a transport verb, not an authority grant. |
| **Comment read / list / resolve / unresolve / rm** (full CRUD+resolve) | docmost-cli `comment add\|edit\|get\|list\|resolve\|rm` (`§12`); orvex-cli `wiki comment` (404-risk, `§3`) | engine primitive + studio-api `/v1/social` | **partial** — only `wiki_comment_post` (write-only, studio-api-conditional) is reachable; **no read/list/resolve/rm** (`evidence-mcp §3c`) | **adopt** | Collaboration is table-stakes; complete the `wiki_comment_*` family on-demand — today an agent can post but not read a thread. |
| **Attachments get / list / upload / rm / search** | docmost-cli `attachment get\|list\|orphans\|rm\|search\|upload` (`§12`); orvex-cli `wiki attach` (404-risk, `§3`) | wiki-api (binary) + knowledge (full-text attach-search) | **missing** — `wiki_attachment_get`/`_save` are **SCAFFOLD `NOT_AVAILABLE_YET`** (`evidence-mcp §3b`; R-SEAM-8a) | **adopt-reshaped** | Attachments are core content; on-demand once wiki-api serves the sub-resource (§5(c)Q3); attach-search → knowledge. |
| **Labels list / pages / add / rm** | docmost-cli `label`, `page label add\|list\|rm` (`§12`); orvex-cli `wiki label` (404-risk) | engine + wiki-api front | **missing** — no MCP label verb (`evidence-mcp §3`) | **adopt** | Labels drive taxonomy + retrieval; cheap on-demand `wiki_label_*`. |
| **History list / diff / version / revert / restore-content** | docmost-cli `page history\|diff\|version\|revert\|restore-content` (`§1a`); orvex-cli `wiki history` real (`§3`); engine ENG-1369 Done | wiki-api → engine | **missing** — no MCP history/diff/revert verb | **adopt** | Version navigation on-demand reads (`wiki_history`/`wiki_diff`) + a `confirm_token`-gated `wiki_revert` (destructive). |
| **Space CRUD + members + permissions + confirm-gate** | docmost-cli `space create\|delete\|get\|list\|update\|permissions\|member\|confirm-gate` (`§12`); orvex-cli `wiki space` **permanently stubbed — wiki-api serves no spaces resource** (`evidence-orvex-cli §3`) | wiki-api (needs NEW resource) + engine | **missing (server gap, not just MCP)** — no spaces resource anywhere (`synthesis-parity C`, `(c)`) | **adopt-reshaped** | Space org is core; blocked upstream by the missing spaces resource; member/permission mutations token-gated. |
| **Duplicate detection** (dedup cluster find) | docmost-cli `verify duplicates`, `search duplicates`, `page-duplicate-check` (`§4`, `synthesis-parity A.2`) | knowledge | **missing** — `knowledge_search`/`_related` live but **no duplicates verb** (`evidence-mcp §3a`) | **adopt** | Dedup is a first-class librarian job (doc-consolidate); knowledge-served on-demand `knowledge_duplicates`. |

---

## P1 — important secondary capabilities (authoring depth, QA, AI product, memory, audit)

| Capability | Precedent (file-cited) | Serving service (PO-D4) | Current state @HEAD | Disposition | One-line rationale |
|---|---|---|---|---|---|
| **Typed block/embed authoring (21 non-Linear types)** | docmost-cli `page block`/`pb` 28 subtypes (`§5`); orvex-cli block authoring Todo (ENG-2556); wiki-api registry real (`synthesis-parity A.3`, ENG-1465) | wiki-api | **partial** — `wiki_save` block-patch (`string_patch`\|`block_patch`\|`batch`) already writes DfM blocks; no typed per-embed helper (`evidence-mcp §6`) | **adopt-reshaped** | Keep ONE `wiki_save` block grammar; expose the block-schema catalog via `get_capabilities`, not 21 verbs (KPI-protective). |
| **Bulk markdown import (scan / apply / verify)** | docmost-cli `migrate` (`§7`); orvex-cli `migrate` real (`evidence-orvex-cli §8`); wiki-api `POST /v1/import` | wiki-api | **missing** — no MCP import/batch verb; async-batch seam only reserved (`synthesis-goggles §3.2 Q12`; Wave-2 `TaskHandle` seam) | **adopt-reshaped** | Doc-migration is a real agent sweep; on-demand async `wiki_import` (submit→poll), off the live-turn path. |
| **Drift verification (living-wiki)** | docmost-cli `verify drift` (`§4`); wiki-api `verifyPage`/`getDrift` REAL (`synthesis-parity A.7`, ENG-1464 Done) | wiki-api | **missing** — server-real, MCP-unreachable (no `wiki_drift` verb) | **adopt** | Drift is the doc-governance value-prop; on-demand `wiki_drift`. |
| **Verify suite (lint / links / orphans / render / staleness / ia-conformance)** | docmost-cli `verify *` (`§4`); orvex-cli mostly stub (`evidence-orvex-cli §3`); wiki-api content-health ENG-1959 Done | wiki-api (content-health) + knowledge (link/orphan graph) | **missing** — no MCP verify verb | **adopt-reshaped** | Fold into ONE parameterized on-demand `wiki_verify(check)` — not one tool per check. |
| **AI image generation** | docmost-cli `ai image generate` (`§8`); orvex-cli `ai image` real (`evidence-orvex-cli §5`) | ai | **missing** — `generate_image` scaffold `NOT_AVAILABLE_YET` (`synthesis-parity A.1`, ENG-2802) | **adopt** | Generation is core AI; ai-served; just unwired — on-demand `ai_image`. |
| **AI cost / usage read** | docmost-cli `ai cost` (`§8`); orvex-cli `ai cost` real | billing (+ai spend) | **missing** — `billing_usage`/`billing_plan` SCAFFOLD (`evidence-mcp §3b`) | **adopt** | Spend visibility; billing-served on-demand `billing_usage`. |
| **Memory recall / propose** | fork `ai-memories`; re-baseline hero `memory_recall` + on-demand `memory_propose` (`ZGjLctEnGH`); highest force-matrix score (`research §B`) | ai / memory (read-leg → knowledge, ENG-2800) | **missing** — hero `memory_recall` is a SCAFFOLD (`evidence-mcp §2`, ENG-2471 unstarted) | **adopt** | The KPI-worst case: an *advertised hero stub*. Make it real or demote it; do not ship an always-loaded tool that always fails. |
| **Audit query (read)** | docmost-cli `audit log\|summary` (`§3.4,§12`); orvex-cli `audit` stub | audit (R16/R25, PRD `vhC5XXCYkC`) | **missing** — `audit_query` SCAFFOLD (`evidence-mcp §3b`, R-SEAM-9a) | **adopt** | Compliance read; audit-service-owned; on-demand once its scope model lands. |
| **Nav: permissions / watchers / transclusion-impact / mentions / recent** | docmost-cli `page permissions\|mentions\|transclusion-impact` (`§1a`); orvex-cli `wiki nav` real (`§3`); engine FR-10/FR-13 Done | wiki-api → engine | **partial** — tree/neighborhood/changes reachable; permissions/watchers/**transclusion-impact**/mentions not (`evidence-mcp §3a`) | **adopt-reshaped** | Transclusion-impact is a SAFETY read before a destructive edit — must be reachable; fold into `wiki_get_neighborhood` options or a `wiki_inspect` verb. |
| **AI chat / inline edit** | fork `ai-chat`/`ai-inline` product (`synthesis-parity A.1`); orvex-cli `ai chat/inline` stub (`evidence-orvex-cli §5`) | ai | **missing** — no MCP verb; CLI stub too | **rethink** | Interactive chat isn't obviously agent-native; inline overlaps `ai_ask`+`wiki_save` — evaluate before adding surface. |
| **AI re-embed / reindex (admin)** | docmost-cli `ai reembed`; `ai-bulk-reembed` (`synthesis-parity A.2`); orvex-cli `admin reembed/reindex` stub | knowledge (admin) | **missing** — no MCP verb | **rethink** | Bulk re-embed is an OPERATOR maintenance task, not an agent capability; likely console/knowledge-admin, not the agent door. |
| **Audit emit / dual-write** | docmost-cli audit dual-write (`§3.4`); orvex-cli `audit record` stub | audit (emit) | n/a — MCP already stderr-audits every mutation (`evidence-mcp §6`) | **drop** | The MCP is an audit *source*, not an audit-write *client*; a caller-driven emit verb invites forged rows — server emits from the write it observes. |

---

## P2 — admin / org / niche surfaces (mostly rethink → console/identity, or drop)

| Capability | Precedent (file-cited) | Serving service (PO-D4) | Current state @HEAD | Disposition | One-line rationale |
|---|---|---|---|---|---|
| **Bulk page ops (batch move/archive/delete/relabel)** | wiki-api `POST /v1/pages/bulk` (`synthesis-parity A.4`, ENG-1467) | wiki-api | **missing** — no MCP verb | **adopt-reshaped** | Shares the async `wiki_import`/batch home; token-gated for the destructive legs. |
| **Support-issue relay (`wiki issue create`)** | orvex-cli `wiki issue create` real (`evidence-orvex-cli §3`, ENG-1484); wiki-api server-held-key relay (ENG-1483) | wiki-api (support) | **missing** — no MCP verb | **rethink** | Useful agent affordance (file a bug with build/context) but must shed Linear naming (Q10); rename to `support_report` or drop. |
| **AI availability / model list** | docmost-cli `ai avail`; `ai models` (`§8`); orvex-cli `ai models` stub | ai | **missing** — `ai_models` SCAFFOLD (`evidence-mcp §3b`) | **adopt** | Capability discovery for the ai leg; cheap on-demand `ai_models`. |
| **admin user (get/invite/activate/deactivate/delete/list/search)** | docmost-cli `user *` (`§12`); orvex-cli `admin user` stub (`evidence-orvex-cli §7`) | identity + console | **missing** — no MCP verb | **rethink** | Org user-lifecycle is an identity/console admin surface; least-privilege says keep mutations out of the agent door — read-only `identity_user_get` at most. |
| **admin workspace (info/integrations/invitations/settings)** | docmost-cli `workspace *` (`§12`); orvex-cli `admin workspace` stub | identity + console | **missing** — no MCP verb | **rethink** | Settings mutation is console; a read probe overlaps `whoami`/`get_capabilities` — mostly not agent-native. |
| **admin events (settings/connections/log)** | fork `ee/events`; orvex-cli `admin events` stub (`evidence-orvex-cli §7`) | console (over knowledge) | **missing** — no MCP verb | **drop** | Event-stream admin is an operator console job, not an agent capability. |
| **AI prompts library / settings / usage-dashboard** | fork `ai-prompts`/`ai-settings`/`ai-usage`; client suites (`synthesis-parity A.1,B`) | ai + console | **missing** — no MCP verb (satellite, uncensused) | **rethink** | Provider config + prompt-library are product/console surfaces; only the *effect* (ask/generate/models) belongs on the agent door. |

---

## 4. Justified CLI-only exceptions — deliberately NOT on the MCP surface (short + argued, per PO-D1)

These stay CLI-only because the MCP is a **stateless network capability shim** (no filesystem, no persistent store, no shell, no browser, never mints tokens) — an MCP tool exposing them would be nonsensical or unsafe, not merely redundant. This is the whole exception list; everything else is parity.

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

**Net exception surface: 10 client-local/host-owned/heavy-toolchain groups.** All the *content* and *governance* capabilities remain parity targets. This satisfies PO-D1's "default is parity, exceptions short and argued."

---

## (a) Delta capabilities with NO Linear ticket (in the MCP project)

Cross-referenced against `evidence-linear.md §3` (Orvex Studio MCP: ENG-2449–2475, 2707, 2800–2802). The MCP backlog was built around the pre-parity hero surface; **most of the parity delta is unticketed on the MCP side:**

- **Page delete / trash / purge / move / duplicate** — ENG-2454 is the `save_page/edit` chokepoint only; **no delete/move/duplicate verb ticket.** `[no MCP ticket]`
- **Governance `wiki_status`/`wiki_supersede`/`wiki_ratify` verb** — ENG-2464 covers *transport* of `needs_human_*`/RATIFY/CONFIRM but **not an explicit lifecycle verb.** `[partial — transport only]`
- **Comment read/list/resolve/rm** — ENG-2469 (six `studio_*` tools) fronts `wiki_comment_post` (write); **no comment-read ticket.** `[no MCP ticket]`
- **Attachments (get/list/upload/rm/search)** — scaffold under R-SEAM-8a; **no ENG.** `[no MCP ticket]`
- **Labels (list/add/rm)** — **no MCP ticket.** `[no MCP ticket]`
- **History / diff / revert / version** — **no MCP ticket.** `[no MCP ticket]`
- **Spaces (CRUD/members/permissions)** — **no MCP ticket AND no wiki-api spaces-resource ticket** (double gap, `synthesis-parity (c)`). `[genuinely no ticket, server + MCP]`
- **Duplicate detection verb** — ENG-2460 routes search/related/neighborhood to knowledge but **omits duplicates.** `[no MCP ticket]`
- **Drift / verify suite / spec-gate** — **no MCP ticket** (server-side wiki-api ENG-2536/2537 exist; MCP has none). `[no MCP ticket]`
- **AI cost / usage (`billing_usage`)** and **`ai_models`** — scaffolds; **no ENG.** `[no MCP ticket]`
- **Audit query** — scaffold under R-SEAM-9a; **no ENG.** `[no MCP ticket]`
- **Bulk import / async batch** — **no MCP ticket.** `[no MCP ticket]`
- **Support-issue relay verb** — **no MCP ticket** (CLI side is ENG-1484, misaligned — see (b)). `[no MCP ticket]`

**HAS a ticket:** memory (`ENG-2471`), AI image (`ENG-2802`), memory read-leg carve-out (`ENG-2800`, canon-drift). **Structural finding:** parity is a *requirements floor the MCP backlog was never written to* — the redo must file the missing verbs, not assume the ENG-24xx cluster covers them.

## (b) OBE / misaligned tickets (evidence-linear.md §6)

- **MCP ENG-2449–2475, 2707, 2801–2802 (33 Todo) — largely OBE.** Re-proposes a server that is already live hero-13 on `mcp.orvex.dev` (`evidence-linear §6.1`): ENG-2449 "server core", 2450 "hero surface + list_tools", 2451 "whoami", 2453 "get_page ladder", 2454 "save/edit chokepoint", 2472 "golden-tape harness" all restate already-Done ENG-1404-1407/1499/1500. **But the 2026-07-17 hero-13 re-baseline (`ZGjLctEnGH`) is a genuine v2** — some (2450 hero-13, 2801 tools.ts tier-split) are re-scoped, not dup. **Per-ticket reality-probe against dev HEAD `8076395` before scheduling.**
- **ENG-2470 "Re-home marketplace_search/skill_get onto knowledge (fold)" — MISALIGNED / REVERSED.** R-SEAM-3 (2026-07-17) ruled these stay **separate** tools, explicitly reversing the fold (`canon-mcp §2.1`, `evidence-mcp §3c`). Ticket now contradicts ratified canon.
- **ENG-2455 "get_changes pull-based (no SSE)" vs R21 streaming — reconcile.** R21 folds streaming into ask/edit verb *classes*; `get_changes` staying non-SSE is correct, but the ADR-0038 streaming-scope tension is **still open** (`canon-mcp §3.5,§7`) and must be closed before the surface count is frozen.
- **ENG-1483 / ENG-1484 (Done) — MISALIGNED with drop-Linear.** Both built the Linear support-issue relay (`evidence-linear §6.4`); the endpoint `POST /api/integrations/linear/issues` still ships. If the support-issue capability survives on the MCP (P2 row) it must be renamed off Linear; otherwise both are removal-owed.
- **ENG-2800 (canon-drift, valid)** — PRD `k1sWjtJq3x` FR-M19 doesn't carve out `memory_get`'s read-leg-to-knowledge; blocks a clean memory disposition. Pre-existing, keep.

## (c) Open design questions this delta surfaces

1. **Reclaim the 7 scaffold hero seats, or keep all parity verbs on-demand?** Hero-13 is full but 7 seats (`memory_recall`, `staging_*`, `workgraph_*`) are `NOT_AVAILABLE_YET` stubs — an advertised-but-unreachable set that already dents the golden-tape KPI (`synthesis-goggles §2.2 #3`). Demoting them (goggles fix-A) is the *only* lever that frees hero seats for live wiki verbs; parity itself needs none. **Ruling needed:** are wiki-domain verbs (delete/history/comments) ever hero-worthy, or permanently on-demand?
2. **One `confirm_token`-gated `wiki_lifecycle` verb, or per-op verbs** for delete/purge/supersede/status/revert/space-delete? Verb-count (KPI) vs. clarity. The CLI has ~8 distinct destructive verbs + per-op force-gates (`evidence-docmost-cli §3.3`); the MCP should not mint 8 tools.
3. **Does wiki-api get comment/label/attachment/space sub-resources?** (goggles Q8.) This is the *server* gap that blocks MCP parity for 4 P0 rows — the CLI already ships 404-ing clients against non-existent routes (`evidence-orvex-cli §3`). MCP parity here is downstream of a wiki-api decision, not an MCP-only fix.
4. **Is the support-issue relay kept (renamed off Linear) or dropped?** (Q10.) Determines whether the P2 `support_report` row is a real MCP verb or a removal.
5. **Agent document reads: knowledge index vs engine round-trip** (PO-D4 open question, `po-decisions:99-104`). If `wiki_get` for agents reads from a knowledge read-replica, the serving-service column for *every read row* above flips from wiki-api to knowledge — and freshness/ACL-enforcement-point/lossless-fidelity trade-offs must be settled before the read verbs are specced.
6. **Is the MCP ever an audit-WRITE client, or only an audit SOURCE?** This delta argues drop (the MCP already stderr-audits mutations); confirm against the audit-service design (Daniel's incoming, R16/R25).
7. **Block authoring: schema-in-`get_capabilities` vs typed per-embed verbs.** This delta disposes it as one `wiki_save` grammar + a discoverable block-schema catalog; confirm no per-embed tools (21 verbs would blow the KPI).
8. **Async batch home** for import / bulk-page-ops / verify sweeps — build the Wave-2 `TaskHandle` submit→poll seam now, or defer until the doc-migration/consolidate workloads move onto `/v1`? (goggles Q12.)
9. **Are org-admin surfaces (user/workspace/events/reindex) in scope for the MCP at all?** PO-D1's default is parity, so "console/identity-only" needs an *explicit* justified-exception ruling — this delta files them as `rethink`, not yet a sanctioned exception. Without a ruling they are open parity gaps.
10. **Does a de-Linearized spec-gate survive as an agent verb?** Server-side is 501 (ENG-2537 Todo) and its post-Linear scope is unsettled (`synthesis-parity A.7`); may be a wiki-first governance verb or may not belong on the agent door.
