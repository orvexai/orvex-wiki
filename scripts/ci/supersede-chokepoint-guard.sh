#!/usr/bin/env bash
# supersede-chokepoint-guard.sh — ENG-1434 AC12/§5c: the ONLY place in this
# repo allowed to write `orvex_page_meta.status = 'superseded'` is
# `OrvexPageMetadataService.supersedeAtomic` (apps/server/src/orvex/
# page-metadata/orvex-page-metadata.service.ts). Any OTHER hand-rolled
# write of `PageStatus.SUPERSEDED` (or the raw `'superseded'` literal) into
# `orvexPageMeta`/`orvex_page_meta` is a second, divergent mutation path —
# exactly what AC12 forbids.
#
# Scoped to the orvex-wiki repo tree only (ruling 10 — this leg does not,
# and must not, reach into apps/server/src/orvex/mcp/** owned by the
# separate orvex-studio-mcp leg; that leg has no supersede-writing code in
# THIS repo to false-positive on).
#
# Usage: supersede-chokepoint-guard.sh [repo-dir]
# Exit 0 = single chokepoint holds. Exit 1 = a divergent path was found.
set -uo pipefail

REPO_DIR="${1:-.}"
SRC_DIR="$REPO_DIR/apps/server/src/orvex"
CHOKEPOINT="$SRC_DIR/page-metadata/orvex-page-metadata.service.ts"

if [[ ! -f "$CHOKEPOINT" ]]; then
  echo "supersede-chokepoint-guard: chokepoint file missing: $CHOKEPOINT" >&2
  exit 1
fi

# Every *.ts file under apps/server/src/orvex, excluding the chokepoint
# itself, DTOs (which only EXCLUDE `superseded` from an allow-list — AC9 —
# never write it) and *.spec.ts fixtures, that WRITES the literal
# `status: PageStatus.SUPERSEDED` (a Kysely `.set(`/`.values(` object key)
# is a candidate divergent mutation path. A bare reference (e.g. a
# read-only classification list) is not a write and is not flagged.
violations=$(
  grep -rlE --include='*.ts' "status:\s*PageStatus\.SUPERSEDED" "$SRC_DIR" 2>/dev/null \
    | grep -v -F "$CHOKEPOINT" \
    | grep -v '/dto/' \
    | grep -v '\.spec\.ts$' \
    || true
)

if [[ -n "$violations" ]]; then
  echo "supersede-chokepoint-guard: FAIL — divergent supersede write(s) found outside supersedeAtomic:" >&2
  echo "$violations" >&2
  exit 1
fi

echo "supersede-chokepoint-guard: PASS — supersedeAtomic is the sole in-repo supersede chokepoint."
