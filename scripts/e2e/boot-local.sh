#!/usr/bin/env bash
# Boot the orvex-wiki server for E2E testing.
#   boot.sh vanilla  -> ORVEX_MODULES_ENABLED unset (upstream Docmost parity)
#   boot.sh orvex    -> ORVEX_MODULES_ENABLED=true (the fork's module tree)
cd /home/yafet/orvex-ai/.worktrees/orvex-wiki-integration || exit 1
set -a
. ./.env.dev
set +a
export NODE_ENV=production
export PORT=3777
export APP_URL=http://localhost:3777
if [ "$1" = "orvex" ]; then
  export ORVEX_MODULES_ENABLED=true
else
  unset ORVEX_MODULES_ENABLED
fi
exec node apps/server/dist/main.js
