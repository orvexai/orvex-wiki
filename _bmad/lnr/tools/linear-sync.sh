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
  PROJECT_NAME=$(grep '^project_name:' "$config_file" 2>/dev/null | sed 's/^project_name:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)

  TRACKING_SYSTEM=$(grep '^tracking_system:' "$config_file" | awk '{print $2}' | tr -d '"' | tr -d "'" || true)

  if [[ -z "$TEAM_KEY" || -z "$LINEAR_TENANT" || -z "$LINEAR_PROJECT" ]]; then
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
    echo "ERROR: Linear not configured — set tracking_system: linear, linear_tenant, linear_project, team_key in config" >&2
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
    echo "ERROR: Linear not configured — set tracking_system: linear, linear_tenant, linear_project, team_key in config" >&2
    exit 1
  fi
  check_deps
  ensure_gitignore
  local issue_id="$1"
  mkdir -p "$CACHE_DIR/issues"

  echo "Refreshing $issue_id..."
  local json err_file; err_file=$(mktemp)
  # stdout (JSON) captured to $json; stderr to $err_file so a warning can't corrupt the JSON.
  if ! json=$(linearis issues read "$issue_id" 2>"$err_file") \
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

  echo "Refreshed $issue_id (status: $status)"
}

# ---------- update ----------
cmd_update() {
  if [[ "${LINEAR_NOT_CONFIGURED:-0}" == "1" ]]; then
    echo "ERROR: Linear not configured — set tracking_system: linear, linear_tenant, linear_project, team_key in config" >&2
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
# The delivery engine needs the WHOLE initiative (all projects — one team), INCLUDING
# Done (which `issues list` excludes by default), plus each candidate's blocked-by
# edges. The linearis list payload already carries state, labels, project, milestone,
# updatedAt, AND populated relations/inverseRelations — so the entire frontier is a
# handful of paginated list calls with ZERO per-issue reads (the old frontier did a
# per-project live sweep + a per-candidate live relation read every tick, which drained
# the shared 2500/hr quota). Output: .cache/linear/initiative.json — a slim, jq-friendly
# projection keyed by identifier. Deliberately does NOT touch work-status.yaml /
# milestone-map.md / issues/*.yaml (those stay owned by the single-project `sync`).

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

cmd_sync_initiative() {
  if [[ "${LINEAR_NOT_CONFIGURED:-0}" == "1" ]]; then
    echo "ERROR: Linear not configured — set tracking_system: linear, linear_tenant, linear_project, team_key in config" >&2
    exit 1
  fi
  check_deps
  ensure_gitignore
  mkdir -p "$CACHE_DIR"

  # --projects-file <path>: newline-delimited allowlist of project NAMES to keep
  # (team ENG is a SUPERSET of the initiative — 24 projects — so the delivery engine
  # passes its PROJECT_REPO keys to scope to the 14 satellites + Delivery Gates and
  # drop Houston / Claude-Code-MCP / OPS-POC / archived noise). Absent ⇒ whole team.
  local projects_file=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --projects-file) projects_file="$2"; shift 2 ;;
      *) echo "ERROR: Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  echo "Initiative sync: team $TEAM_KEY — ALL states (incl. Done), + blocked-by graph${projects_file:+ (scoped to $projects_file)}..."

  local open_tmp done_tmp all_tmp synced_at complete
  open_tmp=$(mktemp); done_tmp=$(mktemp); all_tmp=$(mktemp)
  synced_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  complete=true

  # 1) All non-completed issues. A failure here is fatal — without the open set there is
  #    no usable frontier, so leave the existing cache untouched rather than half-write.
  if ! fetch_paginated "$open_tmp"; then
    rm -f "$open_tmp" "$done_tmp" "$all_tmp"
    echo "Initiative sync aborted (open-issue fetch failed, likely rate-limited) — existing initiative.json left untouched." >&2
    exit 1
  fi
  # 2) Done issues (the completed workflow-state is excluded from the default list). A
  #    failure here is NON-fatal but marks the cache incomplete so the engine frontier
  #    sets readComplete=false and waits/retries instead of trusting a 0-Done backlog.
  if ! fetch_paginated "$done_tmp" --status Done; then
    echo "WARN: Done fetch failed (rate-limited?) — marking cache complete=false." >&2
    printf '[]' > "$done_tmp"
    complete=false
  fi
  # 3) Merge + dedupe by identifier (states are disjoint, but be defensive).
  if ! jq -s '(.[0] + .[1]) | unique_by(.identifier)' "$open_tmp" "$done_tmp" > "$all_tmp"; then
    rm -f "$open_tmp" "$done_tmp" "$all_tmp"
    echo "ERROR: failed to merge issue sets — initiative.json left untouched." >&2
    exit 1
  fi
  # 3b) Scope to the initiative's projects if an allowlist was given.
  if [[ -n "$projects_file" ]]; then
    if [[ ! -f "$projects_file" ]]; then
      rm -f "$open_tmp" "$done_tmp" "$all_tmp"
      echo "ERROR: --projects-file '$projects_file' not found." >&2
      exit 1
    fi
    local scoped_tmp; scoped_tmp=$(mktemp)
    if ! jq --rawfile allow "$projects_file" '
      ($allow | split("\n") | map(select(length>0))) as $keep
      | map(select((.project.name // "") as $p | $keep | index($p)))
    ' "$all_tmp" > "$scoped_tmp"; then
      rm -f "$open_tmp" "$done_tmp" "$all_tmp" "$scoped_tmp"
      echo "ERROR: project scoping failed — initiative.json left untouched." >&2
      exit 1
    fi
    mv "$scoped_tmp" "$all_tmp"
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
    rm -f "$open_tmp" "$done_tmp" "$all_tmp" "$init_tmp"
    echo "ERROR: projection failed — initiative.json left untouched." >&2
    exit 1
  fi
  mv "$init_tmp" "$CACHE_DIR/initiative.json"
  echo "$synced_at" > "$CACHE_DIR/.last-initiative-sync"
  rm -f "$open_tmp" "$done_tmp" "$all_tmp"

  local total done_n
  total=$(jq -r '.counts.total' "$CACHE_DIR/initiative.json")
  done_n=$(jq -r '.counts.byState.Done // 0' "$CACHE_DIR/initiative.json")
  echo "Initiative synced: $total issues ($done_n Done, complete=$complete) → $CACHE_DIR/initiative.json"
  jq -r '.counts.byState | to_entries[] | "  " + .key + ": " + (.value|tostring)' "$CACHE_DIR/initiative.json"
  [[ "$complete" == "true" ]] || exit 3   # non-zero (partial) so callers can detect
}

# ---------- main ----------
resolve_config

case "${1:-}" in
  sync)             cmd_sync ;;
  sync-initiative)  shift; cmd_sync_initiative "$@" ;;
  issue|story)      cmd_issue "${2:?Usage: linear-sync.sh issue <ID>}" ;;
  update)           shift; cmd_update "$@" ;;
  check)            cmd_check ;;
  *)
    echo "Usage: linear-sync.sh {sync|sync-initiative|issue <ID>|update <ID> --status <STATE>|check}"
    echo ""
    echo "Commands:"
    echo "  sync                         Full refresh — fetches ALL project issues (paginated) via linearis"
    echo "  sync-initiative              Whole-TEAM refresh (all projects, all states incl. Done) + blocked-by"
    echo "                               graph → .cache/linear/initiative.json (for the delivery engine frontier)"
    echo "  issue <ID>                   Refresh a single issue's cache file + work-status entry (alias: story)"
    echo "  update <ID> --status <S>     Write status to Linear via linearis, then refresh cache"
    echo "  check                        Verify cache freshness (exit 0 always; notes if stale/absent)"
    echo ""
    echo "Requires: linearis (npm i -g linearis), jq, linearis auth login completed."
    echo "Cache location: <project_root>/.cache/linear/ (gitignored)"
    echo "Note: linearis matches --project by NAME (or UUID), not slug — set linear_project to the display name."
    exit 1
    ;;
esac
