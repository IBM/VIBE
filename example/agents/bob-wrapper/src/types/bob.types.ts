// ─── BOB stream-json event types ───────────────────────────────────────────

export interface BobInitEvent {
  type: "init";
  session_id: string;
  model: string;
}

export interface BobMessageEvent {
  type: "message";
  role: "assistant";
  content: string;
  delta: boolean;
}

export interface BobToolUseEvent {
  type: "tool_use";
  tool_name: string;
  tool_id: string;
  parameters: Record<string, unknown>;
}

export interface BobToolResultEvent {
  type: "tool_result";
  tool_id: string;
  status: string;
  output: string;
}

export interface BobResultEvent {
  type: "result";
  status: string;
  stats: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    session_costs?: number;
  };
}

export type BobEvent =
  | BobInitEvent
  | BobMessageEvent
  | BobToolUseEvent
  | BobToolResultEvent
  | BobResultEvent;

// ─── Conversation / worktree metadata ──────────────────────────────────────

export type ChatMode = "ask" | "code" | "plan" | "advanced";

export interface BobApiMeta {
  conversationId: string;
  sessionId: string | null;
  branch: string;
  createdAt: string;
  mode: ChatMode;
}

// ─── API request / response types ──────────────────────────────────────────

export interface ChatRequest {
  message: string;
  conversationId?: string;
  mode?: ChatMode;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
}

export interface ChatResponse {
  conversationId: string;
  content: string;
  usage: UsageStats;
}

// SSE events

export interface SseDeltaPayload {
  content: string;
}

export interface SseDonePayload extends ChatResponse {}

export interface SseErrorPayload {
  message: string;
}

// Conversation list item

export interface ConversationInfo {
  conversationId: string;
  sessionId: string | null;
  branch: string;
  createdAt: string;
  mode: ChatMode;
}
