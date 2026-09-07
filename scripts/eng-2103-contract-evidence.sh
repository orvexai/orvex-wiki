#!/usr/bin/env bash
set -euo pipefail

# Read-only external evidence check for ENG-2103 AC3/AC4/AC12. This script does
# not create a tag, generate code, or modify the contracts checkout. A tag name
# supplied by an environment variable is only an input selector; its contents
# must still prove the frozen engine surface and generated TS client.

CONTRACTS_ROOT="${ORVEX_CONTRACTS_ROOT:-/home/yafet/repos/orvex-studio/orvex-studio-contracts}"
TAG="${ORVEX_CONTRACT_TAG:-}"

fail=0
fail_with() {
  echo "BLOCKED: $*" >&2
  fail=1
}

if ! git -C "$CONTRACTS_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  fail_with "contracts checkout is unavailable: $CONTRACTS_ROOT"
fi

if [[ -z "$TAG" ]]; then
  fail_with "ORVEX_CONTRACT_TAG is unset; an untagged contract blocks dispatch"
else
  if ! git -C "$CONTRACTS_ROOT" rev-parse --verify "$TAG^{commit}" >/dev/null 2>&1; then
    fail_with "contract tag does not resolve to a commit: $TAG"
  fi
fi

if (( fail )); then
  exit 1
fi

TAGGED_SPEC="$(git -C "$CONTRACTS_ROOT" show "$TAG:openapi/engine-orvex.yaml" 2>/dev/null || true)"
if [[ -z "$TAGGED_SPEC" ]]; then
  fail_with "tag $TAG has no openapi/engine-orvex.yaml"
else
  if ! python3 - "$TAGGED_SPEC" <<'PY'
import sys

try:
    import yaml
except ImportError as exc:
    raise SystemExit(f"PyYAML is required for contract evidence: {exc}")

spec = yaml.safe_load(sys.argv[1]) or {}
paths = spec.get("paths") or {}
expected = {
    "orvexApplyOps": "real",
    "orvexGetQuota": "real",
    "orvexSessionExchange": "real",
    "orvexSourceOffer": "real",
    "orvexTenantMoveQuiesce": "noop-501",
    "orvexTenantMoveExport": "noop-501",
    "orvexTenantMoveImport": "noop-501",
    "orvexTenantMoveActivate": "noop-501",
}
actual = {}
for item in paths.values():
    if not isinstance(item, dict):
        continue
    for operation in item.values():
        if not isinstance(operation, dict):
            continue
        operation_id = operation.get("operationId")
        if operation_id in expected:
            actual[operation_id] = operation.get("x-classification")

missing = sorted(set(expected) - set(actual))
wrong = sorted(
    f"{operation_id}={actual[operation_id]!r} (expected {expected[operation_id]!r})"
    for operation_id in expected
    if operation_id in actual and actual[operation_id] != expected[operation_id]
)
if missing or wrong:
    if missing:
        print("missing operations: " + ", ".join(missing), file=sys.stderr)
    if wrong:
        print("classification drift: " + ", ".join(wrong), file=sys.stderr)
    raise SystemExit(1)
PY
  then
    fail_with "tagged engine contract does not match the ENG-2103 frozen eight-operation surface"
  else
    echo "PASS: tag $TAG contains the frozen eight-operation engine surface"
  fi
fi

MANIFEST="$(git -C "$CONTRACTS_ROOT" show "$TAG:codegen.manifest.yaml" 2>/dev/null || true)"
if [[ -z "$MANIFEST" ]]; then
  fail_with "tag $TAG has no codegen.manifest.yaml"
else
  # The TS lane must explicitly own this source. A Go-only register entry is
  # the exact AC4 gap this check is intended to keep visible.
  if ! awk '
    /TypeScript \(ADR-0035/ { ts=1 }
    /Go \(ADR-0035/ { ts=0 }
    ts && /engine-orvex\.yaml/ { found=1 }
    END { exit(found ? 0 : 1) }
  ' <<<"$MANIFEST"; then
    fail_with "tagged codegen manifest registers engine-orvex.yaml outside the TS lane"
  else
    echo "PASS: tag $TAG registers engine-orvex.yaml in the TS codegen lane"
  fi
fi

TS_ENGINE_PATH=""
while IFS= read -r path; do
  [[ "$path" == *.ts || "$path" == *.d.ts ]] || continue
  case "$path" in
    packages/*|gen/ts/*|clients/*|sdk/*) ;;
    *) continue ;;
  esac
  if git -C "$CONTRACTS_ROOT" show "$TAG:$path" 2>/dev/null | grep -qE 'orvexApplyOps|orvexGetQuota|orvexSessionExchange'; then
    TS_ENGINE_PATH="$path"
    break
  fi
done < <(git -C "$CONTRACTS_ROOT" ls-tree -r --name-only "$TAG" 2>/dev/null || true)

if [[ -z "$TS_ENGINE_PATH" ]]; then
  fail_with "tag $TAG has no generated TypeScript file carrying the engine operation surface"
else
  echo "PASS: tagged generated TypeScript engine surface: $TS_ENGINE_PATH"
fi

FIXTURE_PATH=""
while IFS= read -r path; do
  case "$path" in
    openapi/*) continue ;;
    *fixture*|*golden*)
      [[ "$path" == *engine* || "$path" == *orvex* ]] || continue
      if git -C "$CONTRACTS_ROOT" show "$TAG:$path" 2>/dev/null | grep -q 'orvexApplyOps'; then
        FIXTURE_PATH="$path"
        break
      fi
      ;;
  esac
done < <(git -C "$CONTRACTS_ROOT" ls-tree -r --name-only "$TAG" 2>/dev/null || true)

if [[ -z "$FIXTURE_PATH" ]]; then
  fail_with "tag $TAG has no engine golden fixture containing orvexApplyOps"
else
  echo "PASS: tagged engine golden fixture: $FIXTURE_PATH"
fi

if (( fail )); then
  exit 1
fi

echo "eng-2103-contract-evidence: PASS"
