// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/** The CloudEvents Solo-sentinel cell (cell-contract.md; dev/standalone/crew). */
export const CELL_SOLO = 'solo';

/**
 * ENG-2496 AC2 — the per-cell studio-spine topic for this engine's events
 * (cell-contract rule #5 / the contracts catalog `topics:` convention):
 * `{domain}-events.{env}` with this engine's fixed domain `wiki` and the
 * env suffix = `CELL_ID` (prod cells) or the `solo` sentinel
 * (dev/standalone/crew). Replaces the single flat `KAFKA_OUTBOX_TOPIC`
 * every domain and cell previously shared.
 *
 * A PLAIN function, deliberately not a port/class (one-adapter rule, CS
 * §3.2): exactly one real caller (`OutboxRelayService`), no second
 * implementation anticipated, and construction is pure string logic — no
 * I/O, no cluster required.
 */
export function resolveWikiEventsTopic(cellId: string | null): string {
  return `wiki-events.${cellId || CELL_SOLO}`;
}
