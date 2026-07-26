#!/usr/bin/env bash
# dfm-parity-gate.sh — ENG-2488 T3/AC1: the BLOCKING invocation of the
# contracts-repo's DfM parity reference script for this repo's TS leg.
#
# The contracts script (`gates/drift/dfm-parity-check.sh`, vendored
# unmodified at scripts/ci/vendor/dfm-parity-check.sh — see
# scripts/ci/vendor/README.md for the pin + why vendored) is report-only by
# design: it prints `FAIL:` lines but always exits 0. Its own header says
# each consuming repo's CI wraps it; THIS wrapper is that flip for
# orvex-wiki — any `FAIL:` line in its output fails this gate (exit 1), so
# the CI check "DfM TS↔Go parity (blocking, was report-only)" is a real
# required check, not a log line.
#
# The corpus it runs against is this repo's vendored snapshot
# (packages/@orvex/dfm/test/fixtures/dfm/ — same contracts pin as the
# script itself). The TS serializer's own byte-compare leg lives in the
# conformance suite (packages/@orvex/dfm/test/dfm-conformance/
# twin-parity.spec.ts, `TestDfmTwinsConformToGoldenFixtures`), run by the
# same CI job right after this shape gate.
#
# Usage: dfm-parity-gate.sh [repo-dir] [corpus-parent-dir]
#   repo-dir           defaults to this script's ../..
#   corpus-parent-dir  the dir containing fixtures/dfm/ — defaults to
#                      <repo-dir>/packages/@orvex/dfm/test
# Exit 0 = fixture-shape check clean. Exit 1 = at least one FAIL line.
set -uo pipefail

REPO_DIR="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
CORPUS_PARENT="${2:-$REPO_DIR/packages/@orvex/dfm/test}"
VENDORED_SCRIPT="$REPO_DIR/scripts/ci/vendor/dfm-parity-check.sh"

if [[ ! -f "$VENDORED_SCRIPT" ]]; then
  echo "FAIL: vendored parity script not found at $VENDORED_SCRIPT" >&2
  exit 1
fi
if [[ ! -d "$CORPUS_PARENT/fixtures/dfm" ]]; then
  echo "FAIL: vendored corpus not found at $CORPUS_PARENT/fixtures/dfm" >&2
  exit 1
fi

out="$(bash "$VENDORED_SCRIPT" "$CORPUS_PARENT" 2>&1)"
rc=$?
printf '%s\n' "$out"

if [[ $rc -ne 0 ]]; then
  echo "dfm-parity-gate: vendored script exited $rc — BLOCKING failure." >&2
  exit "$rc"
fi
if grep -q '^FAIL' <<< "$out"; then
  echo "dfm-parity-gate: FAIL line(s) detected — report-only override does NOT apply in this repo (blocking flip, ENG-2488)." >&2
  exit 1
fi

echo "dfm-parity-gate: OK (blocking mode) — corpus shape clean."
exit 0
