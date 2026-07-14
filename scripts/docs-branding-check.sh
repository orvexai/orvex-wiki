#!/usr/bin/env bash
#
# docs-branding-check.sh — ENG-1399 AC5 static grep gate.
#
# Fails if user-facing self-hosted docs/copy contain a stray "Docmost"
# product-name reference. Allow-lists deliberate "vanilla-Docmost-compatible"
# mentions (the fork's real upstream-compatibility framing, and the actual
# upstream URLs/EE-license grant text, which are not product-name literals).
#
# Usage: scripts/docs-branding-check.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DOCS_FILES=(README.md)

# Lines allowed to keep the word "Docmost" — real upstream URLs, the actual
# EE license grantor text, and deliberate compatibility framing.
ALLOW_PATTERN='docmost\.com|DocmostHQ|Built on \[Docmost\]|vanilla-Docmost-compatible|Docmost core is licensed|Docmost Enterprise license'

fail=0
for f in "${DOCS_FILES[@]}"; do
  [[ -f "$f" ]] || continue
  while IFS= read -r line; do
    if ! grep -qE "$ALLOW_PATTERN" <<<"$line"; then
      echo "FAIL: stray 'Docmost' product-name reference in $f: $line" >&2
      fail=1
    fi
  done < <(grep -n "Docmost" "$f" || true)
done

if [[ "$fail" -ne 0 ]]; then
  echo "docs-branding-check: FAIL" >&2
  exit 1
fi

echo "docs-branding-check: OK"
