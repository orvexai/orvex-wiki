#!/usr/bin/env bash
# no-md-ext-in-doc-workflows.sh — ENG-1398 AC6 CI grep gate.
#
# Ruling 10 (po-rulings): the mention/turndown markdown extensions are a
# SEPARATE `@orvex/dfm` contracts leg, not this one. This leg (the
# slug-rewrite queue task + the attachment SHA-256 hashing stream) must never
# grow turndown / mention-markdown-extension code.
#
# Usage: no-md-ext-in-doc-workflows.sh [repo-dir]
# Exit 0 = pass (zero matches). Exit 1 = fail, with the offending lines.
set -uo pipefail

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TARGET="$REPO_DIR/apps/server/src/integrations/queue/tasks"

if [[ ! -d "$TARGET" ]]; then
  echo "no-md-ext-in-doc-workflows: target dir not found: $TARGET" >&2
  exit 1
fi

MATCHES="$(grep -rnE "turndown|mention.*markdown extension" "$TARGET" || true)"

if [[ -n "$MATCHES" ]]; then
  echo "no-md-ext-in-doc-workflows: FAIL — turndown/markdown-extension code found in $TARGET (belongs in @orvex/dfm, ruling 10):" >&2
  echo "$MATCHES" >&2
  exit 1
fi

echo "no-md-ext-in-doc-workflows: PASS — zero matches in $TARGET"
exit 0
