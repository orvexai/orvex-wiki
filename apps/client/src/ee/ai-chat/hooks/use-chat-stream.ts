import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { sendChatMessage } from "../services/ai-chat-service";
import { parseCitationString } from "../utils/citation-metadata";
import type {
  AiChatCitation,
  AiChatMessage,
  AiChatStreamEvent,
  AiChatStreamEventWire,
  AiChatToolCall,
  ChatAttachment,
  PageMention,
  SendArgs,
} from "../types/ai-chat.types";

// The SSE event types this reader knows how to handle — the PINNED wire
// vocabulary (orvex-studio-contracts sse/AI-CHAT.md), ratified from the
// real ENG-1450 producer. Anything else is a forward-compat no-op (AC8) —
// future service versions may add event types the client doesn't
// understand yet; ignoring them keeps the stream alive.
const KNOWN_EVENT_TYPES = new Set([
  "chat_id",
  "state",
  "banner",
  "token",
  "citation",
  "cap",
  "error",
  "keepalive",
]);

// The wire carries no `retryable` boolean (sse/AI-CHAT.md) — retryability is
// derived from the closed `errCode` set. MODEL_STREAM_FAILED is a transient
// upstream/model failure; the other three are permanent for this turn's
// inputs (retrying with the same args would fail identically).
const RETRYABLE_ERROR_CODES = new Set(["MODEL_STREAM_FAILED"]);

type ChatStreamOptions = {
  onChatCreated?: (chatId: string) => void;
};

export function useChatStream(
  chatId: string | undefined,
  options?: ChatStreamOptions,
) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingToolCalls, setStreamingToolCalls] = useState<AiChatToolCall[]>(
    [],
  );
  // Citations accumulated for the in-flight turn from `citation` frames
  // (AC2), attached to the assistant message once the turn's `done` frame
  // finalizes it — same accumulate-then-finalize pattern already used for
  // streamingContent/streamingToolCalls.
  const [streamingCitations, setStreamingCitations] = useState<
    AiChatCitation[]
  >([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingState, setStreamingState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Added by the port (ENG-1359): remembers the last SendArgs so `retry()`
  // can re-send verbatim after a retryable stream error.
  const lastSendArgsRef = useRef<SendArgs | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentChatIdRef = useRef(chatId);
  currentChatIdRef.current = chatId;
  // Tracks which chatId the local `messages` state currently represents.
  // Set when we seed from a server fetch AND when we optimistically own a
  // freshly-created chat after `chat_id`. This is the single authority
  // marker that keeps server-state effects from clobbering in-flight streams.
  const hydratedChatIdRef = useRef<string | undefined>(undefined);

  // Reset local state when the consumer switches to a different chat.
  // Skip the reset if the new chatId is one the hook itself already claimed
  // during a new-chat flow — in that case our optimistic state is the truth.
  useEffect(() => {
    if (chatId && chatId === hydratedChatIdRef.current) return;
    hydratedChatIdRef.current = undefined;
    setMessages([]);
    setError(null);
    setErrorCode(null);
    setIsRetryable(false);
  }, [chatId]);

  const hydrateFromServer = useCallback((msgs: AiChatMessage[]) => {
    const forId = currentChatIdRef.current;
    if (!forId) return;
    if (hydratedChatIdRef.current === forId) return;
    hydratedChatIdRef.current = forId;
    setMessages(msgs);
  }, []);

  const sendMessage = useCallback(
    (
      content: string,
      mentions: PageMention[] = [],
      attachments: ChatAttachment[] = [],
      contextPageId?: string,
      scope?: "page" | "workspace",
      model?: string,
    ) => {
      if (isStreaming || (!content.trim() && attachments.length === 0)) return;

      // Remember this send so retry() can re-issue it verbatim on a
      // retryable stream error (added by the port, ENG-1359).
      lastSendArgsRef.current = {
        content,
        mentions,
        attachments,
        contextPageId,
        scope,
        model,
      };

      setError(null);
      setErrorCode(null);
      setIsRetryable(false);
      setIsStreaming(true);
      setStreamingContent("");
      setStreamingToolCalls([]);
      setStreamingCitations([]);
      setStreamingState(null);

      const metadata: Record<string, unknown> = {};
      if (mentions.length) {
        metadata.mentionedPageIds = mentions.map((m) => m.id);
      }
      if (attachments.length) {
        metadata.attachments = attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          fileExt: a.fileExt,
        }));
      }

      const userMessage: AiChatMessage = {
        id: `temp-${Date.now()}`,
        chatId: currentChatIdRef.current || "",
        role: "user",
        content,
        toolCalls: null,
        metadata: Object.keys(metadata).length ? metadata : null,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);

      const attachmentIds = attachments.map((a) => a.id);

      const abortController = sendChatMessage(
        {
          chatId: currentChatIdRef.current,
          content,
          mentionedPageIds: mentions.map((m) => m.id),
          ...(contextPageId && { contextPageId }),
          ...(attachmentIds.length && { attachmentIds }),
          ...(scope && { scope }),
          ...(model && { model }),
        },
        (wireEvent: AiChatStreamEventWire) => {
          // Forward-compat (AC8): a still-unknown SSE event type is a no-op
          // — never throw, never break the stream. Known events fall
          // through to the switch below, narrowed to the closed union.
          if (!KNOWN_EVENT_TYPES.has(wireEvent.type)) {
            return;
          }
          const event = wireEvent as AiChatStreamEvent;
          switch (event.type) {
            // Always the first frame of a turn (sse/AI-CHAT.md) — was
            // `chat_created` under the stale fork-client vocabulary.
            case "chat_id":
              currentChatIdRef.current = event.chatId;
              // Claim authority over this new chatId so when the consumer's
              // prop catches up via navigation/onChatCreated, the reset effect
              // sees a match and preserves our optimistic messages.
              hydratedChatIdRef.current = event.chatId;
              if (options?.onChatCreated) {
                options.onChatCreated(event.chatId);
              } else {
                navigate(`/ai/chat/${event.chatId}`, { replace: true });
              }
              queryClient.invalidateQueries({ queryKey: ["ai-chats"] });
              break;
            // The state-machine transition frame. `connecting`/`streaming`
            // are surfaced via streamingState for a future affordance;
            // `done` finalizes the turn, `error` is a no-op here because the
            // paired `error` frame (below) already carries the message the
            // inline error UI needs (producer emits `error` THEN
            // `state:"error"` — sse/AI-CHAT.md).
            case "state":
              switch (event.state) {
                case "connecting":
                  setStreamingState("connecting");
                  break;
                case "streaming":
                  setStreamingState(null);
                  break;
                case "done": {
                  // The wire carries no messageId (sse/AI-CHAT.md) — a
                  // stable id is synthesized client-side, same pattern
                  // already used for the stopGeneration partial-message id.
                  const messageId = `msg-${Date.now()}`;
                  setStreamingContent((currentContent) => {
                    setStreamingToolCalls((currentToolCalls) => {
                      setStreamingCitations((currentCitations) => {
                        const assistantMessage: AiChatMessage = {
                          id: messageId,
                          chatId: currentChatIdRef.current || "",
                          role: "assistant",
                          content: currentContent || null,
                          toolCalls: currentToolCalls.length
                            ? currentToolCalls
                            : null,
                          metadata: null,
                          createdAt: new Date().toISOString(),
                          citations: currentCitations.length
                            ? currentCitations
                            : undefined,
                        };

                        setMessages((prev) => [...prev, assistantMessage]);
                        return [];
                      });
                      return [];
                    });
                    return "";
                  });
                  setIsStreaming(false);
                  setStreamingState(null);
                  queryClient.invalidateQueries({
                    queryKey: ["ai-chat", currentChatIdRef.current],
                  });
                  break;
                }
                case "error":
                  setIsStreaming(false);
                  setStreamingState(null);
                  break;
              }
              break;
            // Model/scope/health metadata for this turn (sse/AI-CHAT.md).
            // Not yet surfaced by a dedicated affordance — the existing
            // AiStatusBanner reads the independent /ai/health poll, not
            // this per-turn frame. No-op today (same documented posture as
            // the old `reasoning` case), tracked for a future banner.
            case "banner":
              break;
            // Was `content` under the stale fork-client vocabulary.
            case "token":
              setStreamingContent((prev) => prev + event.token);
              break;
            // Bare wire string ("Title — URL", sse/AI-CHAT.md) — parsed
            // client-side into an AiChatCitation and accumulated for the
            // in-flight turn; attached to the assistant message when its
            // `done` frame finalizes it (AC2).
            case "citation":
              setStreamingCitations((prev) => [
                ...prev,
                parseCitationString(event.citation, prev.length),
              ]);
              break;
            // Spend-cap-reached turn — replaces the entire turn (no
            // chat_id/state precede it). Surfaced as the same inline,
            // non-retryable error UI as a typed `error` frame.
            case "cap":
              setError("Spend cap reached");
              setErrorCode(event.errCode);
              setIsRetryable(false);
              setIsStreaming(false);
              break;
            case "error":
              setError(event.errMsg || "Something went wrong");
              setErrorCode(event.errCode || null);
              setIsRetryable(
                event.errCode ? RETRYABLE_ERROR_CODES.has(event.errCode) : false,
              );
              setIsStreaming(false);
              break;
            // Bare SSE comment frame — never reaches here in practice (the
            // service-layer parser only forwards `data:` lines), kept for
            // documentation/forward-compat completeness.
            case "keepalive":
              break;
          }
        },
        (errorMsg) => {
          setError(errorMsg);
          setIsStreaming(false);
        },
        () => {
          setIsStreaming(false);
        },
      );

      abortRef.current = abortController;
    },
    [isStreaming, navigate, queryClient],
  );

  // Re-sends the last SendArgs verbatim (AC6). No-op if nothing was ever
  // sent or a send is already in flight.
  const retry = useCallback(() => {
    const args = lastSendArgsRef.current;
    if (!args || isStreaming) return;
    sendMessage(
      args.content,
      args.mentions,
      args.attachments,
      args.contextPageId,
      args.scope,
      args.model,
    );
  }, [isStreaming, sendMessage]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    setStreamingContent((currentContent) => {
      setStreamingToolCalls((currentToolCalls) => {
        if (currentContent || currentToolCalls.length > 0) {
          const partialMessage: AiChatMessage = {
            id: `stopped-${Date.now()}`,
            chatId: currentChatIdRef.current || "",
            role: "assistant",
            content: currentContent || null,
            toolCalls: currentToolCalls.length ? currentToolCalls : null,
            metadata: null,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, partialMessage]);
        }
        return [];
      });
      return "";
    });

    setIsStreaming(false);
  }, []);

  return {
    messages,
    streamingContent,
    streamingToolCalls,
    isStreaming,
    streamingState,
    error,
    errorCode,
    isRetryable,
    sendMessage,
    retry,
    stopGeneration,
    hydrateFromServer,
  };
}
