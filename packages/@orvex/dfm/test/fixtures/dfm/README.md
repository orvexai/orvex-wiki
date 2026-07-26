# DfM round-trip fixtures — the `pkg/dfm` parity corpus (FR-C20 / A-DFM)

Authored **ProseMirror-JSON ↔ DfM** pairs, paired by case name
(`<case>.pm.json` ↔ `<case>.dfm.md`). This is the **single canonical**
parity corpus (ENG-1598 AC7 — folds the former `packages/dfm/corpus/**`,
ENG-1393, in here; that directory is retired) the family's **clean-room** Go
serializer `orvex-studio-lib/pkg/dfm` (shared by wiki-api and the Orvex CLI)
is proven against, and that the TS `@orvex/dfm` package in this repo is
proven against from its side (`packages/dfm/src/__tests__/golden-corpus.spec.ts`)
— **equivalence flows through these fixtures, never through shared code**
(D-CON-8).

Every pair is **authored from the documented ProseMirror schema + the
engine's published block-schema catalog (`GET /api/schemas/blocks`)** —
never an engine-output snapshot, and never derived by reading or porting
`@docmost/editor-ext` (NFR-C7 clean-room; the `gates/agpl-import/` guard
makes the fast path the blocked path). A wrong fixture is a contract bug,
fixed by revision against the catalog.

## Layout

```
fixtures/dfm/
  manifest.json    the coverage manifest — node/mark registry lists, the
                    live embed-catalog enumeration, mentions, exclusions
  nodes/            the 15 registered @orvex/dfm PM node types (first-class
                    DfM syntax), + extra cases (e.g. table-cell-marks)
  marks/            the 12 registered @orvex/dfm PM mark types
  opaque/           reference opaque-fence exemplars (excalidraw, drawio) —
                    synthetic, never-registered type names exercising the
                    reference-fence path in isolation from the live catalog
  embeds/           the 22 live engine catalog types with NO first-class DfM
                    shape yet — each an authored opaque-fence fixture
  mentions/         both mention formats (mention-slug, mention-label)
```

## Coverage count (AC3 — reconciled 2026-07-08)

The authoritative count is **24**, live-enumerated from the engine's
`GET /api/schemas/blocks` registry (`apps/server/src/orvex/page-blocks/handlers/*.ts`,
cross-checked against `schemas-catalog.spec.ts`'s `EXPECTED_SCHEMA_TYPES`).
This supersedes every prior number in circulation (this README's former
"21 post-Linear-removal", PO Q21's "31", ENG-1465's "~25",
doc-session-policy's "≈28") — those were estimates made before the catalog
was live-enumerated; **24 is the number to cite going forward**.

Of the 24: **2** (`table`, `callout`) already have first-class,
non-opaque DfM syntax and are covered by `nodes/table.*` and
`nodes/callout.*`. The remaining **22** have no first-class DfM shape yet
(pending per-type handlers, ENG-1465) and are covered as documented
opaque-fence fixtures under `embeds/`.

- text marks, headings, lists, blockquotes, callouts, code blocks
- tables incl. **table-cell marks** (`nodes/table-cell-marks.*`)
- both **mention formats**: `[[slugId]]` (`mentions/mention-slug.*`,
  `entityType: "page"`) and `@label` (`mentions/mention-label.*`,
  `entityType: "user"`) — both round-trip through the inline `{dfm:BASE64}`
  atom fence (`@orvex/dfm`'s generic unregistered-inline-atom path); the
  slug/user distinction lives in the node's own `attrs`, not a second fence
  format.
- **opaque/atom nodes** — drawio, excalidraw, mermaid, and every other
  catalog embed type without first-class DfM — round-trip **byte-identical**
  via the block-level `:::dfm-opaque type=<T> id=<id>\n:::` fence (the
  reference form this package actually implements; the CAS body resolves
  from the base document via `reattachOpaqueRefs`, never an inlined
  base64/summary payload for block-level opaques).
- **Linear is fully absent (D-S11)** — zero `linear_*` fixtures anywhere in
  this corpus, full stop. (The prior "legacy `linear_*` round-trip as
  opaque-preserve" line here was stale: `handlers/linear.ts` is deliberately
  never ported/imported into the engine's schema registry — see
  `page-blocks.module.ts` — so there is no `linear_*` catalog type left to
  preserve, opaquely or otherwise. D-S11 is a full drop, not a
  preserve-as-opaque carve-out.)

## Rule

A new engine block type requires a fixture-pair PR **here first**, before
either serializer ships it (contract-first, enforced by the `dfm-parity`
drift gate).

## Status

**Full catalog (v0.3, ENG-1598).** The `dfm-parity` gate definition
(`gates/drift/gates.yaml`) is flipped `x-status: draft` → `active` +
`x-mode: report-only` (FR-C16 / OQ-C4 — wired report-only first, blocking
later); the reference byte-compare tooling lives at
`gates/drift/dfm-parity-check.sh`. Execution of the gate inside
`orvex-studio-lib` CI and `orvex-wiki` CI (the two `runs_in` legs) is
tracked by those repos, not owned here — this repo's obligation (the
corpus + the reference tooling + the TS-side proof) is complete as of this
revision.
