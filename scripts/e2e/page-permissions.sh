#!/usr/bin/env bash
# ENG-1375 / ENG-1596 page-permission E2E — the exact flow whose client reads
# I repointed. Runs authenticated against the live server (vanilla mode).
B=http://localhost:3777
W=${ORVEX_E2E_WORKDIR:-/tmp/orvex-e2e}
mkdir -p "$W"
J=$W/pcookies.txt
PASS=0; FAIL=0
declare -a FAILURES
ok()  { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); FAILURES+=("$1 -- $2"); printf '  FAIL  %s\n        %s\n' "$1" "$2"; }
head1(){ printf '\n=== %s ===\n' "$1"; }
req() {
  local m=$1 p=$2 d=${3:-}
  local out
  if [ -n "$d" ]; then
    out=$(curl -s -m 20 -b "$J" -c "$J" -X "$m" "$B$p" -H 'Content-Type: application/json' -d "$d" -w '\n%{http_code}')
  else
    out=$(curl -s -m 20 -b "$J" -c "$J" -X "$m" "$B$p" -w '\n%{http_code}')
  fi
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
jqv() { echo "$BODY" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin); v=eval('d'+sys.argv[1]); print(v if v is not None else '')
except Exception: print('')
" "$1"; }

rm -f "$J"
req POST /api/auth/login '{"email":"tester@e2e.local","password":"SuperSecret123!"}'
[ "$CODE" = 200 ] || { echo "cannot login (HTTP $CODE) — aborting"; exit 1; }

req POST /api/spaces '{"page":1}'
SPACE_ID=$(jqv "['data']['items'][0]['id']")
req POST /api/pages/create "{\"spaceId\":\"$SPACE_ID\",\"title\":\"Perm Test Page\"}"
PAGE_ID=$(jqv "['data']['id']")
[ -n "$PAGE_ID" ] || { echo "cannot create page — aborting"; exit 1; }
echo "page under test: $PAGE_ID"

head1 "ENG-1596 READS (the routes my ENG-1375 fix repointed the client onto)"
req POST /api/page-permissions/restriction-info "{\"pageId\":\"$PAGE_ID\"}"
if [ "$CODE" = 200 ]; then
  ok "restriction-info returns 200"
  echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin); b=d.get('data',d)
for k in ('hasDirectRestriction','hasInheritedRestriction','inheritedFrom','userAccess'):
    assert k in b, 'missing field '+k
ua=b['userAccess']
assert 'canAccess' in ua and 'canEdit' in ua, 'userAccess shape wrong: %r' % ua
print('shape OK:', json.dumps(b))
" && ok "restriction-info body matches the IPageRestrictionInfo contract the client expects" \
   || bad "restriction-info shape" "$(echo "$BODY"|head -c 200)"
else
  bad "restriction-info" "HTTP $CODE: $(echo "$BODY"|head -c 200)"
fi

req POST /api/page-permissions/list "{\"pageId\":\"$PAGE_ID\"}"
if [ "$CODE" = 200 ]; then
  ok "list returns 200 on an UNRESTRICTED page (empty, never an error)"
  echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin); b=d.get('data',d)
assert 'items' in b and 'meta' in b, 'not a paginated shape: %r' % list(b)
print('pagination OK, items=%d' % len(b['items']))
" && ok "list body is the IPagination shape the client expects" || bad "list shape" "$(echo "$BODY"|head -c 200)"
else
  bad "list" "HTTP $CODE: $(echo "$BODY"|head -c 200)"
fi

head1 "MUTATIONS -> READ-BACK (the full restrict/grant round trip)"
req POST /api/page-permissions/restrict "{\"pageId\":\"$PAGE_ID\"}"
[ "$CODE" = 200 ] && ok "restrict page" || bad "restrict" "HTTP $CODE: $(echo "$BODY"|head -c 200)"

req POST /api/page-permissions/restriction-info "{\"pageId\":\"$PAGE_ID\"}"
HD=$(jqv "['data']['hasDirectRestriction']")
[ "$HD" = "True" ] && ok "restriction-info reflects the restrict (hasDirectRestriction=true)" \
  || bad "restrict read-back" "hasDirectRestriction=$HD"

req POST /api/page-permissions/list "{\"pageId\":\"$PAGE_ID\"}"
N=$(echo "$BODY" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin); b=d.get('data',d); print(len(b['items']))
except Exception: print('ERR')")
[ "$N" != "ERR" ] && [ "$N" -ge 1 ] && ok "list shows the restricting admin as a grant ($N row)" \
  || bad "list after restrict" "items=$N (the controller grants the admin writer on restrict)"

req POST /api/page-permissions/remove-restriction "{\"pageId\":\"$PAGE_ID\"}"
[ "$CODE" = 200 ] && ok "unrestrict page" || bad "unrestrict" "HTTP $CODE"

req POST /api/page-permissions/restriction-info "{\"pageId\":\"$PAGE_ID\"}"
HD=$(jqv "['data']['hasDirectRestriction']")
[ "$HD" = "False" ] && ok "restriction-info reflects the unrestrict" || bad "unrestrict read-back" "hasDirectRestriction=$HD"

head1 "AUTHZ — the reads share the mutations' admin choke point"
CN=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$B/api/page-permissions/list" -H 'Content-Type: application/json' -d "{\"pageId\":\"$PAGE_ID\"}")
[ "$CN" = 401 ] && ok "unauthenticated list rejected (401)" || bad "authz" "unauthenticated got $CN"

printf '\n================ PERMISSIONS RESULT ================\n'
printf 'PASS: %d   FAIL: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\nFAILURES:\n'; for f in "${FAILURES[@]}"; do printf '  - %s\n' "$f"; done; exit 1
fi
