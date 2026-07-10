import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@mantine/core";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useChatInfoQuery } from "../queries/ai-chat-query";
import { useChatStream } from "../hooks/use-chat-stream";
import ChatMessageList from "./chat-message-list";
import ChatEmptyState from "./chat-empty-state";
import ChatInput from "./chat-input";
import AiStatusBanner from "./ai-status-banner";
import ChatModelPicker from "./chat-model-picker";
import ChatScopeSwitcher from "./chat-scope-switcher";
import type { HomeAiPromptInitialState } from "@/features/home/components/home-ai-prompt";
import classes from "../styles/ai-chat.module.css";

export default function AiChatLayout() {
  const { t } = useTranslation();
  const { chatId } = useParams<{ chatId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const chatInfoQuery = useChatInfoQuery(chatId);
  // Presentational only — forwarded verbatim on the next send (AC5); the
  // client does not decide model capabilities.
  const [model, setModel] = useState<string | undefined>(undefined);
  const [scope, setScope] = useState<"page" | "workspace">("workspace");

  // If the URL points at a chat the user does not own, the info fetch 404s.
  // Bounce them back to /ai so they cannot interact with any chat UI (including
  // kicking off orphan uploads) tied to a chat they have no access to.
  useEffect(() => {
    if (chatId && chatInfoQuery.isError) {
      navigate("/ai", { replace: true });
    }
  }, [chatId, chatInfoQuery.isError, navigate]);
  const {
    messages,
    streamingContent,
    streamingToolCalls,
    isStreaming,
    error,
    isRetryable,
    sendMessage,
    retry,
    stopGeneration,
    hydrateFromServer,
  } = useChatStream(chatId);

  const autoSentRef = useRef(false);

  useEffect(() => {
    if (chatInfoQuery.data?.messages) {
      hydrateFromServer(chatInfoQuery.data.messages);
    }
  }, [chatInfoQuery.data, hydrateFromServer]);

  useEffect(() => {
    if (autoSentRef.current || chatId) return;
    const state = location.state as HomeAiPromptInitialState | null;
    if (!state?.initialContent && !state?.initialAttachments?.length) return;

    autoSentRef.current = true;
    sendMessage(
      state.initialContent ?? "",
      state.initialMentions ?? [],
      state.initialAttachments ?? [],
    );
    navigate(location.pathname, { replace: true, state: null });
  }, [chatId, location, navigate, sendMessage]);

  const hasMessages = messages.length > 0 || isStreaming || !!chatId;

  const handleSend = (
    content: string,
    mentions: Parameters<typeof sendMessage>[1],
    attachments: Parameters<typeof sendMessage>[2],
  ) => {
    sendMessage(content, mentions, attachments, undefined, scope, model);
  };

  // While the redirect effect is running (or if the user is still on this
  // component for any reason) never render the chat UI for a forbidden chat.
  if (chatId && chatInfoQuery.isError) {
    return null;
  }

  return (
    <div className={classes.main}>
      <AiStatusBanner />
      {hasMessages ? (
        <>
          <ChatMessageList
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            streamingToolCalls={streamingToolCalls}
          />
          {error && (
            <div
              data-testid="chat-error"
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--mantine-spacing-xs)",
                padding: "var(--mantine-spacing-sm) var(--mantine-spacing-lg)",
                color: "var(--mantine-color-red-6)",
                fontSize: "var(--mantine-font-size-sm)",
              }}
            >
              <span>{error}</span>
              {isRetryable && (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  onClick={retry}
                >
                  {t("Retry")}
                </Button>
              )}
            </div>
          )}
          <div className={classes.inputArea}>
            <div className={classes.inputToolbar}>
              <ChatScopeSwitcher value={scope} onChange={setScope} disabled={isStreaming} />
              <ChatModelPicker value={model} onChange={setModel} disabled={isStreaming} />
            </div>
            <ChatInput
              isStreaming={isStreaming}
              onSend={handleSend}
              onStop={stopGeneration}
              chatId={chatId}
            />
          </div>
        </>
      ) : (
        <>
          <div className={classes.inputToolbar}>
            <ChatScopeSwitcher value={scope} onChange={setScope} disabled={isStreaming} />
            <ChatModelPicker value={model} onChange={setModel} disabled={isStreaming} />
          </div>
          <ChatEmptyState
            isStreaming={isStreaming}
            onSend={handleSend}
            onStop={stopGeneration}
          />
        </>
      )}
    </div>
  );
}
