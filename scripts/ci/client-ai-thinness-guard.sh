#!/usr/bin/env bash
# client-ai-thinness-guard.sh — ENG-1359 AC7: the client-bundle AI-chat
# rendering surface (apps/client/src/ee/ai-chat) must contain no
# model-capability tables, prompt templates, agent/tool orchestration, or
# budget-policy math — only rendering + SSE-reading + forwarding. All of
# that logic is confined behind the REST+SSE seam in orvex-studio-ai
# (CS §6 tier confinement, ruling 10).
#
# Usage: client-ai-thinness-guard.sh [repo-dir]
# Exit 0 = no forbidden pattern found. Exit 1 = at least one found (listed
# on stderr).
set -uo pipefail

REPO_DIR="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
AI_CHAT_DIR="$REPO_DIR/apps/client/src/ee/ai-chat"

if [[ ! -d "$AI_CHAT_DIR" ]]; then
  echo "FAIL: '$AI_CHAT_DIR' does not exist" >&2
  exit 1
fi

BANNED_REGEX='system prompt|promptTemplate|toolLoop|agentStep|model capabilities table|budget policy'

MATCHES=$(grep -rniE "$BANNED_REGEX" "$AI_CHAT_DIR" 2>/dev/null || true)

if [[ -n "$MATCHES" ]]; then
  echo "FAIL: AI/model/prompt/agent/budget-policy logic found in the client bundle:" >&2
  echo "$MATCHES" >&2
  exit 1
fi

echo "OK: client-ai-thinness — no AI logic found in $AI_CHAT_DIR"
exit 0
