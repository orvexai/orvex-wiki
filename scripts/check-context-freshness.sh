#!/usr/bin/env bash
# check-context-freshness.sh — the CS carried-copy drift gate (Foundation, TBD-5).
#
# THE PROBLEM: project-context.md is a CARRIED COPY of the family Coding
# Standards (CS §9 "always-loaded copy"), so it binds agents at planning time.
# But it drifts silently when the canonical wiki page changes. CS §9 itself
# names the multi-repo refresh mechanism an OPEN DECISION. This is that
# mechanism for THIS repo: a loud CI gate, not a silent copy.
#
# HOW: project-context.md pins the sha256 of the CS source page it was
# materialized from (the `cs-source-sha256:` line in its provenance header).
# This script fetches the CURRENT CS page and compares. It tracks the SOURCE's
# identity, NOT byte-equality with the local copy — the local copy intentionally
# carries repo-specific overrides (e.g. the D-S12 Postgres override), so it is
# never byte-equal to the wiki. What must not drift unnoticed is the SOURCE.
#
# On mismatch the gate FAILS (never auto-overwrites): a human reviews what
# changed in the CS page, folds the relevant delta into the local copy
# (preserving overrides), and re-pins the hash. Requires docmost-cli +
# DOCMOST_API_TOKEN; if the wiki is unreachable the gate is SKIPPED-with-warning
# (a network outage must not red every PR) — never a silent pass.
set -uo pipefail

CS_SLUG="6aMAzsYeQb"
CTX="$(cd "$(dirname "$0")/.." && pwd)/project-context.md"

pinned=$(grep -oE 'cs-source-sha256:[[:space:]]*[a-f0-9]{64}' "$CTX" 2>/dev/null | grep -oE '[a-f0-9]{64}' | head -1)
if [[ -z "$pinned" ]]; then
  echo "FAIL: no 'cs-source-sha256:' pin found in project-context.md provenance header." >&2
  exit 1
fi

if ! command -v docmost-cli >/dev/null 2>&1; then
  echo "SKIP (docmost-cli not installed) — cannot verify CS freshness; pinned=$pinned" >&2
  exit 0
fi

current=$(docmost-cli page get "$CS_SLUG" --no-daemon 2>/dev/null | sha256sum | cut -d' ' -f1)
if [[ -z "$current" || ${#current} -ne 64 ]]; then
  echo "SKIP (wiki unreachable) — could not fetch CS page $CS_SLUG; pinned=$pinned" >&2
  exit 0
fi

if [[ "$current" == "$pinned" ]]; then
  echo "OK: project-context.md is materialized from the current CS page ($CS_SLUG @ $current)."
  exit 0
fi

cat >&2 <<EOF
FAIL: the canonical Coding Standards page changed since this repo's
project-context.md was materialized.
  CS page : $CS_SLUG
  pinned  : $pinned
  current : $current
Review the CS delta, fold it into project-context.md (PRESERVE this repo's
documented overrides — e.g. the D-S12 Postgres override), then re-pin:
  docmost-cli page get $CS_SLUG --no-daemon | sha256sum   # -> new cs-source-sha256
EOF
exit 1
