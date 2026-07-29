#!/usr/bin/env bash
# Real end-to-end functional test against the live orvex-wiki server.
# Every check hits the running HTTP API over real Postgres/Redis/MinIO.
B=http://localhost:3777
W=${ORVEX_E2E_WORKDIR:-/tmp/orvex-e2e}
mkdir -p "$W"
J=$W/cookies.txt
PASS=0; FAIL=0
declare -a FAILURES

ok()   { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILURES+=("$1 -- $2"); printf '  FAIL  %s\n        %s\n' "$1" "$2"; }
head1() { printf '\n=== %s ===\n' "$1"; }

req() { # req METHOD PATH [JSON] -> body in $BODY, code in $CODE
  local m=$1 p=$2 d=${3:-}
  local out
  if [ -n "$d" ]; then
    out=$(curl -s -m 20 -b "$J" -c "$J" -X "$m" "$B$p" -H 'Content-Type: application/json' -d "$d" -w '\n%{http_code}')
  else
    out=$(curl -s -m 20 -b "$J" -c "$J" -X "$m" "$B$p" -w '\n%{http_code}')
  fi
  CODE=${out##*$'\n'}
  BODY=${out%$'\n'*}
}

jqv() { echo "$BODY" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    v=eval('d'+sys.argv[1])
    print(v if v is not None else '')
except Exception:
    print('')
" "$1"; }

head1 "AUTH"
req POST /api/auth/login '{"email":"tester@e2e.local","password":"SuperSecret123!"}'
[ "$CODE" = 200 ] && ok "login returns 200" || bad "login" "HTTP $CODE: $(echo "$BODY"|head -c 150)"
grep -q authToken "$J" && ok "session cookie set" || bad "session cookie" "no authToken in jar"

req POST /api/users/me '{}'
[ "$CODE" = 200 ] && ok "GET me authenticated" || bad "users/me" "HTTP $CODE"
USER_ID=$(jqv "['data']['user']['id']"); WS_ID=$(jqv "['data']['workspace']['id']")
[ -n "$USER_ID" ] && ok "user id resolved ($USER_ID)" || bad "user id" "missing in body"

req POST /api/auth/login '{"email":"tester@e2e.local","password":"WrongPassword!"}'
[ "$CODE" != 200 ] && ok "wrong password rejected (HTTP $CODE)" || bad "wrong password" "accepted a bad credential"

head1 "WORKSPACE + SPACES"
req POST /api/workspace/info '{}'
[ "$CODE" = 200 ] && ok "workspace info" || bad "workspace info" "HTTP $CODE"
req POST /api/spaces '{"page":1}'
[ "$CODE" = 200 ] && ok "list spaces" || bad "list spaces" "HTTP $CODE"
SPACE_ID=$(jqv "['data']['items'][0]['id']")
[ -n "$SPACE_ID" ] && ok "default space exists ($SPACE_ID)" || bad "default space" "none returned"

head1 "PAGE CRUD"
req POST /api/pages/create "{\"spaceId\":\"$SPACE_ID\",\"title\":\"E2E Page One\"}"
[ "$CODE" = 200 ] && ok "create page" || bad "create page" "HTTP $CODE: $(echo "$BODY"|head -c 200)"
PAGE_ID=$(jqv "['data']['id']")
[ -n "$PAGE_ID" ] && ok "page id returned" || bad "page id" "missing"

req POST /api/pages/info "{\"pageId\":\"$PAGE_ID\"}"
[ "$CODE" = 200 ] && ok "read page back" || bad "read page" "HTTP $CODE"
T=$(jqv "['data']['title']")
[ "$T" = "E2E Page One" ] && ok "title round-trips ('$T')" || bad "title round-trip" "got '$T'"

req POST /api/pages/update "{\"pageId\":\"$PAGE_ID\",\"title\":\"E2E Page Renamed\"}"
[ "$CODE" = 200 ] && ok "update page title" || bad "update page" "HTTP $CODE"
req POST /api/pages/info "{\"pageId\":\"$PAGE_ID\"}"
T=$(jqv "['data']['title']")
[ "$T" = "E2E Page Renamed" ] && ok "update persisted" || bad "update persist" "title is '$T'"

req POST /api/pages/create "{\"spaceId\":\"$SPACE_ID\",\"title\":\"E2E Child\",\"parentPageId\":\"$PAGE_ID\"}"
CHILD_ID=$(jqv "['data']['id']")
[ "$CODE" = 200 ] && [ -n "$CHILD_ID" ] && ok "create child page" || bad "child page" "HTTP $CODE"

req POST /api/pages/recent '{"page":1}'
[ "$CODE" = 200 ] && ok "recent pages list" || bad "recent pages" "HTTP $CODE"

head1 "PAGE HISTORY"
req POST /api/pages/history "{\"pageId\":\"$PAGE_ID\",\"page\":1}"
[ "$CODE" = 200 ] && ok "page history list" || bad "page history" "HTTP $CODE"

head1 "SEARCH"
req POST /api/search "{\"query\":\"E2E\"}"
[ "$CODE" = 200 ] && ok "search executes" || bad "search" "HTTP $CODE: $(echo "$BODY"|head -c 150)"

head1 "COMMENTS"
CCONTENT='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"e2e comment"}]}]}'
CPAYLOAD=$(python3 -c "import json,sys;print(json.dumps({'pageId':sys.argv[1],'content':sys.argv[2]}))" "$PAGE_ID" "$CCONTENT")
req POST /api/comments/create "$CPAYLOAD"
if [ "$CODE" = 200 ]; then ok "create comment"; else bad "create comment" "HTTP $CODE: $(echo "$BODY"|head -c 200)"; fi
req POST /api/comments "{\"pageId\":\"$PAGE_ID\",\"page\":1}"
[ "$CODE" = 200 ] && ok "list comments" || bad "list comments" "HTTP $CODE"

head1 "GROUPS + MEMBERS"
req POST /api/groups '{"page":1}'
[ "$CODE" = 200 ] && ok "list groups" || bad "list groups" "HTTP $CODE"
req POST /api/workspace/members '{"page":1}'
[ "$CODE" = 200 ] && ok "list workspace members" || bad "list members" "HTTP $CODE"

head1 "PAGE DELETE / RESTORE"
req POST /api/pages/delete "{\"pageId\":\"$CHILD_ID\"}"
[ "$CODE" = 200 ] && ok "delete page" || bad "delete page" "HTTP $CODE"

head1 "AUTHZ NEGATIVE"
CODE_NOAUTH=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$B/api/pages/info" -H 'Content-Type: application/json' -d "{\"pageId\":\"$PAGE_ID\"}")
[ "$CODE_NOAUTH" = 401 ] && ok "unauthenticated read rejected (401)" || bad "authz" "unauthenticated got $CODE_NOAUTH"

printf '\n================ RESULT ================\n'
printf 'PASS: %d   FAIL: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\nFAILURES:\n'
  for f in "${FAILURES[@]}"; do printf '  - %s\n' "$f"; done
  exit 1
fi
