#!/usr/bin/env bash
# test-linear-sync-initiative.sh — regression suite for the initiative-filter leak
# fix (PO bug report 2026-07-09).
#
# Covers, against an in-memory initiative model (fixture issues, mocked GraphQL):
#   1. CLOSED-leg scoping — the closed (Done/Canceled) leg is filtered by the SAME
#      initiative member-project set as the active leg. A Done issue in a NON-member
#      project must NEVER appear in initiative.json (the exact team-wide leak: 1095
#      issues across 23 projects for a ~1-200 initiative).
#   2. BLOCKEDBY CLOSURE — a blockedBy target that falls OUTSIDE the initiative is
#      re-resolved as a minimal node marked external:true, so a frontier can always
#      resolve every blockedBy edge's state from the cache.
#   3. External blocker nodes are EXEMPT from the scope-purity invariant (they are
#      out-of-initiative by design), while a genuine out-of-scope in-cache issue
#      (server over-return) still trips it and marks complete=false.
#   4. A blockedBy-closure FAILURE marks complete=false (never a silent dropped edge).
#   5. LABELS in the single-issue refresh — _write_issue_file updates labels in
#      initiative.json (a live hold-label write must take effect on the frontier
#      immediately, not only at the next bulk sync).
#
# Mechanism: SOURCE linear-sync.sh (its source-guard skips CLI dispatch) and drive
# cmd_sync_initiative / _write_issue_file directly, overriding the ONLY true external
# boundaries — gql_post (mocked to a fixture-backed fake Linear server that HONORS the
# filter the script sends, so a reverted scope would surface as leaked issues),
# resolve_initiative_scope, check_deps, resolve_linear_token.
#
# Usage: bash test-linear-sync-initiative.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/linear-sync.sh"

PASS=0
FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# ---------------------------------------------------------------------------
# Fixture: an initiative "Test Initiative" whose ONLY member project is "Alpha".
# "Zeta" is a DIFFERENT project in the same team ENG — its issues must never leak
# into the cache, EXCEPT ENG-9 which is a blockedBy target of the in-scope ENG-1
# and so must appear as an EXTERNAL minimal node.
#   ENG-1  active  Alpha   blockedBy ENG-9 (external, Zeta/Done)
#   ENG-2  active  Alpha   no blockers
#   ENG-3  Done    Alpha   in-scope closed
#   ENG-8  Done    Zeta    NON-member Done — the team-wide-leak canary
#   ENG-9  Done    Zeta    NON-member Done — external blocker of ENG-1
# ---------------------------------------------------------------------------
node() { # id number ident title state type project invrel_json
  jq -cn --arg id "$1" --argjson num "$2" --arg ident "$3" --arg title "$4" \
     --arg sname "$5" --arg stype "$6" --arg proj "$7" --argjson inv "$8" '
    {
      id: $id, identifier: $ident, number: $num,
      title: $title, description: ("Body of " + $ident),
      updatedAt: "2026-07-09T00:00:00.000Z",
      state: {name: $sname, type: $stype},
      project: {name: $proj},
      projectMilestone: null, cycle: null, assignee: null,
      labels: {nodes: [{name: "area:api"}], pageInfo: {hasNextPage: false}},
      relations: {nodes: [], pageInfo: {hasNextPage: false}},
      inverseRelations: {nodes: $inv, pageInfo: {hasNextPage: false}}
    }'
}
FIXTURE=$(jq -cn --argjson a "$(node ID1 1 ENG-1 'One'   'In Progress' started   Alpha '[{"type":"blocks","issue":{"identifier":"ENG-9"}}]')" \
                 --argjson b "$(node ID2 2 ENG-2 'Two'   'Todo'        unstarted Alpha '[]')" \
                 --argjson c "$(node ID3 3 ENG-3 'Three' 'Done'        completed Alpha '[]')" \
                 --argjson d "$(node ID8 8 ENG-8 'Eight' 'Done'        completed Zeta  '[]')" \
                 --argjson e "$(node ID9 9 ENG-9 'Nine'  'Done'        completed Zeta  '[]')" \
                 '[$a,$b,$c,$d,$e]')
export FIXTURE

# ---------------------------------------------------------------------------
# Source the real script (defines functions + GQL_* + set -euo pipefail), then
# override the external boundaries. Re-relax shell opts for the harness itself;
# each cmd_sync_initiative run re-enters `set -euo pipefail` in its own subshell
# so it behaves exactly as under the production CLI.
# ---------------------------------------------------------------------------
# shellcheck disable=SC1090
source "$SYNC_SCRIPT"
set +u

check_deps() { :; }
resolve_linear_token() { LINEAR_TOKEN="fake-token"; return 0; }
resolve_initiative_scope() {
  INIT_RESOLVED_NAME="Test Initiative"
  MEMBER_PROJECTS="Alpha"
  MEMBER_TRUNCATED=0
  OPEN_WORK_EXISTS=1
  return 0
}

# Fixture-backed fake Linear GraphQL server. Distinguishes queries by operation name
# and HONORS the filter the script sends (project.name.in for both legs) — so if the
# closed leg ever reverted to team-wide, ENG-8 would leak into the result here.
gql_post() {
  local query="$1" vars="$2"
  LAST_RATELIMIT_HEADERS=""
  case "$query" in
    *ActiveIssues*)
      local plist; plist=$(echo "$vars" | jq -c '.filter.project.name.in // []')
      jq -cn --argjson fix "$FIXTURE" --argjson p "$plist" '
        {data:{issues:{
          nodes: [ $fix[] | . as $i
            | select((["completed","canceled"] | index($i.state.type)) == null)
            | select(($p | index($i.project.name)) != null) ],
          pageInfo:{hasNextPage:false,endCursor:null}
        }}}'
      ;;
    *ClosedIssues*)
      local plist; plist=$(echo "$vars" | jq -c '.filter.project.name.in // []')
      jq -cn --argjson fix "$FIXTURE" --argjson p "$plist" --arg leak "${LEAK_SIM:-0}" '
        ( [ $fix[] | . as $i
              | select((["completed","canceled"] | index($i.state.type)) != null)
              | select(($p | index($i.project.name)) != null) ]
          + (if $leak=="1" then [ $fix[] | select(.identifier=="ENG-8") ] else [] end) )
        | unique_by(.identifier)
        | {data:{issues:{
            nodes: [ .[] | {id,identifier,updatedAt,state,project} ],
            pageInfo:{hasNextPage:false,endCursor:null}
          }}}'
      ;;
    *IssuesByNumber*)
      if [[ "${CLOSURE_FAIL:-0}" == "1" ]]; then
        echo '{"errors":[{"message":"simulated closure failure"}]}'
        return 0
      fi
      local nums; nums=$(echo "$vars" | jq -c '.numbers // []')
      jq -cn --argjson fix "$FIXTURE" --argjson nums "$nums" '
        {data:{issues:{
          nodes: [ $fix[] | . as $i | select(($nums | index($i.number)) != null) | {id,identifier,updatedAt,state,project} ],
          pageInfo:{hasNextPage:false,endCursor:null}
        }}}'
      ;;
    *)
      echo '{"errors":[{"message":"unexpected query in mock"}]}'
      ;;
  esac
  return 0
}

# run_initiative <sandbox>: set the globals cmd_sync_initiative needs and run it in a
# subshell (so a fatal exit inside cannot abort the harness). Echoes the exit code.
run_initiative() {
  local sandbox="$1"
  LINEAR_NOT_CONFIGURED=0
  TRACKING_SYSTEM="linear"
  TEAM_KEY="ENG"
  LINEAR_INITIATIVE="Test Initiative"
  LINEAR_PROJECT=""
  PROJECT_ROOT="$sandbox"
  CACHE_DIR="$sandbox/.cache/linear"
  ( set -euo pipefail; cd "$sandbox" && cmd_sync_initiative ) \
    > "$sandbox/out.log" 2> "$sandbox/err.log"
  echo $?
}

# ===========================================================================
# Scenario 1 — happy path: closed-leg scoping + blockedBy closure.
# ===========================================================================
echo "Scenario 1: closed-leg scoping + blockedBy closure"
S1="$(mktemp -d)"
LEAK_SIM=0 CLOSURE_FAIL=0
rc1=$(run_initiative "$S1")
INIT="$S1/.cache/linear/initiative.json"

if [[ "$rc1" == "0" ]]; then
  pass "sync-initiative exits 0 on a fully-resolved run"
else
  fail "sync-initiative exited $rc1 (expected 0)"; sed 's/^/    /' "$S1/err.log" >&2
fi

if [[ -f "$INIT" ]] && [[ "$(jq -r '.issues | has("ENG-8")' "$INIT")" == "false" ]]; then
  pass "team-wide-leak canary ENG-8 (Done in non-member project) is ABSENT — closed leg is initiative-scoped"
else
  fail "ENG-8 leaked into initiative.json — closed leg is NOT initiative-scoped (the reported bug)"
fi

eng3=$(jq -r 'if (.issues | has("ENG-3")) then (.issues["ENG-3"].external | tostring) else "MISSING" end' "$INIT")
if [[ "$eng3" == "false" ]]; then
  pass "in-scope Done issue ENG-3 present and marked external:false"
else
  fail "in-scope Done issue ENG-3 missing/mis-marked (external=$eng3)"
fi

if [[ "$(jq -r '.issues | (has("ENG-1") and has("ENG-2"))' "$INIT")" == "true" ]]; then
  pass "active in-scope issues ENG-1, ENG-2 present"
else
  fail "active in-scope issues missing"
fi

# The critical frontier guarantee: the out-of-initiative blocker resolves from the cache.
eng9_ext=$(jq -r '.issues["ENG-9"].external // "MISSING"' "$INIT")
eng9_state=$(jq -r '.issues["ENG-9"].state // "MISSING"' "$INIT")
eng1_blockedby=$(jq -c '.issues["ENG-1"].blockedBy' "$INIT")
if [[ "$eng9_ext" == "true" && "$eng9_state" == "Done" ]]; then
  pass "out-of-initiative blocker ENG-9 resolves from cache as external:true, state=Done"
else
  fail "out-of-initiative blocker ENG-9 not resolved (external=$eng9_ext state=$eng9_state)"
fi
if [[ "$eng1_blockedby" == '["ENG-9"]' ]]; then
  pass "ENG-1.blockedBy = [ENG-9] and that edge is resolvable from the cache (frontier closure holds)"
else
  fail "ENG-1.blockedBy = $eng1_blockedby (expected [\"ENG-9\"])"
fi

if [[ "$(jq -r '.complete' "$INIT")" == "true" ]]; then
  pass "complete=true (external blocker in a non-member project does NOT trip scope purity)"
else
  fail "complete=false on the happy path — external nodes are not exempt from the scope check"
fi
if [[ "$(jq -r '.counts.external' "$INIT")" == "1" ]]; then
  pass "counts.external = 1"
else
  fail "counts.external = $(jq -r '.counts.external' "$INIT") (expected 1)"
fi
# External blocker gets NO body file; in-scope active issues do.
if [[ ! -f "$S1/.cache/linear/issues/ENG-9.yaml" && -f "$S1/.cache/linear/issues/ENG-1.yaml" ]]; then
  pass "body files written for active in-scope issues only (none for external blocker ENG-9)"
else
  fail "body-file scope wrong (ENG-9 body present, or ENG-1 body missing)"
fi
rm -rf "$S1"

# ===========================================================================
# Scenario 2 — tightened invariant: a server over-return of an out-of-scope
# CLOSED issue (ENG-8, project Zeta) must trip scope purity → complete=false,
# exit 3. This proves the non-member-project check now covers the CLOSED leg
# (whole cache), not just the active leg.
# ===========================================================================
echo "Scenario 2: scope-purity invariant covers the closed leg (server over-return)"
S2="$(mktemp -d)"
LEAK_SIM=1 CLOSURE_FAIL=0
rc2=$(run_initiative "$S2")
INIT2="$S2/.cache/linear/initiative.json"
if [[ "$rc2" == "3" ]] && [[ "$(jq -r '.complete' "$INIT2")" == "false" ]]; then
  pass "over-returned out-of-scope Done issue trips scope purity → complete=false, exit 3"
else
  fail "leak not caught (exit $rc2, complete=$(jq -r '.complete' "$INIT2" 2>/dev/null)) — invariant does not cover the closed leg"
fi
if grep -q "HONESTY-FAIL" "$S2/err.log" && grep -q "Zeta" "$S2/err.log"; then
  pass "HONESTY-FAIL names the out-of-scope project (Zeta)"
else
  fail "expected a HONESTY-FAIL mentioning Zeta in stderr"
fi
rm -rf "$S2"
LEAK_SIM=0

# ===========================================================================
# Scenario 3 — blockedBy-closure failure marks complete=false (no silent drop).
# ===========================================================================
echo "Scenario 3: blockedBy-closure failure marks complete=false"
S3="$(mktemp -d)"
LEAK_SIM=0 CLOSURE_FAIL=1
rc3=$(run_initiative "$S3")
INIT3="$S3/.cache/linear/initiative.json"
if [[ "$rc3" == "3" ]] && [[ "$(jq -r '.complete' "$INIT3")" == "false" ]]; then
  pass "closure failure ⇒ complete=false, exit 3 (unresolved blocker never silently accepted)"
else
  fail "closure failure not reflected (exit $rc3, complete=$(jq -r '.complete' "$INIT3" 2>/dev/null))"
fi
rm -rf "$S3"
CLOSURE_FAIL=0

# ===========================================================================
# Scenario 4 — LABELS in the single-issue refresh (_write_issue_file).
# A live label write must land in initiative.json immediately.
# ===========================================================================
echo "Scenario 4: labels included in the single-issue refresh of initiative.json"
S4="$(mktemp -d)"
CACHE_DIR="$S4/.cache/linear"
mkdir -p "$CACHE_DIR/issues"
# Seed initiative.json with ENG-1 carrying the OLD label set + a stale state.
cat > "$CACHE_DIR/initiative.json" <<'JSON'
{
  "synced_at": "seed", "team": "ENG", "complete": true,
  "counts": {"total": 1, "external": 0, "byState": {"Todo": 1}},
  "issues": {
    "ENG-1": {"state": "Todo", "project": "Alpha", "milestone": null,
              "labels": ["area:api"], "updatedAt": "seed",
              "blockedBy": [], "blocks": [], "external": false}
  }
}
JSON
# Seed a minimal work-status.yaml so the flock/awk branch also exercises.
cat > "$CACHE_DIR/work-status.yaml" <<'YAML'
synced_at: "seed"
team_key: ENG

issues:
  ENG-1:
    title: "One"
    status: Todo
    kind: story
    milestone: none
    cycle: none
YAML
# A live read payload: new hold label added, state advanced.
REFRESH_JSON=$(jq -cn '{
  identifier: "ENG-1", title: "One",
  state: {name: "In Progress"},
  projectMilestone: null, cycle: null, description: "",
  labels: {nodes: [{name: "hold:qa"}, {name: "area:api"}]},
  relations: {nodes: []},
  inverseRelations: {nodes: []},
  comments: {nodes: []}
}')
( set -euo pipefail; _write_issue_file "ENG-1" "$REFRESH_JSON" ) > "$S4/out.log" 2> "$S4/err.log"
rc4=$?
new_labels=$(jq -c '.issues["ENG-1"].labels' "$CACHE_DIR/initiative.json")
new_state=$(jq -r '.issues["ENG-1"].state' "$CACHE_DIR/initiative.json")
if [[ "$rc4" == "0" ]]; then
  pass "_write_issue_file exits 0"
else
  fail "_write_issue_file exited $rc4"; sed 's/^/    /' "$S4/err.log" >&2
fi
if [[ "$new_labels" == '["area:api","hold:qa"]' ]]; then
  pass "labels updated in initiative.json (hold:qa now present) — live hold-label takes effect on the frontier"
else
  fail "labels NOT updated: got $new_labels (expected [\"area:api\",\"hold:qa\"])"
fi
if [[ "$new_state" == "In Progress" ]]; then
  pass "state co-updated in the same refresh"
else
  fail "state not updated: got $new_state"
fi
rm -rf "$S4"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
