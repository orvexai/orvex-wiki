import api from "@/lib/api-client.ts";
import type {
  AiChat,
  AiChatMessage,
  AiChatStreamEventWire,
  AiHealthStatus,
  AiModel,
  ChatAttachment,
} from "../types/ai-chat.types";
import { IPagination } from "@/lib/types.ts";

export async function createChat(): Promise<AiChat> {
  const req = await api.post<AiChat>("/ai/chats/create");
  return req.data;
}

export async function listChats(params?: {
  limit?: number;
  cursor?: string;
}): Promise<IPagination<AiChat>> {
  const req = await api.post("/ai/chats", params);
  return req.data;
}

export async function getChatInfo(
  chatId: string,
): Promise<{ chat: AiChat; messages: AiChatMessage[] }> {
  const req = await api.post("/ai/chats/info", { chatId });
  return req.data;
}

export async function deleteChat(chatId: string): Promise<void> {
  await api.post("/ai/chats/delete", { chatId });
}

export async function updateChatTitle(
  chatId: string,
  title: string,
): Promise<void> {
  await api.post("/ai/chats/update", { chatId, title });
}

export async function searchChats(query: string): Promise<AiChat[]> {
  const req = await api.post("/ai/chats/search", { query });
  return req.data;
}

export async function uploadChatFile(
  file: File,
  chatId?: string,
): Promise<ChatAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  if (chatId) {
    formData.append("chatId", chatId);
  }
  return await api.post("/ai/chats/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function getAiHealth(): Promise<AiHealthStatus> {
  const req = await api.post<AiHealthStatus>("/ai/health");
  return req.data;
}

export async function getAiModels(): Promise<AiModel[]> {
  const req = await api.post<AiModel[]>("/ai/models");
  return req.data;
}

export function sendChatMessage(
  params: {
    chatId?: string;
    content: string;
    mentionedPageIds?: string[];
    contextPageId?: string;
    attachmentIds?: string[];
    scope?: "page" | "workspace";
    model?: string;
  },
  onEvent: (event: AiChatStreamEventWire) => void,
  onError?: (error: string) => void,
  onComplete?: () => void,
): AbortController {
  const abortController = new AbortController();

  (async () => {
    try {
      const response = await fetch("/api/ai/chats/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: abortController.signal,
        credentials: "include",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `HTTP error ${response.status}`;
        try {
          const parsed = JSON.parse(errorBody);
          errorMessage = parsed.message || errorMessage;
        } catch {
          // use default
        }
        onError?.(errorMessage);
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        onError?.("Response body is not readable");
        return;
      }

      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            // Per the PINNED wire (orvex-studio-contracts sse/AI-CHAT.md):
            // every frame except `keepalive` is a `data: <json>` line;
            // `keepalive` is a bare SSE COMMENT line (`: keepalive`, no
            // `data:` prefix) — falls through and is ignored here by
            // construction, matching the producer's documented intent
            // ("browsers ignore comment frames"). There is no `[DONE]`
            // sentinel on the real wire — completion is the
            // `{"type":"state","state":"done"}` frame, and `onComplete`
            // fires below when the reader naturally observes the HTTP body
            // close.
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data) as AiChatStreamEventWire;
                onEvent(parsed);
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      onComplete?.();
    } catch (error: any) {
      if (error.name !== "AbortError") {
        onError?.(error.message);
      }
    }
  })();

  return abortController;
}
