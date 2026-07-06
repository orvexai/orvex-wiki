# reference-mock — the mock/reference-data quarantine zone (Foundation M1)

This directory is the **only** sanctioned home for mock datasets, design-time
sample payloads, and reference fixtures that exist for design/reference
purposes. It lives **outside every build root** (no Vite root, no tsconfig
include, no Dockerfile COPY reaches it) and is **never imported by
delivery-path code**.

- The import fence is lint-enforced: the repo-root `eslint.config.mjs` bans any
  `design-artifacts/**` import from `apps/**` and `packages/**`
  (`pnpm lint:boundary`, wired into CI at M4).
- The delivery path renders **honest empty states** where data is not yet real
  (CS §11 ALL-REAL: no fabricated data shown as product; no-op ≠ mock).
- Test fixtures are NOT this directory's concern: tests replay **committed real
  responses** at true-external boundaries (CS §5) and live next to their tests.

Status note (2026-07-06, Foundation M1): the delivery path was audited and
carries **zero** mock datasets — this zone starts empty and exists so the fence
and the convention are in place before any reference data ever lands.
