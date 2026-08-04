#!/usr/bin/env bash
# engine-only-import-guard.sh — ENG-1491 AC4: no file under
# apps/server/src/orvex/ (the AGPL engine's additive tree) may import from a
# closed-satellite package (the private Go/TS family repos: orvex-wiki-api,
# orvex-studio-knowledge, orvex-studio-identity, orvex-studio-ai,
# orvex-studio-mcp, orvex-studio-console, orvex-studio-billing,
# orvex-studio-workflows, orvex-cli, orvex-studio-contracts,
# orvex-studio-lib) or a non-AGPL-compatible module (@docmost/ee, ee/*,
# @forkmost/*). This is the ENGINE-side half of the thin-AGPL split (Q22):
# the engine stays minimal and self-contained; satellite logic reaches the
# engine only through its published HTTP API (CS §7), never a static import.
#
# WHY THIS IS A SEPARATE GATE FROM engine-license-guard.sh (ENG-1381): that
# gate is the P10 "no closed EE submodule/gitlink re-enters the tree" fence
# (upstream-Docmost-EE specific). This gate is the forward-looking guard
# against a DIFFERENT direction of leak — a closed FAMILY satellite package
# being pulled into the public AGPL engine tree. Both are static scans; they
# are deliberately kept as two named gates because they encode two distinct
# rulings (P10 vs Q22 slim-AGPL) and a violation of one is not a violation
# of the other.
#
# Usage: engine-only-import-guard.sh [repo-dir]
# Exit 0 = no forbidden import found. Exit 1 = at least one found (listed on
# stderr).
set -uo pipefail

REPO_DIR="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
ORVEX_DIR="$REPO_DIR/apps/server/src/orvex"

if [[ ! -d "$ORVEX_DIR" ]]; then
  echo "FAIL: '$ORVEX_DIR' does not exist" >&2
  exit 1
fi

# Closed-satellite npm scope/package names + non-AGPL-compatible modules.
# Illustrative/extensible, not exhaustive — see script header for the family
# satellite list this stands in for.
BANNED_IMPORT_REGEX='@orvexai/|orvex-wiki-api|orvex-studio-(knowledge|identity|ai|mcp|console|billing|workflows|contracts|lib)|(^|/)orvex-cli(/|$)|@docmost/(ee|cloud)|docmost-ee|@forkmost/|(^|/)ee/'

# NO ALLOWLIST. The former ENG-1360 exception for the shared metrics
# package (@orvexai scope) was retired by ENG-3149: that package's source is
# now INLINED at apps/server/src/orvex/metrics/ (AD-8/AD-9, CS ❌#7), the
# npm package is deprecated, and the engine imports no @orvexai/* package at
# all. The blanket @orvexai/ ban above therefore applies with zero
# exceptions — the AGPL boundary is enforced by ABSENCE of the package, not
# by a standing lint exception.
hits="$(grep -RnE "from ['\"](${BANNED_IMPORT_REGEX})|require\(['\"](${BANNED_IMPORT_REGEX})" \
          "$ORVEX_DIR" --include='*.ts' \
          --exclude='engine-only-import-guard.spec.ts' 2>/dev/null || true)"

if [[ -n "$hits" ]]; then
  echo "FAIL: forbidden closed-satellite/non-AGPL import found under apps/server/src/orvex/:" >&2
  echo "$hits" >&2
  echo "" >&2
  echo "engine-only-import-guard: FAIL — Q22 slim-AGPL rule violated." >&2
  exit 1
fi

echo "engine-only-import-guard: PASS — no closed-satellite/non-AGPL import found under apps/server/src/orvex/."
exit 0
