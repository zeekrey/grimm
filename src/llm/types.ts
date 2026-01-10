/**
 * LLM Types for OpenRouter/Gemini Integration
 */

/**
 * Message content types
 */
export interface TextContent {
  type: "text";
  text: string;
}

export interface AudioContent {
  type: "input_audio";
  input_audio: {
    data: string; // Base64 encoded audio
    format: "wav" | "mp3" | "ogg" | "flac" | "aac";
  };
}

export type MessageContent = string | (TextContent | AudioContent)[];

/**
 * Chat message types
 */
export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: MessageContent;
}

export interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

/**
 * Tool definitions
 */
export interface ToolFunction {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface Tool {
  type: "function";
  function: ToolFunction;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * API Response types
 */
export interface ChatCompletionChoice {
  index: number;
  message: AssistantMessage;
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: ChatCompletionUsage;
}

/**
 * LLM Client options
 */
export interface LLMClientOptions {
  /** OpenRouter API key (defaults to OPENROUTER_API_KEY env var) */
  apiKey?: string;
  /** Model to use (defaults to google/gemini-2.0-flash-001) */
  model?: string;
  /** System prompt */
  systemPrompt?: string;
  /** HTTP Referer header for OpenRouter */
  referer?: string;
  /** App name for OpenRouter */
  appName?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * LLM Request options
 */
export interface LLMRequestOptions {
  /** Tools available for this request */
  tools?: Tool[];
  /** Tool choice: "auto", "none", or specific tool */
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
}

/**
 * LLM Error class
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: unknown
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * Tool executor interface
 */
export interface ToolExecutor {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}
