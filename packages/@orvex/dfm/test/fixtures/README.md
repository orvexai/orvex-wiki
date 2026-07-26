# DfM golden fixtures — VENDORED, do not hand-edit

Everything under this directory is a **byte-for-byte copy** of contract
artifacts owned by sibling repos. It is the single source of truth for
`@orvex/dfm` round-trip parity; the tests assert against these bytes exactly
and hermetically (no network fetch, no live sibling-repo checkout at test
time — FR-C21 contract-first).

## Provenance

### `dfm/` — the canonical DfM parity corpus (full vendoring, ENG-2487/ENG-2488)

- **Source path:** `orvex-studio-contracts/fixtures/dfm/` (read-only reference
  seam; the corpus is contracts-repo-owned, D-S10)
- **Contracts commit pinned:** `be4d2b1da583155a6dc2cce8a7fc7d974dbbd330`
  (branch `dev`)
- **Contents:** `manifest.json` + the 5 fixture directories
  (`nodes/`, `marks/`, `mentions/`, `opaque/`, `embeds/`) — 110 files, the
  full `<case>.pm.json` ↔ `<case>.dfm.md` pair corpus both serializer twins
  conform to, plus the corpus's own `README.md`.

### `go-twin-corpus/` — the Go twin's corpus manifest (reference copy, ENG-2488)

- **Source path:** `orvex-studio-lib/pkg/dfm/corpus/{manifest.json,PIN}`
  (the Go twin's own vendored corpus snapshot; read-only reference)
- **orvex-studio-lib commit:** `fbb63239c4953cd3e6ba4c722706f0a62ae01268`
- **Purpose:** the TS↔Go conformance suite's structural cross-check
  (`TestGoAndTsCorpusManifestsAgree`) proves both twins pin the SAME declared
  fixture set — a silently-diverged second copy fails the suite. Only the
  manifest + PIN are vendored (the Go corpus's fixture bytes are the same
  contracts corpus; invoking the Go binary from this repo is deliberately out
  of scope — no cross-repo build dependency).

## Update rule (binding)

Updates flow **FROM the contracts repo, never hand-edited here.** A fixture is
a contract artifact: a wrong fixture is a contract bug, fixed by a
fixture-pair PR in `orvex-studio-contracts` (the `dfm-parity` drift gate),
then re-vendored by re-copying the files and bumping the pinned commit above.
Editing a fixture in this directory to make a test pass is forbidden — it
breaks equivalence with the Go twin (D-CON-8: parity flows through the
fixtures, never through shared code).

## Coverage (this vendoring)

Status **FULL** — the complete ENG-1598 canonical corpus: 15 registered node
types + 12 registered marks (`nodes/`, `marks/`), both mention formats
(`mentions/`), the opaque reference exemplars (`opaque/`), and all 22
catalog embed types as opaque-fence fixtures (`embeds/`). This supersedes the
former SEED vendoring (only `paragraph.*`), which shipped with the seed
package before the ENG-2487 fold-in.
