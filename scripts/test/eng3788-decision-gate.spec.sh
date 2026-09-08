#!/usr/bin/env bash
# Hermetic DoD suite for the ENG-3788 human-decision and rollout gate.
#
# The fixtures deliberately supply synthetic ratification/rollout evidence;
# they prove the gate's shape checks without claiming that ENG-3788 has been
# ratified or deployed. The final PATH parity cases exercise both the rg
# branch and the grep fallback, including a PATH with no rg executable.
#
# Usage: scripts/test/eng3788-decision-gate.spec.sh
# Exit 0 = every case behaved as specified.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="${REPO_ROOT}/scripts/verify/eng3788-crew-cell-decision.sh"

WORKDIR="$(mktemp -d -t eng3788-decision-gate.XXXXXX)"
trap 'rm -rf "${WORKDIR}"' EXIT

fail=0
cases=0

WITHOUT_RG_PATH="/usr/bin:/bin"
RG_SHIM_DIR="${WORKDIR}/rg-bin"
mkdir -p "$RG_SHIM_DIR"
cat >"${RG_SHIM_DIR}/rg" <<'EOF'
#!/bin/bash
exec grep "$@"
EOF
chmod 755 "${RG_SHIM_DIR}/rg"
WITH_RG_PATH="${RG_SHIM_DIR}:${WITHOUT_RG_PATH}"

make_tree() {
  local name="$1"
  local tree="${WORKDIR}/${name}"
  mkdir -p "${tree}/po-decisions" "${tree}/deploy/kustomize/components/crew" \
    "${tree}/deploy/kustomize/app-manifests"
  printf '%s\n' 'apiVersion: v1' 'kind: ConfigMap' >"${tree}/deploy/kustomize/cluster-config.yaml"
  printf '%s\n' 'apiVersion: v1' 'kind: ConfigMap' >"${tree}/deploy/kustomize/app-manifests/configmap-env.yaml"
  printf '%s\n' 'apiVersion: kustomize.config.k8s.io/v1alpha1' 'kind: Component' \
    >"${tree}/deploy/kustomize/components/crew/kustomization.yaml"
  printf '%s' "$tree"
}

write_decision() {
  local tree="$1" status="$2" owner="$3" decision="$4" rollout="$5"
  {
    printf '%s\n' '# ENG-3788 fixture' "Status: ${status}" "Owner: ${owner}" "Decision: ${decision}"
    if [[ "$rollout" == yes ]]; then
      printf '%s\n' \
        'Rollout-Verified: crew/daniel | 2026-09-08 | Priya Shah <priya@orvex.ai> | evidence/crew-daniel' \
        'Rollout-Verified: crew/yafet | 2026-09-08 | Priya Shah <priya@orvex.ai> | evidence/crew-yafet'
    fi
  } >"${tree}/po-decisions/ENG-3788.md"
}

add_cloud_patch() {
  local tree="$1"
  cat >"${tree}/deploy/kustomize/components/crew/kustomization.yaml" <<'EOF'
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
patches:
  - patch: |-
      - op: replace
        path: /data/CLOUD
        value: "false"
EOF
}

run_gate() {
  local path_value="$1" tree="$2"
  GATE_OUTPUT="$(PATH="$path_value" bash "$GATE" "$tree" 2>&1)"
  GATE_STATUS=$?
}

expect() {
  local name="$1" want_status="$2" want_text="$3" path_value="$4" tree="$5"
  cases=$((cases + 1))
  run_gate "$path_value" "$tree"
  if [[ "$GATE_STATUS" != "$want_status" ]]; then
    echo "FAIL [$name]: exit $GATE_STATUS, expected $want_status" >&2
    printf '    %s\n' "${GATE_OUTPUT//$'\n'/$'\n'    }" >&2
    fail=1
    return
  fi
  if ! grep -qF -- "$want_text" <<<"$GATE_OUTPUT"; then
    echo "FAIL [$name]: output does not contain '$want_text'" >&2
    printf '    %s\n' "${GATE_OUTPUT//$'\n'/$'\n'    }" >&2
    fail=1
    return
  fi
  echo "ok   [$name]"
}

expect_path_parity() {
  local name="$1" want_status="$2" want_text="$3" tree="$4"
  cases=$((cases + 1))
  run_gate "$WITH_RG_PATH" "$tree"
  local rg_status="$GATE_STATUS" rg_output="$GATE_OUTPUT"
  run_gate "$WITHOUT_RG_PATH" "$tree"
  local grep_status="$GATE_STATUS" grep_output="$GATE_OUTPUT"
  if [[ "$rg_status" != "$want_status" || "$grep_status" != "$want_status" ]]; then
    echo "FAIL [$name]: rg=$rg_status, grep-fallback=$grep_status, expected $want_status" >&2
    fail=1
    return
  fi
  if [[ "$rg_output" != "$grep_output" ]] || ! grep -qF -- "$want_text" <<<"$grep_output"; then
    echo "FAIL [$name]: rg and grep fallback did not produce the same verdict" >&2
    printf '    rg:   %s\n' "${rg_output//$'\n'/$'\n'    }" >&2
    printf '    grep: %s\n' "${grep_output//$'\n'/$'\n'    }" >&2
    fail=1
    return
  fi
  echo "ok   [$name]"
}

# Missing record and pending record remain fail-closed.
missing_tree="$(make_tree missing-record)"
expect "missing decision record" 2 "no ratified decision record exists" "$WITHOUT_RG_PATH" "$missing_tree"

pending_tree="$(make_tree pending-record)"
write_decision "$pending_tree" pending TBD "CLOUD=false for both crew cells" no
expect "pending decision" 2 "decision record is not marked ratified" "$WITHOUT_RG_PATH" "$pending_tree"

# Ratification by a placeholder or bare role is not a named owner.
unnamed_tree="$(make_tree unnamed-owner)"
write_decision "$unnamed_tree" ratified TBD "CLOUD=false for both crew cells" yes
add_cloud_patch "$unnamed_tree"
expect "ratified but unnamed owner" 2 "does not identify a named owner" "$WITHOUT_RG_PATH" "$unnamed_tree"

role_tree="$(make_tree role-owner)"
write_decision "$role_tree" ratified "Orvex Wiki product-platform owner" "CLOUD=false for both crew cells" yes
add_cloud_patch "$role_tree"
expect "ratified but role owner" 2 "does not identify a named owner" "$WITHOUT_RG_PATH" "$role_tree"

# A complete synthetic record passes, while missing source posture blocks.
pass_tree="$(make_tree complete-record)"
write_decision "$pass_tree" ratified "Daniel Vega <daniel@orvex.ai>" "CLOUD=false for both crew cells" yes
add_cloud_patch "$pass_tree"
expect "named owner, rollout, and CLOUD patch" 0 "ENG-3788: PASS" "$WITHOUT_RG_PATH" "$pass_tree"

missing_patch_tree="$(make_tree missing-cloud-patch)"
write_decision "$missing_patch_tree" ratified "Daniel Vega <daniel@orvex.ai>" "CLOUD=false for both crew cells" yes
expect "ratified but crew patch missing" 2 "no crew CLOUD=false patch" "$WITHOUT_RG_PATH" "$missing_patch_tree"

missing_rollout_tree="$(make_tree missing-rollout-attestation)"
write_decision "$missing_rollout_tree" ratified "Daniel Vega <daniel@orvex.ai>" "CLOUD=false for both crew cells" no
add_cloud_patch "$missing_rollout_tree"
expect "ratified but rollout evidence missing" 2 "exactly one entry for crew/daniel" "$WITHOUT_RG_PATH" "$missing_rollout_tree"

# The result must not depend on whether the preferred search executable is
# present. The first PATH contains an rg-compatible shim; the second has none.
expect_path_parity "PATH parity for passing verdict" 0 "ENG-3788: PASS" "$pass_tree"
expect_path_parity "PATH parity for blocked verdict" 2 "no crew CLOUD=false patch" "$missing_patch_tree"

if [[ "$fail" != 0 ]]; then
  echo "ENG-3788 decision-gate spec: ${fail} failure(s) across ${cases} case(s)" >&2
  exit 1
fi
echo "ENG-3788 decision-gate spec: ${cases} cases passed"
