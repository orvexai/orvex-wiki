import { PmMark, PmNode } from './types';

/**
 * Inline (mark) serialization — bold/italic/code/link/etc. SCAFFOLD: returns the
 * bare text; the real inline serializer applies marks in a deterministic order
 * so the round-trip is stable across both twins.
 */
export function serializeInline(node: PmNode): string {
  const text = node.text ?? '';
  // TODO(fold-in): apply node.marks in canonical order (see golden fixtures).
  return applyMarks(text, node.marks ?? []);
}

function applyMarks(text: string, _marks: PmMark[]): string {
  // TODO(fold-in): wrap with **/_/`/[](…) per mark type.
  return text;
}
