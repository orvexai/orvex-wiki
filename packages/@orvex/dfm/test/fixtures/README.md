# DfM golden fixtures — VENDORED, do not hand-edit

These files are **byte-for-byte copies** of the DfM parity corpus in the
contracts seam repo. They are the single source of truth for `@orvex/dfm`
round-trip parity; the tests assert against them exactly.

## Provenance

- **Source path:** `orvex-studio-contracts/fixtures/dfm/`
  (repo `/home/daniel/repos/orvex-studio-contracts`, read-only reference seam)
- **Contracts VERSION pinned:** `0.1.0-draft`
- **Files vendored:**
  - `paragraph.pm.json` ← `fixtures/dfm/paragraph.pm.json`
  - `paragraph.dfm.md`  ← `fixtures/dfm/paragraph.dfm.md`

## Update rule (binding)

Updates flow **FROM the contracts repo, never hand-edited here.** A fixture is a
contract artifact: a wrong fixture is a contract bug, fixed by a fixture-pair PR
in `orvex-studio-contracts` (the `dfm-parity` drift gate), then re-vendored by
re-copying the files and bumping the pinned VERSION above. Editing a fixture in
this directory to make a test pass is forbidden — it breaks equivalence with the
Go twin (D-CON-8: parity flows through the fixtures, never through shared code).

## Coverage (this VERSION)

Status **SEED** — only `paragraph.*` (the trivial `doc`/`paragraph`/`text`
round-trip anchor) exists upstream. Everything else in the contracts coverage
target (headings, lists, tables, marks, mentions, opaque/atom nodes) throws
`DfmNotImplementedError` in this twin until its fixture-pair lands upstream.
