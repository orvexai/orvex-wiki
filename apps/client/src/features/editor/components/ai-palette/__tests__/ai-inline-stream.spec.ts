import { describe, test, expect, vi, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import {
  OrvexAiInlineHandler,
  AiStreamChunk,
  AiStreamError,
} from "@docmost/editor-ext";
import sseTranscript from "../__fixtures__/ai-inline-stream.sse.txt?raw";

/**
 * ENG-1395 — named DoD test (binary gate).
 *
 * "streams a committed real SSE transcript into the doc through
 * @docmost/editor-ext's OrvexAiInlineHandler, groups it under a single
 * undo, and runs exactly one 50ms flush timer"
 *
 * CS §5 mocking rule: the ProseMirror editor is REAL (a real `@tiptap/core`
 * `Editor` instance). The AI transform service over SSE is `true-external`
 * (CS §5) — replayed here behind a `streamFn` stub that reads the SAME
 * wire format `generateAiContentStream` parses (`data: {...}\n` lines,
 * `[DONE]` sentinel) from a committed fixture file, never through a mock
 * of `@docmost/editor-ext` itself (❌#4 — never mock own packages).
 *
 * KNOWN GAP (flagged for review, not silently claimed done): the fixture
 * `__fixtures__/ai-inline-stream.sse.txt` is wire-format-accurate (matches
 * `apps/client/src/ee/ai/services/ai-service.ts`'s SSE parser byte-for-byte)
 * but was NOT captured from a live `orvex-studio-ai` response, because that
 * service's prompt/model logic is owned by blocked-by ENG-1415 and does not
 * exist to call from this repo yet. 5c's "no hand-authored SSE bodies"
 * review gate should re-verify this fixture once ENG-1415 lands and a real
 * transcript can be captured.
 *
 * PASS14/R3 FIX (F1): the single-undo half of the DoD claim used to be
 * checked against a replay that chained every chunk through nothing but
 * `await Promise.resolve()` — under `vi.advanceTimersByTimeAsync`, that
 * whole microtask chain (all 5 chunks + `[DONE]`) drains before the fake
 * clock ever reaches the first 50ms tick, so `flushInterim()` never ran
 * and `commitFinal()` landed against the untouched original range. Undo
 * trivially "passed" without ever exercising the interim-flush path the
 * AC is actually about (mutation-proven tautology: deleting the
 * `addToHistory:false` flush-history handling left this test green).
 * The replay below now gates after the first real chunk so a genuine
 * `flushInterim()` paints mid-stream before the assertions run.
 */
describe("OrvexAiInlineHandlerSpec", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeEditor() {
    return new Editor({
      extensions: [Document, Paragraph, Text, History],
      content: "<p>hello world</p>",
    });
  }

  /**
   * Replays the committed SSE transcript through the exact line-parsing
   * contract `generateAiContentStream` implements against `fetch`'s
   * `ReadableStream` (data: lines, [DONE] sentinel, {error} -> onError) —
   * without going through `fetch` itself (jsdom has no network), and
   * without mocking `@docmost/editor-ext`.
   *
   * PASS14/R3 FIX (F1): `await Promise.resolve()` alone (fix pass 1's
   * fix for F4) still isn't enough to force a REAL interim flush — under
   * `vi.advanceTimersByTimeAsync`, a chain of bare microtask yields drains
   * completely before the fake clock advances to the first 50ms tick, so
   * `flushInterim()` still never ran. This replay additionally gates
   * after `gateAfterChunk` real chunks, held open by an externally
   * resolved `release()`, so the caller can advance the fake clock across
   * a flush boundary WHILE the transcript is genuinely still in flight —
   * exercising `flushInterim()` for real, not `commitFinal()` racing
   * ahead of it. Still reads the same committed wire-format fixture
   * (no hand-authored chunk content).
   */
  function replaySseTranscriptWithGate(
    transcript: string,
    gateAfterChunk: number,
  ): {
    streamFn: (
      data: Record<string, unknown>,
      onChunk: (chunk: AiStreamChunk) => void,
      onError?: (error: AiStreamError) => void,
      onComplete?: () => void,
    ) => Promise<AbortController>;
    release: () => void;
  } {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const streamFn = async (
      _data: Record<string, unknown>,
      onChunk: (chunk: AiStreamChunk) => void,
      onError?: (error: AiStreamError) => void,
      onComplete?: () => void,
    ) => {
      const abortController = new AbortController();
      let chunkCount = 0;
      for (const line of transcript.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        await Promise.resolve();
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
        chunkCount++;
        if (chunkCount === gateAfterChunk) {
          await gate;
        }
      }
      onComplete?.();
      return abortController;
    };
    return { streamFn, release };
  }

  test("streams the committed transcript into the captured range, single-undo reverts it to the ORIGINAL doc (not an interim paint), and exactly one 50ms flush timer runs", async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const editor = makeEditor();
    const preTransformDoc = editor.state.doc.toJSON();

    // Captured range: "world" inside "<p>hello world</p>" (positions 7-12).
    const range = { from: 7, to: 12 };
    const handler = new OrvexAiInlineHandler(editor);

    // Gate the replay after the first real chunk ("The ") so a flush
    // boundary can be crossed while the stream is still genuinely open.
    const { streamFn, release } = replaySseTranscriptWithGate(sseTranscript, 1);

    const streamPromise = handler.startStream(
      range,
      { content: "world" },
      streamFn,
    );

    // Exactly one 50ms flush timer is constructed for this stream.
    const flushTimerCalls = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === 50,
    );
    expect(flushTimerCalls).toHaveLength(1);

    // Advance past one flush cycle WHILE the transcript is still gated
    // after the first chunk — this must be a GENUINE flushInterim paint,
    // not commitFinal running early.
    await vi.advanceTimersByTimeAsync(60);
    expect(handler.isStreaming).toBe(true);
    expect(editor.state.doc.textBetween(7, 7 + "The ".length, "\n")).toBe(
      "The ",
    );

    // Release the rest of the transcript and let the stream complete.
    release();
    await vi.advanceTimersByTimeAsync(200);
    await streamPromise;

    const finalText = "The quick brown fox jumps.";
    const docText = editor.state.doc.textBetween(
      7,
      7 + finalText.length,
      "\n",
    );
    expect(docText).toBe(finalText);
    expect(handler.isStreaming).toBe(false);

    // (b) exactly one undo() restores the pre-transform ORIGINAL doc, not
    // the "The " interim paint that was on-screen mid-stream. Mutation
    // check (manual, see class doc on OrvexAiInlineHandler): reintroduce
    // `addToHistory: false` on `flushInterim` and this assertion goes RED
    // — undo would restore "The " instead of "world".
    editor.commands.undo();
    expect(editor.state.doc.toJSON()).toEqual(preTransformDoc);

    editor.destroy();
    vi.useRealTimers();
  });

  /**
   * NFR-AC (freshness/latency, F4 gap fix) — the first streamed token
   * paints into the doc BEFORE stream-end: an incremental flush, not a
   * single end-of-stream write. Uses an explicit gate (rather than the
   * transcript replay) so the test can deterministically observe
   * mid-stream state before completion.
   */
  test("NFR-AC — first chunk paints into the captured range before [DONE] (incremental flush)", async () => {
    vi.useFakeTimers();

    const editor = makeEditor();
    const range = { from: 7, to: 12 };
    const handler = new OrvexAiInlineHandler(editor);

    let releaseRemainder!: () => void;
    const remainderGate = new Promise<void>((resolve) => {
      releaseRemainder = resolve;
    });

    const streamFn = async (
      _data: Record<string, unknown>,
      onChunk: (chunk: AiStreamChunk) => void,
      _onError?: (error: AiStreamError) => void,
      onComplete?: () => void,
    ) => {
      onChunk({ content: "The quick " });
      await remainderGate;
      onChunk({ content: "brown fox jumps." });
      onComplete?.();
      return new AbortController();
    };

    const streamPromise = handler.startStream(range, {}, streamFn);

    // Advance past one flush cycle WHILE the stream is still open (no
    // [DONE] yet) — the interim flush must have painted the first chunk.
    await vi.advanceTimersByTimeAsync(60);
    const midStreamText = editor.state.doc.textBetween(
      7,
      7 + "The quick ".length,
      "\n",
    );
    expect(midStreamText).toBe("The quick ");
    expect(handler.isStreaming).toBe(true);

    releaseRemainder();
    await vi.advanceTimersByTimeAsync(60);
    await streamPromise;

    const finalText = "The quick brown fox jumps.";
    expect(
      editor.state.doc.textBetween(7, 7 + finalText.length, "\n"),
    ).toBe(finalText);

    editor.destroy();
    vi.useRealTimers();
  });
});
