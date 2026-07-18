# TRACK 1 — CLI PARITY-GAP LIST (orvex-cli) — FINAL (merge pass)

**Provenance.** Merge of `draft-cli.md` (2026-07-17) + adversarial `challenge-cli.md` (14 findings)
against `evidence-orvex-cli.md` (HEAD `48329b7`), `evidence-docmost-cli.md` (baseline),
`evidence-fork-server.md`, `evidence-fork-client.md`, `synthesis-parity.md`, `synthesis-goggles.md`,
`evidence-mcp-research-corpus.md`, and `wiki-study/atlas.md`, under the four binding PO directives
(`po-decisions/2026-07-17.md`). Every cited challenge finding was re-verified against the underlying
evidence file (grep/read), not taken on faith.

Every row: **capability | precedent (file-cited) | serving service (PO-D4) | state@HEAD | disposition | rationale.**

---

## Executive summary

- **51 scored rows** (37 in `draft-cli.md` + 4 P0/P1 sub-splits + 8 net-new rows surfaced by the
  challenge + 2 rows recount-corrected in place). Dispositions: **adopt 11 · adopt-reshaped 26 ·
  rethink 10 · drop 4**. Zero rows dropped without a named successor home.
- **All 14 challenge findings (C1–C14) were verified against evidence and ACCEPTED.** None rejected —
  see §(d). This is itself a finding: the draft's recurring failure mode was applying "client-completeness
  ≠ live-correctness" skepticism *selectively* (comment/label/attach flagged broken; governance,
  `wiki migrate` archive facade, and `page`/`nav` rated real/done on the same unverified-route evidence).
- **Correction to the challenge doc itself:** `wiki-study/atlas.md` **does exist** (61,590 bytes, written
  after the challenge doc) — `challenge-cli.md`'s "no atlas was produced" note is stale. This final pass
  reads it; its CLI-relevant bindings (B21, B23, B34, B36, B38, B43, S9) corroborate rather than
  contradict every affected row — no row content changed as a result, but B43 (agent wiki-writes hard-cut
  to staging, unexecuted) is added as new open question (c)#11.
- **Headline gap #1 — selective rigor.** The human-gated `ratify` verb (P6/P8's whole point) does not
  exist at HEAD; only a read-only `/v1/settings/ratify-gate` route does. The draft called governance
  "real" anyway (C2).
- **Headline gap #2 — three server routes block real CLI features.** `/v1/comments`, `/v1/labels`,
  `/v1/attachments` have no wiki-api backend; the CLI ships full Go clients against them that 404 live.
  No ticket adds the server side.
- **Headline gap #3 — the family composition is under-scored, not over-scored.** Entitlement/quota read,
  knowledge reindex/reembed, and `ai memory` were declared as service-owned by the CLI's own code/docs but
  never scored as rows (C3, C4, C12) — PO-D4 discipline was inconsistently applied.
- **Headline gap #4 — audit read/query has no settled home.** The draft quietly resolved it to "moves off
  the CLI"; the target service is Daniel's own incoming design, not yet built (C8) — this is an open
  dependency, not a shipped disposition.
- **P0 floor is unchanged in shape** (generated client, output contract, exit codes, verified-write
  chokepoint, governance transport, spec-gate, page/nav, auth, schema) but two P0 rows are now
  correctly downgraded from "done"/"real" to "partial/unverified" (governance, page/nav mentions).
- **The daemon/cache "rethink" and code-graph "rethink" (new, C10) are the two sharpest PO-D2 calls** —
  both ship real docmost-cli precedent that may not belong in a multi-service, server-cached, non-code-tool
  world.

---

## 0. How this list is written (unchanged from draft — still governs)

- **PO-D2 (challenge everything).** No capability is adopted because "the fork had it" — each gets
  **adopt / adopt-reshaped / rethink / drop** argued from AI-first CLI principles
  (`synthesis-goggles.md §3.3`).
- **PO-D4 (compose the family).** Every row names a serving service. The AGPL engine is SoR for
  writes+collab and is never contacted directly by the CLI; wiki verbs → wiki-api /v1; search/related/
  duplicates/reembed → knowledge; ask/chat/inline/image/cost/memory → ai; login/whoami/user → identity;
  audit dual-write → audit (via wiki-api forward); entitlement/quota reads → billing→knowledge projection.
  A capability parked on the wrong service is a gap, not coverage.
- **PO-D1 (MCP ⊇ CLI).** Every CLI capability carries an implicit MCP-reachability obligation
  (token-gated, disclosure-gated). Rows with no MCP counterpart are flagged `[MCP-Δ]`.
- **PO-D3.** The wiki domain is greenfield; the 2026-07-17 general-MCP re-baseline donates envelope/
  error/disclosure/KPI conventions only.

**Coverage legend:** `done` = real handler wired + route-matched @HEAD · `partial` = some real, named
gaps/stubs · `missing` = typed `NOT_IMPLEMENTED`, zero network · `broken` = compiles+unit-tested but
calls a route the server does not serve (404/405 live) · `dropped` = deliberately removed.

**Baseline @HEAD** = `orvex-cli @ 48329b7` (`evidence-orvex-cli.md`), 17,913 Go LOC, real for ~half the
surface. **CI-RED per canon as of 2026-07-15 — unverified past 07-15; reality-probe live before treating
as current** *(hedge added per C7/atlas S9 — do not phrase as an established present-tense blocker)*.

---

## P0 — the trustworthy-CLI floor: correctness, the generated spine, verified writes, governance

| Capability | Precedent (file-cited) | Serving service (PO-D4) | State@HEAD | Disposition | Rationale |
|---|---|---|---|---|---|
| **Shared generated client from the contract tag** | `docmost-cli` triplicated HTTP layer / ~90 callsites (`PACF13d3I3` D10); CLI canon MR-CLI2 (`9AdZkNTlyj §gen/`, `pf10XC2Qjz`); atlas B34 confirms ADR-0035 is TS-only, Go bridge UNDECIDED | contracts (SoT) → cli `internal/client` | **missing** — `gen/` is a `doc.go` placeholder; `internal/client` is hand-authored shells | **adopt-reshaped** | Root cause of the whole 404 class + spine drift. Build a real Go generator off contracts `v0.1.4`, wire `served-openapi-diff` CI gate. |
| **Machine-output contract** (`--output` auto-json-when-piped, `--fields`/`--id-only`/`--compact`, stdout=data/stderr=progress) | `docmost-cli §2.1`, `output_contract_test.go` | cli | **done** — frozen, golden-tested | **adopt** | Best-in-class already; keep verbatim. |
| **Frozen 0–9 exit codes + `error_code` vocabulary + `next` recovery command** | `docmost-cli §2.2/2.3` (55 codes); CLI canon 19-code frozen set | contracts (vocabulary) → cli | **done** — 19 codes, `TestCliContractNoDrift` passing | **adopt** | `next`-carrying envelope is the convergence target for MCP+API — do not strip. |
| **`comment` add/edit/get/list/resolve/rm** | `docmost-cli §12`; ENG-2557 | **wiki-api /v1 → engine SoR** | **broken** — targets `/v1/comments`, route absent from wiki-api's mux (`evidence-orvex-cli §3/§13`) | **adopt-reshaped** | Model as sub-resource `/v1/wiki/{loc}/comments` or make it an honest stub — never a silent 404. `[MCP-Δ]`. |
| **`attachment` get/list/orphans/rm/search/upload/upload-url** | `docmost-cli §12`; ENG-2557 | **wiki-api /v1 → engine SoR** (search-leg → knowledge) | **broken** — targets `/v1/attachments`, route absent | **adopt-reshaped** | Same 404 class; binary I/O + search are real agent needs. `[MCP-Δ]` partial (`wiki_attachment_get/_save` exist). |
| **`label` list/pages + `page label` add/list/rm** | `docmost-cli §12`; ENG-2557 | **wiki-api /v1 → engine SoR** | **broken** — targets `/v1/labels`, route absent; engine `labels` module done (ENG-1385) | **adopt-reshaped** | Only the /v1 front + client shape are missing. No MCP seat today → `[MCP-Δ]`. |
| **Verified-write chokepoint: CAS `ifVersion`→409 + write receipt + `Idempotency-Key`** | `docmost-cli §3.1`; cell-contract R11; atlas B23 confirms R11 NOT MET on the CLI client | wiki-api (chokepoint) → engine | **partial** — CAS real, exit-5 `VERSION_MISMATCH` frozen; **Idempotency-Key is a scaffold stub** | **adopt-reshaped** | CAS = concurrent-writer safety; Idempotency-Key = retry safety (agents retry casually) — both required. |
| **Duplicate-guard on create** (`--force-new-acknowledged` + `--reason`, exit 8) | `docmost-cli §3.2` | knowledge (dup signal) + cli (gate) | **done** — exit-8 `DUPLICATE_CANDIDATE` frozen | **adopt** | Living-wiki anti-mess primitive; dup detection itself must serve from knowledge, not a client heuristic. |
| **Human-gated governance transport** (`supersede/status/verify/label` + `needs_human_*` token transport) *(state revised — was "real"; see C2)* | `docmost-cli §3.3` ratify/confirm gates; `docmost-cli §3.3` `page ratify` (`cmd/page/ratify.go`, RATIFY_TOKEN/CONFIRM_TOKEN model); atlas B38 (RATIFY/CONFIRM tokens server-minted, transport-only) | engine (mint) → wiki-api (transport) → cli | **partial/unverified — same 404-risk class as comment/label/attach.** `SupersedePage/GetGovernanceStatus/SetGovernanceStatus/VerifyGovernance/AttachGovernanceLabel` route-match "not confirmed present in wiki-api's route table" (`evidence-orvex-cli §3 finding, §13`). **The human-gated promotion verb itself (`page ratify`) does not exist at HEAD** — grep confirms zero `ratify` verb; only the read-only `GET /v1/settings/ratify-gate` route exists. `wiki spec gate check` is a stub. | **adopt-reshaped** | P6 "AI never self-promotes" is preserved server-side (PO-D1), but the CLI cannot yet transport a ratify decision at all — build the missing verb + verify the governance routes live before calling this "real." Overstating it is exactly the trap §2.2 warns against. |
| **Wiki-first spec-gate check** | `docmost-cli §6`, exit-9 `GATE_UNSATISFIED`; de-Linearized (ENG-1463) | wiki-api | **missing** — cli stub; server `specgate.Gate.Check` = `ErrNotImplemented` | **adopt-reshaped** | The doc-governance value prop; currently unenforceable end-to-end. |
| **`page` CRUD (15 verbs) + nav** (`tree/outline/breadcrumbs/backlinks/recent/resolve-slug/watchers/permissions/transclusion`) *(nav list corrected — see C1)* | `docmost-cli §1a`; ENG-1495 | wiki-api /v1 → engine | **done** — real; `get`→DfM via in-process `pkg/dfm`; write rejects lossy `--format` locally. *(Correction: the draft's nav enumeration wrongly credited a `mentions` verb — 0 hits in evidence — and omitted the three real verbs `outline`/`recent`/`watchers`, now restored above.)* | **adopt** | Core surface, route-matched to `/v1/wiki`. Keep; it is the CLI's most-real path. Four separate docmost-cli page verbs have no HEAD counterpart and are scored individually below (`page ratify`, `restore-content`, `page watch`, `tree apply`) rather than folded silently into this "done" row. |
| **Auth + profiles** (login/logout/whoami/status/use/list-profiles; OIDC RP + headless `--token`) | `docmost-cli §11`; ENG-1516/1956; atlas B21 (CLI auth is identity-owned) | **identity** | **done** — real OIDC RP, keyring/file store, zero-trust bearer forward | **adopt** | Correctly composed onto identity. Headless `--token` is the agent login path. |
| **`schema` runtime introspection + first-party Skill file** | *absent in docmost-cli*; `synthesis-goggles §3.3` | cli | **missing** — only `instructions`/`ErrorCodeRegistry()` self-discovery exists | **adopt** (net-new) | The two most agent-specific CLI affordances the research demands. `[MCP-Δ]` = `get_capabilities`. |
| **`wiki whoami`** (tenant self-discovery: `workspace_id`/`workspace_name`/`default_space_id`) *(new row — C13)* | `evidence-orvex-cli.md §3` fix11, 2026-07-13 | **wiki-api** | **done** — real, distinct from `auth whoami`→identity; deliberately not auto-injected into `page create --space-id` (no-fallbacks) | **adopt** | Fixes a genuine prior blind spot — a fresh tenant previously had no way to learn its auto-provisioned space id short of a privileged DB SELECT. Keep; verify whether the MCP `whoami` hero verb already covers this or is identity-only (unresolved — flag for the MCP-delta pass). |

---

## P1 — feature depth + the AI-first reshapes (the PO-D2 judgment calls)

| Capability | Precedent (file-cited) | Serving service (PO-D4) | State@HEAD | Disposition | Rationale |
|---|---|---|---|---|---|
| **Block authoring** (23 retained non-Linear embeds + `diagram` + `image_from_prompt`) *(counts corrected — see C11)* | `docmost-cli §5`; ENG-2556 | wiki-api (grammar) + ai (bake/image) | **partial** — `wiki diagram` real; general block authoring Todo | **adopt-reshaped** | *(Correction: the actual embed enumeration is 30 named types, **7** of them `linear_*` (`linear_entity/cycle/roadmap/mention/graph/issue/view`), not "28/6" as the draft stated — verified by direct count against `evidence-docmost-cli.md §5`.)* Drop all 7 `linear_*` embeds + `orvex_dashboard` (D-S24, rebuilt generic, not a Linear type); `rm` is a remove-operation, not an embed type. `image_from_prompt` routes to ai. Keep block-patch under the CAS chokepoint. |
| **`search` related / duplicates / attachment-search** | `docmost-cli §12`; ENG-2567 | **knowledge** (fronted by wiki-api /v1/search) | **partial** — keyword/semantic/hybrid real (ACL'd via `/v1/search`); related/duplicates/attachment-search stub, hit knowledge directly (no public host) | **adopt-reshaped** | search→knowledge is settled (D-M8). The 3 stub leaves inherit the unrouted-host gap — front them through wiki-api or give knowledge a reachable path. |
| **`ai` chat / inline / models** | `docmost-cli §8`; ENG-2568 | **ai** | **partial** — ask/cost/image real; chat/inline/models stub | **adopt-reshaped** | ai product surface routes to the ai satellite, never the engine. `ask` is the uncontested lead — protect it. Streaming folds into ask/inline (R21), not new verbs. `[MCP-Δ]` chat/inline. |
| **`verify` suite** (lint/links/orphans/render/space/duplicates/staleness/ia-conformance; `drift` real) *(split — see C6)* | `docmost-cli §4`; wiki-api content-health backend ENG-1959 (Done) | wiki-api (content-health) + knowledge (dup/stale) | **partial, two different gap classes — not one "wiring gap":** `lint/links/orphans/render` ARE registered in wiki-api's live route table (`.../links /lint /orphans /render`, `evidence-orvex-cli §3` route table) — pure **wiring gap**, backend exists, CLI leaf is stub. `duplicates/staleness/ia-conformance` and a `verify space` leaf have **no server route at all** — these are **design gaps**: dup/staleness need a knowledge-side build, ia-conformance/space have no server home yet. | **adopt-reshaped** | Wire the four backed leaves now (cheap); scope `duplicates/staleness` onto knowledge and `ia-conformance`/`space` as new server design work, not "the same fix." **ENG-1556 is marked Done yet the suite is stub — see §b.** |
| **`migrate scan/apply/verify`** (top-level, bulk markdown import) *(scope narrowed — see C5)* | `docmost-cli §7`; ENG-1560 | wiki-api /v1 (Save/Get match grammar) | **done** — real, in-process `pkg/dfm`; `apply`→`SavePage`/`/v1/wiki`, `verify`→`GetPageV1`/`/v1/wiki/{loc}` both match the live `{resource}` grammar; fidelity-diff → exit-9 on mismatch | **adopt** | The most-real bulk path. Keep; add an async-batch home for large sweeps (P2). *(Scope note: this "done" verdict covers only the top-level `migrate` group — the separate `wiki migrate` archive facade below is NOT covered by this evidence.)* |
| **`wiki migrate {import,export,verify,apply}`** (archive facade group, distinct from top-level `migrate`) *(new split row — C5)* | `docmost-cli` archive-import precedent; `evidence-orvex-cli §3/§13` | wiki-api /v1 → engine | **partial / routes-unverified** — targets `ArchiveRequest`-shaped calls "not independently re-verified against the server table … should be checked before being presented as parity-complete" — the same 404-risk class as comment/label/attach, not the same as top-level `migrate` | **adopt-reshaped** | Do not present alongside top-level `migrate`'s "done" verdict as one surface. Verify live before scheduling further work on it. |
| **`admin user`** (get/invite/activate/deactivate/delete/list/me/search) | `docmost-cli §12`; ENG-2569 | **identity** | **missing** — `admin` namespace 100% stub | **adopt-reshaped** | User lifecycle composes onto identity, not the engine. **ENG-1554 marked Done yet admin is 100% stub — see §b.** |
| **`admin workspace`** (info/members/invites/integrations/settings/confirm-gate) | `docmost-cli §12` | wiki-api (workspace reads) + identity (members) | **missing** — stub | **adopt-reshaped** | Workspace reads front through wiki-api; membership through identity. Drop the `integrations linear` leaf (D-S11). |
| **`admin` entitlement / quota-state read** (`GET /orvex/quota`-equivalent) *(new row — C3)* | `evidence-orvex-cli.md §7` (CLI code itself declares the route: `workspace entitlements → knowledge`, reading a projection fed by `billing.entitlement.changed`); `synthesis-parity.md A.8` independently flags the endpoint missing; billing has no CLI host (`cmd/admin.go`) | **billing (source) → knowledge (read projection)** | **missing (stub)** | **adopt-reshaped** | For 10k paying tenants, an agent/operator needs to *see* quota usage and entitlement state without hitting Stripe or the engine. Right service named in the code, never scored as a row until this pass. |
| **`admin reindex` / `reembed`** (knowledge corpus maintenance) *(new row — C4)* | `evidence-orvex-cli.md §7` declares `reindex, reembed → knowledge` (stub); `evidence-fork-server.md §3.1` "bulk re-embed admin → knowledge"; docmost-cli shipped `ai reembed` | **knowledge** | **missing (stub)** | **adopt-reshaped** | Corpus maintenance after a bulk import / forced re-embed is a real operator verb with a settled serving-service; never engine. Had a row-neighbor for user/workspace/audit but was silently dropped from the table — restored. |
| **`page ratify`** (human-gated promote-draft-to-canonical, device-authorization/token flow) *(new row, from C1/C2)* | `docmost-cli §3.3` `cmd/page/ratify.go`; RATIFY_TOKEN/CONFIRM_TOKEN model; `RATIFY_ACK_REQUIRED`/`RATIFY_REASON_REQUIRED`/`RATIFY_FORCE_NOT_ALLOWED` codes | engine (mint) → wiki-api (transport) → cli | **missing** — no verb at HEAD; only the read-only `GET /v1/settings/ratify-gate` route exists | **adopt-reshaped** | This is the concrete verb the P0 "Human-gated governance transport" row is about — build it explicitly rather than letting it hide inside a "governance real" claim. `[MCP-Δ]` — token-gated per PO-D1. |
| **`page tree apply <file>`** (bulk tree-restructure write) *(new row, from C1)* | `docmost-cli §1a` `cmd/page/tree.go` (bulk-apply, a write) | wiki-api /v1 → engine | **missing** — HEAD `nav tree` is read-only; no write counterpart | **adopt-reshaped** | Bulk reorg after a migration/consolidation pass is a real wiki-admin need distinct from per-page moves. Needs a wiki-api write route — currently unhomed either side. |
| **`mirror` pull/push/watch** (filesystem ↔ wiki, offline DfM↔PM) | `docmost-cli §9`; ENG-2566 | wiki-api /v1 + cli (`pkg/dfm` offline) | **partial** — pull/push real; `watch` a routing stub | **adopt-reshaped** | The operator/human authoring loop + doc-migration path survives. `watch` is the rethink — should ride the changes feed, not poll (open-Q). |
| **Audit dual-write (emit leg)** *(split from the draft's single "audit" row — see C8)* | `docmost-cli §3.4` `internal/audit/dualwrite.go`; ENG-2558; atlas B31 (events-only integration; wiki-api's `/v1/audit` re-points from engine to the shared audit service) | **audit** (via wiki-api forward, ADR-0037) | **missing** — `audit record` stub; dual-write not wired | **adopt-reshaped** | Emit-only client leg; the sink is orvex-studio-audit reached transitively via wiki-api, not the engine. |
| **Audit read/query** *(split — see C8)* | `docmost-cli §12` `audit log`/`audit summary` — real docmost-cli read verbs (`evidence-docmost-cli.md:174`) | **audit (target — not yet built)** | **missing** — `audit log` stub | **rethink — OPEN, not a settled removal.** | The draft's "read/query moves off the CLI to the audit service" treats an unbuilt service as a done disposition. Per memory, Daniel is personally designing the audit/compliance service now (`audit-compliance-service-incoming`) and "R16 artifacts = seam reservations only, his design supersedes." Confirm the CLI retains *some* audit-read path (own knowledge-style no-public-host risk) once that design lands — do not silently drop docmost-cli's real read verbs. |
| **Daemon + SQLite cache** (`daemon run/status/…`; `cache sync/check/clear/diff/info/mirror`) | `docmost-cli §10`; ENG-1513/2570-2573 | cli client-local + **knowledge SSE** (freshness) | **partial** — `daemon run`/`__daemon` real; `cache path`/`link` real; sync/status/clear/most-of-daemon stub | **rethink** | **The sharpest PO-D2 challenge.** docmost-cli built a client cache hitting one monolith directly; in a multi-service world caching may belong server-side. Keep the daemon **only** if the agent-call-loop win beats delegating to server-side caching — decide before building 2570-2573. |
| **Changes/events consumption** (`nav recent`, SSE freshness) | `docmost-cli` event stream; `PACF13d3I3 §5` 11-item SSE contract; atlas B30 (SSE wire contract) | wiki-api `/v1/changes` (cursor) + knowledge SSE | **partial** — `events` SSE wired via daemon; `admin events` stub | **adopt-reshaped** | Convert the feed to cursor-paginated off the CloudEvents `version_field`; cursors keyed `(cell/events-host, space)` to survive tenant-move. |
| **Support-issue filing** (`wiki issue create`, SSO-relayed, server-held key) | `docmost-cli §1`; ENG-1484 | wiki-api relay (server-held platform key) | **done BUT Linear-shaped** — relays via `POST /api/integrations/linear/issues` | **rethink** | The mechanism (zero client key, `--dry-run`) is sound; the **naming** violates the total-Linear-drop mandate. Rename to `/v1/support/issues` and sever the Linear name, or drop if support-ticketing has another home. |
| **Config** (edit/get/set/show/unset) *(hedge corrected — see C14)* | `docmost-cli §12` | cli client-local | **partial** — `endpoints` **presumed-real (unconfirmed** — the evidence's own words are "not read in detail … presumably real given `doctor` shares the resolver," which the draft had upgraded to a flat "real")**; `set`/`migrate` stub | **adopt-reshaped** | Endpoint registry per-service replaces docmost-cli's single `InstanceURL`; confirm `endpoints` live, then finish `set`/`migrate` (DOCMOST_*→ORVEX_* one-window cutover, no shim). |
| **Universal `--dry-run` + separate destructive-confirm flag** | `docmost-cli §5`; `synthesis-goggles §3.3` | cli + wiki-api (idempotent semantics) | **partial** — `--dry-run` on `wiki issue create` + block ops only, not universal | **adopt-reshaped** | Safe-by-construction: every consequential verb gets `--dry-run`; don't conflate `--yes` with authorizing irreversible ops. |

---

## P2 — lower-impact, full-binary, dropped, reshape-then-defer, or genuinely open

| Capability | Precedent (file-cited) | Serving service (PO-D4) | State@HEAD | Disposition | Rationale |
|---|---|---|---|---|---|
| **`space` create/delete/get/list/update/permissions/member/confirm-gate** | `docmost-cli §12` | wiki-api /v1 → engine | **missing** — honest local `NOT_IMPLEMENTED`; wiki-api serves no spaces resource | **adopt-reshaped** | Correctly stubbed, not papered over — space management is real. Blocked on a wiki-api spaces resource that **has no ticket** (§a). |
| **`screenshot` manifest/refresh/shot** (headless Chromium) | `docmost-cli §12`; ENG-1561/2561 | cli `orvex-full` variant | **partial** — `orvex-full`-gated stub | **adopt-reshaped** | Two-variant build is right-shaped; screenshotting rendered wiki pages is wiki-adjacent doc-QA — survives on a thinner-but-real argument (unlike `code graph` below). |
| **`code graph`** (tree-sitter dep-graph) *(disposition revised — see C10)* | `docmost-cli §12`; ENG-1960/2561 | cli `orvex-full` variant — **no wiki/knowledge/ai/identity/audit/billing family member obviously owns this** | **partial** — full-binary-gated | **rethink** | *(Correction: the draft filed this "adopt-reshaped, defer" on precedent alone — "same two-variant posture" — with no PO-D4 serving-service argument and no PO-D2 first-principles case. Tree-sitter code-dependency analysis is orthogonal to a wiki/knowledge CLI.)* Either name the family member it serves, or scope it out of this program entirely; don't quietly carry it forward on docmost-cli's say-so. |
| **`doctor`** | `docmost-cli §12` | cli (probes services) | **done** — real, honest configured-vs-unconfigured | **adopt** | The CLI's self-diagnostic; keep. |
| **`instructions` + embeds catalog** | `docmost-cli §12`; ENG-1515 | cli | **done** — golden-tested | **adopt** | Machine-discoverable; extend into `schema` (P0). |
| **`completion` bash/zsh/fish/powershell** | `docmost-cli §1` | cli (cobra) | **done** — cobra auto-registers | **adopt** | Free; keep. |
| **`link`/`unlink`** (symlink canonical mirror into a repo) | `docmost-cli §1` | cli | **missing** — no orvex-cli equivalent, no ticket | **rethink** | Single-tenant-repo-era convenience; overlaps `mirror`. Fold into `mirror` or drop — decide, don't silently omit. |
| **Rate-limit awareness** (`X-RateLimit-*`/`Retry-After` surfacing) | `docmost-cli internal/ratelimit` | wiki-api (emits) → cli (surfaces) | **missing** | **adopt-reshaped** | Agents need backoff signals; surface headers + `429/RATE_LIMITED` (already exit-7). |
| **Batch / async bulk ops** | `docmost-cli internal/batch`; `synthesis-goggles Q12` | wiki-api (sync `blocks:batch`/`pages/bulk` + future async submit→poll) | **missing** | **rethink** | Reserve an async submit→poll endpoint for doc-migration/consolidate sweeps; build when P1-factory workloads move to /v1. |
| **`apikey force-grant`** *(rationale corrected — see C9)* | `docmost-cli §12` | — (CLI leg only) | **dropped** — SSO-only now | **drop** | *(Correction: the draft's rationale "API-key management is gone … no client-side key" mis-states the code. API keys are NOT gone — the engine ships clean-room `core/api-key` implementing FR-11 auth+CRUD, ENG-1380 Done; `ee/api-key` is empty per the licensing cleanup, not the feature.)* What is actually dropped is the **CLI's force-grant leg only**; API-key management moves to an identity/portal surface. Confirm no agent flow needs a CLI key-mint leg — SSO + headless bearer likely already cover it, but that substitution should be named, not assumed. |
| **Linear surface** (`linear view`, `issue`, 7 linear embeds, `LINEAR_NOT_CONNECTED`) | `docmost-cli §1/§5` | — | **dropped** — absent by construction (D-S11) | **drop** | Product-wide Linear drop; opaque-preserve pre-existing embeds on round-trip. Distinct from the support-issue relay (P1, rethink). |
| **Device-code auth (client-side)** | `docmost-cli internal/deviceauth` | identity | **dropped-by-substitution** — OIDC RP + headless `--token` replace it | **drop** | The engine hosts the device-grant landing; CLI acquisition is browser-RP or headless bearer. Confirm no agent flow needs device-code. |
| **Loki log query** | `docmost-cli internal/lokiquery` | console (satellite) | **dropped** — observability = orvex-studio-console over LGTM | **drop** | A CLI log-query leg would duplicate console. Drop. |
| **Role administration internals** | `docmost-cli internal/roles` | identity / console | **missing** | **rethink** | Role/permission admin is identity+console territory (SCIM/OIDC group-sync); decide whether the CLI needs any read leg. |
| **`page restore-content <slug>`** (restore a specific historical content snapshot, distinct from untrash-`restore` and version-`revert`) *(new row, from C1)* | `docmost-cli §1a` `cmd/page/restore_content.go` | wiki-api /v1 → engine | **missing** — no HEAD counterpart | **rethink** | Possibly redundant with `wiki history revert`; decide whether this is a distinct primitive (partial-content restore vs full-version revert) before building or dropping it — don't leave it silently implied inside the "page CRUD done" claim. |
| **`page watch <slug>`** (subscribe to per-page change notifications) *(new row, from C1)* | `docmost-cli §1a` `cmd/page/watch.go` | wiki-api /v1 (or knowledge SSE) | **missing** — distinct from `mirror watch` (filesystem) and `nav watchers` (list who's watching, now real) | **rethink** | Fold into `nav watchers` as a subscribe action, or ride the same cursor feed as `mirror watch`/`nav recent` — don't build a third independent watch mechanism. |
| **`ai memory` list/add/recall (CLI leg)** *(new row — C12)* | `evidence-fork-server.md §3.1` `ai-memories` controller (real, `ai` satellite); `evidence-mcp-research-corpus.md` — `memory_recall` is the single highest-scoring hero verb on the full force×verb matrix (11), sole carrier of the capture-funnel business goal | **ai** | **missing (net-new — no docmost-cli baseline)** | **rethink** | PO-D4 composes onto ai; PO-D1 is MCP⊇CLI, not the reverse, so this is a candidate, not a hard parity gap. But the draft added other net-new AI-first rows it judged worthy (schema, Skill file, rate-limit) while silently omitting this one — needs an explicit decision (build a thin CLI leg, or document why memory stays MCP-only). |

---

## (a) Capabilities with NO Linear ticket (in the censused `Orvex CLI` project)

> Caveat: identity/knowledge/ai/audit/console satellites are separate, un-censused projects; server-side
> homes may be ticketed there. Items below are unhomed in the CLI project on the evidence available.

**Genuinely no ticket anywhere:**
- **`link`/`unlink`** (symlink canonical mirror) — no orvex-cli equivalent, no ticket, no explicit drop decision. **Decision owed.**
- **`orvex schema` runtime introspection** and **first-party Skill file** — net-new, no ticket.
- **Universal `--dry-run`** (beyond block ops/`issue create`) + separate destructive flag — no ticket.
- **Rate-limit-header surfacing, async-batch consumption** — no orvex-cli ticket; may be intentional non-goals but undocumented as such.
- **`page ratify`, `page restore-content`, `page watch`, `page tree apply`** — no HEAD verb, no ticket for any of the four (newly individuated by this pass — previously folded silently into the "page CRUD done" row).
- **Entitlement/quota-state read**, **`admin reindex`/`reembed`** — declared as knowledge/billing-served in the CLI's own code comments, but neither has a scored ticket.
- **`ai memory` CLI leg** — net-new, no ticket either way (build or documented drop).

**Server-side gaps that make CLI verbs unshippable (CLI-side ticketed, server-side unhomed):**
- **wiki-api spaces resource** — `wiki space` is permanently stubbed because wiki-api serves no spaces resource; ENG-2557 tracks the **CLI** side, **no ticket adds the server route**.
- **wiki-api `/v1/comments`, `/v1/labels`, `/v1/attachments` routes** (or sub-resources under the locator) — ENG-2557 is CLI-side; **no ticket adds the server routes** the broken clients need.
- **`wiki migrate` archive-facade routes** (`ArchiveRequest`-shaped) — unverified against wiki-api's route table; same unhomed-server-side risk, not yet distinguished from the top-level `migrate` ticket.
- **Audit read/query home** — genuinely blocked on Daniel's incoming audit-service design (memory: `audit-compliance-service-incoming`); not a ticket gap so much as a design-not-landed gap.

**Alignment/removal owed, untracked:**
- **Rename/remove the Linear-shaped support-issue relay** (`POST /api/integrations/linear/issues`) — ENG-1483/1484 built it; **nothing tracks renaming it to `/v1/support/issues` or removing it** per the total-Linear-drop mandate.

**MCP-Δ (feeds Track-1 list-3, not a CLI ticket):** `label`, `verify` suite, `migrate` archive facade, `space`, daemon/cache, `page ratify`, `page tree apply` have no MCP counterpart today — PO-D1 requires reachability. `admin reindex/reembed` is a plausible **deliberate** MCP exclusion (knowledge-admin capabilities were explicitly OUT-tabled in the MCP research corpus because they'd need the shim to hold/escalate credentials beyond the caller's) — flag for confirmation, not an automatic gap.

---

## (b) OBE / misaligned tickets (`evidence-linear.md §4`)

**The ENG-2544..2578 "from-scratch" cluster (35 Todo) is largely OBE.** It re-proposes work already
Done: ENG-2544 dups ENG-1419; ENG-2549/ENG-2554 dup ENG-1495; ENG-2550/2551 dup ENG-1521; ENG-2574 dups
ENG-1516/1956; ENG-2553 dups ENG-1521; ENG-2567/2568 dup ENG-1519/1557; ENG-2570-2573 dup ENG-1513.
**Reality-probe each against HEAD before scheduling.**

**Genuinely unfinished, must be RE-SCOPED as fixes not net-new builds:**
- **ENG-2547** (codegen from contracts tag + drift gate) — real gap; `gen/` is a placeholder, MR-CLI2 undecided. **P0.**
- **ENG-2557** (space/comment/label/attach + binary I/O) — real, but needs the **server-side wiki-api routes** first (no ticket, §a). *(Does not currently cover `page ratify`/`restore-content`/`watch`/`tree apply` or the `wiki migrate` archive facade — see the newly individuated rows above; scope-check before treating ENG-2557 as exhaustive.)*
- **ENG-2546** (transport chokepoint incl. Idempotency-Key) — R11 NOT MET is a real retry-safety gap.
- **ENG-2560** (verify suite + spec-gate check) — real; only `drift` ships today. *(Scope note: only 4 of ~8 verify leaves are wiring-gaps against an existing backend — the other 4 are design gaps needing new server work; ENG-2560 should be split accordingly.)*

**Done tickets contradicting reality at HEAD (Done-but-stub / false-done):**
- **ENG-1554** "admin namespace verb surface (user/workspace/audit/config)" — marked **Done**, but the entire `admin` namespace is **100% stub** at HEAD. Mis-marked. *(Also silent on reindex/reembed — see C4.)*
- **ENG-1556** "verify/code content-health + drift gates + Tree-Sitter" — marked **Done**, but the `verify` suite is **stub except `drift`** and `code graph` is full-binary-gated.
- These two are the CLI face of the "signals are not observation" hazard: Linear-Done ≠ working.

**Misaligned with the Linear-drop mandate:**
- **ENG-1484** (`orvex wiki issue create`, SSO-relayed Linear filing, **Done**) — the relay it targets is Linear-shaped; pending rename/removal. Server twin: **ENG-1483** (wiki-api).

**Superseded / bookkeeping:**
- **ENG-1493** (wiki namespace verb surface) — **Canceled**, correctly superseded by the Done ENG-1495.
- **ENG-2105** ([FACTORY] Wave-3 delta) + the 35-story pack are the pack wrapper; **ENG-1512** (Done, uncached yaml) unresolved in the census.

**Valid self-flagged canon-drift (keep):** **ENG-2795** — define FR-CLI21 (golden-corpus parity test) on the PRD; real and Todo.

---

## (c) Open design questions this list surfaces

1. **Does the client-side daemon + SQLite cache survive, or is caching delegated server-side?** The
   sharpest PO-D2 reshape: docmost-cli's cache existed because it hit one monolith; PO-D4 says "reads
   maybe from knowledge." Decide before building ENG-2570-2573.
2. **Do comment/label/attachment become sub-resources under `/v1/wiki/{loc}`, top-level resources, or
   honest stubs?** Governs whether 3 broken CLI groups become real. **No server ticket exists either way** (§a).
3. **The Go codegen bridge (MR-CLI2).** ADR-0035 covers only the 3 TS satellites and explicitly excludes
   Go stubs (atlas B34). A CLI consuming the same pinned contract as MCP needs a decided Go generator.
4. **Serve agent document-reads from the knowledge index vs wiki-api /v1?** PO-D4's open question, applied
   to the CLI's read verbs (`page get`, `nav`, `search --cached`).
5. **Does `mirror watch` survive, and does it ride knowledge SSE or the wiki-api `/v1/changes` cursor
   feed?** Now explicitly linked to the new `page watch` question (#12) — decide both together, not separately.
6. **`content_pm` (raw ProseMirror) parity (OQ-CLI1).** The knowledge projection has no PM-JSON analogue;
   blocks `--prosemirror`/hash-skip/lossless round-trip on any read served from knowledge.
7. **Support-issue relay: rename-and-keep or drop?** The total-Linear-drop directive forces a ruling on ENG-1483/1484.
8. **Host-routing form (MR-CLI1) is still unpinned** — flat vs cell-segmented for `ai`/knowledge/wiki-api hosts.
9. **Is the CLI itself MCP-exposable?** (PO-D1 + web-cli §12) — shared generated client as substrate vs
   parallel MCP+CLI projections of /v1.
10. **Fix the CI-RED false-green (D-CLI1) FIRST** — but treat its current status as **unverified past
    2026-07-15** (C7/atlas S9), not a live present-tense fact. Reality-probe before scheduling around it.
11. **Does B43 (agent wiki-writes hard-cut to staging, unexecuted) reshape every write-verb row above?**
    *(new, from atlas)* — atlas B43: MCP `save_page`/`edit` and CLI wiki writes will eventually 403 at
    wiki-api ingress for agent-class creds and redirect to `staging_*`/`orvex-cli staging`, sequenced LAST
    and gated on staging's apply path (currently a stub). None of this list's write-verb rows (`page`
    CRUD, `page ratify`, `mirror push`, `migrate apply`, block authoring) currently design for this cut.
    Design them as a clean swap-in now rather than re-architecting later — do not assume the cut has landed.
12. **`page watch` vs `nav watchers` vs `mirror watch` — one subscribe primitive or three?** *(new,
    from C1's individuated row)* — three docmost-cli-derived "watch"-shaped capabilities exist with no
    unifying design; resolve before building any of them.

---

## (d) Challenge disposition log (PO-D2 audit trail)

All 14 findings in `challenge-cli.md` were independently re-verified against the underlying evidence
files before being applied (not taken on the challenger's word). **All 14 ACCEPTED; zero rejected.**

| # | Finding | Verified against | Applied as |
|---|---|---|---|
| C1 | `mentions` claimed done but absent; 4 docmost-cli page verbs unaccounted-for | `evidence-orvex-cli.md §3` nav enumeration (0 `mention` hits); `evidence-docmost-cli.md §1a/§3.3` | P0 page/nav row corrected; 4 new individuated rows (`ratify`, `restore-content`, `watch`, `tree apply`) |
| C2 | Governance rated "real" despite same unverified-route risk as comment/label/attach; no `ratify` verb exists | `evidence-orvex-cli.md §3 finding, §13`; grep 0-hits for `ratify` verb | P0 governance row downgraded to partial/unverified |
| C3 | Missing row: entitlement/quota-state read | `evidence-orvex-cli.md §7`; `synthesis-parity.md A.8` | New P1 row added |
| C4 | Missing row: admin reindex/reembed | `evidence-orvex-cli.md §7,§13`; `evidence-fork-server.md §3.1` | New P1 row added |
| C5 | `migrate` "done" conflates top-level + unverified archive facade | `evidence-orvex-cli.md §3,§8,§13` | Split into two rows |
| C6 | "wiring gap not design gap" holds for only half the verify leaves | `evidence-orvex-cli.md §3` route table (links/lint/orphans/render registered; duplicates/staleness/ia-conformance/space not) | Row split into wiring-gap vs design-gap leaves |
| C7 | CI-RED presented as current fact; canon says unverified past 07-15 | `wiki-study/orvexcli.md:114`; atlas S9 | Hedge added to baseline note + Open-Q #10 |
| C8 | Audit read/query dropped as "settled" against an unbuilt service | memory `audit-compliance-service-incoming`; `evidence-docmost-cli.md:174` | Split row; reframed as OPEN |
| C9 | `apikey force-grant` drop rationale mis-states the code (keys not gone) | `synthesis-parity.md A.10`; `evidence-fork-client.md §4.3,§5` | Rationale corrected |
| C10 | `code graph` adopted from precedent with no serving-service/first-principles argument | Direct application of PO-D2/PO-D4 to the row (judgment call, not a factual citation) | Disposition changed adopt-reshaped → rethink |
| C11 | Embed counts internally inconsistent (28/6 vs actual) | `evidence-docmost-cli.md §5` — direct recount: 30 types, 7 `linear_*` | Counts corrected (30 total, 7 Linear) |
| C12 | Missing row: `ai memory` CLI leg, silently omitted while other net-new rows were added | `evidence-fork-server.md §3.1`; `evidence-mcp-research-corpus.md` | New P2 row added (rethink) |
| C13 | `wiki whoami` is a real kept primitive with no row | `evidence-orvex-cli.md §3` fix11 | New P0 row added |
| C14 | Config `endpoints` "real" over-claims a hedged "presumably real" | `evidence-orvex-cli.md §9` | Hedge restored |

**Correction to the challenge doc itself (not one of the 14, found independently in this pass):**
`challenge-cli.md`'s header claims `wiki-study/atlas.md` "does not exist … no atlas was produced." At
the time this final pass ran, **the atlas exists** (`wiki-study/atlas.md`, 61,590 bytes, timestamped after
the challenge doc — it was produced between the challenge pass and this merge pass). It was read in full
for this pass. Its CLI-relevant bindings (B21 CLI-auth-is-identity-owned, B23 Idempotency-Key-NOT-MET,
B30 SSE wire contract, B34 ADR-0035-TS-only, B36 AGPL boundary, B38 RATIFY/CONFIRM transport-only, B43
agent-writes-hard-cut-to-staging, S9 CI-red-unverified) all **corroborate** rows already in this list —
none contradicted a row or forced a disposition change — except B43, which surfaces new open question
(c)#11 (no row currently designs for the eventual write hard-cut to staging).
