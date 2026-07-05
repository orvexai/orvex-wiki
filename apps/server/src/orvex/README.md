# `apps/server/src/orvex/` — the additive Orvex engine modules

**Status: compiling skeleton (scaffold).** Every module here is a structural
seam for the orvex-wiki TARGET architecture (`PRD: orvex-wiki` / `Architecture:
orvex-wiki`). The bodies are TODO stubs; wiring the real behaviour is the
fold-in program (`qJojHbWJni`). Until then the deployed engine stays **vanilla
Docmost v0.95.0**.

## Prime directive — never break the vanilla boot

- This whole tree is **additive**. It never modifies upstream Docmost files.
  The only upstream touch is a single **inert** `OrvexRootModule.register()`
  import in `app.module.ts` (the A-THIN 13-row allow-list's one `app.module.ts`
  edit).
- `OrvexRootModule.register()` is **off by default**: it loads the submodules
  only when `ORVEX_MODULES_ENABLED=true`. With the flag unset (the deployed
  default) it returns an empty module, so **no orvex provider is ever
  constructed** and runtime behaviour is byte-for-byte vanilla.
- No file here imports `@docmost/*` or `ee/*` (the AGPL import-guard + the FR-30
  divergence gate). The coupling to the engine is a future, explicit seam, not a
  tangled import — so importing upstream Docmost stays a mechanical
  overlay-rebase.

## The seams (one dir per primitive the thin engine keeps)

| Dir | Primitive | PRD / ADR |
| --- | --- | --- |
| `config/` | product-family-agnostic endpoint seam (`ORVEX_<SVC>_URL`) + cell contract | A-PORTABLE / A-CELL |
| `page-meta/` | the `orvex_page_meta` side table (stamps off upstream `pages`) | FR-W3 / A-CELL rule #7 |
| `quota/` | write-chokepoint quota enforcement vs billing entitlements | F-QUOTA / A-QUOTA / A-QUOTA-HARDENING |
| `outbox/` | transactional outbox + relay → Kafka studio-spine (direct, no bridge) | FR-W5 / A-EVENTS |
| `cell/` | own small CloudEvents envelope builder (`orvexcell` ext, wire names) | A-CELL rule #6/#2 / A-SEAMS |
| `api-key/` | clean-room AGPL api-key rebuild (off `ee/api-key`) | FR-W7 / A-AUTH |
| `session-mint/` | consume identity exchange token → mint session (FR-15) | FR-W6 / A-AUTH |
| `boot/` | CLOUD-clean boot decouple helper (no `process.exit(1)`) | FR-W20 / A-BOUNDARY |
| `migrations/` | the separate `orvex_migrations` ledger + advisory-lock runner | FR-W22 / A-IMPORT |
| `types/` | the single declaration-merge file for additive columns | A-BOUNDARY type hygiene |

## What is intentionally NOT here yet (documented TODO stubs)

- The `page.service.ts` / `collaboration.util.ts` chokepoint + quota pre-check
  hook, the `page.controller.ts` verdict marshal, the RLS GUC hook, the
  `jwt.strategy.ts` api-key repoint, the `domain.middleware.ts` cell assertion,
  and the `app.module.ts` CLOUD-boot decouple are **inline allow-list edits** to
  upstream files. They are left as documented stubs here rather than wired,
  because touching the vanilla boot path is out of scope for the skeleton.
