# TENANT_MOVE — cross-cell tenant-move contract (orvex-wiki engine)

> Cell-contract rules **#10** (coverage-checked store inventory — this file) and
> **#11** (mandatory `Idempotency-Key` on every step). The store-inventory table
> below is **machine-checked** by `scripts/ci/tenant-move-coverage-check.mjs`
> (CI check "Tenant-Move Coverage (cell-lint rule #10)") against the manifest
> DTO's declared shape — a store present in one place and missing from the
> other fails CI.

## The typed step-API

`POST /api/orvex/tenant-move/{step}` — four typed lifecycle steps, in order:

| Step | Route | Purpose (once wired) |
| -- | -- | -- |
| quiesce | `POST /api/orvex/tenant-move/quiesce` | Pause the tenant's writes on the source cell |
| export | `POST /api/orvex/tenant-move/export` | Serialize every store in the manifest from the source cell |
| import | `POST /api/orvex/tenant-move/import` | Materialize the serialized stores on the target cell |
| activate | `POST /api/orvex/tenant-move/activate` | Cut routing over and resume writes on the target cell |

Every step takes a `TenantMoveManifest` body (below) and **requires an
`Idempotency-Key` header** (cell-contract rule #11 — 421-/retry-driven replays
must be safely idempotent once the step logic is real). A missing/blank header
is a typed `400 Bad Request` — validated **before** anything else in each
handler.

A **different, already-real operation** shares the route root: the bare
`POST /api/orvex/tenant-move` (no `/{step}` suffix) is the ENG-1578 REGISTRY
cell-binding move — it delegates to identity's real `Registry.Move` and is NOT
part of this content-pipeline contract.

### Day-1 scope — stated plainly (CS §11)

The four step bodies are **deliberate `501` stubs today**: each returns the
typed sentinel `{code: 'NOT_IMPLEMENTED', operationId: 'orvexTenantMove…',
marker: 'ORVEX_NOT_IMPLEMENTED'}` after header + DTO validation. The typed
contract (routes, manifest shape, mandatory header, validation ordering) is
day-1 and non-retrofittable; the step LOGIC is explicitly future work. Nothing
in this document claims otherwise.

## The manifest

`TenantMoveManifest` (`apps/server/src/orvex/http/dto/tenant-move-manifest.dto.ts`,
field-for-field mirror of `orvex-studio-contracts/schemas/org-move-manifest.schema.json`,
snake_case):

```
{
  schema_version: number ≥ 1,
  tenant_id:      uuid,
  stores:         [{ name, kind: 'postgres'|'redis'|'kafka'|'s3'|'external', row_estimate? }],
  s3_prefixes:    [{ bucket, prefix }],
  cursors:        [{ source, position }]
}
```

## Store inventory (rule #10 — machine-checked)

Everything this engine owns for one tenant, keyed on `workspace_id`
(= `tenant_id`, the RLS tenant key — ENG-2502). This table IS the coverage
contract; the CI check parses the rows between the markers.

<!-- tenant-move-inventory:begin -->
| Name | Kind | Tenant-scoped pattern | Move strategy |
| -- | -- | -- | -- |
| workspaces | postgres | `workspaces.id = {tenant_id}` (the tenant root row, incl. `status`, `principal_kind`/`principal_id`) | export/import |
| users | postgres | `users.workspace_id = {tenant_id}` (members + auth_accounts linkage) | export/import |
| spaces | postgres | `spaces.workspace_id = {tenant_id}` | export/import |
| pages | postgres | `pages.workspace_id = {tenant_id}` (upstream content rows) | export/import |
| orvex_page_meta | postgres | 1:1 sidetable of `pages` (join via `pages.workspace_id`; carries `version`, `content_hash` — FR-W3/ENG-2480 placement, live) | export/import |
| comments | postgres | `comments.workspace_id = {tenant_id}` | export/import |
| page_history | postgres | `page_history.workspace_id = {tenant_id}` (version history) | export/import |
| attachments | postgres | `attachments.workspace_id = {tenant_id}` (blob METADATA rows; blobs themselves are the s3 row below) | export/import |
| orvex_event_outbox | postgres | `orvex_event_outbox.workspace_id = {tenant_id}` (unrelayed rows move; relayed rows are history) | export/import + cursor |
| attachment blobs | s3 | `{tenant_id}/…` object prefix (`{tenant_id}/files`, `{tenant_id}/avatars`, `{tenant_id}/workspace-logos`, `{tenant_id}/space-logos`, `{tenant_id}/chat-files` — see `attachment.utils.ts`) | s3 prefix copy (declared in `s3_prefixes[]`) |
| quota fast-counters | redis | `quota:{resource}:{tenant_id}` (ENG-2490 O(1) pre-flight counters) | re-seed from Postgres truth on the target cell (declared for completeness; derivable) |
| suspension status | redis | `suspension:{tenant_id}` (ENG-2505 push-invalidated lockout state) | re-derive from `workspaces.status` on the target cell (derivable) |
| entitlement projection | redis | `entitlement:org:{tenant_id}` (300s-TTL billing projection) | re-derive from orvex-studio-billing on the target cell (derivable) |
| outbox relay cursor | kafka | relay watermark over `orvex_event_outbox` (`relayed_at` — rows publish to studio-spine as `wiki.*` CloudEvents) | carried in `cursors[]` as `{source: 'orvex_event_outbox', position: <last-relayed watermark>}` |
<!-- tenant-move-inventory:end -->

Notes:

- **Derivable Redis state** (`quota:*`, `suspension:*`, `entitlement:*`) is
  declared so no store is silently unaccounted for (rule #10's whole point);
  its move strategy is re-derivation from durable truth, not byte copy.
- The Postgres set moves under the tenant's `workspace_id` foreign keys —
  RLS (ENG-2502) enforces the same boundary the export must respect.
- Kafka itself is a shared cell bus; what is tenant-scoped is the OUTBOX
  CURSOR — the position up to which this tenant's rows were already relayed —
  so the target cell neither replays nor drops events.

## Ownership boundary

This engine never mutates the global tenant→cell registry — identity is the
sole writer (PO ruling 13); the registry move is the bare `POST` above. Billing
(Stripe) state lives entirely in orvex-studio-billing and is NOT an engine
store (FR-W21/ENG-2504 severance).
