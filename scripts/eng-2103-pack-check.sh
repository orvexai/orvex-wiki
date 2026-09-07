#!/usr/bin/env bash
set -euo pipefail

# ENG-2103 local pack gate. This checks only repository-owned evidence. The
# --certify mode adds explicit external gates and must stay red until their
# owners provide machine-readable evidence.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACK="$ROOT/docs/definition-packs/orvex-wiki"
MODE="${1:-local}"

# `rg` is preferred when it is an executable, but this gate must also work in
# the non-interactive shells used by CI and fresh clones. An interactive shell
# function named `rg` is not evidence that the binary is installed.
RG_BIN="$(type -P rg 2>/dev/null || true)"
search_q() {
  local pattern="$1"
  shift
  if [[ -n "$RG_BIN" ]]; then
    "$RG_BIN" -q -- "$pattern" "$@"
  else
    grep -Eq -- "$pattern" "$@"
  fi
}
search_r() {
  local pattern="$1"
  local path="$2"
  if [[ -n "$RG_BIN" ]]; then
    "$RG_BIN" -n -i -- "$pattern" "$path"
  else
    grep -RniE -- "$pattern" "$path"
  fi
}

fail=0
require_file() {
  if [[ ! -f "$PACK/$1" ]]; then
    echo "FAIL: missing pack artifact $1" >&2
    fail=1
  fi
}

for file in README.md prd-delta.md contract-summary.md test-plan.md sdd.md build-prompt.md; do
  require_file "$file"
done

if [[ -d "$PACK" ]] && search_r 'mongo' "$PACK"; then
  echo "FAIL: forbidden event-store wording in ENG-2103 pack" >&2
  fail=1
fi

for slug in \
  orvex-wiki-prd-delta \
  orvex-wiki-contract-summary \
  orvex-wiki-test-plan \
  orvex-wiki-sdd \
  orvex-wiki-build-prompt; do
  if ! search_q "slug: $slug" "$PACK"/*.md; then
    echo "FAIL: pack slug not declared: $slug" >&2
    fail=1
  fi
done

if ! search_q '^status: draft$' "$PACK"/*.md; then
  echo "FAIL: pack artifacts must remain drafts until external certification" >&2
  fail=1
fi

if ! search_q 'orvex_outbox.*Postgres|Postgres.*orvex_outbox' "$PACK"/*.md; then
  echo "FAIL: pack does not pin the transactional Postgres outbox" >&2
  fail=1
fi
if ! search_q 'directly to Kafka|directly to.*Kafka|direct; no intermediate' "$PACK"/*.md; then
  echo "FAIL: pack does not pin direct Kafka studio-spine delivery" >&2
  fail=1
fi
if ! search_q '402 QUOTA_EXCEEDED' "$PACK"/*.md; then
  echo "FAIL: pack does not pin the quota error contract" >&2
  fail=1
fi
if ! search_q 'orvex-wiki-api' "$PACK"/prd-delta.md "$PACK"/sdd.md "$PACK"/build-prompt.md; then
  echo "FAIL: pack does not pin the composition owner" >&2
  fail=1
fi
if ! search_q 'ORVEX_GIT_SHA' "$PACK"/prd-delta.md "$PACK"/sdd.md; then
  echo "FAIL: pack does not pin source-offer build provenance" >&2
  fail=1
fi

for n in $(seq 1 17); do
  if ! search_q "^H${n} yes" "$PACK/build-prompt.md"; then
    echo "FAIL: build prompt missing H${n} yes self-audit" >&2
    fail=1
  fi
done

if ! "$ROOT/scripts/orvex-marker-check.sh"; then
  echo "FAIL: local OpenAPI/marker contract drift" >&2
  fail=1
fi

if [[ "$MODE" == "--certify" ]]; then
  if ! "$ROOT/scripts/eng-2103-contract-evidence.sh"; then
    fail=1
  fi
  declare -A gates=(
    [PACK_REVIEW_PASS]="reviewer-owned PACK-REVIEW: PASS with reviewer != author"
    [ORVEX_CONTRACTS_CI_GREEN]="contracts CI green on the tag commit"
    [ORVEX_WIKI_DRAFTS_VERIFIED]="wiki owner verified all five draft pages"
    [ORVEX_SOURCE_GATE_RATIFIED]="contracts/PO owner ratified source URL and SHA authority"
  )
  for name in "${!gates[@]}"; do
    value="${!name:-}"
    if [[ "$name" == "ORVEX_CONTRACTS_CI_GREEN" || "$name" == "ORVEX_WIKI_DRAFTS_VERIFIED" || "$name" == "ORVEX_SOURCE_GATE_RATIFIED" || "$name" == "PACK_REVIEW_PASS" ]]; then
      if [[ "$value" != "true" ]]; then
        echo "BLOCKED: $name — ${gates[$name]}" >&2
        fail=1
      fi
    elif [[ -z "$value" ]]; then
      echo "BLOCKED: $name — ${gates[$name]}" >&2
      fail=1
    fi
  done
fi

if (( fail )); then
  exit 1
fi

echo "eng-2103-pack-check: local evidence PASS"
if [[ "$MODE" == "--certify" ]]; then
  echo "eng-2103-pack-check: external certification PASS"
fi
