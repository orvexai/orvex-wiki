/**
 * Minimal ProseMirror + DfM shapes (clean-room, from the documented schema —
 * never ported from the AGPL source barrel).
 */

/** A ProseMirror JSON node (loose — the real schema is registry-driven). */
export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: PmMark[];
  text?: string;
}

export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** A ProseMirror document root. */
export interface PmDoc extends PmNode {
  type: 'doc';
}

/** DfM is the Markdown-family text representation the CLI/agents read/write. */
export type Dfm = string;

/**
 * An opaque fence — an unknown/opaque node preserved losslessly as
 * `:::dfm-opaque type=<type> id=<id>` … `:::`. The body is spliced back from the
 * CAS base page on reattach.
 */
export interface DfmOpaqueRef {
  type: string;
  id: string;
}
