#!/usr/bin/env bash
# RED-first DoD for ENG-3356 AC1/AC5.
#
# The positive branch exercises the scanner against this repo's real trigger;
# the negative branch mutates only the fixture's resolver pin to the exact bare
# pipelineRef shape that the ticket measured. The empty fleet-root case proves
# that no candidate is not a vacuous pass.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCANNER="${REPO_ROOT}/shared-build-conform.sh"
FIXTURE="${REPO_ROOT}/scripts/test/fixtures/shared-build/conforming"
WORKDIR="$(mktemp -d -t eng-3356-shared-build.XXXXXX)"
trap 'rm -rf "${WORKDIR}"' EXIT

fail=0

expect_status() {
  local label="$1" want="$2" got="$3" output="$4"
  if [[ "${got}" != "${want}" ]]; then
    echo "FAIL [${label}]: exit ${got}, expected ${want}" >&2
    printf '    %s\n' "${output//$'\n'/$'\n    '}" >&2
    fail=1
  else
    echo "ok   [${label}]: exit ${got}"
  fi
}

expect_contains() {
  local label="$1" needle="$2" output="$3"
  if ! grep -qF -- "${needle}" <<<"${output}"; then
    echo "FAIL [${label}]: output does not contain '${needle}'" >&2
    printf '    %s\n' "${output//$'\n'/$'\n    '}" >&2
    fail=1
  else
    echo "ok   [${label}]: found '${needle}'"
  fi
}

# AC1 proof obligation: the real, already-correct wiki trigger is clean, and
# specifically its TriggerTemplate image-tag slug does not trip R2.
real_output="$(bash "${SCANNER}" "${REPO_ROOT}" 2>&1)"
real_status=$?
expect_status "real wiki trigger is conformant" 0 "${real_status}" "${real_output}"
expect_contains "real wiki trigger has no R2 false positive" \
  "shared-build-conform: PASS" "${real_output}"
if grep -qF 'FAIL(R2/AC3)' <<<"${real_output}"; then
  echo "FAIL [real wiki trigger has no R2 false positive]: R2 fired" >&2
  fail=1
fi

# AC5 RED-first proof: one unpinned fixture reds at R5/AC1, then the original
# pinned bytes green again. Keep the mutation text-specific so a fixture drift
# cannot silently turn this into a success-shaped no-op.
candidate="${WORKDIR}/candidate"
cp -R "${FIXTURE}" "${candidate}"
trigger="${candidate}/tekton/trigger.yaml"
original="$(<"${trigger}")"
unpinned="$(sed '/^          resolver: git$/,/^        params:$/ { /^          resolver: git$/c\          name: orvex-shared-build
/^        params:$/!d
}' <<<"${original}")"
if [[ "${unpinned}" == "${original}" ]]; then
  echo "FAIL [fixture mutation]: unpinning the fixture was a no-op" >&2
  fail=1
else
  printf '%s\n' "${unpinned}" >"${trigger}"
  red_output="$(bash "${SCANNER}" "${candidate}" 2>&1)"
  red_status=$?
  expect_status "unpinned fixture reds" 1 "${red_status}" "${red_output}"
  expect_contains "unpinned fixture names R5/AC1" "FAIL(R5/AC1)" "${red_output}"

  printf '%s\n' "${original}" >"${trigger}"
  green_output="$(bash "${SCANNER}" "${candidate}" 2>&1)"
  green_status=$?
  expect_status "restored pin greens" 0 "${green_status}" "${green_output}"
  if grep -qF 'FAIL(R5/AC1)' <<<"${green_output}"; then
    echo "FAIL [restored pin greens]: R5/AC1 still fired" >&2
    fail=1
  fi
fi

# The scanner's tri-state is for an unusable aggregate input: an empty
# fleet-root has no candidate from which to earn a verdict. A direct candidate
# with no tekton/ is a real R6/AC12 violation and therefore exits 1.
empty="${WORKDIR}/empty-fleet"
mkdir -p "${empty}"
empty_output="$(bash "${SCANNER}" --fleet-root "${empty}" 2>&1)"
empty_status=$?
expect_status "empty fleet refuses a verdict" 2 "${empty_status}" "${empty_output}"
if grep -qF 'PASS' <<<"${empty_output}"; then
  echo "FAIL [empty fleet refuses a verdict]: output claimed PASS" >&2
  fail=1
fi

if [[ "${fail}" -ne 0 ]]; then
  echo "shared-build-conformance.spec.sh: FAIL" >&2
  exit 1
fi
echo "shared-build-conformance.spec.sh: PASS — real trigger and RED-first pin proof are live."
