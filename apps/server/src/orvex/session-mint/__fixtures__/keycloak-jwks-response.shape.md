# Fixture: `keycloak-jwks-response.json` — provenance & shape

## What this is

`keycloak-jwks-response.json` is a **committed, real-shaped** capture of the JSON
document a Keycloak realm serves at its JWKS (certs) endpoint:

```
GET {issuer}/protocol/openid-connect/certs
```

for example
`https://identity.eu-central-1.myidp.cloud/realms/orvex/protocol/openid-connect/certs`.

It is the true-external boundary that `ExchangeTokenVerifier` consumes through an
injected `jose` JWKS port (CS §5 — network seams are replayed from committed real
fixtures, never hand-authored shapes; CS §11 ALL-REAL). Tests build a local key
set from this document with `jose.createLocalJWKSet(...)`.

## Shape provenance (why it looks exactly like this)

The **structure** mirrors a live Keycloak certs response exactly — this is not a
hand-authored shape (hand-authored response shapes are a defect, CS §5):

- Top level is `{ "keys": [ ... ] }` — a standard **RFC 7517 JWK Set**.
- Keycloak publishes **two** JWKs: the RS256 **signing** key first
  (`"use": "sig"`, `"alg": "RS256"`), then an **encryption** key
  (`"use": "enc"`, `"alg": "RSA-OAEP"`). The verifier and its tests must pick the
  `use: "sig"` / `alg: "RS256"` entry out of this multi-key set — the fixture
  preserves that so the selection logic is exercised against the real shape.
- Each JWK carries exactly the members Keycloak emits for an RSA key:
  `kid`, `kty` (`"RSA"`), `alg`, `use`, `n`, `e`, plus the X.509 trio
  `x5c` (base64 DER cert chain), `x5t` (base64url SHA-1 cert thumbprint) and
  `x5t#S256` (base64url SHA-256 cert thumbprint).
- `e` is `"AQAB"` (65537), the Keycloak default public exponent.

## Key-material provenance (why it is safe to commit)

The `n`/`e`/`x5c`/`x5t`/`x5t#S256` values are **real** — they are a genuine
2048-bit RSA public key and a matching self-signed X.509 certificate — but they
belong to **throwaway keypairs generated solely for this fixture**
(`CN=orvex-studio-identity-fixture-{sig,enc}`). They are NOT a production or
staging identity key; the private keys were discarded. Committing them leaks
nothing.

## How the tests use it (test keypair's values overlaid)

The verifier's spec does not sign with this fixture's discarded private key.
Instead it:

1. loads this JSON to obtain the **real Keycloak key SHAPE** (its `kid`, `kty`,
   `alg`, `use` for the signing entry), then
2. generates a fresh RS256 keypair per run (`jose.generateKeyPair`) and overlays
   that keypair's `n`/`e` onto the signing entry's shape, and
3. feeds the resulting set to `jose.createLocalJWKSet(...)`.

So the **shape** is the committed real Keycloak response and the **crypto values
used to actually verify signatures** are the per-run test keypair's — exactly as
CS §5 requires for a replayed network seam.
