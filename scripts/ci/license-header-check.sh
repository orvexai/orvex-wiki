#!/usr/bin/env bash
# license-header-check.sh — ENG-1491 AC3: every engine `.ts` file under
# apps/server/src/orvex/ (non-spec) MUST carry the AGPL license header —
# recognised by the `SPDX-License-Identifier: AGPL-3.0-only` marker in the
# file's leading comment block (CS §13; disposition-ledger §5.15).
#
# WHY A MARKER, NOT A FULL-TEXT DIFF: SPDX tags are the industry-standard,
# machine-checkable way to assert a file's license without reproducing the
# full license text in every file (the full text lives once, at the repo
# root LICENSE). Grepping for the tag is a stable, low-maintenance gate.
#
# Scope: apps/server/src/orvex/**/*.ts, EXCLUDING *.spec.ts and
# *.e2e.spec.ts (test files are not shipped/redistributed source artifacts
# in the AGPL §13 sense; the DoD text says "non-spec file").
#
# Usage: license-header-check.sh [repo-dir]
# Exit 0 = every non-spec file carries the header. Exit 1 = at least one is
# missing it (listed on stderr).
set -uo pipefail

REPO_DIR="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
ORVEX_DIR="$REPO_DIR/apps/server/src/orvex"
MARKER='SPDX-License-Identifier: AGPL-3.0-only'

if [[ ! -d "$ORVEX_DIR" ]]; then
  echo "FAIL: '$ORVEX_DIR' does not exist" >&2
  exit 1
fi

missing=()
while IFS= read -r -d '' file; do
  if ! grep -q "$MARKER" "$file"; then
    missing+=("$file")
  fi
done < <(find "$ORVEX_DIR" -type f -name '*.ts' \
            ! -name '*.spec.ts' ! -name '*.e2e.spec.ts' -print0)

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "FAIL: ${#missing[@]} file(s) under apps/server/src/orvex/ are missing the AGPL license header ('$MARKER'):" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "license-header-check: PASS — every engine .ts file under apps/server/src/orvex/ carries the AGPL header."
exit 0
