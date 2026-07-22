# Fixtures: `edge-assertion-{jwks,tokens}.json` — provenance & pin

## What this is

These two files are a **byte-identical vendor copy** of the shared ADR-0049
conformance corpus published at
`orvex-studio-contracts` tag **`v0.1.4`**
(`identity/vectors/edge-assertion/signed/edge-assertion-jwks.json` and
`.../edge-assertion-tokens.json`, commit `3945e2c901c32c8f2ce3b6e321b42c10232ce787`).

This is the **same corpus** the Go `pkg/auth` (ENG-2408) and TS `@orvex/auth-node`
(ENG-3062) verifiers replay — per ADR-0049's "one verifier, adopted, never
re-implemented" principle, the AGPL engine's generic ES256 verify (ENG-3063,
AD-8 exception) proves itself against the SAME golden data, not a hand-authored
shape. `edge-assertion-jwks.json` is a real-shaped RFC 7517 JWK Set (one EC
P-256 `ES256` public key); `edge-assertion-tokens.json` is 9 real compact-JWS
tokens signed by the matching **committed test-only** private key (zero
security value — see the corpus's own `_provenance`).

**Pinned, not `@latest`**: v0.1.4 is the tag where the schema is
`x-status: pinned` (ADR-0049 human-ratified). `orvex-studio-contracts` HEAD has
since moved past this pin (semver `>= 0.13.0`); this engine intentionally
vendors the OLDER, frozen v0.1.4 shape rather than tracking HEAD, because HEAD
is not this ticket's contract — v0.1.4 is (per the build plan: "v0.1.4 <
v0.13.0 semver; vendor/fixture the golden corpus at v0.1.4"). Bumping this pin
is a deliberate, separate change, not a side effect of an unrelated edit here.

## Why vendored, not a live dependency

`orvex-studio-contracts` is not consumed as an npm package from this repo (it
publishes JSON-schema + Python tooling, no JS package). Per this repo's own
network-seam discipline (`session-mint/__fixtures__/keycloak-jwks-response.shape.md`),
a real published shape is captured and committed, replayed in tests — never
fetched live in CI or hand-authored from scratch.

## How the tests use it

Unlike `keycloak-jwks-response.json` (a shape-only capture whose test overlays
a **fresh per-run keypair** because the original private key was discarded),
this corpus's tokens were signed by the SAME key published in
`edge-assertion-jwks.json` — both halves are used **as committed, unmodified**:
`edge-assertion-verifier.spec.ts` loads the JWKS directly (via
`jose.createLocalJWKSet`, wrapped in a test `EdgeAssertionKeySource`) and
replays every token in `edge-assertion-tokens.json` against it, using the
corpus's own pinned `now_unix` as the injected verification clock so the
`exp`/`iat` boundaries stay reproducible.

## Regeneration / re-pin

Do not hand-edit these files. To move the pin: `git show <new-tag>:identity/vectors/edge-assertion/signed/edge-assertion-{jwks,tokens}.json`
from `orvex-studio-contracts` and overwrite both, updating the tag/commit
referenced above and in `edge-assertion-verifier.spec.ts`.
