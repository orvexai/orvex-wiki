#!/usr/bin/env bash
# Run the browser (Playwright) user-journey suite against a locally running engine.
#
# Clears the Redis auth-throttle keys first: AUTH_THROTTLER is 10 attempts / 60s
# and a suite that logs in (plus any manual poking beforehand) trips it. A 429
# surfaces as "still on /login", which is indistinguishable from a broken login
# form — so the harness removes the ambiguity rather than tuning production
# throttle config for tests.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

# Capture the caller's APP_URL BEFORE sourcing .env.dev, which sets its own
# (port 3000) and would otherwise clobber an explicit override.
CALLER_APP_URL="${APP_URL:-}"
COMPOSE_REDIS="${COMPOSE_REDIS:-orvex-wiki-dev-redis-1}"

if [ -f .env.dev ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env.dev; set +a
fi

APP_URL="${CALLER_APP_URL:-${APP_URL:-http://localhost:3777}}"
export APP_URL

if docker ps --format '{{.Names}}' | grep -qx "$COMPOSE_REDIS"; then
  RP=$(printf '%s' "${REDIS_URL:-}" | sed -n 's|redis://:\([^@]*\)@.*|\1|p')
  docker exec "$COMPOSE_REDIS" redis-cli ${RP:+-a "$RP"} --no-auth-warning \
    EVAL "local k=redis.call('keys','*hrottle*') for i=1,#k do redis.call('del',k[i]) end return #k" 0 \
    >/dev/null 2>&1 && echo "cleared auth-throttle keys"
fi

if ! curl -sf -m 5 "$APP_URL/api/health" >/dev/null; then
  echo "engine not reachable at $APP_URL — start it with scripts/e2e/boot-local.sh vanilla" >&2
  exit 1
fi

exec pnpm -C apps/client exec playwright test "$@" \
  --project=chromium --workers=1 --reporter=list
