# TRACK 1 — CLI PARITY-GAP LIST (orvex-cli)

**Deliverable.** The `orvex-cli` capability inventory scored against the COMPLETE `docmost-cli`
baseline (`evidence-docmost-cli.md`) + the multi-service successor scope from the CLI canon
(`evidence-canon-cli.md` / `wiki-study/orvexcli.md`), with each capability given a first-principles
AI-first disposition. Built 2026-07-17 under the four binding PO directives
(`po-decisions/2026-07-17.md`).

Every row: **capability | precedent (file-cited) | serving service (PO-D4) | state@HEAD | disposition | one-line rationale.**

---

## 0. How this list is written (the four directives, applied)

- **PO-D2 (challenge everything).** `docmost-cli` grew organically against the LEGACY Docmost
  monolith over a single `InstanceURL` with ~90 raw-HTTP callsites (`PACF13d3I3` audit; D1–D13).
  No capability is adopted because "the fork had it" — each gets **adopt / adopt-reshaped / rethink /
  drop** argued from the AI-first CLI principles in `synthesis-goggles.md §3.3` (machine-output
  contract, noun-verb grammar, generated-client sharing, progressive disclosure, `schema`
  introspection, universal `--dry-run`).
- **PO-D4 (compose the family).** Every row names a **serving service**. The AGPL engine is the SoR
  for writes+collab and is **never contacted directly by the CLI** (D-S16, engine raw API internal-only);
  wiki-shaped verbs front through **wiki-api /v1**; search/related/duplicates/reembed → **knowledge**;
  ask/chat/inline/image/cost → **ai**; login/whoami/user → **identity**; audit dual-write → **audit**
  (via wiki-api forward, ADR-0037); entitlement/quota reads → **billing→knowledge projection**
  (billing has no CLI host). A capability parked on the wrong service is a gap, not coverage.
- **PO-D1 (MCP ⊇ CLI).** Every CLI capability below carries an implicit MCP-reachability obligation
  (token-gated, progressive-disclosure-gated). CLI capabilities with **no** MCP counterpart are flagged
  inline `[MCP-Δ]` — they feed the separate Track-1 list-3 (MCP-vs-CLI delta), not this one.
- **PO-D3.** The wiki DOMAIN is greenfield here; the 2026-07-17 general-MCP re-baseline donates the
  envelope/error/disclosure/KPI conventions only.

**Coverage legend:** `done` = real handler wired + route-matched @HEAD · `partial` = some real, named
gaps/stubs · `missing` = typed `NOT_IMPLEMENTED`, zero network · `broken` = compiles+unit-tested but
calls a route the server does not serve (404/405 live) · `dropped` = deliberately removed.

**Baseline @HEAD** = `orvex-cli @ 48329b7` (`evidence-orvex-cli.md`), 17,913 Go LOC, real for ~half the
surface, **CI-RED since 2026-07-13** (D-CLI1 false-green: local `go test` passes only on an ambient
`DOCMOST_API_TOKEN`; clean-env fails). "Done in a Linear ticket" ≠ working — several Done tickets cover
still-stubbed surface (see §b).

---

## P0 — the trustworthy-CLI floor: correctness, the generated spine, verified writes, governance

These block a CLI an agent can trust. The unifying failure is **client-side completeness ≠ live
correctness** (`synthesis-goggles §2.2#4`): the CLI ships verb groups that compile, pass unit tests, and
404 live because no one generated the client from the contract or checked it against a running wiki-api.

| Capability | Precedent (file-cited) | Serving service (PO-D4) | State@HEAD | Disposition | Rationale |
|---|---|---|---|---|---|
| **Shared generated client from the contract tag** | `docmost-cli` triplicated HTTP layer / ~90 callsites (`PACF13d3I3` D10); CLI canon MR-CLI2 (`9AdZkNTlyj §gen/`, `pf10XC2Qjz`) | contracts (SoT) → cli `internal/client` | **missing** — `gen/` is a `doc.go` placeholder; `internal/client` is hand-authored shells; ADR-0035 excludes Go stubs (`9AdZkNTlyj`) | **adopt-reshaped** | Root cause of the whole 404 class + spine drift (`synthesis-goggles Q2`); the single highest-leverage decision — build a real Go generator off contracts `v0.1.4`, wire the `served-openapi-diff` CI gate. |
| **Machine-output contract** (`--output` auto-json-when-piped, `--fields`/`--id-only`/`--compact`, stdout=data/stderr=progress, `SetEscapeHTML(false)`) | `docmost-cli §2.1`, `binary/json/output_contract_test.go` (`§13`) | cli | **done** — frozen, golden-tested (`evidence-orvex-cli §11`) | **adopt** | Best-in-class already; the deterministic surface agents need. Keep verbatim. |
| **Frozen 0–9 exit codes + `error_code` vocabulary + `next` recovery command** | `docmost-cli §2.2/2.3` (55 codes); CLI canon 19-code frozen set (`9AdZkNTlyj`) | contracts (vocabulary) → cli | **done** — 19 codes, `TestCliContractNoDrift` real/passing; `{error_code,message,hint,matches,request_id,next}` richest in the family | **adopt** | `synthesis-goggles §3.4` makes the CLI's `next`-carrying envelope the convergence target for MCP+API — do not strip. Reconcile 19 vs docmost-cli's 55 as codegen lands. |
| **`comment` add/edit/get/list/resolve/rm** | `docmost-cli §12` `cmd/comment/*` | **wiki-api /v1 → engine SoR** | **broken** — `WikiClient.*Comment` → `/v1/comments`, route absent (`evidence-orvex-cli §3`); same class as `wiki space` | **adopt-reshaped** | Table-stakes wiki feature that 404s live. Model as sub-resource `/v1/wiki/{loc}/comments` (`synthesis-goggles Q8`) or make it an honest local stub — never a silent 404. `[MCP-Δ]` covered by `wiki_comment_post`. |
| **`attachment` get/list/orphans/rm/search/upload/upload-url** | `docmost-cli §12` `cmd/attachment/*` | **wiki-api /v1 → engine SoR** (search-leg → knowledge) | **broken** — `WikiClient.*Attachment` → `/v1/attachments`, route absent (`evidence-orvex-cli §3`) | **adopt-reshaped** | Same 404 class. Binary I/O + `attachment-search` are real agent needs; sub-resource under locator; search-leg routes to knowledge. `[MCP-Δ]` `wiki_attachment_get/_save` exist. |
| **`label` list/pages + `page label` add/list/rm** | `docmost-cli §12` `cmd/label/*`, `cmd/page/label/*` | **wiki-api /v1 → engine SoR** | **broken** — `WikiClient.*Label` → `/v1/labels`, route absent (`evidence-orvex-cli §3`); engine `labels` module done (ENG-1385) | **adopt-reshaped** | Server primitive exists in engine; only the /v1 front + client shape are missing. No MCP seat today → `[MCP-Δ]`. |
| **Verified-write chokepoint: CAS `ifVersion`→409 + write receipt + `Idempotency-Key`** | `docmost-cli §3.1` three-baseline CAS (INV4); cell-contract R11 (`lhqTzMTPCj §5`) | wiki-api (chokepoint) → engine | **partial** — CAS real, exit-5 `VERSION_MISMATCH` frozen; **Idempotency-Key is a scaffold stub (R11 NOT MET, `transport.go:29`)** | **adopt-reshaped** | CAS = concurrent-writer safety; Idempotency-Key = retry safety (agents retry casually) — both required (`synthesis-goggles P6/Q4`). Engine already has internal keys; surface at /v1. |
| **Duplicate-guard on create** (`--force-new-acknowledged` + `--reason`, exit 8) | `docmost-cli §3.2` `internal/duplicate` | knowledge (dup signal) + cli (gate) | **done** — exit-8 `DUPLICATE_CANDIDATE` frozen (`evidence-orvex-cli §11`) | **adopt** | Living-wiki anti-mess primitive; keep. Dup detection itself must serve from knowledge, not a client heuristic. |
| **Human-gated governance transport** (ratify/confirm/supersede: `needs_human_*` + verbatim RATIFY/CONFIRM tokens, Studio deep-link) | `docmost-cli §3.3` ratify/confirm gates; governance chain (`synthesis-parity A.7`) | engine (mint) → wiki-api (transport) → cli | **partial** — `wiki governance` real; `wiki spec gate check` stub; ratify/confirm transport scaffolded | **adopt-reshaped** | P6 "AI never self-promotes" is preserved server-side (PO-D1 note); CLI transports verbatim, never mints. Wire the /v1 transport (`synthesis-goggles P8`). |
| **Wiki-first spec-gate check** | `docmost-cli §6` `cmd/specgate/*`, exit-9 `GATE_UNSATISFIED`; de-Linearized (ENG-1463) | wiki-api | **missing** — cli stub; `specgate.Gate.Check` = `ErrNotImplemented` server-side (`synthesis-parity A.7`) | **adopt-reshaped** | The doc-governance value prop; enforce it (de-Linearized). Currently unenforceable end-to-end. |
| **`page` CRUD (15 verbs) + nav (tree/backlinks/breadcrumbs/mentions/resolve-slug/permissions/transclusion)** | `docmost-cli §1a`; ENG-1495 | wiki-api /v1 → engine | **done** — real; `get`→DfM via in-process `pkg/dfm`; write rejects lossy `--format` locally | **adopt** | Core surface, route-matched to `/v1/wiki`. Keep; it is the CLI's most-real path. |
| **Auth + profiles** (login/logout/whoami/status/use/list-profiles; OIDC RP + headless `--token`) | `docmost-cli §11`; ENG-1516/1956 | **identity** | **done** — real OIDC RP, keyring/file store, zero-trust bearer forward, documented bug-fixes | **adopt** | Correctly composed onto identity (PO-D4). The headless `--token` path is the agent login. Keep. |
| **`schema` runtime introspection + first-party Skill file** | *absent in docmost-cli*; `synthesis-goggles §3.3` (web-cli §3 Poehnelt, §9) | cli | **missing** — only `instructions`/`ErrorCodeRegistry()` self-discovery exists | **adopt** (net-new) | The two most agent-specific CLI affordances the research demands; a program that lives on Skills should ship one. `[MCP-Δ]` = `get_capabilities`. |

---

## P1 — feature depth + the AI-first reshapes (the PO-D2 judgment calls)

| Capability | Precedent (file-cited) | Serving service (PO-D4) | State@HEAD | Disposition | Rationale |
|---|---|---|---|---|---|
| **Block authoring** (21 retained non-Linear embeds + `diagram` + `image_from_prompt`) | `docmost-cli §5` (28 subtypes, 29→21); ENG-2556 | wiki-api (grammar) + ai (bake/image) | **partial** — `wiki diagram` real; general block authoring Todo | **adopt-reshaped** | Drop the 6 Linear embeds (below); `orvex_dashboard` rebuilds generic (ENG-2532); `image_from_prompt` routes to ai. Keep block-patch under the CAS chokepoint. |
| **`search` related / duplicates / attachment-search** | `docmost-cli §12` `cmd/search`; ENG-2567 | **knowledge** (fronted by wiki-api /v1/search) | **partial** — keyword/semantic/hybrid real (via `/v1/search`, ACL'd); related/duplicates/attachment-search stub, hit knowledge directly (no public host) | **adopt-reshaped** | search→knowledge is settled (D-M8). The 3 stub leaves inherit the unrouted-host gap — either front them through wiki-api or give knowledge a reachable path. |
| **`ai` chat / inline / models** | `docmost-cli §8`; ENG-2568 | **ai** | **partial** — ask/cost/image real; chat/inline/models stub | **adopt-reshaped** | ai product surface routes to the ai satellite, never the engine (PO-D4). `ask` (cited) is the uncontested lead — protect it. Streaming folds into ask/inline (R21/P12), not new verbs. `[MCP-Δ]` chat/inline. |
| **`verify` suite** (lint/links/orphans/render/space/duplicates/staleness/ia-conformance; `drift` real) | `docmost-cli §4`; wiki-api content-health backend ENG-1959 (Done) | wiki-api (content-health) + knowledge (dup/stale) | **partial** — only `drift` real; rest stub; `render` full-binary stub (`evidence-orvex-cli §3`) | **adopt-reshaped** | Backend endpoints (links/lint/orphans/render) shipped in wiki-api (ENG-1959) but CLI leaves are stubs — a wiring gap, not a design gap. **ENG-1556 is marked Done yet the suite is stub — see §b.** |
| **`migrate` scan/apply/verify** (bulk markdown import) | `docmost-cli §7`; ENG-1560 | wiki-api /v1 (Save/Get match grammar) | **done** — real, in-process `pkg/dfm`, fidelity-diff → exit-9 on mismatch | **adopt** | The most-real bulk path; both live calls match the `{resource}=wiki` grammar. Keep; add an async-batch home for large sweeps (P2). |
| **`admin user`** (get/invite/activate/deactivate/delete/list/me/search) | `docmost-cli §12` `cmd/user/*`; ENG-2569 | **identity** | **missing** — `admin` namespace 100% stub (`evidence-orvex-cli §7`) | **adopt-reshaped** | User lifecycle composes onto identity (PO-D4 authn→identity), not the engine. **ENG-1554 marked Done yet admin is 100% stub — see §b.** |
| **`admin workspace`** (info/members/invites/integrations/settings/confirm-gate) | `docmost-cli §12` `cmd/workspace/*` | wiki-api (workspace reads) + identity (members) | **missing** — stub | **adopt-reshaped** | Workspace reads front through wiki-api; membership through identity. Drop the `integrations linear` leaf (D-S11). |
| **`audit` log/summary + dual-write** | `docmost-cli §3.4` `internal/audit/dualwrite.go`; ENG-2558 | **audit** (via wiki-api forward, ADR-0037) | **missing** — `audit record/log` stub; dual-write not wired | **adopt-reshaped** | Emit-only client leg; sink is orvex-studio-audit reached transitively via wiki-api (ADR-0037), not the engine. Read/query moves off the CLI to the audit service. |
| **`mirror` pull/push/watch** (filesystem ↔ wiki, offline DfM↔PM) | `docmost-cli §9` `cmd/page/mirror/*`; ENG-2566 | wiki-api /v1 + cli (`pkg/dfm` offline) | **partial** — pull/push real; `watch` a routing stub | **adopt-reshaped** | The operator/human authoring loop + doc-migration path survives (it is the offline-authoring keystone). `watch` is the rethink — it should ride the changes feed, not poll (see open-Q). |
| **Daemon + SQLite cache** (`daemon run/status/…`; `cache sync/check/clear/diff/info/mirror`) | `docmost-cli §10`; ENG-1513/2570-2573 | cli client-local + **knowledge SSE** (freshness) | **partial** — `daemon run`/`__daemon` real; `cache path`/`link` real; sync/status/clear/most-of-daemon stub | **rethink** | **The sharpest PO-D2 challenge.** docmost-cli built a client cache because it hit one monolith directly; in a multi-service world caching may belong server-side (wiki-api/knowledge). Keep the daemon **only** if the agent call-loop win (web-cli §8) beats delegating to server-side caching — decide before building 2570-2573. |
| **Changes/events consumption** (`nav recent`, SSE freshness) | `docmost-cli` event stream; `PACF13d3I3 §5` 11-item SSE contract | wiki-api `/v1/changes` (cursor) + knowledge SSE | **partial** — `events` SSE wired via daemon; `admin events` stub | **adopt-reshaped** | Convert the feed to cursor-paginated off the CloudEvents `version_field` (`synthesis-goggles Q9`); cursors keyed `(cell/events-host, space)` to survive tenant-move. |
| **Support-issue filing** (`wiki issue create`, SSO-relayed, server-held key) | `docmost-cli §1` `cmd/issue`; ENG-1484 | wiki-api relay (server-held platform key) | **done BUT Linear-shaped** — relays via `POST /api/integrations/linear/issues` (`synthesis-parity A.13/§b`) | **rethink** | The mechanism (zero client key, `--dry-run`) is sound; the **naming** violates the total Linear drop. Rename to `/v1/support/issues` and sever the Linear name, or drop if support-ticketing has another home (`synthesis-goggles Q10`). |
| **Config** (edit/get/set/show/unset) | `docmost-cli §12` `cmd/config/*` | cli client-local | **partial** — `endpoints` real; `set`/`migrate` stub | **adopt-reshaped** | Endpoint registry per-service replaces docmost-cli's single `InstanceURL`; finish `set`/`migrate` (DOCMOST_*→ORVEX_* one-window cutover, no shim — no-fallbacks). |
| **Universal `--dry-run` + separate destructive-confirm flag** | `docmost-cli §5` block `--dry-run`; `synthesis-goggles §3.3` (web-cli §6) | cli + wiki-api (idempotent semantics) | **partial** — `--dry-run` on `wiki issue create` + block ops only, not universal | **adopt-reshaped** | Safe-by-construction (P7): every consequential verb gets `--dry-run`; don't conflate `--yes` with authorizing irreversible ops. |

---

## P2 — lower-impact, full-binary, dropped, or reshape-then-defer

| Capability | Precedent (file-cited) | Serving service (PO-D4) | State@HEAD | Disposition | Rationale |
|---|---|---|---|---|---|
| **`space` create/delete/get/list/update/permissions/member/confirm-gate** | `docmost-cli §12` `cmd/space/*` | wiki-api /v1 → engine | **missing** — honest local `NOT_IMPLEMENTED`; **wiki-api serves no spaces resource** (`{resource}=wiki` only) | **adopt-reshaped** | Correctly stubbed (not papered over) — but space management is real. Blocked on a wiki-api spaces resource that **has no ticket** (§a). Model as a resource or sub-resource; keep the honest stub until built. |
| **`screenshot` manifest/refresh/shot** (headless Chromium) | `docmost-cli §12` `cmd/screenshot/*`; ENG-1561/2561 | cli `orvex-full` variant | **partial** — `orvex-full`-gated stub in the default binary | **adopt-reshaped** | Two-variant build (honest `REQUIRES_FULL_BINARY`) is the right shape; not a hot agent path. Keep gated. |
| **`code graph`** (tree-sitter dep-graph) | `docmost-cli §12` `cmd/code/*`; ENG-1960/2561 | cli `orvex-full` variant | **partial** — full-binary-gated (`REQUIRES_FULL_BINARY`) | **adopt-reshaped** | Same two-variant posture; defer. |
| **`doctor`** | `docmost-cli §12` | cli (probes 5 services) | **done** — real, honest configured-vs-unconfigured | **adopt** | The CLI's self-diagnostic; keep. |
| **`instructions` + embeds catalog** | `docmost-cli §12`; ENG-1515 | cli | **done** — golden-tested | **adopt** | Machine-discoverable; extend into `schema` (P0). |
| **`completion` bash/zsh/fish/powershell** | `docmost-cli §1` | cli (cobra) | **done** — cobra auto-registers | **adopt** | Free; keep. |
| **`link`/`unlink`** (symlink canonical mirror into a repo) | `docmost-cli §1` `cmd/link/*` | cli | **missing** — no orvex-cli equivalent, **no ticket** (§a) | **rethink** | A single-tenant-repo-era convenience; overlaps `mirror`. Fold into `mirror` or drop — decide, don't silently omit. |
| **Rate-limit awareness** (`X-RateLimit-*` / `Retry-After` surfacing) | `docmost-cli internal/ratelimit` (`evidence-orvex-cli §12`) | wiki-api (emits) → cli (surfaces) | **missing** — no equivalent | **adopt-reshaped** | Agents need backoff signals; surface headers + `429/RATE_LIMITED` (already exit-7). Cheap once the shared transport lands. |
| **Batch / async bulk ops** | `docmost-cli internal/batch`; `synthesis-goggles Q12` | wiki-api (sync `blocks:batch`/`pages/bulk` + future async submit→poll) | **missing** — no CLI batch surface | **rethink** | Reserve an async submit→poll endpoint for doc-migration/consolidate sweeps; keep it off the live-turn path. Build when P1-factory workloads move to /v1. |
| **`apikey force-grant`** | `docmost-cli §12` `cmd/apikey/*` | — | **dropped** — SSO-only now | **drop** | API-key management is gone with SSO cutover; no client-side key. Correct. |
| **Linear surface** (`linear view`, `issue`, 6 page-block embeds, `LINEAR_NOT_CONNECTED`) | `docmost-cli §1/§5` `cmd/linear`, `cmd/issue` | — | **dropped** — absent from the binary by construction (D-S11) | **drop** | Product-wide Linear drop; opaque-preserve pre-existing embeds on round-trip (`PACF13d3I3 §6`). Correct. Distinct from the support-issue relay (P1, rethink). |
| **Device-code auth (client-side)** | `docmost-cli internal/deviceauth` | identity | **dropped-by-substitution** — OIDC RP + headless `--token` replace it | **drop** | The engine hosts the device-grant landing (ENG-2059); the CLI's acquisition is browser-RP or headless bearer — a cleaner model. Confirm no agent flow needs device-code. |
| **Loki log query** | `docmost-cli internal/lokiquery` | console (satellite) | **dropped** — observability = orvex-studio-console over LGTM, not the CLI | **drop** | Troubleshooting UI is console; a CLI log-query leg would duplicate it. Drop. |
| **Role administration internals** | `docmost-cli internal/roles` | identity / console | **missing** — no equivalent | **rethink** | Role/permission admin is identity+console territory (SCIM/OIDC group-sync); decide whether the CLI needs any read leg or none. |

---

## (a) Capabilities with NO Linear ticket (in the censused `Orvex CLI` project)

> Caveat: identity/knowledge/ai/audit/console satellites are separate, un-censused projects; server-side
> homes may be ticketed there. Items below are unhomed in the CLI project on the evidence available.

**Genuinely no ticket anywhere:**
- **`link`/`unlink`** (symlink canonical mirror) — no orvex-cli equivalent, no ticket, no explicit
  drop decision (`evidence-orvex-cli §12`; `synthesis-parity §C`). **Decision owed.**
- **`orvex schema` runtime introspection** and **first-party Skill file** — the two AI-first CLI
  affordances `synthesis-goggles §3.3` most emphasizes; net-new, no ticket.
- **Universal `--dry-run`** (beyond block ops / `issue create`) + separate destructive flag — no ticket.
- **Rate-limit-header surfacing, async-batch consumption** — docmost-cli had
  `internal/{ratelimit,batch}`; no orvex-cli ticket; may be intentional non-goals but undocumented as such.

**Server-side gaps that make CLI verbs unshippable (CLI-side ticketed, server-side unhomed):**
- **wiki-api spaces resource** — `wiki space` is permanently stubbed because wiki-api serves no spaces
  resource; ENG-2557 tracks the **CLI** side, **no ticket adds the server route** (`synthesis-parity §c`).
- **wiki-api `/v1/comments`, `/v1/labels`, `/v1/attachments` routes** (or sub-resources under the
  locator) — ENG-2557 is CLI-side; **no ticket adds the server routes** the broken clients need.

**Alignment/removal owed, untracked:**
- **Rename/remove the Linear-shaped support-issue relay** (`POST /api/integrations/linear/issues`) —
  ENG-1483/1484 built it; **nothing tracks renaming it to `/v1/support/issues` or removing it** per the
  total-Linear-drop mandate.

**MCP-Δ (feeds Track-1 list-3, not a CLI ticket):** `label`, `verify` suite, `migrate`, `space`,
daemon/cache have no MCP counterpart today — PO-D1 requires reachability.

---

## (b) OBE / misaligned tickets (`evidence-linear.md §4`)

**The ENG-2544..2578 "from-scratch" cluster (35 Todo) is largely OBE.** It re-proposes work already
Done: ENG-2544 "from-scratch scaffold" dups ENG-1419; ENG-2549 "cobra tree" and ENG-2554 "Page CRUD verb
grammar" dup ENG-1495; ENG-2550/2551 "output contract + exit codes" dup ENG-1521; ENG-2574 "auth→identity
profiles" dups ENG-1516/1956; ENG-2553 "docmost-cli parity harness" dups ENG-1521; ENG-2567/2568
search/ai dup ENG-1519/1557; ENG-2570-2573 daemon/cache dup ENG-1513. **Reality-probe each against HEAD
before scheduling — the binary already exists (17,913 LOC).**

**But several 25xx tickets are genuinely unfinished and must be RE-SCOPED as fixes, not net-new builds:**
- **ENG-2547** (codegen from contracts tag + drift gate) — real gap; `gen/` is a placeholder, MR-CLI2
  undecided. **P0.**
- **ENG-2557** (space/comment/label/attach + binary I/O) — the broken-client + missing-spaces work is
  real; but it needs the **server-side wiki-api routes** first (no ticket, §a).
- **ENG-2546** (transport chokepoint incl. Idempotency-Key) — R11 NOT MET is a real retry-safety gap.
- **ENG-2560** (verify suite + spec-gate check) — real; only `drift` ships today.

**Done tickets contradicting reality at HEAD (Done-but-stub / false-done):**
- **ENG-1554** "admin namespace verb surface (user/workspace/audit/config)" — marked **Done**, but the
  entire `admin` namespace is **100% stub** at HEAD (`evidence-orvex-cli §7`). Mis-marked.
- **ENG-1556** "verify/code content-health + drift gates + Tree-Sitter" — marked **Done**, but the
  `verify` suite is **stub except `drift`** and `code graph` is full-binary-gated (`evidence-orvex-cli §3`).
- These two are the CLI face of the "signals are not observation" hazard: Linear-Done ≠ working.

**Misaligned with the Linear-drop mandate:**
- **ENG-1484** (`orvex wiki issue create`, SSO-relayed Linear filing, **Done**) — the relay it targets is
  Linear-shaped; pending rename/removal (see P1 rethink + §a). Its server twin is **ENG-1483** (wiki-api).

**Superseded / bookkeeping:**
- **ENG-1493** (wiki namespace verb surface) — **Canceled**, correctly superseded by the Done ENG-1495.
- **ENG-2105** ([FACTORY] Wave-3 delta) + the 35-story pack are the pack wrapper; **ENG-1512** (Done,
  uncached yaml) unresolved in the census.

**Valid self-flagged canon-drift (keep):** **ENG-2795** — define FR-CLI21 (golden-corpus parity test) on
the PRD; real and Todo.

---

## (c) Open design questions this list surfaces

1. **Does the client-side daemon + SQLite cache survive, or is caching delegated server-side?** The
   single sharpest PO-D2 reshape: docmost-cli's cache existed because it hit one monolith; PO-D4 says
   "reads maybe from knowledge." Decide before building ENG-2570-2573 — the agent-call-loop win
   (web-cli §8) vs delegating freshness to wiki-api/knowledge (`docmost-cli §15`).
2. **Do comment/label/attachment become sub-resources under `/v1/wiki/{loc}`, top-level resources, or
   honest stubs?** (`synthesis-goggles Q8`). Governs whether 3 broken CLI groups become real. **No server
   ticket exists either way** (§a).
3. **The Go codegen bridge (MR-CLI2).** ADR-0035 covers only the 3 TS satellites and explicitly excludes
   Go stubs. A CLI that consumes the SAME pinned contract as MCP needs a decided Go generator — the root
   cause of the 404 class stays open until this is ruled (`synthesis-goggles Q2`).
4. **Serve agent document-reads from the knowledge index vs wiki-api /v1?** PO-D4's open question, applied
   to the CLI's read verbs (`page get`, `nav`, `search --cached`): read-replica freshness/fidelity/ACL
   trade-off. Names the serving service for the whole read side.
5. **Does `mirror watch` survive, and does it ride knowledge SSE or the wiki-api `/v1/changes` cursor
   feed?** The offline-authoring loop's continuous leg is the one mirror verb still stubbed.
6. **`content_pm` (raw ProseMirror) parity (OQ-CLI1).** The knowledge projection has no PM-JSON analogue;
   this blocks `--prosemirror` / hash-skip / lossless round-trip on any read served from knowledge. A
   cross-surface parity risk, not CLI-only.
7. **Support-issue relay: rename-and-keep or drop?** (`synthesis-goggles Q10`) — the total-Linear-drop
   directive forces a ruling on ENG-1483/1484.
8. **Host-routing form (MR-CLI1) is still unpinned** — flat vs cell-segmented for `ai`/knowledge/wiki-api
   hosts. Any CLI endpoint-registry work assumes a form contracts hasn't pinned (`wiki-study/orvexcli.md §4`).
9. **Is the CLI itself MCP-exposable?** (PO-D1 + web-cli §12) — the generated client is the shared
   substrate; whether the CLI shells out as MCP tools via code-execution, or MCP+CLI stay parallel
   projections of /v1, is unresolved.
10. **Fix the CI-RED false-green (D-CLI1) FIRST.** Not a capability but the gate that makes every "Done"
    above verifiable — the auth-precondition ordering + hermetic-test fixes (`TestCmdSuiteIsHermetic`,
    `TestWikiVerbAuthPreconditionOrdering`) reopen honest dispatch.
