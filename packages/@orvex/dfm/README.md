# `@orvex/dfm`

The AGPL **TypeScript** DfM ⇄ ProseMirror serializer subsystem (FR-W18 / A-DFM).

A shared package the engine's **own write path** depends on — `page.service.ts`
imports `dfmToJson` / `reattachOpaqueRefs` and `collaboration.util.ts` imports
`pmToDfm`. It is **not** a pure-AI concern that can be deleted or externalized:
the fold-in extracts it out of the upstream `editor-ext` barrel into this
standalone package.

## Two twins, one contract

DfM is serialized by two twin implementations kept in lockstep by the
orvex-studio-contracts **golden fixtures**:

- this AGPL TypeScript `@orvex/dfm`, and
- the closed Go `orvex-studio-lib/pkg/dfm` (D-S10) backing wiki-api + the Orvex
  CLI.

**Import boundary (A-SEAMS / canon P10):** the AGPL TS `@orvex/dfm` is imported
**ONLY by the AGPL engine**. Every closed satellite (mcp, wiki-api, ai, llms)
reaches DfM through the **Go twin or a network call to wiki-api** — never by
importing this AGPL package (that would relicense a closed repo; the CS
import-guard enforces it).

## Opaque-node contract

Unknown node types round-trip through a lossless `:::dfm-opaque type=… id=…`
fence. `reattachOpaqueRefs` splices the original body back from the CAS base page
and **throws `DFM_OPAQUE_UNKNOWN_REF`, never silently drops**.

## Status

**Scaffold** — compiling stubs only. The real serializer (`registry`,
`common-nodes`, `inline-serializer`, the `:::dfm-opaque` fence machinery,
round-trip tests) is authored in the fold-in and proven against the contracts
golden fixtures. Not yet imported by the engine write path.
