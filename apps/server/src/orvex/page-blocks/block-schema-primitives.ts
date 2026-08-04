// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * block-schema-primitives.ts (ENG-3289)
 *
 * Shared JSON-Schema fragments for the PUBLIC block-schema catalog that
 * `SchemasController` serves at `GET /api/schemas/blocks[/:type]`.
 *
 * WHY THIS FILE EXISTS. Every `handlers/*.ts` entry is a schema-only port of
 * orvexai/docmost @ 050187676624f2395c55b36ec60e365f87fd4a9f (ENG-1412,
 * po-ruling 10), and the fork declared the CAS guard 24 separate times, each
 * as its own literal. Twenty-four copies of one wire type is exactly the drift
 * surface that let the catalog advertise `ifVersion: {type: 'string'}` — a
 * type this engine's own write path has never accepted — to the CLI/MCP/agent
 * clients the catalog exists to inform. The declaration now lives once, so a
 * future fork port cannot re-introduce a divergent copy site by site.
 */

/**
 * IF_VERSION_SCHEMA is the ONE declaration of the optimistic-concurrency
 * baseline every block-placement DTO carries.
 *
 * It is an INTEGER, and that is ratified, not stylistic:
 *
 *   - ADR-0053 (ENG-3240, ratified 2026-07-30) fixes `ifVersion` as
 *     `type: integer` family-wide; MR-6 is retired and a string CAS token in
 *     any `openapi/` surface is merge-blocking in orvex-studio-contracts
 *     (`TestEnginePrimitivesConforms::test_ifversion_is_integer_family_wide`).
 *   - It carries the single persisted monotonic write-commit counter
 *     `orvex_page_meta.version` (D-CON-5 / FR-C8) — a counter, never a
 *     wall-clock `updated_at`, so the 409 compares like with like.
 *   - This repo's own `contracts/openapi.yaml` and this engine's live write
 *     DTOs (`orvex/http/dto/apply-ops.dto.ts`: `@IsInt() @Min(0)`) already
 *     say integer, as do every generated client, `orvex-cli`, and
 *     `orvex-wiki-api/internal/blockpatch` (`*int64`, `strconv.ParseInt`).
 *
 * Frozen because the single instance is shared by every registered schema;
 * a mutation here would silently rewrite the served catalog for all types.
 */
export const IF_VERSION_SCHEMA = Object.freeze({
  type: 'integer',
  minimum: 0,
  description:
    "CAS guard — the page's persisted write-commit counter " +
    '(orvex_page_meta.version). The write is rejected with 409 ' +
    'VERSION_MISMATCH if it does not match the current version. An integer, ' +
    'never a timestamp string (ADR-0053).',
});
