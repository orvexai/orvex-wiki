import { Editor } from "@tiptap/core";
import {
  AiAwarenessProvider,
  AiInlineStreamCallbacks,
  AiInlineUser,
  AiStreamFn,
  InlineStreamRange,
  OrvexAiInlineHandler,
} from "./ai-inline-handler";

/**
 * ENG-1395 — OrvexAiBubbleHandler.
 *
 * Ported from `packages/orvex-editor-ext/src/ai-bubble-handler.ts`
 * (provenance thread, pin `orvexai/docmost@050187676624`, L1-L34):
 * a thin composition wrapper around `OrvexAiInlineHandler` for the
 * bubble-menu surface.
 *
 * Anti-pattern guard (source comment, carried forward): do NOT add a
 * second 50ms flush timer here — all streaming mechanics (flush cadence,
 * single-undo grouping, Yjs awareness) are owned by the inner
 * `OrvexAiInlineHandler`; this wrapper only delegates (AC4).
 */
export class OrvexAiBubbleHandler {
  private readonly inner: OrvexAiInlineHandler;

  constructor(
    editor: Editor,
    provider: AiAwarenessProvider | null = null,
    user?: AiInlineUser,
  ) {
    this.inner = new OrvexAiInlineHandler(editor, provider, user);
  }

  get isStreaming(): boolean {
    return this.inner.isStreaming;
  }

  startStream(
    range: InlineStreamRange,
    data: Record<string, unknown>,
    streamFn: AiStreamFn,
    callbacks?: AiInlineStreamCallbacks,
  ): Promise<void> {
    return this.inner.startStream(range, data, streamFn, callbacks);
  }
}
