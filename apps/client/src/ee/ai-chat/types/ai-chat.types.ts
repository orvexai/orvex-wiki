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

// The frame vocabulary PINNED in orvex-studio-contracts sse/AI-CHAT.md —
// ratified from the real, merged ENG-1450 producer (orvex-studio-ai
// internal/chat/types.go FrameType consts + internal/stream/sse.go), NOT
// the stale fork-client shape this file used to carry (chat_created/
// content/stream_state/citation_preview/done{messageId,citations[]}) —
// see ENG-1359 pass6-followup ruling. `errCode` values are the closed set
// from FrameType's error codes: CURRENT_PAGE_REQUIRED, SPEND_CAP_REACHED,
// MODEL_STREAM_FAILED, FORBIDDEN_PAGE. There is no `retryable` boolean on
// the wire — the client derives it from `errCode` (ERROR_RETRYABLE below).
export type AiChatStreamEvent =
  | { type: 'chat_id'; chatId: string }
  | { type: 'state'; chatId?: string; state: 'connecting' | 'streaming' | 'done' | 'error' }
  | { type: 'banner'; chatId?: string; model?: string; scope?: 'page' | 'workspace'; health?: string }
  | { type: 'token'; token: string }
  // KNOWN GAP (pinned honestly in sse/AI-CHAT.md, not fabricated here): the
  // producer's RunChat never constructs this frame today — `citation` is a
  // bare string on the wire (no id/pageId/url/title), so it CANNOT be
  // assembled into an AiChatCitation without inventing fields. Tracked as a
  // raw string only; citation-hover-card rendering stays unreachable until
  // a producer follow-up wires structured citations onto this frame.
  | { type: 'citation'; citation: string }
  | { type: 'cap'; errCode: string }
  | { type: 'error'; chatId?: string; errCode?: string; errMsg?: string }
  | { type: 'keepalive' };

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
