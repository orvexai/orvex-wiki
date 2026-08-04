#!/usr/bin/env bash
# DoD suite for the osv exception ledger (ENG-3274).
#
# Drives scripts/ci/osv-gate.py — the threshold + exception half of
# scripts/ci/audit-osv.sh — with SYNTHETIC osv-scanner reports and SYNTHETIC
# osv-scanner.toml ledgers. Hermetic: no network, no scanner, no lockfile.
#
# What it is here to prove: the exception mechanism cannot be turned into a
# fail-open switch. An exception only holds while it names an owning ticket,
# carries a future expiry inside the allowed window, and still matches a
# reported advisory. Every other shape reds the gate.
#
# Usage: scripts/test/audit-osv-exceptions.spec.sh
# Exit 0 = every case behaved as specified.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="${REPO_ROOT}/scripts/ci/osv-gate.py"
MAX_DAYS=120

WORKDIR="$(mktemp -d -t osv-gate-spec.XXXXXX)"
trap 'rm -rf "${WORKDIR}"' EXIT

fail=0
cases=0

SOON="$(date -u -d '+30 days' +%F)"
YESTERDAY="$(date -u -d '-1 day' +%F)"
TOO_FAR="$(date -u -d "+$((MAX_DAYS + 10)) days" +%F)"

# report <severity>:<id>:<pkg>:<version> ... -> writes an osv-scanner-shaped JSON
write_report() {
  local out="$1"; shift
  local pkgs=""
  for spec in "$@"; do
    IFS=':' read -r sev vid name ver <<<"$spec"
    [[ -n "$pkgs" ]] && pkgs+=","
    pkgs+="{\"package\":{\"name\":\"${name}\",\"version\":\"${ver}\",\"ecosystem\":\"npm\"},"
    pkgs+="\"vulnerabilities\":[{\"id\":\"${vid}\",\"database_specific\":{\"severity\":\"${sev}\"}}]}"
  done
  printf '{"results":[{"packages":[%s]}]}\n' "$pkgs" >"$out"
}

# expect <name> <expected-exit> <expected-substring> <report-file> <ledger-file|-->
expect() {
  local name="$1" want_exit="$2" want_text="$3" report="$4" ledger="$5"
  cases=$((cases + 1))
  local out status
  out="$(python3 "$GATE" "$report" "$ledger" "$MAX_DAYS" 2>&1)"
  status=$?
  if [[ "$status" != "$want_exit" ]]; then
    echo "FAIL [$name]: exit $status, expected $want_exit" >&2
    printf '    %s\n' "${out//$'\n'/$'\n'    }" >&2
    fail=1
    return
  fi
  if ! grep -qF -- "$want_text" <<<"$out"; then
    echo "FAIL [$name]: output does not contain '$want_text'" >&2
    printf '    %s\n' "${out//$'\n'/$'\n'    }" >&2
    fail=1
    return
  fi
  echo "ok   [$name]"
}

MISSING_LEDGER="${WORKDIR}/no-such-ledger.toml"

# --- AC1: a clean tree passes, with or without a ledger file -----------------
printf '{"results":[]}\n' >"${WORKDIR}/clean.json"
expect "clean tree, no ledger file" 0 "no known vulnerabilities" \
  "${WORKDIR}/clean.json" "$MISSING_LEDGER"

# --- AC2: sub-threshold findings still pass, and are still printed ----------
write_report "${WORKDIR}/moderate.json" "MODERATE:GHSA-mod-0001:qs:6.14.2"
expect "MODERATE only passes" 0 "SECURITY PASSED" \
  "${WORKDIR}/moderate.json" "$MISSING_LEDGER"
expect "MODERATE only is printed" 0 "qs@6.14.2" \
  "${WORKDIR}/moderate.json" "$MISSING_LEDGER"

# --- AC3: an un-excepted HIGH reds the gate ---------------------------------
write_report "${WORKDIR}/high.json" "HIGH:GHSA-high-0001:left-pad:1.0.0"
expect "un-excepted HIGH reds" 1 "un-excepted HIGH/CRITICAL" \
  "${WORKDIR}/high.json" "$MISSING_LEDGER"
write_report "${WORKDIR}/critical.json" "CRITICAL:GHSA-crit-0001:left-pad:1.0.0"
expect "un-excepted CRITICAL reds" 1 "un-excepted HIGH/CRITICAL" \
  "${WORKDIR}/critical.json" "$MISSING_LEDGER"

# --- AC4: a well-formed, live exception carries the HIGH --------------------
cat >"${WORKDIR}/good.toml" <<EOF
[[IgnoredVulns]]
id = "GHSA-high-0001"
ignoreUntil = ${SOON}
reason = "ENG-3274. Upstream backported the fix; the GHSA range was never split."
EOF
expect "valid exception carries the HIGH" 0 "SECURITY PASSED" \
  "${WORKDIR}/high.json" "${WORKDIR}/good.toml"
expect "excepted finding is still printed" 0 "EXCEPTED until ${SOON}" \
  "${WORKDIR}/high.json" "${WORKDIR}/good.toml"
expect "the reason is echoed into the log" 0 "ENG-3274" \
  "${WORKDIR}/high.json" "${WORKDIR}/good.toml"

# --- AC5: an expired exception reds — the expiry is real -------------------
cat >"${WORKDIR}/expired.toml" <<EOF
[[IgnoredVulns]]
id = "GHSA-high-0001"
ignoreUntil = ${YESTERDAY}
reason = "ENG-3274. Stale window."
EOF
expect "expired exception reds" 1 "has PASSED" \
  "${WORKDIR}/high.json" "${WORKDIR}/expired.toml"

# --- AC6: an over-long window reds — no parking spaces --------------------
cat >"${WORKDIR}/toofar.toml" <<EOF
[[IgnoredVulns]]
id = "GHSA-high-0001"
ignoreUntil = ${TOO_FAR}
reason = "ENG-3274. Parked indefinitely."
EOF
expect "over-long window reds" 1 "max ${MAX_DAYS}" \
  "${WORKDIR}/high.json" "${WORKDIR}/toofar.toml"

# --- AC7: an unowned or undated exception reds ----------------------------
cat >"${WORKDIR}/noticket.toml" <<EOF
[[IgnoredVulns]]
id = "GHSA-high-0001"
ignoreUntil = ${SOON}
reason = "not reachable in our app"
EOF
expect "reason without an ENG ticket reds" 1 "names no ENG ticket" \
  "${WORKDIR}/high.json" "${WORKDIR}/noticket.toml"

cat >"${WORKDIR}/nodate.toml" <<EOF
[[IgnoredVulns]]
id = "GHSA-high-0001"
reason = "ENG-3274. No expiry at all."
EOF
expect "exception without ignoreUntil reds" 1 "no \`ignoreUntil\`" \
  "${WORKDIR}/high.json" "${WORKDIR}/nodate.toml"

cat >"${WORKDIR}/noreason.toml" <<EOF
[[IgnoredVulns]]
id = "GHSA-high-0001"
ignoreUntil = ${SOON}
EOF
expect "exception without a reason reds" 1 "no \`reason\`" \
  "${WORKDIR}/high.json" "${WORKDIR}/noreason.toml"

cat >"${WORKDIR}/noid.toml" <<EOF
[[IgnoredVulns]]
ignoreUntil = ${SOON}
reason = "ENG-3274. No id."
EOF
expect "exception without an id reds" 1 "no \`id\`" \
  "${WORKDIR}/high.json" "${WORKDIR}/noid.toml"

cat >"${WORKDIR}/stringdate.toml" <<EOF
[[IgnoredVulns]]
id = "GHSA-high-0001"
ignoreUntil = "someday"
reason = "ENG-3274. Not a date."
EOF
expect "non-date ignoreUntil reds" 1 "must be a TOML date" \
  "${WORKDIR}/high.json" "${WORKDIR}/stringdate.toml"

# --- AC8: the ratchet — a stale exception must be deleted, not parked -----
expect "exception for an unreported advisory reds" 1 "STALE" \
  "${WORKDIR}/moderate.json" "${WORKDIR}/good.toml"

# --- AC9: a broken ledger is a hard error, never a silent green -----------
printf '[[IgnoredVulns\nid = broken\n' >"${WORKDIR}/broken.toml"
expect "malformed TOML reds" 1 "not valid TOML" \
  "${WORKDIR}/high.json" "${WORKDIR}/broken.toml"

# --- AC10: one excepted HIGH does not cover a second, different HIGH ------
write_report "${WORKDIR}/twohigh.json" \
  "HIGH:GHSA-high-0001:left-pad:1.0.0" "HIGH:GHSA-high-0002:right-pad:2.0.0"
expect "a second un-excepted HIGH still reds" 1 "un-excepted HIGH/CRITICAL" \
  "${WORKDIR}/twohigh.json" "${WORKDIR}/good.toml"

# --- AC11: the committed ledger itself is in good standing ----------------
# Not a fixture: the REAL osv-scanner.toml, validated against a report that
# contains exactly the advisories it excepts. Catches an entry that rots
# (expired / over-long / unowned) without waiting for the nightly scan.
COMMITTED="${REPO_ROOT}/osv-scanner.toml"
if [[ -f "$COMMITTED" ]]; then
  mapfile -t committed_ids < <(grep -oE '^id = "[^"]+"' "$COMMITTED" | sed 's/^id = "//; s/"$//')
  if [[ ${#committed_ids[@]} -gt 0 ]]; then
    specs=()
    for vid in "${committed_ids[@]}"; do
      specs+=("HIGH:${vid}:excepted-pkg:0.0.0")
    done
    write_report "${WORKDIR}/committed.json" "${specs[@]}"
    expect "the committed osv-scanner.toml is in good standing" 0 "SECURITY PASSED" \
      "${WORKDIR}/committed.json" "$COMMITTED"
  else
    echo "ok   [committed osv-scanner.toml has no exceptions — nothing to validate]"
    cases=$((cases + 1))
  fi
else
  echo "ok   [no committed osv-scanner.toml — no exceptions in force]"
  cases=$((cases + 1))
fi

echo
if [[ $fail -ne 0 ]]; then
  echo "FAIL: osv exception-ledger spec — see above (${cases} case(s) run)." >&2
  exit 1
fi
echo "OK: osv exception-ledger spec — ${cases}/${cases} cases behaved as specified."
