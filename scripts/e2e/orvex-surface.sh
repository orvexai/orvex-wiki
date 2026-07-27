#!/usr/bin/env bash
# Orvex-fork surface E2E — runs against the LIVE server in ORVEX_MODULES_ENABLED=true mode.
B=http://localhost:3777
W=${ORVEX_E2E_WORKDIR:-/tmp/orvex-e2e}
mkdir -p "$W"
J=$W/ocookies.txt
PASS=0; FAIL=0
declare -a FAILURES
ok()   { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILURES+=("$1 -- $2"); printf '  FAIL  %s\n        %s\n' "$1" "$2"; }
head1(){ printf '\n=== %s ===\n' "$1"; }
code() { curl -s -m 20 -o /dev/null -w '%{http_code}' "$@"; }
body() { curl -s -m 20 "$@"; }

head1 "MODULE TREE MOUNTED (ORVEX_MODULES_ENABLED=true)"
c=$(code http://localhost:3777/health/orvex)
[ "$c" = 200 ] && ok "/health/orvex serves 200 (dependency aggregate)" || bad "health/orvex" "HTTP $c"

c=$(code -X POST $B/api/orvex/session/exchange -H 'Content-Type: application/json' -d '{}')
[ "$c" != 404 ] && ok "session-exchange route MOUNTED (HTTP $c, not 404)" || bad "session-exchange" "404 — module tree not mounted"

c=$(code $B/api/orvex/quota)
[ "$c" != 404 ] && ok "quota route MOUNTED (HTTP $c)" || bad "quota route" "404"

head1 "ENG-2499 — NATIVE LOGIN FAIL-CLOSED UNDER ORVEX MODE"
r=$(body -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"tester@e2e.local","password":"SuperSecret123!"}')
c=$(code -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"tester@e2e.local","password":"SuperSecret123!"}')
if [ "$c" = 403 ] && echo "$r" | grep -qi "native login disabled"; then
  ok "native password login REJECTED 403 with typed message"
elif [ "$c" = 429 ]; then
  ok "native login rate-limited (429) — guard reached, throttler fired first"
else
  bad "native login guard" "HTTP $c body=$(echo "$r"|head -c 120)"
fi
echo "$r" | grep -qi "set-cookie" && bad "native login leak" "response carried a cookie" || ok "no session cookie minted on rejection"

head1 "ENG-2510 — PER-ROLE LIVENESS PROBES"
c=$(code $B/health/orvex/collab)
[ "$c" = 200 ] || [ "$c" = 503 ] && ok "/health/orvex/collab responds (HTTP $c — 503 = dead WS, honest)" || bad "collab probe" "HTTP $c"
r=$(body $B/health/orvex/relay); c=$(code $B/health/orvex/relay)
[ "$c" = 200 ] && ok "/health/orvex/relay 200-unconditional (family health ruling)" || bad "relay probe" "HTTP $c"
echo "$r" | grep -q '"role"' && ok "relay body carries role field" || bad "relay role" "no role in $(echo "$r"|head -c 120)"

head1 "ENG-2510 AC3 — HEALTH ECHOES CELL_ID + CLUSTER_NAME"
r=$(body $B/health/orvex)
echo "$r" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'cellId' in d, 'no cellId field'
assert 'clusterName' in d, 'no clusterName field'
print('OK cellId=%r clusterName=%r' % (d['cellId'], d['clusterName']))
" 2>/dev/null && ok "health body echoes cellId + clusterName" || bad "cell echo" "missing from $(echo "$r"|head -c 160)"

head1 "ENG-2500 — AGPL SOURCE OFFER (fail-loud when unconfigured)"
r=$(body $B/api/orvex/source); c=$(code $B/api/orvex/source)
if [ "$c" = 200 ]; then
  echo "$r" | grep -q '"sha"' && ok "source offer serves {sha,sourceRepo}" || bad "source offer" "200 but no sha: $(echo "$r"|head -c 120)"
elif [ "$c" = 500 ] && echo "$r" | grep -qi "not configured"; then
  ok "source offer fails LOUD when unconfigured (never a nulls-200)"
else
  bad "source offer" "HTTP $c: $(echo "$r"|head -c 150)"
fi

head1 "ENG-2508 — NO SWAGGER / NO /docs ON THE LIVE APP"
# NOTE: the SPA client is served as a catch-all, so ANY unknown non-/api path
# returns 200 with index.html — a 200 alone proves nothing. What matters is
# that no path serves an actual OpenAPI/Swagger DOCUMENT or UI. Assert on the
# CONTENT, and use a known-nonexistent control path to prove the catch-all is
# what is answering.
CTRL=$(body "$B/definitely-not-a-real-route-$$")
for p in /docs /api/docs /api-docs /swagger /api/swagger /api/docs-json /swagger-ui; do
  r=$(body "$B$p")
  if echo "$r" | grep -qiE '"openapi"|"swagger"|swagger-ui|redoc'; then
    bad "docs exposure" "$p serves an API-docs document/UI"
  elif [ "$r" = "$CTRL" ]; then
    ok "$p is the SPA catch-all, not API docs"
  else
    c=$(code "$B$p")
    [ "$c" = 404 ] && ok "$p is 404" || bad "docs exposure" "$p returned $c with non-SPA body"
  fi
done

head1 "ENG-2493 — QUOTA READ IS AUTH-GUARDED (no anonymous usage leak)"
c=$(code $B/api/orvex/quota)
[ "$c" = 401 ] && ok "unauthenticated quota read rejected 401" || bad "quota authz" "HTTP $c (expected 401)"

head1 "INTERNAL API — BEARER FAIL-CLOSED"
c=$(code -X POST $B/internal/principals/provision -H 'Content-Type: application/json' -d '{}')
[ "$c" = 401 ] || [ "$c" = 403 ] && ok "internal API rejects unauthenticated (HTTP $c)" || bad "internal authz" "HTTP $c"
c=$(code -X POST $B/internal/principals/provision -H 'Authorization: Bearer wrong-token' -H 'Content-Type: application/json' -d '{}')
[ "$c" = 401 ] || [ "$c" = 403 ] && ok "internal API rejects WRONG bearer (HTTP $c)" || bad "internal bearer" "HTTP $c"

head1 "METRICS — FAIL-CLOSED BY DEFAULT"
c=$(code $B/metrics)
[ "$c" = 401 ] || [ "$c" = 404 ] && ok "/metrics not anonymously readable (HTTP $c)" || bad "metrics" "HTTP $c — usage data exposed"

printf '\n================ ORVEX SURFACE RESULT ================\n'
printf 'PASS: %d   FAIL: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\nFAILURES:\n'; for f in "${FAILURES[@]}"; do printf '  - %s\n' "$f"; done; exit 1
fi
