# @orvex/dfm

Clean-room **AGPL** TypeScript twin of the DfM serializer (A-DFM / FR-W18).

DfM ("Docmost-flavored Markdown") is the durable on-disk form of a wiki page.
This package is `ProseMirror-JSON ↔ DfM`:

- `pmToDfm(doc)` — serialize a ProseMirror document to DfM text.
- `dfmToJson(dfm)` — parse DfM text back to ProseMirror JSON.

The engine's **future write path** imports this package. Closed satellites use
the Go twin (`orvex-studio-lib/pkg/dfm`) and **never** import this one.
Equivalence between the two twins flows **only** through the shared contract
fixtures (`orvex-studio-contracts/fixtures/dfm/**`), never through shared code
(D-CON-8). This is a clean-room implementation: authored from the documented
ProseMirror schema + the contract fixtures, never ported from `@docmost/*`
(NFR-C7; enforced by the repo-root `pnpm lint:boundary` fence).

## Honesty contract (no-op ≠ mock)

Exactly the **fixture-covered** node set is implemented for real and round-trips
the golden fixtures byte-exact: `doc`, `paragraph`, `text` (no marks). Every
other surface THROWS a typed, greppable sentinel — never a fabricated value:

- unknown node type → `DfmNotImplementedError` (`code = DFM_NOT_IMPLEMENTED`,
  `.nodeType`)
- any uncovered DfM construct on parse (heading, list, blockquote, code fence,
  table, opaque directive, inline mark/mention, multi-line paragraph, empty
  doc) → `DfmNotImplementedError` (it does **not** fall back to an empty
  `{ type: 'doc', content: [] }`).
- `serializeOpaque(node)` is a typed signature only — it throws the
  `dfm-opaque` sentinel. The byte-identical opaque round-trip is delivery work
  (FR-C20, rollout v0.3) with its own fixtures. `DfmOpaqueUnknownRefError`
  (`code = DFM_OPAQUE_UNKNOWN_REF`) is the typed error for that future path.

The covered set grows only when a new fixture-pair lands in the contracts repo
(coverage target and update rule in `test/fixtures/README.md`).

## Trailing-newline policy

`pmToDfm` joins block nodes with a single blank line (`\n\n`) and terminates the
document with exactly one trailing `\n`. `dfmToJson` strips exactly that one
trailing `\n`. The two are symmetric and round-trip the fixtures exactly.

## Scripts

- `pnpm --dir packages/@orvex/dfm test` — vitest, all through exported surfaces.
- `pnpm --dir packages/@orvex/dfm build` — `tsc --build` (declarations to `dist/`).
