# Evidence map — orvex-wiki (thin AGPL engine) @ HEAD

Repo: `/home/daniel/repos/orvex-wiki`, branch `fix/internal-export-title-space`.
HEAD at time of mapping: `5572beeb` (docs/po-decisions log). Most recent
FEATURE commits: `b2f60c22` (internal export enrichment), `91b3b115`
(amazing-MCP /v1 primitives), `aacabb07` (merge of same).

Legend: **REAL** = working code, exercised by passing unit/e2e specs, wired
into a live route. **STALE-DOC** = contract/checklist artifact not
regenerated after code went real. **PENDING** = genuinely not implemented
(still the 501 sentinel). **NOT FOUND** = claimed/expected artifact does not
exist in this repo at HEAD.

## 1. `apps/server/src/orvex/*` modules actually present

All of the following are real directories with source + specs (not empty
scaffolds); listed with their principal responsibility:

| Module | Responsibility | Status |
|---|---|---|
| `throttle/` | workspace + MCP-tool throttler configs/guard | REAL |
| `transclusion-safeguard/` | blocks deleting a page still transcluded elsewhere | REAL |
| `metrics/` | `/metrics` machine surface + auth | REAL |
| `mail/` | SMTP probe/admin | REAL |
| `session-mint/` | exchange-token verifier (identity → engine session) | REAL |
| `config/` | `OrvexConfigService`/module (env-driven) | REAL |
| `events/outbox/` | outbox-writer + relay + Kafka publisher adapter/port | REAL |
| `page-visuals/` | page-visuals service/controller | REAL |
| `llms/` | `orvex-llms` controller/service (`/llms.txt`-family, gated by `OrvexModulesEnabledGuard`) | REAL |
| `settings/` | workspace settings DTO/merge, SSO enforcement helpers | REAL |
| `page-blocks/` | **apply-ops / apply-doc write primitives** (see §2) | REAL |
| `entitlement/` | quota/entitlement service, billing port, chokepoint integration specs | REAL |
| `secret/` | secret-consumer-disposition | REAL (narrow) |
| `not-implemented.ts` | the `ORVEX_NOT_IMPLEMENTED` 501-sentinel contract (still in active use for genuinely-pending ops) | REAL |
| `mcp-surface-shed-at-parity.spec.ts` | DoD gate proving **zero MCP transport in the engine** (`packages/orvex-mcp` absent, `orvex/mcp` absent, no `@Controller('mcp')`) — engine-leg of the MCP shed to the satellite `orvex-studio-mcp` | REAL, passing gate |
| `page-metadata/` | ratify-token, force-supersede, page-meta drift/verify, promote/supersede controllers | REAL |
| `attachments/` | storage admin controller, S3 probe factory | REAL |
| `obs/` | OTel tracing bootstrap/interceptor, Kysely span plugin, correlation hook, span redaction | REAL |
| `enforce-sso/` | workspace-update interceptor + SSO check service | REAL |
| `audit/` | audit-actor resolver | REAL |
| `http/` | quota controller, tenant-move controller/service, source-offer controller, identity-registry client, global-prefix exclude | REAL |
| `extensions/` | migrator module/service/registry (concurrency-tested) | REAL |
| `health/` | health probes/service/controller | REAL |

No `apps/server/src/orvex/*` subtree inspected was an empty 501 skeleton —
the skeleton pattern (`not-implemented.ts` + `x-classification: noop-501`)
is applied at the **operation** level inside otherwise-real modules (e.g.
`orvex-quota.controller.ts`, `orvex-tenant-move.controller.ts` still contain
`// ORVEX_NOT_IMPLEMENTED: orvexGetQuota` etc. — see §4).

## 2. `/internal/*` endpoints — `apps/server/src/core/internal-api/`

Controller: `internal-api.controller.ts` (`@Controller('internal')`, excluded
from the `/api` global prefix, guarded by `InternalApiAuthGuard` — shared
bearer token, NOT `JwtAuthGuard`). All handlers `@SkipTransform()` (bare JSON,
no `{data,success,status}` envelope).

| Route | Verdict | Response shape |
|---|---|---|
| `POST /internal/principals/provision` | REAL | `{user_id, created, workspace_created}` |
| `POST /internal/acl/filter` | REAL | `{allowed}` (per-user CASL+page-permission intersection) |
| `GET /internal/pages/{id}/export` | **REAL, just enriched (`b2f60c22`, 2026-07-16)** | `{text_repr, title, space, slug_id}` — `title`/`space`(slug)/`slug_id` added so a knowledge hit is chainable to `/s/{space}/p/{slug_id}`. Previously only `text_repr`. |
| `GET /internal/pages/{id}/resolve` | REAL | `{title, content}` (raw ProseMirror doc, for `dfm.PmToDfm`) |
| `GET /internal/settings/ai-search` | REAL | `{enabled}` (`workspaces.settings.ai.search`) |

Backing service `internal-api.service.ts`: workspace-scoped tenant isolation
via `loadPageInWorkspace` (foreign-workspace id → typed 404, never leak);
`exportPage` now does one extra `SpaceRepo.findById` for the slug, degrading
to `space: null` (never a fabricated slug) if unresolvable.

## 3. `/internal/*`-adjacent write/read primitives (apply-ops family)

Controller: `apps/server/src/orvex/page-blocks/orvex-apply-ops.controller.ts`
(`@Controller('orvex/pages')`, mounted under `/api` via `OrvexPageBlocksModule`
→ effective route `POST /api/orvex/pages/:pageId/apply-ops`). Guarded by
`OrvexModulesEnabledGuard` + `JwtAuthGuard` (flag off → 404 byte-parity with
vanilla Docmost).

| Primitive | Route | Ticket | Status |
|---|---|---|---|
| Ordered PM-JSON batch op apply (append/prepend/insert-at/insert_before/replace-at/move/patch-by-id/delete-by-id/patch-string/string-replace) | `POST :pageId/apply-ops` | ENG-1652, amazing-MCP `91b3b115` | **REAL** — atomic multi-op tx, CAS on `ifVersion` → `orvex_page_meta.version`, idempotency-key claim AFTER validation (no false-success on malformed batch), settled read-after-write envelope `{version, settledUpdatedAt, contentHash}` |
| Whole-document apply (replace/append/prepend the root doc of an existing page) | `POST :pageId/apply-doc` | amazing-MCP `91b3b115` | **REAL** — `ApplyOpsService.applyDocument`, same integer CAS + idempotency, shares `commitWorkingDoc` tail with `apply-ops` so the two write shapes can't drift. Distinct `apply-doc` idempotency namespace. Backs wiki-api's `PUT /v1/wiki/{loc}` (save_page). |
| Server-side block string-replace w/ ambiguity guard | op `string-replace` inside the batch grammar | amazing-MCP `91b3b115` | **REAL** — `NO_REPLACEMENT` on 0 matches, `AMBIGUOUS_OLD` on >1 without `replaceAll`, block-scoped only (blockId required), never a silent first-match |
| Integer `meta.version` CAS | `apps/server/src/core/page/if-version.util.ts` + `PageRepo.casIncrementMeta` (`database/repos/page/page.repo.ts:215`) | ENG-1413 | **REAL** — `isIntegerVersion`/`toIntegerVersion` do the pure pre-check (fast-fail before idempotency claim); `casIncrementMeta` is the atomic `UPDATE … WHERE version = ?` store-tier guarantee (also used by `PageService.update` at `core/page/services/page.service.ts:555`, unifying the write paths) |
| Version-semantics unification | `page.controller.ts` (update/upsert), + specs `page.controller.version-field.spec.ts` | amazing-MCP `91b3b115` | **REAL** — the integer `orvex_page_meta.version` is now the sole `version` field on update AND upsert receipts (create/info/apply-ops already had it) |
| tree 502 fix | `core/page/dto/sidebar-page.dto.ts` | amazing-MCP `91b3b115` | **REAL** — `spaceId` empty-string normalized to `undefined` before `@IsUUID()` (wiki-api's tree path sends `spaceId:""`) |
| drift 502 fix | `orvex/page-metadata/orvex-page-meta-drift.controller.ts` (new) | amazing-MCP `91b3b115` | **REAL** — the `/api/orvex/page-meta/{verify-context,stamp,stamps}` routes literally didn't exist before (`PageMetaVerificationService` had the stamp logic, ENG-1379, but no HTTP surface); now wired, `@SkipTransform()` bare-shape for wiki-api's `DriftClient` |

**Explicit caveat from the commit itself (`91b3b115` message, verbatim):**
"Unit-tested (59 passing across the touched suites); **live end-to-end is
deploy-pending**." — i.e. REAL-IN-CODE, not yet REAL-IN-PRODUCTION as of this
mapping. No separate evidence in this pass confirms a live deploy of this
exact SHA (matches the "certified ≠ current" pattern flagged in memory —
treat this commit's claims as code-verified only, not yet behaviorally
verified in a running environment).

## 4. Genuinely-pending 501 primitives (contract-confirmed)

`contracts/openapi.yaml` still declares these `x-classification: noop-501`,
and the corresponding controllers still throw `OrvexNotImplementedException`
(`ORVEX_NOT_IMPLEMENTED` sentinel):

| operationId | Route | Ticket ref | Handler file |
|---|---|---|---|
| `orvexGetQuota` | `GET /api/orvex/quota` | FR-W15 | `orvex/http/orvex-quota.controller.ts:20` |
| `orvexSessionExchange` | — | FR-W6 | (session-mint module — check for later real wiring; not verified real in this pass) |
| `orvexTenantMoveQuiesce` | tenant-move step 1 | A-MOVE | `orvex/http/orvex-tenant-move.controller.ts:96` |
| `orvexTenantMoveExport` | tenant-move step 2 | A-MOVE | `orvex-tenant-move.controller.ts:106` |
| `orvexTenantMoveImport` | tenant-move step 3 | A-MOVE | `orvex-tenant-move.controller.ts:116` |
| `orvexTenantMoveActivate` | tenant-move step 4 | A-MOVE | `orvex-tenant-move.controller.ts:126` |

Real from day one (no 501), per the checklist: `orvexSourceOffer` (FR-W19,
AGPL §13 written source offer, real `{sha, sourceRepo}` from env) —
`orvex/http/orvex-source.controller.ts`.

## 5. ⚠️ CONTRACT/CHECKLIST DRIFT — `orvexApplyOps` is stale in the docs

`docs/delivery-checklist.md` (generated, "do NOT hand-edit") **still lists
`orvexApplyOps` as an unchecked `- [ ]` noop-501 item**, and
`contracts/openapi.yaml` **still carries `x-classification: noop-501` and a
501-only description** for `POST /api/orvex/pages/{pageId}/apply-ops`
(lines 176–226).

This is FALSE as of HEAD: `orvexApplyOps` went real in `7487fc9d`
("feat(eng-1652): real apply-ops HTTP write primitive") and was extended in
`91b3b115`. Neither `contracts/openapi.yaml` nor `docs/delivery-checklist.md`
has been touched since `5f0afcdc` (an unrelated tenant-move commit) — the
regeneration script (`scripts/orvex-marker-check.sh --checklist`) was not
re-run after the apply-ops delivery landed.

**Net: trust the code (`orvex-apply-ops.controller.ts` /
`apply-ops.service.ts`), not the checklist/contract file, for
`orvexApplyOps`'s status.** This is exactly the certified≠current failure
mode already flagged in project memory (`certified-is-not-current.md`) —
logging it here as a fresh, concrete instance for this evidence pass.

## 6. `packages/@orvex/*`

| Package | Contents | Status |
|---|---|---|
| `packages/@orvex/dfm` | `pm-to-dfm.ts`, `dfm-to-json.ts`, `registry.ts`, `errors.ts`, `types.ts` + tests/fixtures, built `dist/` present | REAL — the DFM (Docmost-flavored-markdown?) transform library backing `internal/pages/{id}/resolve`'s raw-PM contract and knowledge's `dfm.PmToDfm` consumer |
| `packages/@orvex/extensions` | `orvex-migration-provider.ts` (+ spec), `orvex-migrations/`, `page-metadata/`, built `dist/` present | REAL — migration registry/provider package |

(Non-`@orvex` packages present but out of scope: `packages/ee`,
`packages/base-formula`, `packages/editor-ext`.)

## 7. The "13-row upstream inline-edit allow-list" — NOT FOUND / NOT YET REAL

File exists: `patches/inline-edit-allowlist.json` — but its actual content
at HEAD is:
```json
{
  "pinnedUpstreamSha": null,
  "entries": []
}
```
Zero rows, not 13. Design doc `docs/design/patches-drift-ci-design.md` (§4,
line 257) makes this **deliberate, not a placeholder-to-forget**: activating
CI enforcement with a real `pinnedUpstreamSha` over an empty `entries` list
would red-gate the whole repo, because years of legitimate un-tracked
upstream-file divergence already exist. `check-patches.mjs` treats
`pinnedUpstreamSha: null` as "allow-list not yet activated" and exits 0.
Backfilling `entries` (to whatever count, "13" not evidenced anywhere in
this repo) is an explicit **out-of-scope follow-up ticket** per that same
design doc (§4/§8, "Auditing/back-filling the allow-list…").

**Verdict: the 13-row allow-list is not present at HEAD in any form — the
allow-list mechanism is scaffolded and inert (0 entries, unpinned).** Any
claim elsewhere of a populated/13-row allow-list should be treated as
either aspirational, from a different repo/branch, or stale.

## 8. Contracts / checklist snapshot (for cross-reference)

- `contracts/openapi.yaml` — present, structured OpenAPI with
  `x-classification: noop-501` markers per pending operation and a
  `NotImplementedError` schema (`{code, operationId, marker}`).
- `docs/delivery-checklist.md` — generated from the contract by
  `scripts/orvex-marker-check.sh --checklist`; 20 lines; 7 unchecked
  (`orvexApplyOps` [STALE — see §5], `orvexGetQuota`, `orvexSessionExchange`,
  4× tenant-move steps), 1 checked (`orvexSourceOffer`).

## 9. Summary — REAL vs PENDING at HEAD

**REAL and wired:**
- `/internal/*` full surface (provision, acl/filter, export [enriched], resolve, ai-search)
- `/api/orvex/pages/:id/apply-ops` (atomic multi-op batch incl. string-replace)
- `/api/orvex/pages/:id/apply-doc` (whole-document replace/append/prepend)
- Integer `meta.version` CAS end-to-end (`if-version.util.ts` + `casIncrementMeta`), unified across create/info/update/upsert/apply-ops
- tree 502 fix (empty-string spaceId normalization)
- drift 502 fix (`OrvexPageMetaDriftController` + verify-context/stamp/stamps)
- MCP transport fully absent from the engine (shed complete, gate-enforced by `mcp-surface-shed-at-parity.spec.ts`)
- `@orvex/dfm`, `@orvex/extensions` packages

**PENDING (still 501, contract-confirmed):**
- `orvexGetQuota`, `orvexSessionExchange`, `orvexTenantMoveQuiesce/Export/Import/Activate`

**STALE DOCS (code ahead of the artifact):**
- `contracts/openapi.yaml` + `docs/delivery-checklist.md` both still mark `orvexApplyOps` as noop-501 — false, needs regeneration

**NOT FOUND / NOT REAL:**
- "13-row upstream inline-edit allow-list" — the allow-list file exists but is empty (`entries: []`, `pinnedUpstreamSha: null`) and deliberately inert pending a follow-up backfill ticket

**Unverified in this pass (flag, don't assert):**
- Whether `91b3b115`'s primitives are actually deployed/live anywhere (commit message itself says "live end-to-end is deploy-pending"); no ArgoCD/live-probe check was run in this mapping pass
