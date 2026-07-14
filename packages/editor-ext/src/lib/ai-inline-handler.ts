import { Editor } from "@tiptap/core";
import { Transaction } from "@tiptap/pm/state";

/**
 * ENG-1395 — OrvexAiInlineHandler.
 *
 * Ported (per the "Original fork source" provenance thread on ENG-1395,
 * pin `orvexai/docmost@050187676624`) from
 * `packages/orvex-editor-ext/src/ai-inline-handler.ts` into this repo's
 * `@docmost/editor-ext` package (`packages/editor-ext/`).
 *
 * Streams AI-generated tokens into a captured document range. Owns:
 *  - the single 50ms flush-timer cadence (liveness cadence only — CS §4h
 *    #9, never read-model determinism; tests are transcript-driven and
 *    deterministic, never `time.Now`/`rand`);
 *  - single-undo grouping (fixed post-R3/pass14: see below): every interim
 *    flush AND the final commit are ordinary history-tracked transactions,
 *    fired in immediate succession (well inside prosemirror-history's
 *    default 500ms `newGroupDelay`) over the same (adjacent/overlapping)
 *    range — so prosemirror-history merges the whole sequence into ONE
 *    undo-stack item. Exactly one `editor.commands.undo()` therefore
 *    reverts the whole transform, even a partial one, all the way back to
 *    the ORIGINAL pre-stream content (AC3, AC7) — not merely to the last
 *    interim paint.
 *
 *    Why not `addToHistory: false` for interim flushes (the pre-fix
 *    approach): prosemirror-history only uses `addToHistory: false`
 *    transactions to remap *existing* undo items' positions (`addMaps`);
 *    it never records their inverse. `Transaction.invert()` is only ever
 *    defined relative to that transaction's own starting doc, so no
 *    matter what `commitFinal()` did, undoing the ONE tracked transaction
 *    could only ever restore the doc to whatever it looked like
 *    immediately before `commitFinal` ran — i.e. the last untracked
 *    interim paint, not the true original. Grouping every flush into the
 *    same tracked history item sidesteps this: the group's combined
 *    inverse targets the doc state before the FIRST transaction in the
 *    group, which is the true pre-stream original;
 *  - Yjs awareness, when a collab `provider` is supplied, so collaborators
 *    can see who is streaming.
 *
 * Deletion test (CS §3.1): NOT a pass-through. Deleting this class would
 * lose the flush cadence, the undo-grouping invariant, and the awareness
 * broadcast — real behaviour, reused as-is by `OrvexAiBubbleHandler`
 * (CS §3.2 one-adapter rule / anti-2nd-timer guard, see AC4).
 *
 * The network transport is injected as `streamFn` (matching the existing
 * `generateAiContentStream` seam in `apps/client/src/ee/ai/services/ai-service.ts`)
 * rather than owned here — no new port/seam is introduced (CS §4d); the
 * SSE endpoint `POST /api/ai/generate/stream` IS the network seam, owned
 * client-side by the caller. This also lets tests replay a committed real
 * transcript behind a `streamFn` stub without mocking this package.
 */

export interface InlineStreamRange {
  from: number;
  to: number;
}

export interface AiStreamChunk {
  content: string;
}

export interface AiStreamError {
  error: string;
}

export type AiStreamFn = (
  data: Record<string, unknown>,
  onChunk: (chunk: AiStreamChunk) => void,
  onError?: (error: AiStreamError) => void,
  onComplete?: () => void,
) => Promise<AbortController>;

export interface AiInlineStreamCallbacks {
  onError?: (error: AiStreamError) => void;
  onComplete?: (finalText: string) => void;
}

export interface AiInlineUser {
  id: string;
  name?: string;
  color?: string;
}

export interface AiAwarenessProvider {
  setAwarenessField?: (key: string, value: unknown) => void;
}

const FLUSH_INTERVAL_MS = 50;

export class OrvexAiInlineHandler {
  protected readonly editor: Editor;
  protected readonly provider: AiAwarenessProvider | null;
  protected readonly user?: AiInlineUser;

  private range: InlineStreamRange | null = null;
  private buffer = "";
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private streaming = false;

  constructor(
    editor: Editor,
    provider: AiAwarenessProvider | null = null,
    user?: AiInlineUser,
  ) {
    this.editor = editor;
    this.provider = provider;
    this.user = user;
  }

  get isStreaming(): boolean {
    return this.streaming;
  }

  /**
   * Starts (or resumes into) a stream that replaces `range` with the
   * tokens forwarded via `streamFn`. `data` is the `AiGenerateDto`-shaped
   * request body; this handler never inspects prompt/action semantics
   * beyond forwarding it (CS §6 — no prompt/agent logic in the client).
   */
  async startStream(
    range: InlineStreamRange,
    data: Record<string, unknown>,
    streamFn: AiStreamFn,
    callbacks: AiInlineStreamCallbacks = {},
  ): Promise<void> {
    if (this.streaming) {
      throw new Error("OrvexAiInlineHandler: a stream is already in flight");
    }

    this.range = { ...range };
    this.buffer = "";
    this.streaming = true;
    this.setAwareness(true);
    this.startFlushTimer();

    let settled = false;
    const settle = (error?: AiStreamError) => {
      if (settled) return;
      settled = true;
      this.stopFlushTimer();
      this.commitFinal();
      this.streaming = false;
      this.setAwareness(false);
      this.range = null;
      if (error) {
        callbacks.onError?.(error);
      } else {
        callbacks.onComplete?.(this.buffer);
      }
    };

    try {
      await streamFn(
        data,
        (chunk) => {
          this.buffer += chunk.content;
        },
        (error) => settle(error),
        () => settle(),
      );
    } catch (error) {
      settle({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flushInterim(), FLUSH_INTERVAL_MS);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Interim flush: paints the buffer so far. History-tracked (NOT
   * `addToHistory: false` — see the class doc for why that broke
   * single-undo). Fired well inside prosemirror-history's `newGroupDelay`
   * of every neighbouring flush/commit over an adjacent range, so it
   * merges into the same undo-stack item instead of opening a new one.
   */
  private flushInterim(): void {
    if (!this.range) return;
    const { view } = this.editor;
    const tr = view.state.tr;
    tr.setMeta("orvexAiInlineFlush", true);
    this.replaceRange(tr, this.range, this.buffer);
    this.range = { from: this.range.from, to: this.range.from + this.buffer.length };
    view.dispatch(tr);
  }

  /**
   * Final commit: lands the full buffer. History-tracked, like every
   * interim flush — it's the last transaction in the group, not the only
   * one, so its own inverse only has to cover the tail (interim ->
   * final); the group's combined inverse (what a single undo actually
   * runs) covers the whole transform back to the original.
   */
  private commitFinal(): void {
    if (!this.range) return;
    const { view } = this.editor;
    const tr = view.state.tr;
    this.replaceRange(tr, this.range, this.buffer);
    view.dispatch(tr);
  }

  private replaceRange(
    tr: Transaction,
    range: InlineStreamRange,
    text: string,
  ): void {
    if (text) {
      tr.replaceWith(range.from, range.to, this.editor.schema.text(text));
    } else {
      tr.delete(range.from, range.to);
    }
  }

  private setAwareness(active: boolean): void {
    this.provider?.setAwarenessField?.(
      "aiStreaming",
      active ? { userId: this.user?.id ?? null } : null,
    );
  }
}
