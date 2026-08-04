// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

// Closed label enums mirroring the Go pkg/metrics registry.go definitions
// byte-for-byte (CS §12 pinned contract; ENG-1610). No free-form label maps
// (CS §12 — typed label enums). Inlined into the engine from the retired
// shared metrics package (ENG-3149, AD-8/AD-9, CS ❌#7).

/** The closed label enum for the `feature` label on orvex_ai_cost_usd_total. */
export const AiFeatureLabel = {
  Chat: 'chat',
  Inline: 'inline',
  SearchEmbedding: 'search-embedding',
  Autocomplete: 'autocomplete',
} as const;
export type AiFeatureLabelValue =
  (typeof AiFeatureLabel)[keyof typeof AiFeatureLabel];

/**
 * Kept for metric-name continuity only; OpenBao itself has been removed
 * (matches the Go fork's deprecated OpenBaoOpLabel type).
 */
export const OpenBaoOpLabel = {
  Encrypt: 'encrypt',
  Decrypt: 'decrypt',
} as const;
export type OpenBaoOpLabelValue =
  (typeof OpenBaoOpLabel)[keyof typeof OpenBaoOpLabel];

/** The closed label enum for the Linear entity cache tier. */
export const CacheTier = {
  L1: 'l1', // in-process LRU
  L2: 'l2', // Redis
  L3: 'l3', // Postgres
} as const;
export type CacheTierValue = (typeof CacheTier)[keyof typeof CacheTier];
