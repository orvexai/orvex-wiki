# `orvex/migrations/` — the separate `orvex_migrations` ledger

The engine's additive schema (`orvex_page_meta`, `orvex_outbox`, quota tables,
RLS policies) is migrated through a **separate ledger**, NOT the upstream Kysely
`kysely_migration` chain (FR-W22 / A-IMPORT).

## Why a separate ledger

- **Never copy the fork's upstream-chain migrations onto v0.95.** Kysely tracks
  migrations by **filename**; the fork's two *renamed* upstream migrations
  (`page-transclusions`, `labels`) are byte-identical to originals v0.95 already
  applied under their original names, so the renamed copies re-run
  `CREATE TABLE` → duplicate-object failure. The dead
  `r5-pages-tsv-keyword-fastlane` no-op is dropped too.
- Genuinely-additive orvex migrations are **appended after the v0.95 tip** in
  this ledger, authored idempotently, so an upstream overlay-rebase never
  collides with orvex schema.

## Advisory-lock guard (FR-W22)

`database.module` runs `migrateToLatest` on boot for every `NODE_ENV` except
`test`, and the api role runs multiple replicas — concurrent boots race the
shared migration chain (crashloop + possible half-apply). The orvex runner takes
a `pg_advisory_xact_lock` so replica boots serialise, or migration moves
out-of-band to an ArgoCD PreSync Job.

## Status

SCAFFOLD. `orvex-migrator.service.ts` is the runner stub; it is **not wired to
the vanilla boot path** (that would change boot behaviour). Migration files land
in `./ledger/` as `NNNN-<name>.ts`, appended after the v0.95 tip.
