// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/** The only non-wiki CloudEvent types this service may emit. */
export const WIKI_ACCOUNT_DELETION_EVENT_TYPES = [
  'identity.account.deletion.step.acknowledged',
  'identity.account.deletion.step.resumable',
] as const;

const WIKI_ACCOUNT_DELETION_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  WIKI_ACCOUNT_DELETION_EVENT_TYPES,
);

export function isWikiAccountDeletionEventType(type: string): boolean {
  return WIKI_ACCOUNT_DELETION_EVENT_TYPE_SET.has(type);
}

/**
 * Wiki-domain outbox rows retain the historic `wiki.` catalog prefix. The
 * two account-deletion reply events are the only exact cross-domain exception;
 * other identity events fail closed instead of being rewritten or published.
 */
export function resolveWikiOutboxEventType(type: string): string {
  if (isWikiAccountDeletionEventType(type)) return type;
  if (type.startsWith('identity.')) {
    throw new Error(`Unsupported identity outbox event type: ${type}`);
  }
  return `wiki.${type}`;
}
