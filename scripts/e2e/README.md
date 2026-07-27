# Live E2E suites

Functional tests that drive the **running application** over HTTP against real
Postgres / Redis / MinIO — not mocks, not testcontainers-per-spec. They exist
because the unit and integration suites were all green while a real deployment
defect was live (see "What these caught" below).

## Running them

```bash
# 1. infra
scripts/dev-secrets.sh                     # writes .env.dev (gitignored)
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d

# 2. build + boot (PORT/APP_URL default to 3777 to avoid colliding with a dev server)
pnpm nx run server:build
scripts/e2e/boot-local.sh vanilla &        # upstream-parity mode
#   ...or...
scripts/e2e/boot-local.sh orvex   &        # ORVEX_MODULES_ENABLED=true

# 3. the suites
scripts/e2e/core-flows.sh                  # vanilla mode (needs native login)
scripts/e2e/page-permissions.sh            # vanilla mode
scripts/e2e/orvex-surface.sh               # orvex mode
```

First run needs a workspace:

```bash
curl -X POST http://localhost:3777/api/auth/setup -H 'Content-Type: application/json' \
  -d '{"workspaceName":"E2E","name":"Tester","email":"tester@e2e.local","password":"SuperSecret123!"}'
```

`core-flows.sh` and `page-permissions.sh` need **vanilla** mode: under
`ORVEX_MODULES_ENABLED=true` the native-login guard (ENG-2499) fail-closes by
design, so there is no password path to authenticate with.

The auth throttler is 10 attempts / 60s (`AUTH_THROTTLER`) and is Redis-backed,
so repeated runs can 429. Wait out the window or clear the `throttle:*` keys.

## What these caught

`fix(health): per-role probes were unreachable — SPA swallowed /health/orvex/*`

`ORVEX_GLOBAL_PREFIX_EXCLUDE` defaulted to `['health/orvex']`, which excludes
only the exact aggregate route from the `/api` prefix. The per-role sub-probes
(`/health/orvex/collab`, ENG-2510; `/health/orvex/relay`, ENG-2496) stayed
inside the prefix, matched no controller, and fell through to the SPA
catch-all — a live GET returned `index.html`. The collab kubelet probe in
`deploy/kustomize/app-manifests/deployment.yaml` could never have fired, so a
dead collab listener would have read green forever.

Every unit and integration spec was green throughout: they assert the exclusion
list's *contents*, never that a real HTTP request reaches the controller.

## Writing new checks

- **Assert on content, not status.** The SPA is a catch-all: any unknown
  non-`/api` path returns 200 with `index.html`. `orvex-surface.sh` compares
  against a known-nonexistent control path for exactly this reason — an early
  version of it reported false "docs exposure" failures on `/docs` and
  `/swagger` before that was corrected.
- Prefer probing observable side effects (a row in `orvex_event_outbox`, a
  `quota:*` key in Redis, `pg_policies` rows) over trusting a 200.
