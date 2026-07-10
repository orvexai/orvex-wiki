import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { sendChatMessage } from "../services/ai-chat-service";
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

// The SSE event types this reader knows how to handle. Anything else is a
// forward-compat no-op (AC8) — future service versions may add event types
// the client doesn't understand yet; ignoring them keeps the stream alive.
const KNOWN_EVENT_TYPES = new Set([
  "chat_created",
  "content",
  "tool_call",
  "tool_result",
  "stream_state",
  "reasoning",
  "done",
  "error",
]);

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
  // freshly-created chat after `chat_created`. This is the single authority
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
            case "chat_created":
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
            case "content":
              setStreamingContent((prev) => prev + event.text);
              break;
            case "tool_call":
              setStreamingToolCalls((prev) => [
                ...prev,
                {
                  id: event.id,
                  name: event.name,
                  args: event.args,
                },
              ]);
              break;
            case "tool_result":
              setStreamingToolCalls((prev) =>
                prev.map((tc) =>
                  tc.id === event.id ? { ...tc, result: event.result } : tc,
                ),
              );
              break;
            case "stream_state":
              setStreamingState(event.state);
              break;
            case "reasoning":
              // Reasoning tokens are not yet surfaced in the transcript UI;
              // tracked via streamingState so a future affordance can show
              // "thinking" text without a citation/AC change here.
              setStreamingState("reasoning");
              break;
            case "done": {
              const citations: AiChatCitation[] | undefined = event.citations;
              setStreamingContent((currentContent) => {
                setStreamingToolCalls((currentToolCalls) => {
                  const assistantMessage: AiChatMessage = {
                    id: event.messageId,
                    chatId: currentChatIdRef.current || "",
                    role: "assistant",
                    content: currentContent || null,
                    toolCalls: currentToolCalls.length
                      ? currentToolCalls
                      : null,
                    metadata: event.usage ? { tokenUsage: event.usage } : null,
                    createdAt: new Date().toISOString(),
                    ...(citations?.length && { citations }),
                  };

                  setMessages((prev) => [...prev, assistantMessage]);
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
              setError(event.message);
              setErrorCode(event.code || null);
              setIsRetryable(event.retryable || false);
              setIsStreaming(false);
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
