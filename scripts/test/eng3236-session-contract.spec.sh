#!/usr/bin/env bash
# ENG-3236 — contract assertions for the ADR-0049 session exchange seam.
#
# This is intentionally dependency-light and reads the authored OpenAPI source
# of truth directly. It protects the dual-accept documentation from drifting
# back to an introspection-only contract or accidentally turning the optional
# assertion into operation-level security.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SPEC="${REPO_ROOT}/contracts/openapi.yaml"

python3 - "${SPEC}" <<'PY'
import sys

try:
    import yaml
except ImportError as exc:
    raise SystemExit(f"PyYAML is required for ENG-3236 contract checks: {exc}")

spec = yaml.safe_load(open(sys.argv[1])) or {}
operation = (
    spec["paths"]["/api/orvex/session/exchange"]["post"]
)
assert operation["operationId"] == "orvexSessionExchange"
assert operation["x-status"] == "pinned"
assert operation["security"] == [], "session exchange must remain public while minting"

assert len(operation["parameters"]) == 1
assertion = operation["parameters"][0]
assert assertion["name"] == "X-Orvex-Assertion"
assert assertion["in"] == "header"
assert assertion["required"] is False
assert assertion["schema"] == {"type": "string"}

request = spec["components"]["schemas"]["SessionExchangeRequest"]
assert "required" not in request, "exchangeToken must stay optional for assertion callers"
assert request["additionalProperties"] is False

description = operation["description"]
assert "dual-accept" in description
assert "assertion wins" in description
assert "introspection leg is not consulted" in description
assert "401" in request["description"]

print("ENG-3236 session-exchange contract: OK")
PY
