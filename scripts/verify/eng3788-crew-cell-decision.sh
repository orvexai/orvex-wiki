#!/usr/bin/env bash
# ENG-3788 — crew cell posture decision gate.
#
# This gate intentionally blocks until the product/platform owner records one
# of the two postures requested by ENG-3788. It must not choose between them:
# both CLOUD=false and real per-crew CELL_IDs are product decisions.
#
# The ratified record is expected at po-decisions/ENG-3788.md and must contain:
#   Status: ratified
#   Owner: <named decision owner> <contact or @handle>
#   Decision: CLOUD=false for both crew cells
# or
#   Decision: real CELL_IDs for both crew cells
#   Rollout-Verified: crew/daniel | YYYY-MM-DD | <named verifier> | <evidence ref>
#   Rollout-Verified: crew/yafet | YYYY-MM-DD | <named verifier> | <evidence ref>
#
# Usage: eng3788-crew-cell-decision.sh [repo-dir]
set -euo pipefail

repo_dir="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
decision_file="$repo_dir/po-decisions/ENG-3788.md"
crew_component="$repo_dir/deploy/kustomize/components/crew/kustomization.yaml"
base_env="$repo_dir/deploy/kustomize/app-manifests/configmap-env.yaml"
cluster_config="$repo_dir/deploy/kustomize/cluster-config.yaml"

# `rg` is preferred when it is an executable, but this gate also runs in the
# non-interactive shells used by CI and fresh clones. An interactive shell
# function named `rg` is not evidence that the binary is installed.
RG_BIN="$(type -P rg 2>/dev/null || true)"
search_q() {
  local pattern="$1"
  shift
  if [[ -n "$RG_BIN" ]]; then
    "$RG_BIN" -q -- "$pattern" "$@"
  else
    grep -Eq -- "$pattern" "$@"
  fi
}

fail_blocked() {
  echo "ENG-3788: BLOCKED — $1" >&2
  echo "Decision required: choose CLOUD=false or real per-cell CELL_IDs for crew/daniel and crew/yafet." >&2
  echo "Decision owner: the named Linear assignee / Orvex Wiki product-platform owner; no owner is recorded in the authoritative issue cache." >&2
  echo "Record and ratify the choice and rationale in $decision_file before deploying crew manifests." >&2
  exit 2
}

[[ -d "$repo_dir" ]] || fail_blocked "repository directory does not exist: $repo_dir"
[[ -f "$crew_component" ]] || fail_blocked "crew component is missing: $crew_component"
[[ -f "$base_env" ]] || fail_blocked "base environment manifest is missing: $base_env"
[[ -f "$cluster_config" ]] || fail_blocked "cluster config is missing: $cluster_config"

if [[ ! -f "$decision_file" ]]; then
  fail_blocked "no ratified decision record exists"
fi

if ! search_q '^Status:[[:space:]]*ratified[[:space:]]*$' "$decision_file"; then
  fail_blocked "decision record is not marked ratified"
fi

owner_value="$(sed -n 's/^Owner:[[:space:]]*//p' "$decision_file" | head -n 1)"
owner_contact_re='(<[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}>|@[[:alnum:]][[:alnum:]_.-]*)'
owner_lower="${owner_value,,}"
case "$owner_lower" in
  ""|*tbd*|*unknown*|*unassigned*|*pending*|*product-platform*|*wiki*owner*|*owner*)
    fail_blocked "decision record does not identify a named owner with a contact"
    ;;
esac
if [[ ! "$owner_value" =~ $owner_contact_re ]]; then
  fail_blocked "decision record does not identify a named owner with a contact"
fi

decision=""
if search_q '^Decision:[[:space:]]*CLOUD=false for both crew cells[[:space:]]*$' "$decision_file"; then
  decision="cloud-false"
elif search_q '^Decision:[[:space:]]*real CELL_IDs for both crew cells[[:space:]]*$' "$decision_file"; then
  decision="real-cell-ids"
else
  fail_blocked "decision record does not choose one of the two approved postures"
fi

case "$decision" in
  cloud-false)
    # The source defaults remain CLOUD=true + CELL_ID=solo for prod and the
    # standalone shape. The crew component must therefore override CLOUD for
    # both rendered crew branches; a decision record alone is not enough.
    if ! search_q 'path:[[:space:]]*/data/CLOUD' "$crew_component" \
      || ! search_q '^[[:space:]]*value:.*false' "$crew_component"; then
      fail_blocked "the CLOUD=false decision is recorded but no crew CLOUD=false patch is present"
    fi
    ;;
  real-cell-ids)
    # This posture intentionally leaves CLOUD=true. It changes the other
    # input to the predicate, so do not require a CLOUD patch here. The patch
    # may use a Kustomize replacement (for example branchSlug -> crew-daniel /
    # crew-yafet), but it must not leave the inherited solo sentinel in place.
    if ! search_q 'path:[[:space:]]*/data/cellId' "$crew_component"; then
      fail_blocked "the real-CELL_ID decision is recorded but no crew CELL_ID patch is present"
    fi
    if search_q '^[[:space:]]*value:[[:space:]]*solo[[:space:]]*$' "$crew_component"; then
      fail_blocked "the real-CELL_ID decision is recorded but crew still patches CELL_ID to solo"
    fi
    ;;
esac

trim() {
  local value="$1"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  printf '%s' "$value"
}

validate_rollout() {
  local cell="$1"
  local line prefix verified_date verifier evidence date_re verifier_contact_re
  local matches count

  matches="$(grep -E "^Rollout-Verified:[[:space:]]*${cell}[[:space:]]*\\|" "$decision_file" || true)"
  count="$(grep -c . <<<"$matches" || true)"
  if [[ "$count" != "1" ]]; then
    fail_blocked "rollout attestation must contain exactly one entry for $cell"
  fi

  line="$matches"
  IFS='|' read -r prefix verified_date verifier evidence <<<"$line"
  verified_date="$(trim "$verified_date")"
  verifier="$(trim "$verifier")"
  evidence="$(trim "$evidence")"
  date_re='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  if [[ ! "$verified_date" =~ $date_re ]] || [[ "$(date -u -d "$verified_date" +%F 2>/dev/null || true)" != "$verified_date" ]]; then
    fail_blocked "rollout attestation for $cell does not contain a real YYYY-MM-DD date"
  fi
  verifier_contact_re='(<[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}>|@[[:alnum:]][[:alnum:]_.-]*)'
  verifier_lower="${verifier,,}"
  case "$verifier_lower" in
    ""|*tbd*|*unknown*|*unassigned*|*pending*|*verifier*)
      fail_blocked "rollout attestation for $cell does not identify a named verifier"
      ;;
  esac
  if [[ ! "$verifier" =~ $verifier_contact_re ]]; then
    fail_blocked "rollout attestation for $cell does not identify a named verifier"
  fi
  evidence_lower="${evidence,,}"
  if [[ -z "$evidence" || "$evidence_lower" == "pending" || "$evidence_lower" == "tbd" || "$evidence_lower" == "unknown" ]]; then
    fail_blocked "rollout attestation for $cell is missing an evidence reference"
  fi
}

validate_rollout "crew/daniel"
validate_rollout "crew/yafet"

echo "ENG-3788: PASS — owned, ratified crew posture is recorded and the crew source reflects it."
