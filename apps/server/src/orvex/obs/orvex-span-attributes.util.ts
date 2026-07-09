// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import type { Attributes, Span } from '@opentelemetry/api';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

import { denyIfLikelyPii } from '../attachments/orvex-mask.util';

/**
 * FR-C18 attribute vocabulary (ENG-1599) — conform-by-value against the
 * `orvex-studio-contracts` `obs/CONVENTIONS.md` reference (the AGPL engine
 * cannot statically import that private repo — A-SEAMS conform-not-import).
 * Keys below are copied VERBATIM from that file's "Shared trace / metric
 * attribute keys" table; do not rename without updating both sides.
 *
 *   service.name -> the OTel semantic-conventions resource key (standard,
 *                    not orvex.*-prefixed); CONVENTIONS.md pins the VALUE for
 *                    this repo: orvex-wiki -> `wiki`.
 *   orvex.cell    -> "The public cell token (e.g. eu1) / solo on
 *                    dev/crew/standalone." Sourced from CELL_ID (A-CELL).
 *   orvex.tenant  -> "The polymorphic tenant id {user|org} (never PII)."
 *                    In this engine the tenant IS the workspace: the value is
 *                    docmost's opaque `workspaceId` (a UUID), never a
 *                    derivable slug (NFR-CT5).
 *
 * `correlation_id` is NOT part of the CONVENTIONS.md shared-vocab table (that
 * file is a DRAFT SKELETON and does not yet cover request correlation) — it
 * is this leg's A-OBSERVE F11 correlation-chain attribute (ingress -> span ->
 * pino -> [ENG-1600] CloudEvent), named literally per the story ACs.
 */
export const ENGINE_SERVICE_NAME = 'wiki';
export const ORVEX_CELL_ATTR = 'orvex.cell';
export const ORVEX_TENANT_ATTR = 'orvex.tenant';
export const ORVEX_CORRELATION_ID_ATTR = 'correlation_id';

export interface OrvexResourceAttributesEnv {
  CELL_ID?: string;
}

/**
 * Build the FR-C18 RESOURCE attributes (service.name + orvex.cell) — built
 * ONCE at bootstrap tier, before any span exists. Pure: deterministic given
 * `env`, no I/O, no Date.now()/rand (❌#9).
 */
export function buildResourceAttributes(
  env: OrvexResourceAttributesEnv = {},
): Attributes {
  const attrs: Attributes = {
    [ATTR_SERVICE_NAME]: ENGINE_SERVICE_NAME,
  };
  const cell = denyIfLikelyPii(env.CELL_ID ?? null);
  if (cell !== null) {
    attrs[ORVEX_CELL_ATTR] = cell;
  }
  return attrs;
}

export interface OrvexSpanAttributesInput {
  /** The opaque workspace id (docmost's tenant identity) — never a slug/title. */
  workspaceId?: string | null;
  /** The active request's correlation id (inbound header or freshly generated). */
  correlationId?: string | null;
}

/**
 * Build the FR-C18 SPAN attributes (orvex.tenant + correlation_id).
 *
 * PII DENY-LIST (AC6): every value is passed through
 * {@link denyIfLikelyPii} before being admitted. A value that does not look
 * like an opaque identifier (a page title, free-form text, anything with
 * whitespace or over 64 chars) is DROPPED — never included, never
 * partially echoed. This is the ONLY gate: there is no allowlist of
 * "safe-looking" free text, because there isn't one.
 */
export function buildSpanAttributes(input: OrvexSpanAttributesInput): Attributes {
  const attrs: Attributes = {};

  const tenant = denyIfLikelyPii(input.workspaceId ?? null);
  if (tenant !== null) {
    attrs[ORVEX_TENANT_ATTR] = tenant;
  }

  const correlationId = denyIfLikelyPii(input.correlationId ?? null);
  if (correlationId !== null) {
    attrs[ORVEX_CORRELATION_ID_ATTR] = correlationId;
  }

  return attrs;
}

/**
 * Apply a built attribute bag onto a live span. Thin adapter (CS §4c) — no
 * branching/domain logic; a no-op when there is no active span (vanilla-safe,
 * AC5) or no attributes to set.
 */
export function applySpanAttributes(
  span: Span | undefined,
  attrs: Attributes,
): void {
  if (!span || Object.keys(attrs).length === 0) {
    return;
  }
  span.setAttributes(attrs);
}
