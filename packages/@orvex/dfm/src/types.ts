/**
 * Minimal ProseMirror-JSON <-> DfM shapes.
 *
 * Deliberately narrow (CS ❌#6 — model only the surface the implemented
 * serializer actually touches). The engine's full ProseMirror schema is far
 * richer; this twin grows its shapes ONLY as covered fixture-pairs land in the
 * contracts repo (fixtures/dfm/**). Nothing here is a placeholder for an
 * unimplemented node — unimplemented nodes throw {@link DfmNotImplementedError}.
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
