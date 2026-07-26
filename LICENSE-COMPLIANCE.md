# AGPL-3.0 compliance — corresponding source (§13)

This engine is a fork of [Docmost](https://github.com/docmost/docmost),
licensed **AGPL-3.0-only** (see `LICENSE`). AGPL §13 requires that every
network user of a modified version be offered access to the corresponding
source of exactly the version they are interacting with. This file records
how this deployment satisfies that obligation.

## The canonical source-offer endpoint

Every running instance serves one canonical, **unauthenticated** endpoint:

```
GET /api/orvex/source
->  { "sha": "<exact built commit>", "sourceRepo": "<corresponding-source repository URL>" }
```

- Values come from the build-time environment (`ORVEX_GIT_SHA`,
  `ORVEX_SOURCE_REPO`). An unconfigured offer fails **loud** (HTTP 500
  `source offer not configured`) — the endpoint never serves a fabricated
  or fallback SHA.
- It requires no session, no API key, and no tenant: it is reachable in
  every deployment topology, including CLOUD multi-tenancy where the
  request's `Host` header resolves to no workspace (the workspace-resolution
  hook exempts `/api/orvex/source` — `apps/server/src/orvex/http/orvex-workspace-exempt-paths.ts`).
- The client UI renders the offer as a visible source link
  (`apps/client/src/orvex/source-offer/source-offer-link.tsx`).

## The public source repository

The corresponding source is published at the public repository advertised by
`ORVEX_SOURCE_REPO` — canonically:

```
https://github.com/orvexai/orvex-wiki
```

Every deployed image is built from a commit of that repository; the `sha`
returned by the endpoint identifies the exact commit of the running binary.

## What is NOT a §13 mechanism

The authenticated `POST /api/version` endpoint (`VersionController`) is an
upstream-update check pointing at the upstream project's release feed. It is
JwtAuthGuard-gated and names the upstream org, not this fork's source — it
was never a valid §13 offer and carries no compliance role. §13 is answered
**only** by `GET /api/orvex/source`.

## Provenance guards

CI enforces the licensing posture continuously: "License Header Check
(AGPL §13)" (`scripts/ci/license-header-check.sh`) and "Engine License
Guard (P10)" (`scripts/engine-license-guard.sh`).
