import { AiStreamChunk, AiStreamError } from "@docmost/editor-ext";

/**
 * Shared with `ai-inline-stream.spec.ts` (DoD test): replays a committed
 * SSE transcript through the exact line-parsing contract
 * `generateAiContentStream` implements against `fetch`'s `ReadableStream`
 * (`data:` lines, `[DONE]` sentinel, `{error}` -> onError) — without going
 * through `fetch` itself, and without mocking `@docmost/editor-ext`
 * (CS §5 true-external boundary; ❌#4 never mock own packages).
 */
export function replaySseTranscript(
  transcript: string,
): (
  data: Record<string, unknown>,
  onChunk: (chunk: AiStreamChunk) => void,
  onError?: (error: AiStreamError) => void,
  onComplete?: () => void,
) => Promise<AbortController> {
  return async (_data, onChunk, onError, onComplete) => {
    const abortController = new AbortController();
    for (const line of transcript.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") {
        onComplete?.();
        return abortController;
      }
      const parsed = JSON.parse(payload);
      if (parsed.error) {
        onError?.(parsed);
        return abortController;
      }
      onChunk(parsed);
    }
    onComplete?.();
    return abortController;
  };
}
