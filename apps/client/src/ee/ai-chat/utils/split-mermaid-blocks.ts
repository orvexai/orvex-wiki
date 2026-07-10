// Splits assistant message content into alternating markdown/mermaid
// segments so the renderer can hand mermaid fences to the dedicated
// singleton-loader renderer while everything else stays on the normal
// markdown-to-html path. Pure text splitting — no diagram logic here.
export type ContentSegment =
  | { kind: "markdown"; text: string }
  | { kind: "mermaid"; code: string };

const MERMAID_FENCE_RE = /```mermaid\n([\s\S]*?)```/g;

export function splitMermaidBlocks(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MERMAID_FENCE_RE.lastIndex = 0;
  while ((match = MERMAID_FENCE_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "markdown", text: content.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "mermaid", code: match[1].trim() });
    lastIndex = MERMAID_FENCE_RE.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ kind: "markdown", text: content.slice(lastIndex) });
  }

  return segments.length ? segments : [{ kind: "markdown", text: content }];
}
