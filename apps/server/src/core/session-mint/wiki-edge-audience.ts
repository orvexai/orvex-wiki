// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * WIKI_EDGE_AUDIENCE — this engine's own `ServiceToken`, the exact value an
 * ADR-0049 edge assertion minted FOR the wiki engine carries in `aud[0]`. The
 * {@link EdgeAssertionVerifier} enforces `aud[0] === this value`, which is the
 * confused-deputy bound: an assertion minted for any OTHER fleet service
 * (`orvex-studio-knowledge`, `orvex-studio-api`, …) is rejected here.
 *
 * WHY A BAKED CONSTANT (AD-8 / ADR-0049 audience rule): per ADR-0049 every
 * consumer's `aud` value MUST come from the AD-31 contracts service-token table
 * as a compile-time constant, NEVER from config/env (a config-sourced audience
 * would be a disable-a-check-by-configuration hole). Closed-source consumers
 * import the generated package (`pkg/contracts.ServiceWiki` in Go, `ServiceWiki`
 * from `@orvexai/contracts` in TS). This AGPL engine is the AD-8 exception — it
 * cannot import that closed package across the license boundary — so the value
 * is sourced from the SAME declaration by an AGPL-clean route and PINNED here:
 *
 *   orvex-studio-contracts declaration plane `config/services.yaml`
 *     → derivation.svckeys → ServiceWiki
 *     → gen/go  `pkg/contracts/servicetoken_gen.go`      : ServiceWiki ServiceToken = "orvex-wiki"
 *     → gen/ts  `packages/contracts/src/servicetoken.ts` : export const ServiceWiki = "orvex-wiki"
 *
 * Changing the fleet's wiki service-token requires REGENERATING this constant
 * from contracts (a deliberate, reviewed act), never editing the literal ad hoc.
 * The verifier only ENFORCES equality against this value — it never decides it —
 * so there is provably no config-fallback path for the audience.
 */
export const WIKI_EDGE_AUDIENCE = 'orvex-wiki';
