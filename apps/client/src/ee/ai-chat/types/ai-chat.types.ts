export type AiChat = {
  id: string;
  workspaceId: string;
  creatorId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiChatToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
};

export type AiChatMessage = {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls: AiChatToolCall[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  citations?: AiChatCitation[];
};

export type AiChatCitation = {
  id: string;
  pageId: string;
  title: string;
  url: string;
  spaceSlug?: string;
  slugId?: string;
  snippet?: string;
};

export type AiChatStreamEvent =
  | { type: 'chat_created'; chatId: string }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; result: unknown }
  | { type: 'stream_state'; state: string }
  | { type: 'reasoning'; text: string }
  | { type: 'done'; messageId: string; usage?: Record<string, number>; citations?: AiChatCitation[] }
  | { type: 'error'; message: string; code?: string; retryable?: boolean };

// The wire shape is looser than the known union above — a future AI service
// version may emit event types this client doesn't understand yet (AC8
// forward-compat). Parse into this shape, then narrow against
// AiChatStreamEvent's known `type` values before dispatching; anything else
// is a no-op.
export type AiChatStreamEventWire = { type: string; [key: string]: unknown };

export type AiHealthStatus = {
  litellmDown: boolean;
  hardCapReached: boolean;
  budgetPercent: number;
};

export type AiModel = {
  id: string;
  label: string;
};

export type PageMention = {
  id: string;
  title: string;
  slugId: string;
  spaceSlug?: string;
  icon?: string;
};

export type ChatAttachment = {
  id: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  mimeType: string;
};

// Added by the ai-chat thin-client port (ENG-1359): the client forwards the
// user's model/scope selection verbatim — it never decides model
// capabilities (that logic lives behind the seam in orvex-studio-ai).
export type SendArgs = {
  content: string;
  mentions: PageMention[];
  attachments: ChatAttachment[];
  contextPageId?: string;
  scope?: 'page' | 'workspace';
  model?: string;
};
