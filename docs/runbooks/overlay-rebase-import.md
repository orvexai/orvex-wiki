# Overlay-rebase upstream import runbook (ENG-2478, FR-W23/FR-W24)

The gated, ordered procedure for importing a new upstream Docmost tag into
this fork. It is a **gated sequence, not a best-effort checklist**: a stage
that cannot complete STOPS the import and names itself — the run never
silently proceeds to deploy past a failed stage.

The dry-run harness (`scripts/dry-run-overlay-import.mjs`) walks the six
stages against committed fixture inputs (hermetic — a committed fixture tree
stands in for the new tag; no live fetch, no live deploy) and enforces the
stop-on-failure rule mechanically. The real import follows the same six
stages with real inputs.

## The six stages (fixed order — FR-W23)

1. **pull-tag** — fetch the new upstream tag into the pinned-upstream ref
   (the same `upstream` remote + ref machinery `scripts/check-patches.mjs`
   already owns; the fork's working base advances to the new tag's tree).
2. **replay-patch-set** — re-apply the fork's divergence on top of the new
   tag, bounded to the frozen 13-row allow-list (`fr30/allowlist.json`) plus
   the 15-item hardening class (`docs/runbooks/hardening-allowlist.json`).
   The **cosmetics class is explicitly NOT re-applied** (see below).
3. **regenerate-db-types** — regenerate `db.d.ts` verbatim from the new
   tag's schema (never hand-edited; a hand edit here is divergence the FR-30
   gate will catch).
4. **append-orvex-migrations** — re-append the fork's `orvex` migrations
   AFTER the new tag's migration tip (append-only ordering; ENG-2479's
   boot-migrate ledger rules govern execution).
5. **seam-contract-tests** — run the seam contract tests + the DfM golden
   fixtures; any red here stops the import before the gate stage.
6. **fr30-divergence-gate** — run `node scripts/check-fr30-divergence.mjs`
   (ENG-2477): the weighted hot-file budget must pass with every touched
   upstream file on the 13-row allow-list or recognised via a hardening
   anchor.

**deploy** — a human/orchestrator-gated action AFTER the six stages; the
dry-run harness stops short of it by construction and only reports that the
sequence reached the deploy gate.

## The three change classes on import

| Class | Ledger | On import |
| -- | -- | -- |
| 13-row allow-list | `fr30/allowlist.json` (`class: "allowlist"`) | Replayed in stage 2; budgeted by weighted conflict-hunks |
| 15-item correctness hardening | `docs/runbooks/hardening-allowlist.json` (`class: "hardening"`) | Replayed in stage 2; each item recognised by the FR-30 gate via its upstream anchor |
| Cosmetics (named, NOT applied) | none — listed here only | **Never re-applied.** Swagger tags, log-level tuning (owned by env vars instead), micro-fixes. The dry-run's stage-2 replay explicitly skips any cosmetics-tagged change. |

## Hardening-ledger validation

`node scripts/dry-run-overlay-import.mjs --validate-ledger` validates the
15-item ledger against the current tree: exactly 15 items, every item's
anchor path exists and contains its recorded marker. A tag bump that
refactors an anchored site fails this validation loudly, naming the item —
the anchor is then re-recorded consciously, never silently dropped. This
validation also runs on every push via the "Hardening Allowlist Class
Coverage" CI job, catching anchor drift early rather than at the next
import.

Two anchors carry an interpretive mapping, recorded here for honesty rather
than silently anchored: **unique-slug retry** anchors to the three-tier
idempotent upsert lookup in `page.service.ts` (no standalone slug-retry loop
exists at HEAD — the lookup IS the retry-safety mechanism), and **FK/query-
path index migrations** anchors to the api-key hash-lookup index migration
as the class representative (the fork's index hardening ships as individual
migrations).

## Cross-references

- FR-30 gate + 13-row ledger: `scripts/check-fr30-divergence.mjs`,
  `fr30/allowlist.json` (ENG-2477)
- Patches-drift (context drift of declared edits — a different question):
  `scripts/check-patches.mjs`, `docs/design/patches-drift-ci-design.md`
  (ENG-1649)
- Migration append rules: ENG-2479 (boot-migrate advisory lock +
  `orvex_migrations` ledger)
