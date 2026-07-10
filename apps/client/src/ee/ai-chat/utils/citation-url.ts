import type { AiChatCitation } from "../types/ai-chat.types";

// Builds the canonical in-app page path for a citation. Pure presentational
// forwarding — no page-content/model logic lives here (AC7 thinness guard).
export function citationUrl(citation: AiChatCitation): string {
  if (citation.url) return citation.url;
  if (citation.spaceSlug && citation.slugId) {
    return `/s/${citation.spaceSlug}/p/${citation.slugId}`;
  }
  return `/p/${citation.pageId}`;
}
