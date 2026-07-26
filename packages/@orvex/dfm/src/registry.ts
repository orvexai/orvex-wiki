import type { MarkEntry, NodeEntry, PmMark } from './types';

/**
 * The bidirectional single-source-of-truth registry: every node/mark type's
 * forward+reverse behaviour is co-located in ONE entry here. Real, mutable
 * maps — no hidden fallback fabricates output for an unregistered type (the
 * dispatcher fences it instead; see `pm-to-dfm.ts`).
 *
 * Folded in from the upstream clean-room reference serializer (ENG-2487);
 * equivalence with the Go twin (`orvex-studio-lib/pkg/dfm`) flows ONLY through
 * the shared contract fixtures, never through shared code (D-CON-8).
 */

const nodeTable = new Map<string, NodeEntry>();
const markTable = new Map<string, MarkEntry>();
/** Ordered so the reverse lexer checks longer/more-specific tokens first (e.g. `**` before `*`). */
const markOrder: string[] = [];

export function registerNode(type: string, entry: NodeEntry): void {
  nodeTable.set(type, entry);
}

export function getEntry(type: string): NodeEntry | undefined {
  return nodeTable.get(type);
}

export function hasEntry(type: string): boolean {
  return nodeTable.has(type);
}

export function registeredTypes(): string[] {
  return [...nodeTable.keys()];
}

export function registerMark(type: string, entry: MarkEntry): void {
  markTable.set(type, entry);
  markOrder.push(type);
}

export function getMark(type: string): MarkEntry | undefined {
  return markTable.get(type);
}

export function registeredMarkTypes(): string[] {
  return [...markTable.keys()];
}

/** Mark types ordered longest-open-token-first, for greedy left-to-right lexing. */
export function markLexOrder(): Array<{ type: string; entry: MarkEntry }> {
  return [...markOrder]
    .map((type) => ({ type, entry: markTable.get(type)! }))
    .sort((a, b) => b.entry.openToken.length - a.entry.openToken.length);
}

/** Resolve a parsed opening token back to its mark type (used by the reverse lexer). */
export function markFromToken(
  openToken: string,
): { type: string; entry: MarkEntry } | undefined {
  for (const [type, entry] of markTable.entries()) {
    if (entry.openToken === openToken) return { type, entry };
  }
  return undefined;
}

export function buildMark(
  type: string,
  openMatch: string,
  innerCaptures: string[],
): PmMark {
  const entry = markTable.get(type);
  if (!entry) throw new Error(`markFromToken: no registered mark "${type}"`);
  return entry.markFromToken(openMatch, innerCaptures);
}
