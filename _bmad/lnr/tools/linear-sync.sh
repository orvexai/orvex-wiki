#!/usr/bin/env bash
# linear-sync.sh — repo-local cache engine for bmad-linear.
# Uses the `linearis` CLI to fetch Linear data and writes a structured YAML cache
# at <project_root>/.cache/linear/ (gitignored, mirroring docmost-cli's .cache/docs).
# Model: Linear PROJECT holds project-MILESTONES (former epics); ISSUES tag to a
# milestone; CYCLES (former sprints) are orthogonal time-boxes. Every issue in the
# project is cached — stories AND tracking/epic/spec issues — with a `kind:` field
# so callers can slice (board views filter `kind: story`).
# Reads config from _bmad/lnr/config.yaml (or _bmad/bmm/config.yaml fallback).
set -euo pipefail

LINEAR_NOT_CONFIGURED=0
TRACKING_SYSTEM=""

# ---------- config resolution ----------
resolve_config() {
  # Walk up from cwd to find _bmad root
  local search="$PWD"
  local config_file=""
  PROJECT_ROOT=""
  while [[ "$search" != "/" ]]; do
    if [[ -f "$search/_bmad/lnr/config.yaml" ]]; then
      config_file="$search/_bmad/lnr/config.yaml"
      PROJECT_ROOT="$search"
      break
    elif [[ -f "$search/_bmad/bmm/config.yaml" ]]; then
      config_file="$search/_bmad/bmm/config.yaml"
      PROJECT_ROOT="$search"
      break
    fi
    search="$(dirname "$search")"
  done

  if [[ -z "$config_file" ]]; then
    echo "ERROR: Cannot find _bmad/lnr/config.yaml or _bmad/bmm/config.yaml in any parent directory of $PWD" >&2
    exit 1
  fi

  TEAM_KEY=$(grep '^team_key:' "$config_file" | awk '{print $2}' | tr -d '"' | tr -d "'" || true)
  LINEAR_TENANT=$(grep '^linear_tenant:' "$config_file" | awk '{print $2}' | tr -d '"' | tr -d "'" || true)
  LINEAR_PROJECT=$(grep '^linear_project:' "$config_file" | sed 's/^linear_project:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
  LINEAR_INITIATIVE=$(grep '^linear_initiative:' "$config_file" | sed 's/^linear_initiative:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
  PROJECT_NAME=$(grep '^project_name:' "$config_file" 2>/dev/null | sed 's/^project_name:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)

  TRACKING_SYSTEM=$(grep '^tracking_system:' "$config_file" | awk '{print $2}' | tr -d '"' | tr -d "'" || true)

  # Scope key: linear_initiative is REQUIRED for Linear mode. linear_project is a legacy
  # key that MAY still be set (an explicit single-project scope alongside the initiative,
  # e.g. for the legacy `sync` command), but it can no longer stand in for linear_initiative.
  # A config carrying linear_project WITHOUT linear_initiative is a hard migration error —
  # PO decision 2026-07-09 (hard cut): no silent project-scoped fallback. Scoped to Linear
  # mode only — a file-system-tracked repo with a stray/uncommented legacy linear_project
  # key is not blocked; the gate only fires when tracking_system actually selects Linear.
  if [[ "$TRACKING_SYSTEM" == "linear" && -z "$LINEAR_INITIATIVE" && -n "$LINEAR_PROJECT" ]]; then
    echo "ERROR: config-level Linear scope binding is out of date." >&2
    echo "  '$config_file' sets the legacy key 'linear_project' but not 'linear_initiative'." >&2
    echo "  linear_project alone is no longer a valid scope binding — it will NOT silently" >&2
    echo "  fall back to project scope." >&2
    echo "" >&2
    echo "  Fix — add one line to $config_file:" >&2
    echo "    linear_initiative: <initiative-name-or-UUID>" >&2
    echo "" >&2
    echo "  See bmad-linear/README.md 'Linear tracking' config block for the full key set." >&2
    echo "  (Per-command explicit overrides, e.g. --project on a single command or" >&2
    echo "  --projects-file on sync-initiative, are unaffected — only this config-level" >&2
    echo "  binding is retired.)" >&2
    exit 1
  fi

  if [[ -z "$TEAM_KEY" || -z "$LINEAR_TENANT" || -z "$LINEAR_INITIATIVE" ]]; then
    LINEAR_NOT_CONFIGURED=1
    return 0
  fi

  # Repo-local cache (gitignored), mirroring docmost-cli's .cache/docs link.
  # No longer XDG-rooted or keyed by tenant/slug — the cache lives beside the code.
  CACHE_DIR="$PROJECT_ROOT/.cache/linear"
}

# ensure_gitignore: idempotently keep ".cache/linear/" out of version control,
# mirroring how docmost-cli gitignores its .cache/docs link.
ensure_gitignore() {
  [[ -n "$PROJECT_ROOT" ]] || return 0
  local gitignore="$PROJECT_ROOT/.gitignore"
  local entry=".cache/linear/"
  if [[ -f "$gitignore" ]]; then
    grep -qxF "$entry" "$gitignore" && return 0
  fi
  printf '%s\n' "$entry" >> "$gitignore"
}

check_deps() {
  command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not found in PATH (apt install jq / brew install jq)" >&2; exit 1; }
  command -v linearis >/dev/null 2>&1 || { echo "ERROR: linearis CLI not found. Install with: npm i -g linearis && linearis auth login" >&2; exit 1; }
}

# project_hint: actionable guidance for the recurring name-vs-slug failure.
# `linearis` resolves --project by NAME (or UUID), NOT by slug. The BMAD installer
# tends to write the slug into linear_project, which linearis rejects.
project_hint() {
  echo "  → linearis matches --project by NAME (or UUID), not by slug." >&2
  echo "    Set linear_project to the project's display NAME (e.g. \"Linear CLI\")" >&2
  echo "    in _bmad/lnr/config.yaml AND its installer source _bmad/config.toml." >&2
  echo "    (The BMAD installer may have written the slug '$LINEAR_PROJECT', which linearis rejects.)" >&2
}

# ---------- milestone-map ----------
# gen_milestone_map: regenerates milestone-map.md from the cached work-status.yaml
# and per-issue YAML files. Reads milestone id+title from work-status.yaml's
# milestone map (where each entry has key/title/status lines under the id).
gen_milestone_map() {
  local map_file="$CACHE_DIR/milestone-map.md"
  local generated_at
  generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  {
    echo "# ${PROJECT_NAME:-$LINEAR_PROJECT} Milestone Map"
    echo ""
    echo "**Project:** ${PROJECT_NAME:-$LINEAR_PROJECT}"
    echo "**Team:** $TEAM_KEY"
    echo "**Generated:** $generated_at"
    echo ""
    echo "## Milestone → Issue Mapping"

    local milestone_ids=()
    local milestone_titles=()

    # Parse milestones keyed by UUID ("  <uuid>:"), reading the "    name:" sub-field.
    while IFS='|' read -r mid mtitle; do
      milestone_ids+=("$mid")
      milestone_titles+=("$mtitle")
    done < <(awk '
      /^milestones:/ { in_milestones=1; next }
      /^issues:/ { in_milestones=0; next }
      /^[a-z]/ && !/^[[:space:]]/ { in_milestones=0 }
      in_milestones && /^  [0-9a-f-]+:[[:space:]]*$/ {
        id=$1; sub(/:$/, "", id)
        current_id=id
        next
      }
      in_milestones && current_id != "" && /^    name:/ {
        title_line=$0
        sub(/^    name:[[:space:]]*/, "", title_line)
        sub(/^"/, "", title_line)
        sub(/"$/, "", title_line)
        print current_id "|" title_line
        current_id=""
      }
    ' "$CACHE_DIR/work-status.yaml")

    local total_issues=0
    for i in "${!milestone_ids[@]}"; do
      local mid="${milestone_ids[$i]}"
      local mtitle="${milestone_titles[$i]}"
      echo ""
      echo "### ${mid}: ${mtitle}"
      echo "| Issue | Title | Status | File |"
      echo "|-------|-------|--------|------|"

      for issue_file in "$CACHE_DIR/issues"/*.yaml; do
        [[ -f "$issue_file" ]] || continue
        local i_milestone
        i_milestone=$(grep '^milestone:' "$issue_file" | awk '{print $2}')
        if [[ "$i_milestone" == "$mid" ]]; then
          local i_id i_title i_status
          i_id=$(grep '^identifier:' "$issue_file" | awk '{print $2}')
          i_title=$(grep '^title:' "$issue_file" | sed 's/^title:[[:space:]]*//' | sed 's/^"//;s/"$//')
          i_status=$(grep '^status:' "$issue_file" | awk '{print $2}')
          echo "| $i_id | $i_title | $i_status | \`issues/$i_id.yaml\` |"
          total_issues=$((total_issues + 1))
        fi
      done
    done

    echo ""
    echo "## Summary"
    echo ""
    echo "| Milestone | Issues |"
    echo "|-----------|--------|"
    for i in "${!milestone_ids[@]}"; do
      local mid="${milestone_ids[$i]}"
      local mtitle="${milestone_titles[$i]}"
      local mcount=0
      for issue_file in "$CACHE_DIR/issues"/*.yaml; do
        [[ -f "$issue_file" ]] || continue
        local i_milestone
        i_milestone=$(grep '^milestone:' "$issue_file" | awk '{print $2}')
        [[ "$i_milestone" == "$mid" ]] && mcount=$((mcount + 1))
      done
      echo "| ${mid}: ${mtitle} | $mcount |"
    done
    echo "| **Total (milestone-mapped)** | **$total_issues** |"
  } > "$map_file"
}

# kind_expr: jq snippet classifying an issue by title → story | epic | other.
# `other` covers tracking/meta issues (e.g. a sibling-alignment audit) that are
# real project issues but not work stories.
KIND_EXPR='(if (.title|test("^Story \\d")) then "story" elif (.title|test("^Epic ")) then "epic" else "other" end)'

# fetch_all_issues: paginate `linearis issues list` via pageInfo.endCursor into a
# single combined JSON node-array at $1. Aborts (returns 1) on any error/odd shape
# WITHOUT having written the cache, so a partial fetch never clobbers a good cache.
fetch_all_issues() {
  local out="$1"
  local after="" page=0 max_pages=50
  local page_json page_err; page_json=$(mktemp); page_err=$(mktemp)
  printf '[]' > "$out"
  while :; do
    page=$((page + 1))
    if [[ $page -gt $max_pages ]]; then
      echo "ERROR: pagination exceeded $max_pages pages (cursor not advancing?) — aborting" >&2
      rm -f "$page_json" "$page_err"; return 1
    fi
    # stdout (JSON) and stderr (warnings) are kept SEPARATE — merging them would let a
    # linearis stderr line corrupt the JSON buffer and false-abort the sync.
    if [[ -z "$after" ]]; then
      linearis issues list --team "$TEAM_KEY" --project "$LINEAR_PROJECT" --limit 100 > "$page_json" 2>"$page_err" || true
    else
      linearis issues list --team "$TEAM_KEY" --project "$LINEAR_PROJECT" --limit 100 --after "$after" > "$page_json" 2>"$page_err" || true
    fi
    # Error / shape guard — abort the whole sync before writing anything.
    local err
    err=$(jq -r 'if type=="object" and has("error") then .error else empty end' "$page_json" 2>/dev/null || echo "PARSE_ERROR")
    if [[ -n "$err" ]]; then
      echo "ERROR: linearis issues list failed: $err" >&2
      project_hint
      rm -f "$page_json" "$page_err"; return 1
    fi
    if ! jq -e 'has("nodes")' "$page_json" >/dev/null 2>&1; then
      echo "ERROR: unexpected linearis response shape (no .nodes):" >&2
      head -c 300 "$page_json" >&2; echo >&2
      [[ -s "$page_err" ]] && { echo "  linearis stderr:" >&2; head -c 300 "$page_err" >&2; echo >&2; }
      rm -f "$page_json" "$page_err"; return 1
    fi
    jq -s '.[0] + (.[1].nodes // [])' "$out" "$page_json" > "$out.next" && mv "$out.next" "$out"
    local has_next end_cursor
    has_next=$(jq -r '.pageInfo.hasNextPage // false' "$page_json")
    end_cursor=$(jq -r '.pageInfo.endCursor // empty' "$page_json")
    [[ "$has_next" == "true" && -n "$end_cursor" ]] || break
    after="$end_cursor"
  done
  rm -f "$page_json" "$page_err"
  return 0
}

# ---------- sync ----------
cmd_sync() {
  if [[ "${LINEAR_NOT_CONFIGURED:-0}" == "1" ]]; then
    echo "ERROR: Linear not configured — set tracking_system: linear, linear_tenant, linear_initiative, team_key in config" >&2
    exit 1
  fi
  if [[ -z "${LINEAR_PROJECT:-}" ]]; then
    echo "ERROR: 'sync' is the legacy single-project refresh and needs linear_project. You have linear_initiative set — use: linear-sync.sh sync-initiative" >&2
    exit 1
  fi
  check_deps
  ensure_gitignore
  mkdir -p "$CACHE_DIR/issues"

  echo "Syncing Linear issues for project \"$LINEAR_PROJECT\" (team $TEAM_KEY)..."

  local tmpfile ms_tmpfile
  tmpfile=$(mktemp)
  ms_tmpfile=$(mktemp)

  # Fetch ALL issues (paginated, all kinds). Abort before writing on any failure.
  if ! fetch_all_issues "$tmpfile"; then
    rm -f "$tmpfile" "$ms_tmpfile"
    echo "Sync aborted — existing cache left untouched." >&2
    exit 1
  fi

  # Fetch project-milestones separately (they are not issues). stdout (JSON) and
  # stderr (warnings) kept SEPARATE so a linearis stderr line can't corrupt the JSON.
  local ms_err; ms_err=$(mktemp)
  if ! linearis milestones list --project "$LINEAR_PROJECT" > "$ms_tmpfile" 2>"$ms_err" \
     || jq -e 'if type=="object" and has("error") then true else false end' "$ms_tmpfile" >/dev/null 2>&1; then
    echo "ERROR: linearis milestones list failed:" >&2
    head -c 300 "$ms_tmpfile" >&2; echo >&2
    [[ -s "$ms_err" ]] && { echo "  linearis stderr:" >&2; head -c 300 "$ms_err" >&2; echo >&2; }
    project_hint
    rm -f "$tmpfile" "$ms_tmpfile" "$ms_err"
    echo "Sync aborted — existing cache left untouched." >&2
    exit 1
  fi
  rm -f "$ms_err"
  # Normalise milestones to a bare array ({nodes,…} OR a bare array OR error-guarded above).
  jq '.nodes // .' "$ms_tmpfile" > "$ms_tmpfile.arr" && mv "$ms_tmpfile.arr" "$ms_tmpfile"

  _process_issues "$tmpfile" "$ms_tmpfile"
  rm -f "$tmpfile" "$ms_tmpfile"
}

_process_issues() {
  local tmpfile="$1"   # combined bare array of ALL issue nodes
  local ms_tmpfile="$2"
  local synced_at
  synced_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local ws_tmp="$CACHE_DIR/work-status.yaml.tmp"

  {
    echo "synced_at: \"$synced_at\""
    echo "team_key: $TEAM_KEY"
    echo "linear_project: $LINEAR_PROJECT"
    echo "project: ${PROJECT_NAME:-$LINEAR_PROJECT}"
    echo ""
    echo "milestones:"

    # Real project-milestones from linearis milestones list, keyed by UUID.
    jq -r '
      sort_by(.targetDate // "9999") |
      .[] |
      "  " + .id + ":\n" +
      "    name: " + (.name | @json) + "\n" +
      "    target_date: " + (.targetDate // "null")
    ' "$ms_tmpfile"

    echo ""
    echo "issues:"

    # ALL issues (stories + epics + tracking/meta), keyed by Linear identifier,
    # sorted by issue number. `kind:` classifies; `milestone:`=projectMilestone.id.
    jq -r '
      def kind: '"$KIND_EXPR"';
      sort_by(.identifier | split("-") | last | tonumber) |
      .[] |
      "  " + .identifier + ":\n" +
      "    title: " + (.title | @json) + "\n" +
      "    status: " + .state.name + "\n" +
      "    kind: " + kind + "\n" +
      "    milestone: " + (.projectMilestone.id // "none") + "\n" +
      "    cycle: " + ((.cycle.number // empty | tostring) // "none")
    ' "$tmpfile"
  } > "$ws_tmp"
  mv "$ws_tmp" "$CACHE_DIR/work-status.yaml"

  local issue_count=0
  while IFS= read -r issue; do
    local id
    id=$(echo "$issue" | jq -r '.identifier')
    echo "$issue" | jq -r '
      def kind: '"$KIND_EXPR"';
      "identifier: " + .identifier,
      "title: " + (.title | @json),
      "status: " + .state.name,
      "kind: " + kind,
      "milestone: " + (.projectMilestone.id // "none"),
      "cycle: " + ((.cycle.number // empty | tostring) // "none"),
      (if (.description // "") == "" then "description: \"\""
       else "description: |\n" + (.description | split("\n") | map("  " + .) | join("\n"))
       end)
    ' > "$CACHE_DIR/issues/$id.yaml"
    issue_count=$((issue_count + 1))
  done < <(jq -c '.[]' "$tmpfile")

  echo "$synced_at" > "$CACHE_DIR/.last-sync"

  local milestone_count
  milestone_count=$(jq 'length' "$ms_tmpfile")

  gen_milestone_map

  echo "Synced $milestone_count milestones, $issue_count issues to $CACHE_DIR/"
  echo "  work-status.yaml updated"
  echo "  milestone-map.md updated"
  echo "  $issue_count issue files written to issues/"
}

# ---------- issue (single-issue refresh; `story` kept as an alias) ----------
cmd_issue() {
  if [[ "${LINEAR_NOT_CONFIGURED:-0}" == "1" ]]; then
    echo "ERROR: Linear not configured — set tracking_system: linear, linear_tenant, linear_initiative, team_key in config" >&2
    exit 1
  fi
  check_deps
  ensure_gitignore
  local issue_id="$1"
  mkdir -p "$CACHE_DIR/issues"

  echo "Refreshing $issue_id..."
  local json err_file; err_file=$(mktemp)
  # stdout (JSON) captured to $json; stderr to $err_file so a warning can't corrupt the JSON.
  # --with-comments: the refresh-on-write cache model makes this file the ONLY read surface
  # for the ticket — agents need the discussion thread too.
  if ! json=$(linearis issues read "$issue_id" --with-comments 2>"$err_file") \
     || jq -e 'if type=="object" and has("error") then true else false end' <<<"$json" >/dev/null 2>&1; then
    echo "ERROR: linearis issues read $issue_id failed:" >&2
    head -c 300 <<<"$json" >&2; echo >&2
    [[ -s "$err_file" ]] && { echo "  linearis stderr:" >&2; head -c 300 "$err_file" >&2; echo >&2; }
    rm -f "$err_file"
    exit 1
  fi
  rm -f "$err_file"
  _write_issue_file "$issue_id" "$json"
}

_write_issue_file() {
  local issue_id="$1"
  local json="$2"

  local status
  status=$(echo "$json" | jq -r '.state.name')

  echo "$json" | jq -r '
    def kind: '"$KIND_EXPR"';
    "identifier: " + .identifier,
    "title: " + (.title | @json),
    "status: " + .state.name,
    "kind: " + kind,
    "milestone: " + (.projectMilestone.id // "none"),
    "cycle: " + ((.cycle.number // empty | tostring) // "none"),
    (if (.description // "") == "" then "description: \"\""
     else "description: |\n" + (.description | split("\n") | map("  " + .) | join("\n"))
     end),
    # Comments live under .comments.nodes (an object with a nodes[] array), NOT a
    # bare array. Author/body access is defensive (shape varies across linearis versions).
    (if ((.comments.nodes // []) | length) == 0 then "comments: []"
     else "comments:\n" + ([.comments.nodes[] |
       "  - author: " + ((.user.name // .user.displayName // .user.email // "unknown") | @json) + "\n" +
       "    body: |\n" + ((.body // "") | split("\n") | map("      " + .) | join("\n"))] | join("\n"))
     end)
  ' > "$CACHE_DIR/issues/$issue_id.yaml"

  if [[ -f "$CACHE_DIR/work-status.yaml" ]]; then
    awk -v id="$issue_id" -v new_status="$status" '
      $0 ~ "^  " id ":" { found=1; print; next }
      found && /^    status:/ { print "    status: " new_status; found=0; next }
      { print }
    ' "$CACHE_DIR/work-status.yaml" > "$CACHE_DIR/work-status.yaml.tmp"
    mv "$CACHE_DIR/work-status.yaml.tmp" "$CACHE_DIR/work-status.yaml"
  fi

  # Refresh-on-write cache model: also update initiative.json (the delivery engines'
  # state/graph cache) so LOCAL frontier recomputes see this ticket's new state with
  # zero API calls — including ACROSS partitioned engines (A's Done unblocks B's
  # successors). flock serializes concurrent refreshes from two engines; the state
  # AND the blockedBy/blocks edges are updated from the same live read.
  local init="$CACHE_DIR/initiative.json"
  if [[ -f "$init" ]]; then
    (
      flock -x 9
      jq --arg id "$issue_id" --arg st "$status" \
         --argjson bb "$(echo "$json" | jq '[.inverseRelations.nodes[]? | select(.type=="blocks") | .issue.identifier] | unique')" \
         --argjson bl "$(echo "$json" | jq '[.relations.nodes[]? | select(.type=="blocks") | .relatedIssue.identifier] | unique')" \
         'if .issues[$id] then (.issues[$id].state = $st | .issues[$id].blockedBy = $bb | .issues[$id].blocks = $bl) else . end' \
         "$init" > "$init.tmp.$$" && mv "$init.tmp.$$" "$init"
    ) 9>"$init.lock"
  fi

  echo "Refreshed $issue_id (status: $status)"
}

# ---------- update ----------
cmd_update() {
  if [[ "${LINEAR_NOT_CONFIGURED:-0}" == "1" ]]; then
    echo "ERROR: Linear not configured — set tracking_system: linear, linear_tenant, linear_initiative, team_key in config" >&2
    exit 1
  fi
  check_deps
  local issue_id="$1"
  shift

  local status=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --status) status="$2"; shift 2 ;;
      *) echo "ERROR: Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  if [[ -z "$status" ]]; then
    echo "ERROR: --status is required" >&2
    echo "Usage: linear-sync.sh update <ID> --status <state>" >&2
    exit 1
  fi

  echo "Updating $issue_id to status '$status' in Linear..."
  linearis issues update "$issue_id" --status "$status"
  cmd_issue "$issue_id"
}

# ---------- check ----------
cmd_check() {
  if [[ "${LINEAR_NOT_CONFIGURED:-0}" == "1" ]]; then
    echo "linear tracking not active (tracking_system: ${TRACKING_SYSTEM:-file-system}) — set tracking_system: linear in config to enable"
    exit 0
  fi

  if [[ ! -f "$CACHE_DIR/.last-sync" ]]; then
    echo "cache absent — run: _bmad/lnr/tools/linear-sync.sh sync"
    exit 0
  fi

  local last_sync
  last_sync=$(cat "$CACHE_DIR/.last-sync")

  local last_epoch now_epoch age_minutes
  last_epoch=$(date -d "$last_sync" +%s 2>/dev/null || date -jf "%Y-%m-%dT%H:%M:%SZ" "$last_sync" +%s 2>/dev/null)
  now_epoch=$(date +%s)
  age_minutes=$(( (now_epoch - last_epoch) / 60 ))

  if [[ $age_minutes -gt 30 ]]; then
    echo "cache stale ($age_minutes min old) — run: _bmad/lnr/tools/linear-sync.sh sync"
    exit 0
  fi

  echo "cache fresh ($age_minutes min old) — $CACHE_DIR"
  exit 0
}

# ---------- initiative sync (whole-team, ALL states + blocked-by graph) ----------
# The delivery engine needs the WHOLE initiative (all projects under it — one team),
# INCLUDING Done (which `issues list` excludes by default), plus each candidate's
# blocked-by edges. The linearis list payload already carries state, labels, project,
# milestone, updatedAt, AND populated relations/inverseRelations — so the entire
# frontier is a handful of paginated list calls with ZERO per-issue reads (a naive
# frontier that did a per-project live sweep + a per-candidate live relation read
# every tick would drain the shared hourly quota). Output: .cache/linear/initiative.json
# — a slim, jq-friendly projection keyed by identifier. Deliberately does NOT touch
# work-status.yaml / milestone-map.md / issues/*.yaml (those stay owned by the
# single-project `sync`).

# DEPRECATED / UNUSED: fetch_paginated + fetch_done_scoped were the linearis-`issues list`
# fetch path for cmd_sync_initiative. They are SUPERSEDED by the direct-GraphQL path below
# (gql_paginate + GQL_ACTIVE/GQL_CLOSED) because the linearis list fragment carries FOUR
# unbounded nested connections whose per-page complexity Linear meters as ~hundreds of
# request-equivalents, exhausting the hourly budget. Kept here (not called by any command)
# only to minimise churn; safe to delete in a follow-up.
# fetch_paginated <out> [extra linearis args...]: team-scoped (no --project) paginated
# `issues list` into a combined bare node-array at <out>. Aborts (return 1) WITHOUT
# writing on any error/odd shape, so a partial fetch never yields a half cache.
fetch_paginated() {
  local out="$1"; shift
  local extra=("$@")
  local after="" page=0 max_pages=50
  local page_json page_err; page_json=$(mktemp); page_err=$(mktemp)
  printf '[]' > "$out"
  while :; do
    page=$((page + 1))
    if [[ $page -gt $max_pages ]]; then
      echo "ERROR: pagination exceeded $max_pages pages (cursor not advancing?) — aborting" >&2
      rm -f "$page_json" "$page_err"; return 1
    fi
    if [[ -z "$after" ]]; then
      linearis issues list --team "$TEAM_KEY" --limit 100 "${extra[@]}" > "$page_json" 2>"$page_err" || true
    else
      linearis issues list --team "$TEAM_KEY" --limit 100 "${extra[@]}" --after "$after" > "$page_json" 2>"$page_err" || true
    fi
    local err
    err=$(jq -r 'if type=="object" and has("error") then .error else empty end' "$page_json" 2>/dev/null || echo "PARSE_ERROR")
    if [[ -n "$err" ]]; then
      echo "ERROR: linearis issues list ${extra[*]} failed: $err" >&2
      rm -f "$page_json" "$page_err"; return 1
    fi
    if ! jq -e 'has("nodes")' "$page_json" >/dev/null 2>&1; then
      echo "ERROR: unexpected linearis response shape (no .nodes):" >&2
      head -c 300 "$page_json" >&2; echo >&2
      [[ -s "$page_err" ]] && { echo "  linearis stderr:" >&2; head -c 300 "$page_err" >&2; echo >&2; }
      rm -f "$page_json" "$page_err"; return 1
    fi
    jq -s '.[0] + (.[1].nodes // [])' "$out" "$page_json" > "$out.next" && mv "$out.next" "$out"
    local has_next end_cursor
    has_next=$(jq -r '.pageInfo.hasNextPage // false' "$page_json")
    end_cursor=$(jq -r '.pageInfo.endCursor // empty' "$page_json")
    [[ "$has_next" == "true" && -n "$end_cursor" ]] || break
    after="$end_cursor"
    sleep 0.3   # be gentle on the shared quota between pages
  done
  rm -f "$page_json" "$page_err"
  return 0
}

# fetch_done_scoped <out> <projects_file>: SERVER-SIDE scoped Done fetch. Instead of one
# team-wide `--status Done` pass (which pays for the team's ENTIRE Done history and
# reliably exhausts Linear's hourly complexity budget mid-pagination), this runs one
# project-scoped `--project <name> --status Done` paginated fetch per allowlisted project
# and concatenates the results. The initiative's projects typically hold only a bounded
# set of Done issues total, so the query complexity drops substantially and the fetch fits
# the budget. Returns 1 (partial) if ANY project's Done fetch fails, leaving whatever was
# fetched so far in <out> (the caller marks complete=false); returns 0 only when every
# project's Done pages fully drained. Stops on the first failure to avoid re-draining quota.
fetch_done_scoped() {
  local out="$1" projects_file="$2"
  local proj_tmp; proj_tmp=$(mktemp)
  printf '[]' > "$out"
  local rc=0
  while IFS= read -r pname || [[ -n "$pname" ]]; do
    [[ -n "$pname" ]] || continue
    if ! fetch_paginated "$proj_tmp" --project "$pname" --status Done; then
      echo "WARN: Done fetch failed for project '$pname' (rate-limited?) — stopping scoped Done fetch." >&2
      rc=1
      break
    fi
    jq -s '.[0] + .[1]' "$out" "$proj_tmp" > "$out.next" && mv "$out.next" "$out"
  done < "$projects_file"
  rm -f "$proj_tmp"
  return $rc
}

# ============================================================================
# Direct-GraphQL initiative fetch (replaces the linearis `issues list` path for
# cmd_sync_initiative ONLY — every other command still uses linearis).
#
# WHY: `linearis issues list` issues ONE HTTP request per page (dist/services/
# issue-service.js listIssues → GraphQLClient.request → @linear/sdk rawRequest — NO
# per-issue fan-out), BUT the fixed `CompleteIssueFields` fragment (dist/gql/gql.js)
# requests FOUR UNBOUNDED nested connections — labels.nodes, children.nodes,
# relations.nodes, inverseRelations.nodes — with no `first:` cap. Linear's rate limiter
# is COMPLEXITY-metered: a `first:100` page × ~4 nested connections (default ~50 each)
# scores ~tens-of-thousands of complexity and debits ~hundreds of "request-equivalents"
# from the hourly bucket. Empirically a naive team-wide Done pass can die after only a
# handful of such fat requests. PLUS each filtered `issues list` invocation silently
# runs a BatchResolveForSearch request first (dist/common/resolve-filters.js:61).
#
# FIX: talk to https://api.linear.app/graphql directly with the SAME token linearis uses,
# with (A) an ACTIVE query whose nested connections are BOUNDED `first:50`, and (B) a SLIM
# CLOSED query with ZERO nested connections — collapsing per-page complexity to ~O(1)
# request-equivalents. Server-side team + state (+ optional project/initiative) filters
# replace the BatchResolve round-trip. Output contract (initiative.json + per-issue YAML)
# is unchanged.
# ============================================================================
LINEAR_GQL_ENDPOINT="https://api.linear.app/graphql"

# resolve_linear_token: mirror linearis' token precedence for the token that is OPERATIVE
# in this environment. dist/common/auth.js resolves: --api-token flag > $LINEAR_API_TOKEN >
# encrypted stored (~/.config/linearis/token) > legacy plaintext (~/.linear_api_token).
# The encrypted stored token cannot be read from bash; if linearis on a given box already
# falls back to the legacy plaintext file (it prints the "~/.linear_api_token is
# deprecated" warning on every call), that file IS the live token. Precedence here: env,
# then legacy.
resolve_linear_token() {
  if [[ -n "${LINEAR_API_TOKEN:-}" ]]; then
    LINEAR_TOKEN="$LINEAR_API_TOKEN"; return 0
  fi
  if [[ -f "$HOME/.linear_api_token" ]]; then
    LINEAR_TOKEN="$(tr -d '[:space:]' < "$HOME/.linear_api_token")"
    [[ -n "$LINEAR_TOKEN" ]] && return 0
  fi
  echo "ERROR: no Linear API token — set \$LINEAR_API_TOKEN or create ~/.linear_api_token" >&2
  return 1
}

# LAST_RATELIMIT_HEADERS: the raw "name: value" rate-limit/complexity header lines captured
# from the MOST RECENT gql_post response. Callers append it to error messages so every
# failure carries the real budget numbers. Reset to empty by each gql_post.
LAST_RATELIMIT_HEADERS=""

# sync_log_path: where the per-call rate-limit budget line is appended. Lives beside the
# cache when configured; falls back to a temp file otherwise (e.g. the `quota` probe before
# a cache exists). Never fatal.
sync_log_path() {
  if [[ -n "${CACHE_DIR:-}" ]]; then
    printf '%s' "$CACHE_DIR/sync.log"
  else
    printf '%s' "${TMPDIR:-/tmp}/linear-sync.log"
  fi
}

# log_ratelimit_headers <raw-header-lines>: append ONE timestamped line carrying the raw
# Linear rate-limit / complexity headers (name+value) to the sync log, so every call's
# remaining budget is durably recorded. Best-effort — never fails the sync.
log_ratelimit_headers() {
  local headers="$1"
  [[ -n "$headers" ]] || return 0
  local logf ts
  logf=$(sync_log_path)
  mkdir -p "$(dirname "$logf")" 2>/dev/null || true
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  printf '%s ratelimit %s\n' "$ts" "$(printf '%s' "$headers" | tr '\n' ' ' | sed 's/  */ /g')" \
    >> "$logf" 2>/dev/null || true
}

# gql_post <query> <variables_json>: POST to Linear's GraphQL endpoint; raw response JSON
# to stdout. @linear/sdk sends the personal API key as a raw Authorization header (no
# "Bearer " prefix) — we mirror that. Returns non-zero only on curl/transport failure;
# GraphQL-level errors (rate limit, bad filter) surface as {errors:[...]} in the body.
# INSTRUMENTED: response headers are dumped via `curl -D` and every Linear rate-limit /
# complexity header (whatever x-ratelimit-* / x-complexity / retry-after the API returns)
# is captured to LAST_RATELIMIT_HEADERS and appended to the sync log — so the real request
# AND complexity budget (remaining/limit/reset) is recorded on EVERY call, and any future
# 429 carries the numbers that explain it.
gql_post() {
  local query="$1" vars="$2" body hdr rc
  body=$(jq -cn --arg q "$query" --argjson v "$vars" '{query:$q, variables:$v}') || return 1
  hdr=$(mktemp)
  curl -sS -X POST "$LINEAR_GQL_ENDPOINT" \
    -H "Authorization: $LINEAR_TOKEN" \
    -H "Content-Type: application/json" \
    -D "$hdr" \
    --max-time 45 \
    --data-binary "$body"
  rc=$?
  # Grep the rate-limit / complexity headers case-insensitively (HTTP/2 lowercases them;
  # HTTP/1.1 may not) and strip CRs. We log whatever Linear actually returns rather than
  # hardcoding names, so a rename or an added complexity header still lands in the log.
  # `|| true`: grep exits 1 when NO rate-limit header is present (e.g. an edge/CDN 429); that
  # must not abort the caller under set -e/pipefail — an empty capture is a valid outcome.
  LAST_RATELIMIT_HEADERS=$(grep -iE '^(x-ratelimit-|x-complexity|retry-after)' "$hdr" 2>/dev/null | tr -d '\r' || true)
  rm -f "$hdr"
  log_ratelimit_headers "$LAST_RATELIMIT_HEADERS"
  return $rc
}

# gql_paginate <out> <query> <base_vars_json> <page_size>: drain issues(...) pagination via
# pageInfo.endCursor into a combined bare node-array at <out>. `first`/`after` are injected
# per page (the caller's base vars carry only `filter`). Returns 1 on any transport / GraphQL
# error / odd shape, LEAVING whatever nodes were accumulated in <out> (so a non-fatal Done
# caller can keep the partial). Never writes the caller's cache — only <out>.
gql_paginate() {
  local out="$1" query="$2" base_vars="$3" page_size="$4"
  local after="" page=0 max_pages=200
  local resp; resp=$(mktemp)
  printf '[]' > "$out"
  while :; do
    page=$((page + 1))
    if [[ $page -gt $max_pages ]]; then
      echo "ERROR: pagination exceeded $max_pages pages (cursor not advancing?) — aborting" >&2
      rm -f "$resp"; return 1
    fi
    local vars
    vars=$(echo "$base_vars" | jq -c --argjson first "$page_size" --arg after "$after" \
      '. + {first:$first, after: (if $after=="" then null else $after end)}') || { rm -f "$resp"; return 1; }
    if ! gql_post "$query" "$vars" > "$resp" 2>/dev/null; then
      echo "ERROR: GraphQL transport failure (curl) on page $page" >&2
      rm -f "$resp"; return 1
    fi
    local gqlerr
    gqlerr=$(jq -r 'if (.errors|type)=="array" then (.errors[0].message // "unknown") else empty end' "$resp" 2>/dev/null || echo "PARSE_ERROR")
    if [[ -n "$gqlerr" ]]; then
      echo "ERROR: Linear GraphQL error on page $page: $gqlerr" >&2
      [[ -n "$LAST_RATELIMIT_HEADERS" ]] && { echo "  rate-limit budget at failure:" >&2; printf '%s\n' "$LAST_RATELIMIT_HEADERS" | sed 's/^/    /' >&2; }
      rm -f "$resp"; return 1
    fi
    if ! jq -e '.data.issues | has("nodes")' "$resp" >/dev/null 2>&1; then
      echo "ERROR: unexpected GraphQL response shape (no .data.issues.nodes) on page $page:" >&2
      head -c 300 "$resp" >&2; echo >&2
      rm -f "$resp"; return 1
    fi
    jq '.data.issues.nodes' "$resp" > "$resp.nodes"
    jq -s '.[0] + .[1]' "$out" "$resp.nodes" > "$out.next" && mv "$out.next" "$out"
    rm -f "$resp.nodes"
    local has_next end_cursor
    has_next=$(jq -r '.data.issues.pageInfo.hasNextPage // false' "$resp")
    end_cursor=$(jq -r '.data.issues.pageInfo.endCursor // empty' "$resp")
    [[ "$has_next" == "true" && -n "$end_cursor" ]] || break
    after="$end_cursor"
  done
  rm -f "$resp"
  return 0
}

# Query A — ACTIVE issues (state type NOT completed/canceled). Nested connections are
# BOUNDED first:50 and each carries its OWN `pageInfo { hasNextPage }` so first-page
# truncation is DETECTABLE (never silent). The caps are SMALL on purpose: a big bulk cap
# multiplies per-page complexity substantially and can rate-limit on PAGE 1 of a thin quota
# window. Because resolve_overflow/drain_connection below re-fetch ANY connection reporting
# hasNextPage=true to exhaustion per issue, small caps + drains for the rare outlier is
# strictly cheaper than a large bulk cap paid on every page:
#   * relations / inverseRelations at first:50 — observed blockedBy fan-out is small in
#     practice, so drains fire for almost nothing; the tail is carried correctly by
#     drain_connection when it does.
#   * labels stays first:50 (issues typically carry only a handful) — still guarded.
#
# Per-issue complexity of THIS fragment under Linear's node-count model (connection first:N
# contributes N leaf nodes; a node with a 1:1 sub-object costs itself + the sub-object):
#     labels(50)            = 50
#     relations(50)         = 50 nodes + 50 relatedIssue = 100
#     inverseRelations(50)  = 50 nodes + 50 issue        = 100
#     scalars + 5 small 1:1 objects (state/project/projectMilestone/cycle/assignee) ≈ 10
#     ---------------------------------------------------------------
#     per issue ≈ 260  → budget with margin at ~300.
# The top-level issues(first: P) multiplies that by P, so page complexity ≈ P × 300.
# gql_paginate is called with P=25 (see cmd_sync_initiative) ⇒ worst case 25 × 300 = 7,500,
# a safe margin under Linear's per-request complexity hard cap.
GQL_ACTIVE='query ActiveIssues($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt, includeArchived: false) {
    nodes {
      id
      identifier
      title
      description
      updatedAt
      state { name type }
      project { name }
      projectMilestone { id name }
      cycle { number }
      assignee { name }
      labels(first: 50) { nodes { name } pageInfo { hasNextPage } }
      relations(first: 50) { nodes { type relatedIssue { identifier } } pageInfo { hasNextPage } }
      inverseRelations(first: 50) { nodes { type issue { identifier } } pageInfo { hasNextPage } }
    }
    pageInfo { hasNextPage endCursor }
  }
}'

# Follow-up single-issue connection queries — used by drain_connection to paginate ONE
# nested connection of ONE issue to exhaustion when the list query flagged hasNextPage=true.
# Node shapes match GQL_ACTIVE exactly (so the drained set slots straight into projection);
# these carry endCursor because THEY are the paginating query.
GQL_LABELS_PAGE='query IssueLabels($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    labels(first: $first, after: $after) { nodes { name } pageInfo { hasNextPage endCursor } }
  }
}'
GQL_RELATIONS_PAGE='query IssueRelations($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    relations(first: $first, after: $after) { nodes { type relatedIssue { identifier } } pageInfo { hasNextPage endCursor } }
  }
}'
GQL_INVREL_PAGE='query IssueInverseRelations($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    inverseRelations(first: $first, after: $after) { nodes { type issue { identifier } } pageInfo { hasNextPage endCursor } }
  }
}'

# drain_connection <issue_uuid> <connection>: paginate ONE nested connection of ONE issue
# to exhaustion via its follow-up query, printing the FULL node array (JSON) to stdout.
# Re-fetches the connection from the start (after=null) and returns the complete set — the
# caller REPLACES the (truncated) first-page nodes with this, avoiding any cursor-alignment
# assumption between the list query and the single-issue query. Returns 1 on any transport /
# GraphQL / shape error or if pagination fails to terminate; the caller then marks the cache
# complete=false so nested incompleteness is covered by the honesty bit.
drain_connection() {
  local id="$1" conn="$2"
  local query
  case "$conn" in
    labels)           query="$GQL_LABELS_PAGE" ;;
    relations)        query="$GQL_RELATIONS_PAGE" ;;
    inverseRelations) query="$GQL_INVREL_PAGE" ;;
    *) echo "ERROR: drain_connection: unknown connection '$conn'" >&2; return 1 ;;
  esac
  local after="" page=0 max_pages=200 acc resp
  acc='[]'
  resp=$(mktemp)
  while :; do
    page=$((page + 1))
    if [[ $page -gt $max_pages ]]; then
      echo "ERROR: drain_connection $conn: exceeded $max_pages pages (cursor not advancing?)" >&2
      rm -f "$resp"; return 1
    fi
    local vars
    vars=$(jq -cn --arg id "$id" --argjson first 250 --arg after "$after" \
      '{id:$id, first:$first, after: (if $after=="" then null else $after end)}') || { rm -f "$resp"; return 1; }
    if ! gql_post "$query" "$vars" > "$resp" 2>/dev/null; then
      echo "ERROR: drain_connection $conn: GraphQL transport failure on page $page" >&2
      rm -f "$resp"; return 1
    fi
    local gqlerr
    gqlerr=$(jq -r 'if (.errors|type)=="array" then (.errors[0].message // "unknown") else empty end' "$resp" 2>/dev/null || echo "PARSE_ERROR")
    if [[ -n "$gqlerr" ]]; then
      echo "ERROR: drain_connection $conn: Linear GraphQL error on page $page: $gqlerr" >&2
      [[ -n "$LAST_RATELIMIT_HEADERS" ]] && { echo "  rate-limit budget at failure:" >&2; printf '%s\n' "$LAST_RATELIMIT_HEADERS" | sed 's/^/    /' >&2; }
      rm -f "$resp"; return 1
    fi
    if ! jq -e --arg c "$conn" '.data.issue[$c] | has("nodes")' "$resp" >/dev/null 2>&1; then
      echo "ERROR: drain_connection $conn: unexpected response shape on page $page" >&2
      rm -f "$resp"; return 1
    fi
    local nodes
    nodes=$(jq -c --arg c "$conn" '.data.issue[$c].nodes' "$resp")
    acc=$(jq -cn --argjson a "$acc" --argjson n "$nodes" '$a + $n') || { rm -f "$resp"; return 1; }
    local has_next end_cursor
    has_next=$(jq -r --arg c "$conn" '.data.issue[$c].pageInfo.hasNextPage // false' "$resp")
    end_cursor=$(jq -r --arg c "$conn" '.data.issue[$c].pageInfo.endCursor // empty' "$resp")
    [[ "$has_next" == "true" && -n "$end_cursor" ]] || break
    after="$end_cursor"
  done
  rm -f "$resp"
  printf '%s' "$acc"
  return 0
}

# resolve_overflow <issues_file>: <issues_file> is a bare array of ACTIVE nodes fetched by
# GQL_ACTIVE. For every issue whose bounded nested connection reported hasNextPage=true,
# drain that connection to exhaustion (drain_connection) and REPLACE the issue's connection
# nodes with the full set — IN PLACE — so projection sees complete edge sets. Returns 0 if
# no overflow occurred OR every needed follow-up fully drained; returns 1 if ANY follow-up
# failed (the caller then marks complete=false so nested truncation is never silently
# accepted). This makes silent blockedBy truncation structurally impossible.
resolve_overflow() {
  local file="$1"
  local rc=0
  local overflow
  overflow=$(jq -c '
    [ .[] | . as $i
      | (["labels","relations","inverseRelations"][]) as $c
      | select(($i[$c].pageInfo.hasNextPage // false) == true)
      | {id: $i.id, identifier: $i.identifier, conn: $c} ]
  ' "$file") || return 1
  local n; n=$(echo "$overflow" | jq 'length')
  [[ "$n" -eq 0 ]] && return 0
  echo "Overflow: $n nested connection(s) exceeded the first-page cap — draining via follow-up queries." >&2
  local idx
  for ((idx = 0; idx < n; idx++)); do
    local id ident conn full
    id=$(echo "$overflow" | jq -r ".[$idx].id")
    ident=$(echo "$overflow" | jq -r ".[$idx].identifier")
    conn=$(echo "$overflow" | jq -r ".[$idx].conn")
    if ! full=$(drain_connection "$id" "$conn"); then
      echo "WARN: follow-up pagination failed for $ident.$conn — marking cache complete=false." >&2
      rc=1
      continue
    fi
    jq --arg ident "$ident" --arg conn "$conn" --argjson full "$full" '
      map(if .identifier == $ident then .[$conn] = {nodes: $full} else . end)
    ' "$file" > "$file.next" && mv "$file.next" "$file"
  done
  return $rc
}

# Query B — CLOSED issues (Done + Canceled + Duplicate, i.e. state type completed|canceled).
# SLIM: id/identifier/state/project/updatedAt ONLY — NO description, NO nested connections.
# Fetched TEAM-WIDE (no project filter) so blocked-by edges pointing at out-of-scope closed
# issues still resolve. Per-page complexity is ~O(page_size) — negligible against the budget.
GQL_CLOSED='query ClosedIssues($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt, includeArchived: false) {
    nodes {
      id
      identifier
      updatedAt
      state { name type }
      project { name }
    }
    pageInfo { hasNextPage endCursor }
  }
}'

cmd_sync_initiative() {
  if [[ "${LINEAR_NOT_CONFIGURED:-0}" == "1" ]]; then
    echo "ERROR: Linear not configured — set tracking_system: linear, linear_tenant, linear_initiative, team_key in config" >&2
    exit 1
  fi
  check_deps
  command -v curl >/dev/null 2>&1 || { echo "ERROR: curl not found in PATH — required for the direct-GraphQL initiative sync." >&2; exit 1; }
  ensure_gitignore
  mkdir -p "$CACHE_DIR"

  # --projects-file <path>: OPTIONAL newline-delimited allowlist of project NAMES to keep,
  # for an operator who wants to pin an explicit project set by hand. NOT required — the
  # scope source is the configured linear_initiative (resolve_config already guarantees it
  # is set — see the hard-cut migration error there), pushed server-side into Query A's
  # filter below, so the active fetch never even transfers out-of-scope issues without
  # this flag.
  local projects_file=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --projects-file) projects_file="$2"; shift 2 ;;
      *) echo "ERROR: Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  if [[ -n "$projects_file" && ! -f "$projects_file" ]]; then
    echo "ERROR: --projects-file '$projects_file' not found." >&2
    exit 1
  fi

  resolve_linear_token || exit 1

  # resolve_config guarantees LINEAR_INITIATIVE is set whenever LINEAR_NOT_CONFIGURED != 1
  # (a legacy-only linear_project config is refused there — hard cut, no fallback here).
  local scope_desc="initiative \"$LINEAR_INITIATIVE\""
  echo "Initiative sync (direct GraphQL): team $TEAM_KEY — active (scoped to $scope_desc) + closed (team-wide, slim) + blocked-by graph${projects_file:+ (explicit project override: $projects_file)}..."

  local active_tmp done_tmp all_tmp synced_at complete
  active_tmp=$(mktemp); done_tmp=$(mktemp); all_tmp=$(mktemp)
  synced_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  complete=true

  # Build server-side filters. Active = team + non-terminal state (+ scope). Closed = team +
  # terminal state, TEAM-WIDE (no project/initiative filter — cross-scope blockers still
  # resolve, and the fetch is slim enough that team-wide is cheap; see GQL_CLOSED comment).
  local filter_active vars_active
  filter_active=$(jq -cn --arg team "$TEAM_KEY" \
    '{team:{key:{eq:$team}}, state:{type:{nin:["completed","canceled"]}}}')
  # Scope source = configured initiative (REQUIRED — resolve_config refuses to reach here
  # without it). Push it into the server-side filter so the active fetch never transfers
  # out-of-scope issues and NO per-project call is made. UUID → filter by initiative id;
  # otherwise by name.
  local ikey="name"
  [[ "$LINEAR_INITIATIVE" =~ ^[0-9a-fA-F-]{36}$ ]] && ikey="id"
  filter_active=$(echo "$filter_active" | jq -c --arg k "$ikey" --arg v "$LINEAR_INITIATIVE" \
    '. + {project:{initiatives:{some:{($k):{eq:$v}}}}}')
  # Optional explicit override: an operator may still pin a project allowlist by hand,
  # narrowing whatever the initiative/project filter above already selected.
  if [[ -n "$projects_file" ]]; then
    local plist
    plist=$(jq -R -s 'split("\n") | map(select(length>0))' "$projects_file")
    filter_active=$(echo "$filter_active" | jq -c --argjson p "$plist" '. + {project:{name:{in:$p}}}')
  fi
  vars_active=$(jq -cn --argjson f "$filter_active" '{filter:$f}')

  local filter_closed vars_closed
  filter_closed=$(jq -cn --arg team "$TEAM_KEY" \
    '{team:{key:{eq:$team}}, state:{type:{in:["completed","canceled"]}}}')
  vars_closed=$(jq -cn --argjson f "$filter_closed" '{filter:$f}')

  # 1) ACTIVE issues (in-scope). Fatal on failure — without the open set there is no usable
  #    frontier, so leave the existing cache untouched rather than half-write.
  #    Page size 25: GQL_ACTIVE costs ≈300 complexity/issue (labels 50 + relations 50×2 +
  #    inverseRelations 50×2 + scalars, see the fragment comment), so 25 × 300 = 7,500 —
  #    a safe margin under Linear's per-request complexity hard cap. Overflow past the
  #    first:50 nested caps is drained per-issue by resolve_overflow, so 25 is safe.
  if ! gql_paginate "$active_tmp" "$GQL_ACTIVE" "$vars_active" 25; then
    rm -f "$active_tmp" "$done_tmp" "$all_tmp"
    echo "Initiative sync aborted (active fetch failed, likely rate-limited) — existing initiative.json left untouched." >&2
    exit 1
  fi
  # 1b) Overflow guard: any ACTIVE issue whose bounded nested connection (labels/relations/
  #     inverseRelations) reported hasNextPage=true is drained to exhaustion via a follow-up
  #     single-issue query and its edge set replaced IN FULL before projection — so a gate's
  #     blockedBy edges can never silently truncate at the page cap. A follow-up FAILURE is
  #     treated exactly like an incomplete closed fetch: keep the partial, mark complete=false
  #     (nested completeness is part of the honesty bit, not just page-level completeness).
  if ! resolve_overflow "$active_tmp"; then
    complete=false
  fi
  # 2) CLOSED issues (team-wide, slim). NON-fatal: on failure keep the partial set and mark
  #    complete=false so the engine frontier sets readComplete=false and retries instead of
  #    trusting an under-resolved blocker graph.
  #    Page size 250 stays large: GQL_CLOSED has ZERO nested connections — per issue ≈ 10
  #    complexity (id/identifier/updatedAt + state{name,type} + project{name}), so
  #    250 × 10 = 2,500 — well within Linear's per-request complexity hard cap. Verified safe.
  if ! gql_paginate "$done_tmp" "$GQL_CLOSED" "$vars_closed" 250; then
    echo "WARN: closed (Done/Canceled) fetch incomplete (rate-limited?) — marking cache complete=false." >&2
    complete=false   # keep whatever $done_tmp accumulated; do not clobber
  fi
  # 3) Merge + dedupe by identifier (states are disjoint; active listed first so its
  #    full-field node wins on any defensive collision).
  if ! jq -s '(.[0] + .[1]) | unique_by(.identifier)' "$active_tmp" "$done_tmp" > "$all_tmp"; then
    rm -f "$active_tmp" "$done_tmp" "$all_tmp"
    echo "ERROR: failed to merge issue sets — initiative.json left untouched." >&2
    exit 1
  fi

  # 4) Project a slim, jq-friendly cache keyed by identifier. blockedBy = the inverse
  #    "blocks" edges (issues that block THIS one); blocks = outgoing (for most-blocking
  #    ordering). Labels/project/milestone/updatedAt let the frontier apply holds and
  #    ordering entirely from cache. `complete` is the honesty bit.
  local init_tmp="$CACHE_DIR/initiative.json.tmp"
  if ! jq --arg ts "$synced_at" --arg team "$TEAM_KEY" --argjson complete "$complete" '
    . as $all |
    {
      synced_at: $ts,
      team: $team,
      complete: $complete,
      counts: {
        total: ($all | length),
        byState: ($all | map(.state.name) | group_by(.) | map({key: .[0], value: length}) | from_entries)
      },
      issues: ($all | map({
        key: .identifier,
        value: {
          state: .state.name,
          project: (.project.name // null),
          milestone: (.projectMilestone.id // null),
          labels: [.labels.nodes[]?.name],
          updatedAt: .updatedAt,
          blockedBy: ([.inverseRelations.nodes[]? | select(.type=="blocks") | .issue.identifier] | unique),
          blocks: ([.relations.nodes[]? | select(.type=="blocks") | .relatedIssue.identifier] | unique)
        }
      }) | from_entries)
    }
  ' "$all_tmp" > "$init_tmp"; then
    rm -f "$active_tmp" "$done_tmp" "$all_tmp" "$init_tmp"
    echo "ERROR: projection failed — initiative.json left untouched." >&2
    exit 1
  fi
  mv "$init_tmp" "$CACHE_DIR/initiative.json"
  echo "$synced_at" > "$CACHE_DIR/.last-initiative-sync"

  # Per-issue body files (cache-first read model): the ACTIVE (Query A) payload carries the
  # FULL description, so every in-scope active issue gets its issues/<id>.yaml written here
  # with zero extra API calls. Bodies are written ONLY for in-scope active issues — the
  # team-wide CLOSED (Query B) set is slim (no description) and exists solely as blocker-
  # resolution targets in initiative.json, so it gets NO body files (a closed ticket that is
  # ever re-opened/read regenerates its body on the next refresh-on-write). Comments are not
  # in the list payload — they appear on the first `linear-sync.sh issue <id>` (--with-comments)
  # write. Agents read tickets ONLY from these files.
  mkdir -p "$CACHE_DIR/issues"
  local body_count=0
  while IFS= read -r issue; do
    local iid
    iid=$(echo "$issue" | jq -r '.identifier')
    echo "$issue" | jq -r '
      def kind: '"$KIND_EXPR"';
      "identifier: " + .identifier,
      "title: " + (.title | @json),
      "status: " + .state.name,
      "kind: " + kind,
      "milestone: " + (.projectMilestone.id // "none"),
      "cycle: " + ((.cycle.number // empty | tostring) // "none"),
      (if (.description // "") == "" then "description: \"\""
       else "description: |\n" + (.description | split("\n") | map("  " + .) | join("\n"))
       end)
    ' > "$CACHE_DIR/issues/$iid.yaml"
    body_count=$((body_count + 1))
  done < <(jq -c '.[]' "$active_tmp")

  rm -f "$active_tmp" "$done_tmp" "$all_tmp"

  local total done_n
  total=$(jq -r '.counts.total' "$CACHE_DIR/initiative.json")
  done_n=$(jq -r '.counts.byState.Done // 0' "$CACHE_DIR/initiative.json")
  echo "Initiative synced: $total issues ($done_n Done, complete=$complete, $body_count body files) → $CACHE_DIR/initiative.json"
  jq -r '.counts.byState | to_entries[] | "  " + .key + ": " + (.value|tostring)' "$CACHE_DIR/initiative.json"
  [[ "$complete" == "true" ]] || exit 3   # non-zero (partial) so callers can detect
}

# ---------- quota (rate-limit probe) ----------
# cmd_quota: make ONE minimal GraphQL request (query { viewer { id } }) purely to read the
# current rate-limit budget, and print the Linear rate-limit headers as JSON to stdout. This
# is the cheapest possible call (no connections) so it never meaningfully spends the budget
# it reports. Output shape:
#   { "requestsRemaining": "...", "requestsLimit": "...", "requestsReset": "...",
#     "raw": { "<header>": "<value>", ... }, "error": <null|string> }
# `raw` carries EVERY x-ratelimit-* / x-complexity / retry-after header verbatim (lowercased
# keys) so complexity budget headers surface even though the top-level convenience fields key
# off the request-bucket names. On a 429 the headers are still captured and `error` is set.
cmd_quota() {
  command -v curl >/dev/null 2>&1 || { echo "ERROR: curl not found in PATH — required for the quota probe." >&2; exit 1; }
  command -v jq   >/dev/null 2>&1 || { echo "ERROR: jq not found in PATH." >&2; exit 1; }
  resolve_linear_token || exit 1

  local resp gqlerr
  resp=$(mktemp)
  # Run gql_post with a REDIRECT (not command substitution) so it executes in THIS shell —
  # command substitution would run it in a subshell and LAST_RATELIMIT_HEADERS (set inside
  # gql_post) would never propagate back here, leaving `raw` empty. `|| true`: a curl
  # transport failure still leaves us the headers/body we have.
  gql_post 'query { viewer { id } }' '{}' > "$resp" 2>/dev/null || true
  gqlerr=$(jq -r 'if (.errors|type)=="array" then (.errors[0].message // "unknown") else empty end' "$resp" 2>/dev/null || echo "")

  # Parse the captured "name: value" header lines into a lowercased-key JSON object, then
  # lift the request-bucket convenience fields off it.
  printf '%s\n' "$LAST_RATELIMIT_HEADERS" | jq -R -s --arg err "$gqlerr" '
    (split("\n") | map(select(length>0))
      | map(capture("^(?<k>[^:]+):[[:space:]]*(?<v>.*)$"))
      | map({(.k | ascii_downcase): .v}) | add // {}) as $raw
    | {
        requestsRemaining: ($raw["x-ratelimit-requests-remaining"] // null),
        requestsLimit:     ($raw["x-ratelimit-requests-limit"] // null),
        requestsReset:     ($raw["x-ratelimit-requests-reset"] // null),
        raw: $raw,
        error: (if $err == "" then null else $err end)
      }
  '
  rm -f "$resp"
  # Surface a non-zero exit on a rate-limit / GraphQL error so scripted callers can detect it,
  # but the JSON (with headers) is already on stdout for the human/parent.
  [[ -z "$gqlerr" ]]
}

# ---------- main ----------
# Source guard: when this file is `source`d (e.g. an offline fixture harness sourcing it to
# unit-test resolve_overflow / drain_connection against mocked gql_post) the CLI dispatch
# below is SKIPPED. Behaviour when executed directly is unchanged.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
resolve_config

case "${1:-}" in
  sync)             cmd_sync ;;
  sync-initiative)  shift; cmd_sync_initiative "$@" ;;
  issue|story)      cmd_issue "${2:?Usage: linear-sync.sh issue <ID>}" ;;
  update)           shift; cmd_update "$@" ;;
  check)            cmd_check ;;
  quota)            cmd_quota ;;
  *)
    echo "Usage: linear-sync.sh {sync|sync-initiative|issue <ID>|update <ID> --status <STATE>|check|quota}"
    echo ""
    echo "Commands:"
    echo "  sync                         Full refresh — fetches ALL project issues (paginated) via linearis"
    echo "  sync-initiative              Initiative-scoped refresh (all projects under linear_initiative, all"
    echo "                               states incl. Done) + blocked-by graph → .cache/linear/initiative.json"
    echo "                               (for the delivery engine frontier). Requires linear_initiative in"
    echo "                               config — a config with only the legacy linear_project key is refused"
    echo "                               with a migration error (see resolve_config)."
    echo "  issue <ID>                   Refresh a single issue's cache file + work-status entry (alias: story)"
    echo "  update <ID> --status <S>     Write status to Linear via linearis, then refresh cache"
    echo "  check                        Verify cache freshness (exit 0 always; notes if stale/absent)"
    echo "  quota                        Probe Linear's rate-limit budget via ONE minimal query"
    echo "                               (viewer{id}); prints the x-ratelimit-* headers as JSON to stdout"
    echo ""
    echo "Requires: linearis (npm i -g linearis), jq, linearis auth login completed."
    echo "Cache location: <project_root>/.cache/linear/ (gitignored)"
    echo "Note: scope of record is linear_initiative (name or UUID); linearis matches --project by name or UUID, never slug."
    exit 1
    ;;
esac
fi
