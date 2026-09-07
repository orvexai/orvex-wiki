#!/usr/bin/env bash
# ENG-3788 — crew cell posture decision gate.
#
# This gate intentionally blocks until the product/platform owner records one
# of the two postures requested by ENG-3788. It must not choose between them:
# both CLOUD=false and real per-crew CELL_IDs are product decisions.
#
# The ratified record is expected at po-decisions/ENG-3788.md and must contain:
#   Status: ratified
#   Owner: <named decision owner>
#   Decision: CLOUD=false for both crew cells
# or
#   Decision: real CELL_IDs for both crew cells
#
# Usage: eng3788-crew-cell-decision.sh [repo-dir]
set -euo pipefail

repo_dir="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
decision_file="$repo_dir/po-decisions/ENG-3788.md"
crew_component="$repo_dir/deploy/kustomize/components/crew/kustomization.yaml"
base_env="$repo_dir/deploy/kustomize/app-manifests/configmap-env.yaml"
cluster_config="$repo_dir/deploy/kustomize/cluster-config.yaml"

fail_blocked() {
  echo "ENG-3788: BLOCKED — $1" >&2
  echo "Decision required: choose CLOUD=false or real per-cell CELL_IDs for crew/daniel and crew/yafet." >&2
  echo "Decision owner: the named Linear assignee / Orvex Wiki product-platform owner; no owner is recorded in the authoritative issue cache." >&2
  echo "Record the choice and rationale in $decision_file before changing crew manifests." >&2
  exit 2
}

[[ -d "$repo_dir" ]] || fail_blocked "repository directory does not exist: $repo_dir"
[[ -f "$crew_component" ]] || fail_blocked "crew component is missing: $crew_component"
[[ -f "$base_env" ]] || fail_blocked "base environment manifest is missing: $base_env"
[[ -f "$cluster_config" ]] || fail_blocked "cluster config is missing: $cluster_config"

if [[ ! -f "$decision_file" ]]; then
  fail_blocked "no ratified decision record exists"
fi

if ! rg -q '^Status:\s*ratified\s*$' "$decision_file"; then
  fail_blocked "decision record is not marked ratified"
fi

if ! rg -q '^Owner:\s*[^[:space:]].*$' "$decision_file"; then
  fail_blocked "decision record does not name an owner"
fi

decision=""
if rg -q '^Decision:\s*CLOUD=false for both crew cells\s*$' "$decision_file"; then
  decision="cloud-false"
elif rg -q '^Decision:\s*real CELL_IDs for both crew cells\s*$' "$decision_file"; then
  decision="real-cell-ids"
else
  fail_blocked "decision record does not choose one of the two approved postures"
fi

case "$decision" in
  cloud-false)
    # The source defaults remain CLOUD=true + CELL_ID=solo for prod and the
    # standalone shape. The crew component must therefore override CLOUD for
    # both rendered crew branches; a decision record alone is not enough.
    if ! rg -q 'path:\s*/data/CLOUD' "$crew_component" \
      || ! rg -q '^\s*value:.*false' "$crew_component"; then
      fail_blocked "the CLOUD=false decision is recorded but no crew CLOUD=false patch is present"
    fi
    ;;
  real-cell-ids)
    # This posture intentionally leaves CLOUD=true. It changes the other
    # input to the predicate, so do not require a CLOUD patch here. The patch
    # may use a Kustomize replacement (for example branchSlug -> crew-daniel /
    # crew-yafet), but it must not leave the inherited solo sentinel in place.
    if ! rg -q 'path:\s*/data/cellId' "$crew_component"; then
      fail_blocked "the real-CELL_ID decision is recorded but no crew CELL_ID patch is present"
    fi
    if rg -q '^\s*value:\s*solo\s*$' "$crew_component"; then
      fail_blocked "the real-CELL_ID decision is recorded but crew still patches CELL_ID to solo"
    fi
    ;;
esac

echo "ENG-3788: PASS — owned, ratified crew posture is recorded and the crew source reflects it."
