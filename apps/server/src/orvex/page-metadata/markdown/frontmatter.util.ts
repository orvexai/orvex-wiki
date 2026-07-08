// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import * as matter from 'gray-matter';

/**
 * ENG-1371 (AC8) — the set of frontmatter keys recognized by the orvex
 * page-metadata system. Keys outside this set are stored verbatim in
 * `orvex_page_meta.unknown_frontmatter` and round-trip on read.
 * Ported verbatim from the fork's `frontmatter.util.ts`.
 */
const KNOWN_KEYS = [
  'status',
  'archive_reason',
  'doc_type',
  'owner_id',
  'last_reviewed_at',
  'supersedes',
  'superseded_by',
  'redirect_from',
  'verified_against',
  'verified_at',
  'spec_confirmed',
];

const KEY_MAP: Record<string, string> = {
  status: 'status',
  archive_reason: 'archiveReason',
  doc_type: 'docType',
  owner_id: 'ownerId',
  last_reviewed_at: 'lastReviewedAt',
  supersedes: 'supersedes',
  superseded_by: 'supersededBy',
  redirect_from: 'redirectFrom',
  verified_against: 'verifiedAgainst',
  verified_at: 'verifiedAt',
  spec_confirmed: 'specConfirmed',
};

export interface ExtractedFrontmatter {
  /** Recognized metadata fields, camelCased to match `OrvexPageMetadataDto`. */
  metadata: Record<string, unknown>;
  /** The markdown body with frontmatter stripped. */
  body: string;
  /** Any frontmatter keys not in KNOWN_KEYS, preserved verbatim. */
  unknownKeys: Record<string, unknown>;
}

/**
 * Parses a markdown string, separating recognized frontmatter keys (mapped
 * onto `OrvexPageMetadataDto` fields) from unknown keys, and returning the
 * plain body text.
 */
export function extractFrontmatter(markdown: string): ExtractedFrontmatter {
  const parsed = matter(markdown);
  const metadata: Record<string, unknown> = {};
  const unknownKeys: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(parsed.data)) {
    if (KNOWN_KEYS.includes(k)) {
      metadata[KEY_MAP[k]] = v;
    } else {
      unknownKeys[k] = v;
    }
  }

  return { metadata, body: parsed.content, unknownKeys };
}

/**
 * Serializes metadata (camelCase, mapped back to snake_case frontmatter
 * keys) and unknownKeys into a YAML frontmatter block prepended to the body.
 * Returns an empty string if there is no metadata to serialize.
 */
export function serializeFrontmatter(
  metadata: Record<string, unknown>,
  unknownKeys: Record<string, unknown> = {},
): string {
  const reverseMap: Record<string, string> = Object.fromEntries(
    Object.entries(KEY_MAP).map(([snake, camel]) => [camel, snake]),
  );
  const snakeMetadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v === undefined || v === null) continue;
    snakeMetadata[reverseMap[k] ?? k] = v;
  }

  const data = { ...unknownKeys, ...snakeMetadata };
  if (Object.keys(data).length === 0) return '';
  return matter.stringify('', data);
}
