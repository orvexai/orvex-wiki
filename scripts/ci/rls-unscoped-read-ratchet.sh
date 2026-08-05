#!/usr/bin/env bash
# rls-unscoped-read-ratchet.sh — ENG-3569. A mechanical fence on the
# READ-path half of the ENG-2502 RLS wiring.
#
# ## The invariant this protects
#
# `set_config('app.workspace_id', $1, true)` is TRANSACTION-LOCAL by
# construction (`apps/server/src/database/rls/rls-guc-hook.ts`). The engine
# sets it at exactly one site — `executeTx` (`database/utils.ts`), which
# reads the ambient tenant scope established by `DomainMiddleware`.
#
# `dbOrTx(db, existingTrx)` hands back the RAW `db` handle whenever no
# transaction is passed. A statement issued on that handle opens no
# transaction, so the GUC is unset and the fail-closed
# `orvex_rls_tenant_isolation_*` policies deny it — including to the row's
# own owner. Under the production RLS posture (owner NOSUPERUSER,
# NOBYPASSRLS, FORCE) that is a fail-closed OUTAGE wearing the shape of
# isolation: `POST /api/pages/info` 404s its own page, `GET /v1/spaces`
# answers a silent `{"items":[]}`.
#
# Proven end to end in
# `apps/server/src/database/rls-request-tier.integration.spec.ts`: over a
# real socket, against a real Postgres with FORCE RLS and a NOBYPASSRLS
# role, tenant A reads its own page through `executeTx` and gets its row;
# the same row through the plain `db` handle returns zero rows.
#
# ## Why a ratchet and not a ban
#
# There are ~156 such sites today. Banning outright would freeze the repo;
# migrating all of them in one change is exactly the "sprinkle transactions
# at call sites" move that produces an unreviewable diff and no chokepoint.
# So this fence does the one thing that actually matters while the real fix
# lands: it makes the number a ONE-WAY function. A new unscoped data-access
# site cannot be added silently.
#
# Same shape and precedent as `lint-boundary-ratchet.sh` (PO-2026-07-29-5).
#
# ## Retirement DoD (do not delete this quietly)
#
# This script is retired by driving the count to zero — i.e. the read path
# gains its own scoped chokepoint, the equivalent of `executeTx` for
# non-transactional reads, and the 156 sites adopt it. Deleting this script
# without that adoption re-opens the hole it fences. That work is ENG-3569.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BASELINE_FILE="scripts/ci/rls-unscoped-read-ratchet-baseline.count"
SRC_ROOT="apps/server/src"

if [ ! -f "$BASELINE_FILE" ]; then
  echo "rls-unscoped-read-ratchet: missing baseline file ${BASELINE_FILE}" >&2
  exit 1
fi

BASELINE="$(tr -d '[:space:]' < "$BASELINE_FILE")"

# The counted population: every `dbOrTx(` CALL SITE in engine source.
# Excluded, deliberately and narrowly:
#   - `database/utils.ts`  — the definition itself, not a call site.
#   - `*.spec.ts`          — tests may exercise the unscoped handle on
#                            purpose (that is how the defect is pinned).
list_sites() {
  grep -rn 'dbOrTx(' --include='*.ts' "$SRC_ROOT" \
    | grep -v '\.spec\.ts:' \
    | grep -v "^${SRC_ROOT}/database/utils\.ts:" \
    || true
}

CURRENT="$(list_sites | wc -l | tr -d '[:space:]')"

echo "rls-unscoped-read-ratchet: unscoped data-access sites — current=${CURRENT} baseline=${BASELINE}"

if [ "$CURRENT" -gt "$BASELINE" ]; then
  echo >&2
  echo "FAIL: the unscoped read surface GREW by $((CURRENT - BASELINE)) site(s)." >&2
  echo >&2
  echo "A \`dbOrTx(db, undefined)\` statement opens no transaction, so" >&2
  echo "\`app.workspace_id\` is never set and FORCE RLS denies the row to its" >&2
  echo "own owner. Route the new read through a tenant-scoped transaction" >&2
  echo "(\`executeTx\`) instead, or pass an existing scoped \`trx\`." >&2
  echo >&2
  echo "Do NOT raise the baseline to make this pass — the baseline is a" >&2
  echo "one-way ratchet (ENG-3569)." >&2
  echo >&2
  echo "Current sites:" >&2
  list_sites >&2
  exit 1
fi

if [ "$CURRENT" -lt "$BASELINE" ]; then
  echo
  echo "The unscoped read surface SHRANK by $((BASELINE - CURRENT)) site(s) — thank you."
  echo "Lower the ratchet so the gain is locked in:"
  echo "  echo ${CURRENT} > ${BASELINE_FILE}"
  echo
  echo "FAIL: baseline is stale (it must never sit above the true count)." >&2
  exit 1
fi

echo "rls-unscoped-read-ratchet: OK — no new unscoped data-access sites."
