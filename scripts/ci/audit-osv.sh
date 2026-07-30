#!/usr/bin/env bash
# Supply-chain vulnerability audit of the pnpm-resolved dependency tree.
#
# WHY NOT `pnpm audit`: pnpm's `audit` command POSTs to npm's
# https://registry.npmjs.org/-/npm/v1/security/audits endpoint, which npm has
# RETIRED — it now answers HTTP 410 Gone: "This endpoint is being retired. Use
# the bulk advisory endpoint instead." Because the retirement is npm-registry
# side (not a pnpm-version bug), EVERY pnpm version that calls that endpoint is
# broken the same way — there is no working-pnpm-version to pin to. Bypassing
# the gate (`pnpm audit ... || true`) is not an option: that would silently
# hide real vulnerabilities. So we scan the SAME resolved dependency tree with
# osv-scanner (OSV.dev), the actively-maintained scanner that reads
# pnpm-lock.yaml natively — the npm-ecosystem sibling of the govulncheck (Go)
# scan already run in this same CI job.
#
# THRESHOLD: this reproduces the prior `pnpm audit --audit-level=high`
# semantics exactly — the gate FAILS only on HIGH or CRITICAL advisories
# (GHSA severity buckets, the same buckets npm's `--audit-level` compares).
# MODERATE / LOW advisories are printed but do NOT fail the build, as before.
# Nothing is suppressed: every finding, all severities, is listed in the log.
#
# EXCEPTIONS (osv-scanner.toml): a HIGH/CRITICAL advisory may fail to red this
# gate ONLY through the committed, dated, expiring ledger at the repo root —
# osv-scanner's own documented `[[IgnoredVulns]]` format. That is not a
# fail-open switch, and it is enforced as such below: the gate re-derives the
# COMPLETE finding list (see the temp-dir note at the scan step), prints every
# finding INCLUDING the excepted ones, and FAILS when
#   * an entry is missing `id`, `reason` or `ignoreUntil`,
#   * `reason` names no ENG ticket (an exception with no owner is not an
#     exception, it is a hole),
#   * `ignoreUntil` has passed, or sits further out than MAX_EXCEPTION_DAYS,
#   * an excepted advisory is no longer reported at all — a STALE exception must
#     be DELETED, never parked (the ratchet: the ledger may only shrink).
# The one legitimate case is documented in osv-scanner.toml itself.
#
# Usage: scripts/ci/audit-osv.sh [path-to-pnpm-lock.yaml]
#
# Exit codes: 0 clean, 1 blocking finding / bad-or-stale exception,
#             2 INFRA-ERROR (toolchain missing — never conflated with a finding).
set -euo pipefail

LOCKFILE="${1:-pnpm-lock.yaml}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXCEPTIONS_FILE="${REPO_ROOT}/osv-scanner.toml"
# The longest window any single exception may be granted, counted from today.
# Keeps a "temporary" exception from quietly becoming permanent.
MAX_EXCEPTION_DAYS=120

WORKDIR="$(mktemp -d -t osv-audit.XXXXXX)"
trap 'rm -rf "${WORKDIR}"' EXIT
REPORT="${WORKDIR}/osv-report.json"

# Pinned for CI reproducibility (and a stable JSON schema for the gate below).
OSV_SCANNER_VERSION="v2.4.0"

GOBIN_DIR="$(go env GOPATH)/bin"
export PATH="${GOBIN_DIR}:${PATH}"
if ! command -v osv-scanner >/dev/null 2>&1; then
  go install "github.com/google/osv-scanner/v2/cmd/osv-scanner@${OSV_SCANNER_VERSION}"
fi
if ! command -v osv-scanner >/dev/null 2>&1; then
  echo "INFRA-ERROR: osv-scanner ${OSV_SCANNER_VERSION} could not be installed." >&2
  exit 2
fi
if ! python3 -c 'import tomllib' >/dev/null 2>&1; then
  echo "INFRA-ERROR: python3 lacks tomllib (needs >= 3.11) — the exception" >&2
  echo "ledger cannot be validated, and this gate will not run unvalidated." >&2
  exit 2
fi

# The scan runs against a COPY of the lockfile in a scratch directory ON PURPOSE:
# osv-scanner auto-discovers an osv-scanner.toml sitting beside the scanned file
# and drops the matching findings from its report entirely. That would hide the
# excepted advisories from this log AND blind the stale-exception ratchet below.
# Scanning the copy keeps the report COMPLETE; the exceptions are then applied by
# this gate, from the same committed file, with every entry printed.
cp "${LOCKFILE}" "${WORKDIR}/pnpm-lock.yaml"

# osv-scanner exits non-zero when it finds ANY vulnerability (any severity). We
# capture the full JSON report and apply our own HIGH+ threshold below, so the
# scanner's own exit code must not abort the script here.
set +e
osv-scanner scan --lockfile="${WORKDIR}/pnpm-lock.yaml" --format=json --output-file="${REPORT}"
set -e

# The threshold + exception-ledger gate lives in its own file so it can be
# driven by fixtures (scripts/test/audit-osv-exceptions.spec.sh) without a
# network scan.
python3 "${REPO_ROOT}/scripts/ci/osv-gate.py" \
  "${REPORT}" "${EXCEPTIONS_FILE}" "${MAX_EXCEPTION_DAYS}"
