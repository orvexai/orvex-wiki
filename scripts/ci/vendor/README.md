# Vendored CI reference tooling — do not hand-edit

## `dfm-parity-check.sh` — the contracts-repo DfM parity reference script

- **Source (owner):** `orvex-studio-contracts/gates/drift/dfm-parity-check.sh`
- **Contracts commit pinned:** see `PIN` (same pin as the fixture corpus
  vendored at `packages/@orvex/dfm/test/fixtures/dfm/` — one contracts
  snapshot, two vendored artifacts).
- **Byte-for-byte copy, UNMODIFIED.** The script's own header declares its
  `runs_in` legs: execution belongs in each consuming repo's CI
  (`orvex-studio-lib`'s Go leg, `orvex-wiki`'s TS leg — this repo). It is
  vendored here because `orvex-studio-contracts` is a private repo and this
  repo's CI runs on public GitHub-hosted runners with no cross-repo token —
  the same hermetic-vendoring rule the fixture corpus follows (FR-C21
  contract-first; no network fetch at CI time).

### The report-only → blocking flip (ENG-2488 T3)

The script itself is **report-only by design** (`exit 0` always — see its
trailing comment; flipping it inside the script is the contracts repo's own
future act, not ours to patch). This repo makes the invocation BLOCKING at
the call site instead: `scripts/ci/dfm-parity-gate.sh` (this repo's own
wrapper, one directory up) runs the vendored script against the vendored
corpus and fails on any emitted `FAIL:` line. The CI check
"DfM TS↔Go parity (blocking, was report-only)" invokes that wrapper.

### Update rule (binding)

Updates flow **FROM the contracts repo, never hand-edited here.** Re-vendor
by re-copying the file and bumping `PIN`, in lockstep with a fixture-corpus
re-vendor. Editing this copy to change what the gate checks is forbidden —
the contracts repo owns the parity definition (D-S10).
