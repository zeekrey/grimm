/**
 * LLM Integration Module
 *
 * Provides integration with Gemini 2.0 Flash via OpenRouter for processing
 * audio commands and generating responses.
 *
 * @example
 * ```typescript
 * const llm = new LLMClient({
 *   apiKey: process.env.OPENROUTER_API_KEY,
 *   systemPrompt: "You are a helpful voice assistant."
 * });
 *
 * // Send text message
 * const response = await llm.chat("What time is it?");
 *
 * // Send audio message
 * const audioResponse = await llm.chatWithAudio(pcmAudio);
 *
 * // With tools
 * const toolResponse = await llm.chatWithAudio(pcmAudio, {
 *   tools: [spotifyTool, timerTool],
 *   toolChoice: "auto"
 * });
 * ```
 */

import {
  type Message,
  type Tool,
  type ToolCall,
  type ToolExecutor,
  type ChatCompletionResponse,
  type LLMClientOptions,
  type LLMRequestOptions,
  type AssistantMessage,
  LLMError,
} from "./types";
import { pcmToWavBase64 } from "./audio";

// Re-export types
export * from "./types";
export {
  pcmToWavBase64,
  pcmToWav,
  calculateDuration,
  estimateAudioTokens,
} from "./audio";

// Default configuration
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";
const DEFAULT_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_SYSTEM_PROMPT = `You are Grimm, a helpful voice assistant.

Guidelines:
- Keep responses concise and conversational
- Speak naturally, as if having a conversation
- Don't use markdown formatting (responses will be spoken aloud)
- If you need to use a tool, explain what you're doing
- Be friendly but not overly enthusiastic
- Answer in German.
`;

/**
 * LLM Client for OpenRouter/Gemini integration
 */
export class LLMClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly referer: string;
  private readonly appName: string;
  private readonly timeout: number;

  /** Conversation history */
  private messages: Message[] = [];

  constructor(options: LLMClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENROUTER_API_KEY || "";
    this.model = options.model || DEFAULT_MODEL;
    this.systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    this.referer = options.referer || "https://grimm.local";
    this.appName = options.appName || "Grimm Smart Speaker";
    this.timeout = options.timeout || DEFAULT_TIMEOUT;

    if (!this.apiKey) {
      throw new LLMError(
        "OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable.",
        0
      );
    }
  }

  /**
   * Send a text message and get a response
   *
   * @param text - User message text
   * @param options - Request options
   * @returns Assistant response text
   */
  async chat(text: string, options: LLMRequestOptions = {}): Promise<string> {
    this.messages.push({
      role: "user",
      content: text,
    });

    const response = await this.sendRequest(options);
    const assistantMessage = response.choices[0].message;

    this.messages.push(assistantMessage);

    return assistantMessage.content || "";
  }

  /**
   * Send an audio message and get a response
   *
   * @param audio - PCM audio data as Int16Array
   * @param options - Request options
   * @param sampleRate - Audio sample rate (default: 16000)
   * @returns Assistant response text
   */
  async chatWithAudio(
    audio: Int16Array,
    options: LLMRequestOptions = {},
    sampleRate: number = 16000
  ): Promise<string> {
    const audioBase64 = pcmToWavBase64(audio, sampleRate);

    this.messages.push({
      role: "user",
      content: [
        { type: "text", text: "Please respond to this audio message:" },
        {
          type: "input_audio",
          input_audio: {
            data: audioBase64,
            format: "wav",
          },
        },
      ],
    });

    const response = await this.sendRequest(options);
    const assistantMessage = response.choices[0].message;

    this.messages.push(assistantMessage);

    return assistantMessage.content || "";
  }

  /**
   * Send an audio message with tool execution support
   *
   * @param audio - PCM audio data as Int16Array
   * @param tools - Available tools
   * @param executors - Tool executors (name -> execute function)
   * @param sampleRate - Audio sample rate (default: 16000)
   * @returns Final assistant response text
   */
  async chatWithAudioAndTools(
    audio: Int16Array,
    tools: Tool[],
    executors: ToolExecutor[],
    sampleRate: number = 16000
  ): Promise<string> {
    const audioBase64 = pcmToWavBase64(audio, sampleRate);

    this.messages.push({
      role: "user",
      content: [
        { type: "text", text: "Please respond to this audio message:" },
        {
          type: "input_audio",
          input_audio: {
            data: audioBase64,
            format: "wav",
          },
        },
      ],
    });

    return this.executeWithTools(tools, executors);
  }

  /**
   * Execute tool calls until we get a final response
   */
  private async executeWithTools(
    tools: Tool[],
    executors: ToolExecutor[]
  ): Promise<string> {
    const executorMap = new Map(executors.map((e) => [e.name, e]));

    let response = await this.sendRequest({ tools, toolChoice: "auto" });
    let assistantMessage = response.choices[0].message;

    // Handle tool calls
    while (
      response.choices[0].finish_reason === "tool_calls" &&
      assistantMessage.tool_calls
    ) {
      this.messages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const executor = executorMap.get(toolCall.function.name);

        if (executor) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executor.execute(args);

            this.messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            this.messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : "Tool execution failed",
              }),
            });
          }
        } else {
          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: `Unknown tool: ${toolCall.function.name}`,
            }),
          });
        }
      }

      // Get next response
      response = await this.sendRequest({ tools, toolChoice: "auto" });
      assistantMessage = response.choices[0].message;
    }

    this.messages.push(assistantMessage);
    return assistantMessage.content || "";
  }

  /**
   * Send request to OpenRouter API
   */
  private async sendRequest(
    options: LLMRequestOptions = {}
  ): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        messages: [
          { role: "system", content: this.systemPrompt },
          ...this.messages,
        ],
      };

      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools;
        body.tool_choice = options.toolChoice || "auto";
      }

      if (options.maxTokens) {
        body.max_tokens = options.maxTokens;
      }

      if (options.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      const response = await fetch(DEFAULT_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.referer,
          "X-Title": this.appName,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text();
        }

        const errorMessage =
          typeof errorBody === "object" &&
          errorBody !== null &&
          "error" in errorBody
            ? (errorBody as { error: { message?: string } }).error?.message ||
              "Unknown error"
            : String(errorBody);

        throw new LLMError(errorMessage, response.status, errorBody);
      }

      return (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMError("Request timeout", 0);
      }

      throw new LLMError(
        error instanceof Error ? error.message : "Unknown error",
        0
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.messages = [];
  }

  /**
   * Get current conversation history
   */
  getHistory(): Message[] {
    return [...this.messages];
  }

  /**
   * Get the last tool calls from the conversation
   */
  getLastToolCalls(): ToolCall[] | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.role === "assistant" && msg.tool_calls) {
        return msg.tool_calls;
      }
    }
    return undefined;
  }
}
