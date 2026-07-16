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
# Usage: scripts/ci/audit-osv.sh [path-to-pnpm-lock.yaml]
set -euo pipefail

LOCKFILE="${1:-pnpm-lock.yaml}"
REPORT="$(mktemp -t osv-report.XXXXXX.json)"
# Pinned for CI reproducibility (and a stable JSON schema for the gate below).
OSV_SCANNER_VERSION="v2.4.0"

GOBIN_DIR="$(go env GOPATH)/bin"
export PATH="${GOBIN_DIR}:${PATH}"
if ! command -v osv-scanner >/dev/null 2>&1; then
  go install "github.com/google/osv-scanner/v2/cmd/osv-scanner@${OSV_SCANNER_VERSION}"
fi

# osv-scanner exits non-zero when it finds ANY vulnerability (any severity). We
# capture the full JSON report and apply our own HIGH+ threshold below, so the
# scanner's own exit code must not abort the script here.
set +e
osv-scanner scan --lockfile="${LOCKFILE}" --format=json --output-file="${REPORT}"
set -e

python3 - "${REPORT}" <<'PYEOF'
import json, sys

report = json.load(open(sys.argv[1]))
BLOCKING = {"HIGH", "CRITICAL"}

findings = []
for res in report.get("results", []):
    for pkg in res.get("packages", []):
        meta = pkg.get("package", {})
        name, ver = meta.get("name"), meta.get("version")
        for v in pkg.get("vulnerabilities", []):
            sev = (v.get("database_specific") or {}).get("severity", "UNKNOWN").upper()
            findings.append((sev, v.get("id"), name, ver))

if not findings:
    print("osv-scanner: no known vulnerabilities in the pnpm-resolved tree.")
    sys.exit(0)

rank = {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4}
findings.sort(key=lambda f: (rank.get(f[0], 5), f[2] or ""))

print("osv-scanner findings (pnpm-lock.yaml):")
for sev, vid, name, ver in findings:
    print(f"  [{sev:8}] {name}@{ver}  {vid}  https://osv.dev/{vid}")

blocking = [f for f in findings if f[0] in BLOCKING]
if blocking:
    print(f"\nSECURITY FAILED: {len(blocking)} HIGH/CRITICAL advisory(ies) "
          f"in the pnpm dependency tree (gate threshold = high). See above.")
    sys.exit(1)

print(f"\nSECURITY PASSED: {len(findings)} advisory(ies) found, none HIGH/CRITICAL "
      f"(gate threshold = high, matching the prior `pnpm audit --audit-level=high`).")
PYEOF
