## Design Paradigm

**Ports-and-adapters delivery client on MV3.** The extension realizes the initiative spine's single AD-5a compose port (`composeInto(target, text) -> {ok | needs-manual-paste}`) as one `DeliveryAdapter` interface with four per-provider adapters (AD-EXT-1). The MV3 layering maps to namespaces: the **service worker** is the orchestration + I/O edge (Orvex backends, token mint/present, signed-pack fetch, telemetry) at `entrypoints/background/`; the **per-provider content scripts** are the isolated-world adapters that own DOM resolve/insert/read-back only at `entrypoints/content/<provider>.ts`; the **popup** is a strictly presentational React shell at `entrypoints/popup/`. Trust runs one way — the extension is an untrusted client; consent, the personal↔employer firewall, and scope enforce server-side at the identity mint boundary (AD-8): the client presents tokens, it never decides them. Inherited from the parent spine's "delivered into any AI through a mechanism-agnostic adapter", fixed to the MV3 mechanism the viability spike resolved.

## Stack (seed)

Verified current via the npm `latest` dist-tag (CS §14) on 2026-07-15; the code owns these once it exists.

- **WXT** — 0.20.27 (extension framework / build tooling; the supermemory fork base)
- **TypeScript** — 7.0.2
- **React** — 19.2.7 (popup / UI shell only, presentational)
- **@types/chrome** — 0.2.2 (MV3 platform typings)
- **Vitest** — 4.1.10 (unit / adapter tests; the provider DOM is the only mocked boundary, CS §5)
- **Generated TS client** — from `orvex-studio-contracts`; version is **Wave-1-gated** (the tag is not yet cut — ENG-2037 / ENG-2091). Never hand-rolled (AD-EXT-8).

Manifest V3 is the platform target (a Chromium spec, not a pinned dependency); Firefox AMO is a phased target (§12). There is no server-side runtime, image, or datastore — the extension holds no system of record (AD-EXT-7); its only build artifact is the reproducible store bundle (§11).

## Consistency Conventions

- **Naming / files** — per-provider adapters at `entrypoints/content/<provider>.ts` (`chatgpt`, `gemini`, `claude`, `grok`); the DOM idempotency-guard attribute is `data-orvex-initialized`; the provider registry is the single add/remove point (AD-EXT-1).
- **Data & formats** — selector packs and tier config are versioned, signed remote JSON on ONE channel (AD-EXT-2 / FR-BC7); the canary telemetry event shape is fixed (Shape 3, §8): `providerId, selectorPackVersion, failureClass, tier, timestamp`; contract bodies cross the seam as generated typed structs, never `any` (CS ❌#12).
- **State & cross-cutting** — all UI state derives from the service worker (the popup is presentational, CS §6); the delivery token is single-target / single-use / short-TTL, re-minted per action (AD-8 / AD-EXT-3); every provider-page touch is synchronous with an explicit user action (AD-6); operational telemetry rides metrics (OTLP) + logs (Loki) via `api`, never CloudEvents (CS §10, §11); config via env / build injection only, no embedded secrets (CS §10); the fail-safe direction is always toward DEGRADE / copy-paste / re-auth — never white-screen (NFR-4).

## Structural Seed

Cold-start source tree (WXT layout; the code owns the detail once it exists):

```text
orvex-studio-extension/
  entrypoints/
    background/        # service worker: auth/session (AD-EXT-6), pack fetch+verify
                       #   (AD-EXT-2), token mint/present (AD-EXT-3), telemetry (FR-BC5),
                       #   provider registry (AD-EXT-1) — the ONLY Orvex-backend caller
    content/
      chatgpt.ts       # GO       DeliveryAdapter (AD-EXT-1/4)
      gemini.ts        # GO       (shadow-DOM go/no-go gated, AD-EXT-4 / section 6)
      claude.ts        # DEGRADE  (copy/paste)
      grok.ts          # DEGRADE  (grok.com only, OQ-E3)
    popup/             # React presentational shell: connect / consent-preview /
                       #   copy-ready degrade / breakage notice (CS §6)
  lib/
    contracts-client/  # generated TS client over orvex-studio-contracts (AD-EXT-8)
    canary/            # resolve -> verify -> insert -> read-back -> branch (AD-EXT-4)
  packs/               # NOT shipped in-bundle: signed selector/tier JSON, remote-fetched
  wxt.config.ts        # MV3 manifest, least-privilege host_permissions (AD-EXT-5)
```

