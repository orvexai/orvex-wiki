import type { AiChatCitation } from "../types/ai-chat.types";

// Extracts the citation list attached to a `done` SSE event or a persisted
// message's metadata. Pure data-shaping — no ranking/relevance logic (that
// stays behind the seam in orvex-studio-ai).
export function extractCitations(
  source: { citations?: AiChatCitation[] } | null | undefined,
): AiChatCitation[] {
  if (!source?.citations) return [];
  return source.citations.filter(
    (c): c is AiChatCitation => Boolean(c && c.id && c.pageId && c.title),
  );
}
