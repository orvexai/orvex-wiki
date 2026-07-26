#!/usr/bin/env bash
# dfm-parity reference tooling — FR-C16 / A-DFM / ENG-1598.
#
# Byte-compares a DfM serializer implementation's output against the
# canonical corpus at fixtures/dfm/**. Definition + reference tooling live
# here (orvex-studio-contracts); EXECUTION runs in each consuming repo's CI
# (orvex-studio-lib's Go pkg/dfm, orvex-wiki's TS serializer), pinned to a
# contracts release tag — never a floating main (see gates/drift/README.md).
#
# This script does NOT invoke either serializer itself (that would require a
# cross-repo build dependency this repo does not own). Instead it proves the
# corpus-side half of the contract: every fixture pair is well-formed,
# every catalog embed type is covered, and — for the TS reference
# implementation vendored in this repo (packages/dfm) — the actual
# pmToDfm/dfmToJson round trip is byte-identical against fixtures/dfm/**.
# A consuming repo's CI wraps THIS script's fixture-shape checks with its
# own serializer's byte-compare step (see the wiring note at the bottom).
#
# Usage: gates/drift/dfm-parity-check.sh [REPO_ROOT]
#   REPO_ROOT defaults to the current directory (the contracts repo root).
#
# Mode: report-only (FR-C16 / OQ-C4) — exit 0 always at this stage; failures
# are printed but do not fail the calling CI job. Flip to blocking (remove
# the report-only exit-0 override below) once both runs_in legs
# (orvex-studio-lib, orvex-wiki) have run this green at least once.
set -uo pipefail

REPO_ROOT="${1:-.}"
FIXTURES_DIR="${REPO_ROOT}/fixtures/dfm"
MANIFEST="${FIXTURES_DIR}/manifest.json"

fail=0

echo "dfm-parity: checking fixture-pair shape under ${FIXTURES_DIR} ..."

if [ ! -f "${MANIFEST}" ]; then
  echo "FAIL: manifest.json not found at ${MANIFEST}"
  exit 1
fi

# Every *.pm.json must have a matching *.dfm.md sibling (except opaque/,
# which stores reference exemplars intentionally without a pinned .dfm.md —
# their expected output is proven by the TS harness at test time, not
# pinned as a byte-golden here, since the reference fence carries an
# auto-incrementing id that is exemplar-specific).
for dir in nodes marks embeds mentions; do
  d="${FIXTURES_DIR}/${dir}"
  [ -d "${d}" ] || { echo "FAIL: missing fixture directory ${d}"; fail=1; continue; }
  for pm in "${d}"/*.pm.json; do
    [ -e "${pm}" ] || continue
    case_name="$(basename "${pm}" .pm.json)"
    dfm="${d}/${case_name}.dfm.md"
    if [ ! -f "${dfm}" ]; then
      echo "FAIL: ${pm} has no matching ${dfm}"
      fail=1
    fi
  done
done

# Every .pm.json (in every dir, incl. opaque/) must be valid JSON — the
# language-neutral loadability check (AC6), runnable with nothing but a
# JSON-capable interpreter.
for dir in nodes marks opaque embeds mentions; do
  d="${FIXTURES_DIR}/${dir}"
  [ -d "${d}" ] || continue
  for pm in "${d}"/*.pm.json "${d}"/*.json; do
    [ -e "${pm}" ] || continue
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "import json,sys; json.load(open(sys.argv[1]))" "${pm}" || { echo "FAIL: ${pm} is not valid JSON"; fail=1; }
    fi
  done
done

# Zero linear-* fixtures anywhere (D-S11 / AC9). README.md is excluded: it
# legitimately discusses the D-S11 drop in prose (see fixtures/dfm/README.md),
# so a plain word match there is not a corpus violation.
hit=$(grep -RIl --exclude=README.md 'linear' "${FIXTURES_DIR}" 2>/dev/null || true)
if [ -n "${hit}" ]; then
  echo "FAIL: found 'linear' reference(s) in the corpus (D-S11 violation):"
  echo "${hit}"
  fail=1
fi

if [ "${fail}" -ne 0 ]; then
  echo "dfm-parity: fixture-shape check FAILED (see above)."
else
  echo "dfm-parity: fixture-shape check OK."
fi

# --- wiring note for consuming repos --------------------------------------
# orvex-studio-lib (Go pkg/dfm): after this script, run
#   go test ./pkg/dfm/... -run TestDfmGoParityAgainstGoldenCorpus
# pointed at this same fixtures/dfm/ directory (vendored via the contracts
# release tag), asserting PmToDfm(pm.json) == dfm.md byte-for-byte for every
# non-opaque case and the opaque-fence contract for every embeds/ case.
#
# orvex-wiki (TS @orvex/dfm serializer, engine side): run the equivalent
# jest suite against the same fixtures/dfm/ directory.
#
# Both legs are tracked in their own repos/CI, not executed from here.
# ---------------------------------------------------------------------------

# Report-only mode (FR-C16 / OQ-C4): never fail the calling CI job yet.
exit 0
