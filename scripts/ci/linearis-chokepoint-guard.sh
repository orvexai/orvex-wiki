#!/usr/bin/env bash
# ENG-2810: production tooling must route Linear mutations through the wrapper.
set -euo pipefail
repo="${1:-.}"
wrapper="$repo/tools/act3/linear-write.sh"
[[ -x "$wrapper" ]] || { echo "linearis-chokepoint-guard: missing executable wrapper: $wrapper" >&2; exit 1; }
violations=$(rg -n --glob '*.sh' --glob '*.mjs' --glob '*.js' '(^|[[:space:]])linearis[[:space:]]+issues[[:space:]]+(update|discuss|create)([[:space:]]|$)' "$repo/tools/act3" "$repo/_bmad/lnr/tools" 2>/dev/null | grep -v -F 'tools/act3/linear-write.sh:' || true)
if [[ -n "$violations" ]]; then
  echo "linearis-chokepoint-guard: FAIL — raw Linear write outside linear-write.sh:" >&2
  echo "$violations" >&2
  exit 1
fi
echo "linearis-chokepoint-guard: PASS — linear-write.sh is the sole raw Linear write path."
