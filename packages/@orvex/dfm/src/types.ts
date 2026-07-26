/**
 * Minimal ProseMirror-JSON <-> DfM shapes.
 *
 * Deliberately narrow (CS ❌#6 — model only the surface the implemented
 * serializer actually touches). The engine's full ProseMirror schema is far
 * richer; this twin's registry (see `common-nodes.ts`) covers the
 * contract-fixture-covered node/mark set, and everything outside it flows
 * through the lossless opaque-fence path (ENG-2487) — never a silent drop.
 */

/** A ProseMirror inline mark (bold, italic, link, mention, ...). */
export interface PmMark {
  readonly type: string;
  readonly attrs?: Record<string, unknown>;
}

/**
 * A ProseMirror node in its plain-JSON wire form. Block nodes carry `content`;
 * the `text` leaf carries `text` (and optional `marks`).
 */
export interface PmNode {
  readonly type: string;
  readonly content?: readonly PmNode[];
  readonly text?: string;
  readonly marks?: readonly PmMark[];
  readonly attrs?: Record<string, unknown>;
}

/** The document root node (`type: "doc"`). */
export interface PmDoc extends PmNode {
  readonly type: 'doc';
  readonly content?: readonly PmNode[];
}

/**
 * DfM ("Docmost-flavored Markdown") serialized form. DfM is a UTF-8 Markdown
 * text, so the honest minimal shape is a `string`. Kept as a named alias so the
 * write-path seam reads as `PmDoc -> Dfm` / `Dfm -> PmDoc` rather than
 * `string`.
 */
export type Dfm = string;

/** Context threaded through a node serializer so it can recurse into children. */
export interface SerializerCtx {
  /** Serialize a single child node via the registry (an unregistered type is
   * opaque-fenced by the dispatcher, never dropped). */
  serializeNode(node: PmNode): string;
  /** Serialize an inline run (text + inline atoms + marks) to a DfM string. */
  serializeInline(nodes: readonly PmNode[] | undefined): string;
  /** Mint a deterministic-per-call opaque id (counter scoped to one `pmToDfm`
   * invocation, never module-global mutable state). */
  nextOpaqueId(): string;
}

/** A node-type's bidirectional entry — the registry's unit of truth. */
export interface NodeEntry {
  /** Serialize this node (and its own children, via `ctx`) to a DfM fragment. */
  toDfm: (node: PmNode, ctx: SerializerCtx) => string;
}

/** A mark-type's bidirectional entry. */
export interface MarkEntry {
  /** Wrap already-serialized (escaped) inline text with this mark's DfM delimiters. */
  wrapDfm: (text: string, mark: PmMark) => string;
  /** The opening delimiter token the reverse lexer matches to recognize this mark. */
  openToken: string;
  /** The closing delimiter token. */
  closeToken: string;
  /** Build the mark object from a matched token (e.g. capture a link href). */
  markFromToken: (openMatch: string, innerCaptures: string[]) => PmMark;
}
