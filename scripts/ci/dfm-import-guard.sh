#!/usr/bin/env bash
# dfm-import-guard.sh — ENG-2488 AC2/AC3/AC4: the DfM-specific AGPL
# import-boundary guard (A-SEAMS finding F8, P10 licensing direction).
#
# `@orvex/dfm` is AGPL-3.0-only. The ONLY permitted importers are the AGPL
# engine itself (apps/server/**, which includes the write path
# `core/page/services/page.service.ts`, the collab util
# `collaboration/collaboration.util.ts`, and the additive orvex tree) and
# the package's own source/tests (packages/@orvex/dfm/**). Any OTHER file in
# this tree importing `@orvex/dfm` is a boundary violation: a closed
# satellite vendored/copied into this repo (or client/tooling code that a
# closed artifact bundles) would relicense the AGPL package. Closed family
# repos (orvex-wiki-api, orvex-studio-mcp, orvex-studio-ai, ...) consume DfM
# ONLY via the Go twin (orvex-studio-lib/pkg/dfm) or a wiki-api network
# call — never this TS package. Each satellite repo's own CI is expected to
# run an equivalent deny-all guard on `@orvex/dfm`; this script proves the
# boundary from THIS repo's side.
#
# WHY THIS IS A SEPARATE GATE FROM engine-only-import-guard.sh (ENG-1491):
# that gate checks the OPPOSITE direction — closed-satellite packages being
# imported INTO the AGPL tree (Q22 slim-AGPL). This gate checks the AGPL
# package `@orvex/dfm` itself never LEAKING OUT to a non-engine importer
# (P10 licensing). A violation of one is not a violation of the other; they
# stay two named gates.
#
# Usage: dfm-import-guard.sh [repo-dir]
# Exit 0 = every `@orvex/dfm` import sits inside a permitted importer.
# Exit 1 = at least one forbidden import found (listed on stderr).
set -uo pipefail

REPO_DIR="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [[ ! -d "$REPO_DIR" ]]; then
  echo "FAIL: repo dir '$REPO_DIR' does not exist" >&2
  exit 1
fi

# Permitted importer prefixes, relative to the repo root (see header).
PERMITTED_REGEX='^(apps/server/|packages/@orvex/dfm/)'

# Every static/dynamic import form of the package: `from '@orvex/dfm'`,
# `require('@orvex/dfm')`, `import('@orvex/dfm')` — including deep
# subpath imports ('@orvex/dfm/...').
IMPORT_REGEX="(from[[:space:]]+['\"]@orvex/dfm(/[^'\"]*)?['\"]|require\(['\"]@orvex/dfm(/[^'\"]*)?['\"]\)|import\(['\"]@orvex/dfm(/[^'\"]*)?['\"]\))"

hits="$(cd "$REPO_DIR" && grep -RnE "$IMPORT_REGEX" . \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
  --include='*.mjs' --include='*.cjs' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
  --exclude-dir=.cache --exclude-dir=data 2>/dev/null || true)"

offenders=""
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  rel="${line#./}"
  file="${rel%%:*}"
  if [[ ! "$file" =~ $PERMITTED_REGEX ]]; then
    offenders+="$rel"$'\n'
  fi
done <<< "$hits"

if [[ -n "$offenders" ]]; then
  echo "FAIL: '@orvex/dfm' (AGPL-3.0-only) imported outside the permitted engine tree:" >&2
  printf '%s' "$offenders" >&2
  echo "" >&2
  echo "Permitted importers: apps/server/** (the AGPL engine) and" >&2
  echo "packages/@orvex/dfm/** (the package itself). Closed satellites reach" >&2
  echo "DfM via the Go twin (orvex-studio-lib/pkg/dfm) or a wiki-api network" >&2
  echo "call — never this TS package. dfm-import-guard: FAIL (P10 / A-SEAMS F8)." >&2
  exit 1
fi

echo "dfm-import-guard: OK — every '@orvex/dfm' import sits inside apps/server/** or packages/@orvex/dfm/**."
exit 0
