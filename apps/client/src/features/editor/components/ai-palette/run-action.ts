import { Editor } from "@tiptap/core";
import {
  AiInlineStreamCallbacks,
  AiStreamChunk,
  AiStreamError,
  AiStreamFn,
  InlineStreamRange,
  OrvexAiInlineHandler,
} from "@docmost/editor-ext";
import { AiAction, AiGenerateDto } from "@/ee/ai/types/ai.types.ts";
import { AiPaletteAction } from "./constants";

/**
 * ENG-1395 — runAction: forwards a picked AiPalette action to the SSE seam
 * through OrvexAiInlineHandler.startStream, and picks the target range for
 * the Apply mode (AC6):
 *  - "replace": the streamed text overwrites the captured range in place.
 *  - "insert-below": the streamed text is inserted at the captured range's
 *    `to` (a zero-width insertion point), leaving prior content untouched.
 *
 * Zero prompt/model logic here (AC8) — only forwards `{action, prompt,
 * content}` (the existing `AiGenerateDto` shape) to `streamFn`.
 */

export interface RunActionParams {
  mode: "replace" | "insert-below";
  range: InlineStreamRange;
  content: string;
  options?: {
    language?: string;
    tone?: string;
  };
}

export interface RunActionDeps {
  streamFn: AiStreamFn;
  setInFlight?: (inFlight: boolean) => void;
  setError?: (error: string | null) => void;
  handler?: OrvexAiInlineHandler;
}

/** Recognizes a real, known palette action (AC10 forward-compat guard). */
function isKnownAction(
  action: AiPaletteAction | Record<string, unknown> | null | undefined,
): action is AiPaletteAction {
  if (!action || typeof action !== "object") return false;
  const candidateAction = (action as { action?: unknown }).action;
  return (
    typeof candidateAction === "string" &&
    (Object.values(AiAction) as string[]).includes(candidateAction)
  );
}

export async function runAction(
  editor: Editor,
  action: AiPaletteAction | Record<string, unknown> | null | undefined,
  params: RunActionParams,
  deps: RunActionDeps,
): Promise<void> {
  // AC10 — an unknown/future action mode is a safe no-op: no throw, doc
  // unchanged, existing modes keep working.
  if (!isKnownAction(action)) {
    return;
  }

  const targetRange: InlineStreamRange =
    params.mode === "insert-below"
      ? { from: params.range.to, to: params.range.to }
      : { from: params.range.from, to: params.range.to };

  const handler = deps.handler ?? new OrvexAiInlineHandler(editor);

  deps.setError?.(null);
  deps.setInFlight?.(true);

  const callbacks: AiInlineStreamCallbacks = {
    onComplete: () => {
      deps.setInFlight?.(false);
    },
    onError: (error: AiStreamError) => {
      deps.setInFlight?.(false);
      deps.setError?.(error.error);
    },
  };

  await handler.startStream(
    targetRange,
    {
      action: action.action,
      prompt: params.options?.language ?? params.options?.tone ?? action.label,
      content: params.content,
    },
    deps.streamFn,
    callbacks,
  );
}

export type { AiStreamChunk, AiStreamError };

/**
 * Typed adapter from the reused `generateAiContentStream(data: AiGenerateDto, ...)`
 * seam to the package's `AiStreamFn` (`data: Record<string, unknown>`).
 * `runAction` always forwards a valid `AiGenerateDto` shape ({action,
 * prompt, content}); this is a single named-type cast at the seam
 * boundary, not an `any`/type-laundering escape (CS §12).
 */
export function toAiStreamFn(
  streamImpl: (
    data: AiGenerateDto,
    onChunk: (chunk: AiStreamChunk) => void,
    onError?: (error: AiStreamError) => void,
    onComplete?: () => void,
  ) => Promise<AbortController>,
): AiStreamFn {
  return (data, onChunk, onError, onComplete) =>
    streamImpl(data as unknown as AiGenerateDto, onChunk, onError, onComplete);
}
