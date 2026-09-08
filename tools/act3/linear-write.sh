#!/usr/bin/env bash
# ENG-2810: sole Act-3 Linear write chokepoint.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE="$REPO_ROOT/scripts/lib/linear-write-gate.mjs"
usage() { echo "Usage: linear-write.sh --issue ENG-N --stage STAGE --payload-file FILE -- linearis ..." >&2; exit 2; }
issue=""; stage=""; payload_file=""; operation=""; status=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue) issue="${2:-}"; shift 2;;
    --stage) stage="${2:-}"; shift 2;;
    --payload-file) payload_file="${2:-}"; shift 2;;
    --operation) operation="${2:-}"; shift 2;;
    --status) status="${2:-}"; shift 2;;
    --) shift; break;;
    *) usage;;
  esac
done
if [[ "$operation" == status-update ]]; then
  [[ -n "$status" && $# -eq 0 ]] || usage
  set -- linearis issues update "$issue" --status "$status"
fi
[[ -n "$issue" && -n "$stage" && -n "$payload_file" && $# -gt 0 && "${1:-}" == linearis ]] || usage
[[ -f "$payload_file" ]] || { echo "linear-write.sh: payload file missing: $payload_file" >&2; exit 2; }
set +e
node "$GATE" run --issue "$issue" --stage "$stage" --payload-file "$payload_file" -- "$@"
rc=$?
set -e
if [[ $rc -eq 0 && "${LINEAR_WRITE_SKIP_REFRESH:-0}" != 1 ]]; then
  HUB="${LINEAR_HUB:-$REPO_ROOT}"
  (cd "$HUB" && _bmad/lnr/tools/linear-sync.sh issue "$issue")
fi
exit "$rc"
