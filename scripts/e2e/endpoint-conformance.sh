#!/usr/bin/env bash
# Live endpoint conformance for the identity -> wiki provision path and the
# authenticated wiki-api caller surface. Credentials must arrive through the
# caller's secure environment; this script never prints response bodies/tokens.
# For the internal route, forward the crew service first, e.g.
# kubectl port-forward -n orvex-wiki-crew-yafet svc/orvex-wiki 34000:3000
set -euo pipefail

BASE_URL=${ORVEX_WIKI_BASE_URL:-https://wiki.crew-yafet.orvex.dev}
INTERNAL_BASE_URL=${INTERNAL_API_BASE_URL:-http://127.0.0.1:34000}
U2_BASE_URL=${E2E_U2_BASE_URL:-$BASE_URL}
U3_BASE_URL=${E2E_U3_BASE_URL:-$BASE_URL}

missing_credentials=0

tmp=$(mktemp -d)
chmod 700 "$tmp"
trap 'rm -rf "$tmp"' EXIT
pass=0
fail=0

request() {
  local method=$1 url=$2 body_file=$3 auth_config=$4
  shift 4
  local -a auth_args=()
  if [[ -n $auth_config ]]; then
    auth_args=(--config "$auth_config")
  fi
  curl --silent --show-error --max-time 25 \
    --output "$body_file" --write-out '%{http_code}' \
    "${auth_args[@]}" --request "$method" "$url" "$@"
}

write_auth_config() {
  local variable_name=$1 output=$2
  [[ -n ${!variable_name:-} ]] || return 1
  AUTH_TOKEN=${!variable_name} python3 - "$output" <<'PY'
import os, sys
token = os.environ["AUTH_TOKEN"]
escaped = token.replace("\\", "\\\\").replace('"', '\\"')
with open(sys.argv[1], "w", encoding="utf-8") as f:
    f.write(f'header = "Authorization: Bearer {escaped}"\n')
PY
  chmod 600 "$output"
}

check_status() {
  local name=$1 got=$2 expected=$3
  if [[ $got == "$expected" ]]; then
    printf 'PASS %s (HTTP %s)\n' "$name" "$got"
    pass=$((pass + 1))
  else
    printf 'FAIL %s (HTTP %s; expected %s)\n' "$name" "$got" "$expected"
    fail=$((fail + 1))
  fi
}

check_error_envelope() {
  local name=$1 file=$2 expected=$3
  if python3 - "$file" "$expected" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    body = json.load(f)
assert isinstance(body, dict), "error body must be an object"
assert "data" not in body, "error must not use the success envelope"
if "statusCode" in body:
    assert body.get("statusCode") == int(sys.argv[2]), "statusCode mismatch"
    assert isinstance(body.get("message"), (str, list)), "message is missing"
else:
    # Crew ingress serializes Nest errors as {error: string} and carries the
    # HTTP status in the response line instead of duplicating it in the body.
    if int(sys.argv[2]) == 421:
        assert body.get("errorCode") == "CELL_MISMATCH", "cell mismatch code is missing"
        assert isinstance(body.get("message"), str), "cell mismatch message is missing"
        assert body.get("details", {}).get("reResolve", {}).get("action") == "rediscover"
    else:
        assert isinstance(body.get("error"), str) and body["error"], "error field is missing"
PY
  then
    printf 'PASS %s error envelope\n' "$name"
    pass=$((pass + 1))
  else
    printf 'FAIL %s error envelope\n' "$name"
    fail=$((fail + 1))
  fi
}

check_workspace_response() {
  local name=$1 file=$2 expected_id=${3:-}
  if python3 - "$file" "$expected_id" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    body = json.load(f)
assert isinstance(body, dict), "response must be an object"
assert body.get("success") is True, "success envelope missing"
assert body.get("status") == 200, "status envelope mismatch"
data = body.get("data")
assert isinstance(data, dict), "data must be an object"
workspace_id = data.get("id") or data.get("workspaceId") or data.get("workspace_id")
assert isinstance(workspace_id, str) and workspace_id, "workspace id missing"
if sys.argv[2]:
    assert workspace_id == sys.argv[2], "workspace id does not match the expected tenant"
PY
  then
    printf 'PASS %s workspace response contract\n' "$name"
    pass=$((pass + 1))
  else
    printf 'FAIL %s workspace response contract\n' "$name"
    fail=$((fail + 1))
  fi
}

printf 'Checking internal identity -> wiki provision contract at %s\n' "$INTERNAL_BASE_URL"
status=$(request POST "$INTERNAL_BASE_URL/internal/principals/provision" "$tmp/no-auth.json" '' \
  -H 'Content-Type: application/json' --data '{}')
check_status 'provision without credentials' "$status" 401
check_error_envelope 'provision without credentials' "$tmp/no-auth.json" 401

status=$(request POST "$INTERNAL_BASE_URL/internal/principals/provision" "$tmp/wrong-auth.json" '' \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer invalid' --data '{}')
check_status 'provision with invalid bearer' "$status" 401
check_error_envelope 'provision with invalid bearer' "$tmp/wrong-auth.json" 401

if [[ -n ${INTERNAL_API_BEARER_TOKEN:-} ]]; then
  write_auth_config INTERNAL_API_BEARER_TOKEN "$tmp/internal-api.curl"
  # A random, syntactically valid tenant cannot exist; 404 proves the valid
  # service credential reached tenant validation without creating user data.
  unknown_tenant=$(python3 -c 'import uuid; print(uuid.uuid4())')
  status=$(request POST "$INTERNAL_BASE_URL/internal/principals/provision" "$tmp/wrong-tenant.json" "$tmp/internal-api.curl" \
    -H 'Content-Type: application/json' \
    --data "{\"subject\":\"vhq31-smoke\",\"tenant\":\"$unknown_tenant\",\"email\":\"vhq31-smoke@example.invalid\"}")
  if [[ $status == 403 || $status == 404 || $status == 421 ]]; then
    printf 'PASS provision to unknown tenant (HTTP %s)\n' "$status"
    check_error_envelope 'provision to unknown tenant' "$tmp/wrong-tenant.json" "$status"
  else
    check_status 'provision to unknown tenant' "$status" '404 or 421'
    check_error_envelope 'provision to unknown tenant' "$tmp/wrong-tenant.json" "$status"
  fi
else
  printf 'SKIP provision to unknown tenant (INTERNAL_API_BEARER_TOKEN is unavailable)\n'
  missing_credentials=1
fi

printf 'Checking authenticated wiki-api caller route for U2 and U3\n'
for user in U2 U3; do
  if [[ $user == U2 ]]; then
    auth_token=${E2E_U2_AUTH_TOKEN:-}
    user_base=$U2_BASE_URL
    expected_workspace=${E2E_U2_WORKSPACE_ID:-}
  else
    auth_token=${E2E_U3_AUTH_TOKEN:-}
    user_base=$U3_BASE_URL
    expected_workspace=${E2E_U3_WORKSPACE_ID:-}
  fi
  if [[ -z $auth_token ]]; then
    printf 'SKIP %s workspace info (E2E_%s_AUTH_TOKEN is unavailable)\n' "$user" "$user"
    missing_credentials=1
    continue
  fi
  token_variable="E2E_${user}_AUTH_TOKEN"
  write_auth_config "$token_variable" "$tmp/$user.curl"
  status=$(request POST "${user_base%/}/api/workspace/info" "$tmp/$user.json" "$tmp/$user.curl" \
    -H 'Content-Type: application/json' \
    --data '{}')
  check_status "$user workspace info" "$status" 200
  check_workspace_response "$user" "$tmp/$user.json" "$expected_workspace"
done

printf '\nEndpoint conformance: %d passed, %d failed\n' "$pass" "$fail"
if (( fail > 0 )); then
  exit 1
fi
if (( missing_credentials > 0 )); then
  printf 'Some authenticated checks were skipped because secure credentials were unavailable.\n' >&2
  exit 2
fi
