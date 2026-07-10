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

// The `citation` SSE frame (sse/AI-CHAT.md pin, ratified — see
// orvex-studio-ai ENG-1945) carries a bare wire string of the form
// `"Title — URL"` (em dash, spaces either side) — NOT a structured object.
// This parses that bare string client-side into the presentational
// AiChatCitation shape the existing citation-card/citation-source-list
// components already render. Pure string-shaping — no relevance/ranking
// logic, no network/model calls (AC7 thinness guard).
const WIRE_CITATION_SEPARATOR = " — ";

export function parseCitationString(
  raw: string,
  index: number,
): AiChatCitation {
  const sepIdx = raw.lastIndexOf(WIRE_CITATION_SEPARATOR);
  const title = sepIdx === -1 ? raw : raw.slice(0, sepIdx);
  const url =
    sepIdx === -1 ? "" : raw.slice(sepIdx + WIRE_CITATION_SEPARATOR.length);

  // Derive pageId from the URL shape the client itself builds
  // (citationUrl: /s/{spaceSlug}/p/{slugId} or /p/{pageId}) — best-effort,
  // never fabricated: falls back to the raw url when the shape doesn't
  // match either pinned pattern.
  const spacePathMatch = url.match(/^\/s\/([^/]+)\/p\/([^/]+)$/);
  const barePathMatch = url.match(/^\/p\/([^/]+)$/);

  return {
    id: `citation-${index}`,
    pageId:
      spacePathMatch?.[2] ?? barePathMatch?.[1] ?? (url || `citation-${index}`),
    title: title || url,
    url,
    ...(spacePathMatch && {
      spaceSlug: spacePathMatch[1],
      slugId: spacePathMatch[2],
    }),
  };
}
