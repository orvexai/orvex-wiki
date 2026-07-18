# Evidence map: `orvex-studio-contracts` @ HEAD — wiki AI-surface bindings

Repo: `/home/daniel/repos/orvex-studio-contracts`
HEAD: `6512408226d258dfe6b0457e737247ea39160cd` (2026-07-16 17:39:14 +0200)
Latest release tag: `v0.1.3` (tags: v0.1.0 … v0.1.3 — **HEAD is materially ahead of the last tag**; see "Versioning discipline" below)

---

## 1. The `/v1/wiki` resource grammar OpenAPI (SoT per ADR-0035)

File: `openapi/wiki-api.yaml` (1308 lines), `info.version: 0.1.0-phase0`.

Per its own header comment, this file was **re-authored 2026-07-16** from the old flat `POST /v1/{verb}` grammar (ADR-0001, now superseded) to the LIVE `/v1/wiki` RESOURCE grammar actually served by `wiki-api.orvex.dev` — driven by a 34-route live probe (router/handler code AND live curl). Where the old canon page and the live probe disagreed, **the live probe won**. This is the concrete instance of the "certified ≠ current" doctrine already in memory (see `certified-is-not-current.md`) and is cited as `DESIGN-NOTES.md §11`.

Layering asserted by the file: `MCP -> wiki-api (/v1) -> engine (/api primitives)`. The engine serves **no** `/v1`; wiki-api is the sole `/v1` origin, composing `/v1` over the engine's internal `/api/*` primitives via session-exchange. `ask` is NOT here (owned by `ai.yaml` `/v1/ask`); `related` is knowledge-owned (`knowledge-query.yaml`).

`x-status` route ledger (full path list, `openapi/wiki-api.yaml`):

| Route | Method(s) implied | x-status | Notes |
|---|---|---|---|
| `/healthz` | GET | pinned | |
| `/v1/whoami` | GET | pinned | |
| `/v1/capabilities` | GET | pinned | |
| `/v1/instructions` | GET | pinned | |
| `/v1/openapi.json` | GET | pinned | Runtime-emitted descriptor — **descriptor only**; codegen sources exclusively from the pinned contracts tag (ADR-0001 D-A7 / **ADR-0035**), never from this live descriptor, "a hand-authored/live-descriptor spec is a contract-drift vector" (line ~242). |
| `/v1/wiki` (create) | POST | pinned | |
| `/v1/wiki/{loc}` | GET | pinned | |
| `/v1/wiki/{loc}` (whole-doc PUT) | PUT | **draft** | biggest gap — needs a NEW engine apply-ops-on-existing-document primitive |
| `/v1/wiki/{loc}/outline` | GET | pinned | |
| `/v1/wiki/{loc}/blocks/{blockID}` | GET | pinned | section-level read, closes the "op-triage section gap" |
| `/v1/wiki/{loc}/blocks` (PATCH) | PATCH | pinned | write chokepoint |
| `/v1/wiki/{loc}/blocks:batch` | POST | **draft** | atomic `{loc}`-addressed batch verb |
| `/v1/wiki/{loc}/backlinks` | GET | pinned | |
| `/v1/wiki/{loc}/breadcrumbs` | GET | pinned | |
| `/v1/wiki/{loc}/tree` | GET | **draft** | 502-fix in progress |
| `/v1/list/wiki` | GET | pinned | |
| `/v1/search` | GET | pinned | fronts knowledge |
| `/v1/wiki/{loc}/links` | GET | pinned | |
| `/v1/wiki/{loc}/lint` | GET | pinned | |
| `/v1/wiki/{loc}/orphans` | GET | pinned | |
| `/v1/wiki/{loc}/render` | GET | pinned | |
| `/v1/wiki/{loc}/drift` | GET | **draft** | 502-fix in progress |
| `/v1/changes` | GET | **draft** | token-scoped |
| `/v1/convert/fidelity` | — | pinned | |
| `/v1/convert/to-dfm` | — | pinned | |
| `/v1/convert/to-prosemirror` | — | pinned | |
| `/v1/import` | POST | pinned | |
| `/v1/pages/{pageId}/blocks/batch` | — | pinned | bulk #30 |
| `/v1/pages/{pageId}/blocks/{blockId}` | — | pinned | ranged block read |
| `/v1/pages/bulk` | — | pinned | |
| `/v1/tenant-move/{step}` | POST | **draft** | typed quiesce/export/import/activate step-API, `x-fronts: engine POST /api/orvex/tenant-move/{quiesce,export,import,activate}` 1:1 |

**Retired in this re-ratification**: the flat `POST /v1/{search,get,save,edit,list,export}` verbs are removed outright. Page-move re-homes onto `POST /v1/pages/bulk` op:move. GDPR-export/history flat verbs (old §10, ADR-0008) are **not on the live surface and are dropped** — `export-receipt.schema.json` fixture retained but now unreferenced.

**Version-semantics drift (load-bearing, flagged in-file):** LIVE inconsistency — create/read return `version` as a **timestamp string**, but `PATCH .../blocks` `If-Match` requires the **numeric engine `meta.version` integer**. A read `version` cannot feed a write CAS token today. The contract pins `version` as a string on receipts and flags the block-patch CAS token as a *distinct integer channel* (`meta_version` / `If-Match`, regex `^[0-9]+$`). The intended unified contract (`x-version-semantics`) collapses both onto one monotonic integer — **not yet true on the live surface**.

`D-S11`: the `{resource}` path segment is gated to `wiki` only; any other value → `400 UNSUPPORTED_RESOURCE_TYPE`. `{loc}` is a locator resolved by dialect (id | url | slug | title | nl) via `Locator{Kind:"auto"}` — one call, no resolve hop.

---

## 2. Engine-facing internal primitives (the `/api/*` and `/internal/*` seams wiki-api/engine expose)

### 2a. `openapi/engine-primitives.yaml` — engine ↔ wiki-api seam (`/api/*`)

`info.version: 0.0.1-draft`, described as "DRAFT SKELETON". Only `patchPageBlocks`, `getQuotaStatus`, and `consumeExchangeToken` are pinned (ENG-1538/M0); everything else, including export, is `x-status: draft`.

Export routes present:

```
GET /api/pages/{id}/export      operationId: exportPage
  description: FR-18 markdown + FR-38 embed-resolved text_repr; fidelity bound to fixtures/ (F6).
  x-status: draft
  params: id (path), format (query: markdown|text_repr|html)
  responses: "200": { description: "Exported document." }   ← NO response schema/body shape at all
GET /api/spaces/{id}/export     operationId: exportSpace   x-status: draft
```

### 2b. `openapi/internal/engine-contracts-internal.yaml` — the only "engine internal tier" openapi file

Single path: `GET /v1/workspaces/{id}/existence` (ADR-0015 ruling 7b, workspace existence-read for identity's orphan-sweep). **Nothing export-related.**

### 2c. `openapi/internal/knowledge-internal.yaml` — knowledge's internal step-API tier (workload-identity only)

Paths: `/internal/v1/keyword-upsert`, `/internal/v1/rebuild/{namespace,walk,index-batch,delta-repull,alias-swap,retire}`. All `x-tier: internal`; all pinned except `keyword-upsert` (draft). **None of these document how the rebuild-walk step actually fetches a page body** — the ledger only describes the step-API cursor mechanics, not the export/body-fetch leg the indexer uses underneath.

### 2d. `mcp/rest-gap-ledger.yaml` — MCP tool → REST mapping

```
tool: export_page   family: import-export
  maps_to: engine-primitives.yaml#/paths/~1api~1pages~1{id}~1export/get
  exposed_via: "engine exportPage primitive (exportService.exportPages), reachable via
                the wiki-api /api export proxy + wiki-api.yaml export verb"
tool: export_space  family: import-export
  maps_to: engine-primitives.yaml#/paths/~1api~1spaces~1{id}~1export/get
```
`mcp/in-fork-tool-surface.yaml` lists `export_page`/`export_space` under `import-export` family as fork-inherited tools.

**None of these reference `/internal/pages/{id}/export`.**

---

## 3. DRIFT FINDING (the requested known-risk check) — `/internal/pages/{id}/export` is undocumented

Current orvex-wiki branch `fix/internal-export-title-space` (HEAD `b2f60c22`) changed the engine's `internal-api.controller.ts` / `internal-api.service.ts` route **`/internal/pages/{id}/export`**, used by the **knowledge indexer**, to enrich the reply from `{text_repr}` to `{text_repr, title, space, slug_id}` — described in the commit message as "the last blocker to addressable `/v1/query` + `/v1/related` hits (amazing-MCP)".

Grepped the entire contracts repo (`openapi/`, `openapi/internal/`, `mcp/`, `events/`, `fixtures/`) for `internal/pages`, `internal-api`, and `/internal/pages/{id}/export`:

- **Zero matches.** This route does not appear in any openapi file, any internal/ tier file, any fixture, or the MCP gap ledger.
- The only export-shaped contract that exists at all is `GET /api/pages/{id}/export` in `openapi/engine-primitives.yaml` — a **different path** (`/api/` not `/internal/`), `x-status: draft`, with a bodiless `"200": { description: "Exported document." }` response (no schema, so `title`/`space`/`slug_id` cannot be "additive" against it — there is nothing to be additive against).
- Consequence: the `served-openapi-diff` drift gate (see §4) is the mechanism that would normally catch a server exposing an undocumented op — but that gate is `x-status: draft` (not wired/blocking) for every `runs_in` repo including `orvex-wiki`. So this change can land, merge, and ship with **no automated signal** that the contract is now stale against the live engine internal surface.
- This is a second, independent instance of the same class of drift the wiki-api.yaml re-ratification (§1) just fixed for the public `/v1` surface — but for the **internal** `/internal/*` engine↔knowledge seam, nobody has yet done the equivalent live-probe reconciliation.

**Recommendation surfaced by evidence, not asserted as fact:** if the knowledge indexer's consumption of `/internal/pages/{id}/export` is meant to be a first-class internal seam (like `knowledge-internal.yaml`'s rebuild step-APIs), it needs its own `openapi/internal/*.yaml` entry — currently there is no contract file positioned to own it (`knowledge-internal.yaml` only owns the knowledge-side keyword-upsert/rebuild endpoints that the *engine calls into knowledge*, not the reverse leg where knowledge/indexer calls *into* the engine for page bodies).

---

## 4. Drift-gate machinery (`gates/drift/`)

`gates/drift/gates.yaml` (FR-C16 / A-GATES) — "Definitions + reference tooling live here; each repo's CI RUNS them pinned to a contracts release tag (never floating main)."

| Gate id | Proves | `runs_in` (incl. orvex-wiki?) | x-status |
|---|---|---|---|
| `served-openapi-diff` | Each server's exposed OpenAPI surface matches its pinned spec (no undocumented/removed ops) | orvex-wiki, orvex-wiki-api, +6 others | **draft** |
| `emitted-event-validation` | Relay/publisher output validates against `events/schemas/` + FR-C8 obligations | orvex-wiki + 4 others | draft |
| `fixture-reproduction` | Exporter output byte-identical to `fixtures/markdown|text_repr` | orvex-wiki | draft |
| `sse-conformance` | FR-C10 resume/gap/filter behaviors | orvex-studio-knowledge, orvex-wiki | draft |
| `apikey-behavioural-parity` | api-key behavior vs frozen `errors/vocabulary.yaml` | orvex-wiki | draft |
| `crash-injection-replay-completeness` | Outbox loses no event across mid-write crash | orvex-wiki | draft |
| `dfm-parity` | Go `pkg/dfm` ↔ engine TS serializer round-trip `fixtures/dfm/**` | orvex-studio-lib, orvex-wiki | **active** (report-only mode) |

**Only `dfm-parity` is active** (and even that is report-only, not blocking). Every gate that would actually catch the class of drift in §3 — most directly `served-openapi-diff` — is still draft/unwired. This is a structural reason contract drift against the live wiki-api/engine surface is discoverable only by manual live-probe reconciliation (as wiki-api.yaml's 2026-07-16 re-ratification did), not by CI.

---

## 5. CloudEvents contracts touching wiki/knowledge/ai/mcp

`events/catalog.yaml` (1011 lines), status: **DRAFT**. Forward-authored (A-CATALOG): "the engine emits Redis-stream events today and the outbox → Kafka relay (D-S13, no Redis bridge) does not exist yet; the first drift-gate run against the built relay is the verification moment."

Producer: AGPL wiki engine (transactional outbox → Kafka relay, no Redis bridge — D-S13). Consumers: Studio satellites via Kafka-backed Knative Broker `studio-spine` (Triggers filter on `type`). Relay envelope pinned separately in `events/outbox-relay.yaml`; delete-propagation (ruling-7 cross-DB, idempotent-consumer + orphan-sweep backstop, CASCADE FK dropped) pinned in `events/wiki-deletes.yaml`.

**FR-C8 publisher obligations (normative, versions with the types):**
- `version_field` — every content event MUST carry the document's monotonic persisted write-commit `version`, the SAME counter FR-C1's `ifVersion` reads (D-CON-5) — never a separately-minted outbox-sequence/relay number (would split event CAS and knowledge's FR-C4 keyword-upsert CAS into incomparable version spaces, breaking knowledge A5's watermark bound). **Note:** this is the same "version" concept flagged as string-vs-integer-inconsistent on the live `/v1/wiki` surface in §1 — worth checking whether emitted events carry the string or the integer form.
- `tenant_extension` — every event MUST carry `orvextenant`.
- `cell_extension` — every event MUST carry `orvexcell` (stamped by the shared envelope helper, never hand-set; consumers fail-closed on a cell mismatch, no-op only in the `solo` sentinel cell).
- `ordering_key` — topic grammar `{domain}-events.{cell}`, `partitions: 1` (single ordered writer = atomic failover unit, rebuilt from Postgres outbox on failover, never MirrorMaker-copied).

Wiki-domain event types (`events/schemas/wiki.*.json`, 32 files) — full catalog list from `events/catalog.yaml`:

| Category | Types |
|---|---|
| Page | `wiki.page.created`, `.updated`, `.content_updated`, `.deleted`, `.moved`, `.restored`, `.purged`, `.status_changed` |
| Comment | `wiki.comment.created`, `.updated`, `.resolved`, `.deleted` |
| Attachment | `wiki.attachment.created`, `.deleted`, `.updated` |
| Space | `wiki.space.created`, `.updated`, `.deleted`, `.member_added`, `.member_removed`, `.member_role_changed` |
| Permission | `wiki.permission.changed` |
| Workspace | `wiki.workspace.created`, `.updated`, `.deleted`, `.member_added`, `.member_role_changed`, `.member_deactivated`, `.member_deleted` |
| User | `wiki.user.deleted` |

Envelope: `events/schemas/_envelope.json` (CloudEvents 1.0, ADR-0007 required orvex extensions). Each type's `data` validated by its own `events/schemas/*.json` file; profiles + type↔frame mapping in `events/PROFILES.md`.

AI/knowledge/MCP-adjacent DTOs live in `openapi/ai.yaml`, not as CloudEvents:
- `AiExport` schema (pinned, ENG-1497) — `exportId`, `status` — an **AI-generated export receipt**, unrelated to the wiki page-export drift in §3 (different concept: async job receipt vs synchronous page-body fetch). Comment in-file: "export/cap-read/spine-delete DTOs (x-owner: ENG-1497) are PINNED."
- `fixtures/ai/` golden fixtures: `cap-read.json`, `export.json`, `image.json`, `k5-answer.json`, `k5-answer-enriched.json`, `k5-answer-missing-citations.json`, `memory.json`, `page-deleted.json`, `ranked-results.json`, `space-deleted.json`, `workspace-deleted.json`.

`fixtures/knowledge-internal/` golden fixtures bound to `openapi/internal/knowledge-internal.yaml`: `rebuild-step-ack.json`, `rebuild-step-error.json`, `rebuild-step-request.json` (per its README, gate `TestRebuildStepContractGoldenRoundTrip`, ENG-1927/T7 AC9).

---

## 6. Golden fixtures bound to `wiki-api.yaml`

`fixtures/wiki-api/` (per its `README.md`): self-describing round-trip vectors keyed by `{seam, case, at:{path,method,part}, status, instance}`, validated by `tests/test_wiki_api_golden_fixtures_contract.py` (`TestWikiApiGoldenFixtures`) which resolves each fixture's schema straight from the committed OpenAPI (cross-file `$ref`s via a `referencing` registry).

Files:
`01-create-page.request.json`, `02-write-receipt.response.json`, `03-read-full.response.json`, `04-read-outline.response.json`, `05-read-block.response.json`, `06-block-patch.request.json`, `07-block-patch-receipt.response.json`, `08-version-mismatch.response.json`, `09-whoami.response.json`, `10-search.response.json`, `11-list-wiki.response.json`, `12-update-whole-doc-draft.request.json`, `13-block-string-replace-draft.request.json`, `14-blocks-batch-draft.request.json`, `15-page-blocks-batch.request.json`.

The `*-draft-*`-named fixtures (12–14) pin the **intended** shapes of not-yet-live additions (whole-doc update, block string-replace, `{loc}` blocks:batch) — i.e. these are authored-ahead-of-implementation fixtures, not recorded snapshots. **No export fixture exists in this directory** — reinforcing §3 (export was retired from the `/v1` flat-verb grammar and never re-added as a `/v1/wiki` resource-grammar operation; only the internal `/api/pages/{id}/export` and undocumented `/internal/pages/{id}/export` legs carry export today).

---

## 7. Pinned tags / versioning discipline (`CHANGELOG.md`, D-CON-1)

> "Repo-level semver is the unit of consumption (D-CON-1): one tag = one coherent contract set; consumers pin a tag and codegen from it (no floating `main`). Additive = minor; breaking = major + a documented dual-publish/deprecation window and a breaking-change notice. Per-artifact `x-status: draft|pinned` markers track readiness inside a release. Nothing in a `draft` artifact may be pinned by a consumer."

- Tags at HEAD: `v0.1.0`, `v0.1.1`, `v0.1.2`, `v0.1.3` — **no tag yet cuts the wiki-api.yaml re-ratification** described in `## [Unreleased]`. The changelog itself proposes (not self-cuts) freezing the newly-pinned wiki-api rows at a future `v0.1.4` (`test_seam_freeze` recut), noted as "proposed, not self-cut" pending a DESIGN-NOTES §11 ratify note. **Any consumer (MCP, orvex-cli, orvex-wiki-api) currently pinned to `v0.1.3` is codegen'ing from the OLD flat `POST /v1/{verb}` grammar, not the live `/v1/wiki` resource grammar** — this is itself a live drift window until v0.1.4 cuts.
- `wiki-api` is explicitly called out as "a `draft` seam OUTSIDE the frozen M0 six" — its churn needs no VERSION bump to stay self-valid, but that also means its `info.version: 0.1.0-phase0` string is decorative, not a semver contract signal.
- `/v1/openapi.json` (the live-served descriptor) is explicitly DISCLAIMED as a codegen source — "codegen sources exclusively from this pinned contracts tag (ADR-0001 D-A7 / ADR-0035), NEVER from this live descriptor (a hand-authored/live-descriptor spec is a contract-drift vector)." ADR-0035 is cited only in this one file across the repo.
- `mcp/rest-gap-ledger.yaml`'s 15 `maps_to` pointers were re-pointed in the same Unreleased batch from the retired flat verbs to the live resource-grammar ops; dispositions and 73/73 counts are asserted unchanged, gated by `TestMcpRestGapLedgerContract`.

---

## 8. Summary of drift observed (risk register)

| # | Drift | Evidence | Severity signal |
|---|---|---|---|
| 1 | `/internal/pages/{id}/export` (engine, just changed on `fix/internal-export-title-space`) has **zero** contract representation anywhere in `orvex-studio-contracts` | grep across `openapi/`, `openapi/internal/`, `mcp/`, `events/`, `fixtures/` — no hits | High — this is exactly the "known risk: contracts stale vs live grammar" the task named, caught live |
| 2 | `GET /api/pages/{id}/export` (the one export contract that does exist) has a bodiless `200` response — no schema for `text_repr`/`title`/`space`/`slug_id` to be additive against | `openapi/engine-primitives.yaml` lines 138–148 | Medium — the "additive, non-breaking" claim in the b2f60c22 commit message can't be checked against a schema that doesn't specify fields |
| 3 | `served-openapi-diff` gate (the mechanism that would catch #1 automatically) is `x-status: draft`, not wired into orvex-wiki CI | `gates/drift/gates.yaml` | High (structural) — nothing currently stops this class of drift from recurring |
| 4 | Live `/v1/wiki` resource grammar re-ratified 2026-07-16 (HEAD) but **not yet tagged** — latest tag `v0.1.3` still reflects the old retired flat-verb grammar | `CHANGELOG.md` `## [Unreleased]`, `git tag` | Medium — any tag-pinned consumer is behind HEAD's own contract truth |
| 5 | `version` field is a string on `/v1/wiki` read/write receipts but an integer CAS token on block-patch `If-Match`, AND CloudEvents' `version_field` obligation says events carry "the same counter" — worth verifying which form is actually emitted | `openapi/wiki-api.yaml` VERSION SEMANTICS header; `events/catalog.yaml` obligations.version_field | Low/Medium — flagged in-contract as known, not hidden, but cross-references two different files that don't cite each other |
