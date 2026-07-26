#!/usr/bin/env bash
# seam2-quota-402.sh — cross-cutting Seam 2 re-run (ENG-2053 closing artifact).
#
# Seam 2 (rebaseline/cross-cutting.md): the frozen 402 QUOTA_EXCEEDED contract
# ({error:'QUOTA_EXCEEDED',resource,limit}, thrown BEFORE any write) must be
# live-exercisable on the target cell. DEFECT-1 found it inert because
# ORVEX_MODULES_ENABLED was off and ORVEX_BILLING_API_URL unwired.
#
# Legs (each emits PASS / FAIL / SKIPPED with the raw evidence inline):
#   1. health         — GET /api/health is 200
#   2. modules-live   — /api/orvex/* routes present in the live OpenAPI
#                       descriptor (GET /api/version/orvex/api). Routes can
#                       only mount when ORVEX_MODULES_ENABLED === 'true' on
#                       the running pod, so this proves the flag took effect
#                       without needing pod exec.
#   3. pod-env        — kubectl exec env grep (needs RBAC on the cell
#                       namespace; SKIPPED cleanly when forbidden)
#   4. quota-402      — authenticated page-create loop on a CAPPED tenant
#                       until the frozen 402 body appears (needs
#                       SEAM2_COOKIE_JAR + a tenant whose page cap is already
#                       reached or reachable within SEAM2_MAX_WRITES)
#
# Usage:
#   scripts/verify/seam2-quota-402.sh                        # legs 1-3
#   SEAM2_COOKIE_JAR=cookies.txt SEAM2_SPACE_ID=<uuid> \
#     scripts/verify/seam2-quota-402.sh                      # + leg 4
#
# Env:
#   SEAM2_BASE_URL    engine base (default https://dev-docmost.eu-central-1.myidp.cloud)
#   SEAM2_NAMESPACE   cell namespace for the pod-env leg (default docmost-dev)
#   SEAM2_COOKIE_JAR  curl cookie jar with an authed session on the capped tenant
#   SEAM2_SPACE_ID    spaceId for the page-create probe
#   SEAM2_MAX_WRITES  page-create attempts before giving up (default 25)
#
# Output: human log on stdout; tee it into the dated evidence file, e.g.
#   scripts/verify/seam2-quota-402.sh | tee \
#     _bmad-output/planning-artifacts/delivery-program-2026-07-13/rebaseline/seam2-rerun-$(date +%F).md
set -u

BASE="${SEAM2_BASE_URL:-https://dev-docmost.eu-central-1.myidp.cloud}"
NS="${SEAM2_NAMESPACE:-docmost-dev}"
JAR="${SEAM2_COOKIE_JAR:-}"
SPACE="${SEAM2_SPACE_ID:-}"
MAX_WRITES="${SEAM2_MAX_WRITES:-25}"
FAILED=0

say() { printf '%s\n' "$*"; }
leg() { printf '\n### LEG %s\n' "$*"; }

say "# Seam 2 re-run — quota 402 chokepoint (ENG-2053)"
say "date: $(date -u +%FT%TZ)   target: $BASE"

# ---- 1. health --------------------------------------------------------------
leg "1 — engine health"
HEALTH=$(curl -sS -m 15 "$BASE/api/health" || true)
say "GET /api/health -> $HEALTH"
if grep -q '"status":"ok"' <<<"$HEALTH"; then say "LEG1: PASS"; else say "LEG1: FAIL"; FAILED=1; fi

# ---- 2. modules-live --------------------------------------------------------
leg "2 — orvex module tree mounted (ORVEX_MODULES_ENABLED live)"
DESC=$(mktemp)
if curl -sS -m 60 "$BASE/api/version/orvex/api" -o "$DESC"; then
  ORVEX_ROUTES=$(python3 - "$DESC" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
print('\n'.join(sorted(p for p in d['paths'] if p.startswith('/api/orvex/'))))
PY
)
  N=$(grep -c . <<<"$ORVEX_ROUTES" || true)
  say "live /api/orvex/* routes: $N"
  sed 's/^/  /' <<<"$ORVEX_ROUTES"
  VERSION=$(curl -sS -m 15 "$BASE/api/version/orvex" || true)
  say "deployed build: $VERSION"
  if [ "${N:-0}" -ge 5 ]; then say "LEG2: PASS"; else say "LEG2: FAIL (module tree absent => flag not effective)"; FAILED=1; fi
else
  say "LEG2: FAIL (descriptor unreachable)"; FAILED=1
fi
rm -f "$DESC"

# ---- 3. pod-env -------------------------------------------------------------
leg "3 — pod env carries the two DEFECT-1 keys (namespace $NS)"
if kubectl auth can-i create pods/exec -n "$NS" >/dev/null 2>&1 && \
   [ "$(kubectl auth can-i create pods/exec -n "$NS" 2>/dev/null)" = "yes" ]; then
  POD=$(kubectl get pods -n "$NS" -o name 2>/dev/null | grep -m1 docmost || true)
  if [ -n "$POD" ]; then
    ENVOUT=$(kubectl exec -n "$NS" "${POD#pod/}" -- env 2>/dev/null | grep -Ei 'ORVEX_MODULES_ENABLED|ORVEX_BILLING_API_URL' || true)
    say "$ENVOUT"
    if grep -q 'ORVEX_MODULES_ENABLED=true' <<<"$ENVOUT" && grep -q 'ORVEX_BILLING_API_URL=' <<<"$ENVOUT"; then
      say "LEG3: PASS"
    else
      say "LEG3: FAIL (keys missing on the running pod)"; FAILED=1
    fi
  else
    say "LEG3: SKIPPED (no docmost pod visible in $NS)"
  fi
else
  say "LEG3: SKIPPED (no pods/exec RBAC in $NS for this identity — run as an operator with cell access)"
fi

# ---- 4. quota-402 -----------------------------------------------------------
leg "4 — authenticated over-cap write returns the frozen 402 body"
if [ -z "$JAR" ] || [ -z "$SPACE" ]; then
  say "LEG4: SKIPPED (set SEAM2_COOKIE_JAR + SEAM2_SPACE_ID for a CAPPED tenant to run the live 402 probe)"
else
  GOT402=""
  for i in $(seq 1 "$MAX_WRITES"); do
    RESP=$(curl -sS -m 20 -b "$JAR" -w '\n%{http_code}' -X POST "$BASE/api/pages/create" \
      -H 'Content-Type: application/json' \
      -d "{\"spaceId\":\"$SPACE\",\"title\":\"seam2-probe-$i\"}" || true)
    CODE=${RESP##*$'\n'}
    BODY=${RESP%$'\n'*}
    if [ "$CODE" = "402" ]; then
      say "write #$i -> 402: $BODY"
      if grep -q 'QUOTA_EXCEEDED' <<<"$BODY" && grep -q '"resource"' <<<"$BODY" && grep -q '"limit"' <<<"$BODY"; then
        say "LEG4: PASS (frozen contract verbatim)"
      else
        say "LEG4: FAIL (402 but body deviates from the frozen contract)"; FAILED=1
      fi
      GOT402=1; break
    fi
    say "write #$i -> $CODE"
  done
  if [ -z "$GOT402" ]; then
    say "LEG4: FAIL (no 402 within $MAX_WRITES writes — cap not enforced or tenant not capped)"; FAILED=1
  fi
fi

say ""
if [ "$FAILED" = 0 ]; then say "== SEAM 2 RE-RUN: no failing leg =="; else say "== SEAM 2 RE-RUN: FAILING LEG(S) PRESENT =="; fi
exit "$FAILED"
