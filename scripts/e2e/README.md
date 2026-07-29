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

## Browser suite (Playwright)

`apps/client/e2e/real-user-journey.spec.ts` drives a real Chromium browser
through the actual UI — the login form, the page tree, the ProseMirror editor,
the share modal. Everything else in this repo tests the SERVER; this is the
only thing that proves a screen renders.

```bash
scripts/e2e/run-browser.sh e2e/real-user-journey.spec.ts
```

The runner clears the Redis auth-throttle keys first. `AUTH_THROTTLER` is 10
attempts / 60s, and a suite that logs in and provisions fixtures trips it; a
429 surfaces as "still on /login", which is indistinguishable from a broken
login form. The suite is also SERIAL and shares one captured session for the
same reason.

### What it caught

`fix(editor): recover from a collab auth failure instead of throwing`

`onAuthenticationFailedHandler` in `page-editor.tsx` called
`jwtDecode(collabQuery?.token)`. That value is optional everywhere else in the
hook — the token query can be in flight or failed — and handing `undefined` to
`jwtDecode` throws `Invalid token specified: must be a string`. Because the
throw happened inside a Hocuspocus event handler it surfaced as an UNCAUGHT
`pageerror`, killing the handler before it could do the one thing it exists
for: refetch the token and reconnect. Now a token that cannot be decoded is
treated as expired, which triggers exactly that recovery.

No server-side test could have seen this: it is a client-only failure in an
event handler that only fires when collab auth fails.

### Notes for new browser checks

- Page permissions are **license-gated** (`Feature.PAGE_PERMISSIONS`).
  Unlicensed, the Access tab's honest state is the enterprise upsell and NO
  permission request is issued — asserting the granted UI would be asserting a
  state the deployment cannot reach. The share test branches on this.
- Type at the document END (`Control+End`) in editor tests. Clicking
  mid-paragraph drops the caret where the click landed, so repeated runs
  interleave their markers and the assertion fails on its own accumulated
  state rather than on a defect.
- 401/403/404/429 console errors are network noise and allowed; a `pageerror`
  or any other console error still fails the run — that is the signal that
  caught the collab defect above.
