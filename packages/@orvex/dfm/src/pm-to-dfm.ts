import { DfmNotImplementedError } from './errors';
import { NodeSerializerRegistry } from './registry';
import type { NodeSerializer } from './registry';
import type { Dfm, PmDoc, PmNode } from './types';

/**
 * Trailing-newline policy (documented, tested, and symmetric with
 * {@link dfmToJson}):
 *
 *   - Block nodes are joined by a single blank line (`\n\n`), the CommonMark
 *     block separator.
 *   - The document is terminated by exactly ONE trailing `\n` (POSIX text-file
 *     convention).
 *
 * For the golden `paragraph` fixture — one paragraph "The quick brown fox." —
 * this yields the file bytes `The quick brown fox.\n` exactly.
 */
const DOCUMENT_TERMINATOR = '\n';
const BLOCK_SEPARATOR = '\n\n';

/** `text` leaf. Marks are OUTSIDE the covered subset — an honest throw. */
const serializeText: NodeSerializer = (node) => {
  if (node.marks && node.marks.length > 0) {
    const mark = node.marks[0];
    throw new DfmNotImplementedError(
      mark.type,
      `DfM does not yet serialize the "${mark.type}" text mark; only unmarked ` +
        `text is fixture-covered (${'DFM_NOT_IMPLEMENTED'}).`,
    );
  }
  return node.text ?? '';
};

/** `paragraph` — inline children concatenated with no separator. */
const serializeParagraph: NodeSerializer = (node, serializeChild) =>
  (node.content ?? []).map(serializeChild).join('');

/** `doc` — block children joined by a blank line, one trailing newline. */
const serializeDoc: NodeSerializer = (node, serializeChild) =>
  (node.content ?? []).map(serializeChild).join(BLOCK_SEPARATOR) +
  DOCUMENT_TERMINATOR;

/**
 * Build a fresh registry pre-loaded with the implemented (fixture-covered)
 * serializers: `doc`, `paragraph`, `text`. Callers may register more only when
 * a covered fixture-pair exists for the new type.
 */
export function createDefaultRegistry(): NodeSerializerRegistry {
  return new NodeSerializerRegistry()
    .register('doc', serializeDoc)
    .register('paragraph', serializeParagraph)
    .register('text', serializeText);
}

const defaultRegistry = createDefaultRegistry();

/**
 * Serialize a ProseMirror document to DfM.
 *
 * Every node is dispatched through `registry`; a type with no registered
 * serializer throws {@link DfmNotImplementedError} carrying that `nodeType`.
 * No node is silently skipped and no fabricated output is emitted.
 */
export function pmToDfm(
  doc: PmDoc,
  registry: NodeSerializerRegistry = defaultRegistry,
): Dfm {
  const serializeChild = (node: PmNode): string => {
    const serializer = registry.lookup(node.type);
    if (!serializer) {
      throw new DfmNotImplementedError(node.type);
    }
    return serializer(node, serializeChild);
  };
  return serializeChild(doc);
}

/**
 * Opaque/atom-node fence serializer — drawio, excalidraw, mermaid, embeds, and
 * the legacy `linear_*` opaque-preserve blocks (contracts README: MUST
 * round-trip byte-identical via the `{ block_id, type, summary }` colon
 * directive).
 *
 * This is a TYPED SIGNATURE ONLY. The lossless opaque round-trip is delivery
 * work (FR-C20, rollout v0.3) with its own fixtures; until those land this
 * throws rather than emit a fabricated fence. Do not route opaque node types
 * here as a stand-in for real serialization.
 */
export function serializeOpaque(node: PmNode): Dfm {
  throw new DfmNotImplementedError(
    'dfm-opaque',
    `DfM opaque-fence serialization for "${node.type}" is not implemented ` +
      `(${'DFM_NOT_IMPLEMENTED'}); the byte-identical opaque round-trip ships ` +
      `with its own contract fixtures.`,
  );
}
