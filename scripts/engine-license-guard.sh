#!/usr/bin/env bash
# engine-license-guard.sh — P10 CI guard (ENG-1381): the AGPL engine may never
# re-import a closed EE git submodule/gitlink or a closed-source package.
#
# Canon: family root `CxjFpIVUZY` §AGPL principle; PO ruling 10; P10 — "no
# closed repo, and no closed submodule, is imported into the AGPL engine".
#
# WHY A GUARD, NOT JUST A ONE-TIME CHECK: at orvex-wiki's `dev` HEAD the EE
# submodule is already fully gone (see ENG-1381 dev-context: commit `cf8927ab`
# deleted both `.gitmodules` and the `apps/server/src/ee` gitlink outright,
# rather than converting it in-tree). So (a)/(b) below are true today by
# ABSENCE. This script exists to make sure they STAY true — it is the
# regression fence, not a discovery tool.
#
# Checks (run against $1, default: repo root inferred from this script's
# location):
#   (a) no .gitmodules file with an EE/`ee` submodule entry
#   (b) no `160000` (gitlink) mode anywhere in the tracked tree
#   (c) IF apps/server/src/ee/ee.module.ts exists, it imports only in-tree
#       relative paths (no import escaping to a closed/EE package)
#   (d) no file under apps/server/src or apps/client/src imports a banned
#       closed-package specifier, and no package.json in the repo declares a
#       git-protocol dependency that re-introduces a closed submodule-alike
#       source (git+ssh/git+https/git:// pointing outside github.com/orvexai,
#       or naming the known closed EE repo `docmost/ee`)
#
# Usage: engine-license-guard.sh [repo-dir]
# Exit 0 = pass (P10 holds). Exit 1 = fail, with a human-readable reason.
set -uo pipefail

REPO_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_DIR" || { echo "FAIL: cannot cd into repo dir '$REPO_DIR'" >&2; exit 1; }

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "FAIL: '$REPO_DIR' is not a git repository" >&2
  exit 1
fi

fail=0

# --- (a) no .gitmodules EE entry -------------------------------------------
if [[ -f .gitmodules ]]; then
  if grep -Eq 'path[[:space:]]*=.*(^|/)ee(/|$)' .gitmodules; then
    echo "FAIL (a): .gitmodules declares an EE submodule entry:" >&2
    grep -E 'path[[:space:]]*=.*(^|/)ee(/|$)' .gitmodules >&2
    fail=1
  fi
fi

# --- (b) no gitlink (160000) anywhere in the tracked tree -------------------
gitlinks="$(git ls-files -s | awk '$1 == "160000" { print $0 }')"
if [[ -n "$gitlinks" ]]; then
  echo "FAIL (b): tracked gitlink(s) (submodule mode 160000) found:" >&2
  echo "$gitlinks" >&2
  fail=1
fi

# --- (c) ee.module.ts (if present) wires only in-tree AGPL modules ---------
EE_MODULE="apps/server/src/ee/ee.module.ts"
if git cat-file -e "HEAD:$EE_MODULE" 2>/dev/null || [[ -f "$EE_MODULE" ]]; then
  content="$(git show "HEAD:$EE_MODULE" 2>/dev/null || cat "$EE_MODULE" 2>/dev/null)"
  # any import escaping above the ee/ directory (../../) is disallowed for
  # this module — it should only wire ./api-key, ./licence and friends.
  escaping="$(printf '%s\n' "$content" | grep -E "from ['\"]\.\./\.\./" || true)"
  if [[ -n "$escaping" ]]; then
    echo "FAIL (c): $EE_MODULE imports escape the engine tree:" >&2
    echo "$escaping" >&2
    fail=1
  fi
fi

# --- (d) no banned closed-package import anywhere in the engine source -----
# Illustrative/extensible list — the concrete closed artifact this guards
# against is the upstream `docmost/ee` private repo and any future
# closed-source registry package standing in for it.
BANNED_IMPORT_REGEX='@docmost/ee-(registry|cloud)|docmost-ee|@forkmost/'
for src_dir in apps/server/src apps/client/src; do
  [[ -d "$src_dir" ]] || continue
  hits="$(grep -RnE "from ['\"](${BANNED_IMPORT_REGEX})" "$src_dir" \
            --include='*.ts' --include='*.tsx' \
            --exclude='engine-license-guard.spec.ts' \
            --exclude='engine-only-import-guard.spec.ts' \
            --exclude='license-header-check.spec.ts' 2>/dev/null || true)"
  if [[ -n "$hits" ]]; then
    echo "FAIL (d): banned closed-package import found under $src_dir:" >&2
    echo "$hits" >&2
    fail=1
  fi
done

# --- (d, cont.) no git-protocol dependency re-introducing a closed source --
while IFS= read -r pkg_json; do
  hits="$(grep -E '"(git\+ssh|git\+https|git)://[^"]*(docmost/ee|forkmost)[^"]*"' "$pkg_json" 2>/dev/null || true)"
  if [[ -n "$hits" ]]; then
    echo "FAIL (d): $pkg_json declares a closed git-protocol dependency:" >&2
    echo "$hits" >&2
    fail=1
  fi
done < <(git ls-files '*package.json' 2>/dev/null | grep -v node_modules)

if [[ "$fail" -ne 0 ]]; then
  echo "" >&2
  echo "engine-license-guard: FAIL — P10 violated (closed submodule/import in the AGPL engine)." >&2
  exit 1
fi

echo "engine-license-guard: PASS — no closed submodule, gitlink, or closed import found."
exit 0
