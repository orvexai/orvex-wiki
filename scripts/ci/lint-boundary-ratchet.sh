#!/usr/bin/env bash
# lint-boundary-ratchet.sh — PO-2026-07-29-5 ratchet for the repo-root
# BOUNDARY lint (eslint.config.mjs's `no-restricted-imports` BAN rules: mock
# quarantine + AGPL import guard, plus the AGPL-tree `no-explicit-any` gate).
#
# This fence is this repo's depguard/forbidigo-shaped BAN enforcement. Per
# ruling PO-2026-07-29-5, BAN rules run as a ratchet scoped to CHANGED FILES
# ONLY (the eslint equivalent of `--new-from-rev=<mainline>`) so unmigrated
# legacy code does not freeze the repo. Every OTHER lint/CI job in this repo
# (lint-client, lint-server, typecheck, security, etc.) stays full-scope —
# this ratchet applies ONLY to this one BAN-rule fence.
#
# Baseline: lint-boundary-ratchet-baseline.sha, the mainline commit this
# ratchet was introduced at (frozen — never advanced to "catch up" the
# ratchet; only removed outright once the fence is fully clean, see below).
# Only files that changed since that commit are linted; everything at-or-
# before it is grandfathered untouched.
#
# REQUIRED Phase-2 adoption DoD (PO-2026-07-29-5): removing this ratchet —
# i.e. reverting `lint-boundary` to unconditionally run full-scope
# `pnpm lint:boundary` on every file, every run — is a REQUIRED item of this
# service's Phase-2 adoption Definition of Done. Do not delete this script or
# silently widen it without also completing that removal.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BASELINE_FILE="scripts/ci/lint-boundary-ratchet-baseline.sha"
BASELINE_SHA="$(tr -d '[:space:]' < "$BASELINE_FILE")"

if ! git cat-file -e "${BASELINE_SHA}^{commit}" 2>/dev/null; then
  echo "lint-boundary-ratchet: baseline commit ${BASELINE_SHA} is not reachable (shallow clone?) — falling back to full-scope pnpm lint:boundary." >&2
  exec pnpm lint:boundary
fi

mapfile -t CHANGED < <(git diff --name-only --diff-filter=ACMR "${BASELINE_SHA}" HEAD -- \
  'apps/**/*.ts' 'apps/**/*.tsx' 'apps/**/*.mts' 'apps/**/*.cts' \
  'packages/**/*.ts' 'packages/**/*.tsx' 'packages/**/*.mts' 'packages/**/*.cts' \
  2>/dev/null || true)

if [ "${#CHANGED[@]}" -eq 0 ]; then
  echo "lint-boundary-ratchet: no changed apps/**/packages/** TS file since baseline ${BASELINE_SHA} — nothing to check."
  exit 0
fi

echo "lint-boundary-ratchet: checking ${#CHANGED[@]} changed file(s) since baseline ${BASELINE_SHA}:"
printf '  %s\n' "${CHANGED[@]}"
exec pnpm exec eslint --quiet "${CHANGED[@]}"
