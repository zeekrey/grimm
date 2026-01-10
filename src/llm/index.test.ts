import { describe, expect, test, mock, beforeEach } from "bun:test";
import { LLMClient, LLMError, pcmToWav, pcmToWavBase64, calculateDuration, estimateAudioTokens } from "./index";

// Store original fetch for restoration
const originalFetch = globalThis.fetch;

describe("Audio Utilities", () => {
  describe("pcmToWav", () => {
    test("creates valid WAV header", () => {
      const pcm = new Int16Array([0, 1000, -1000, 0]);
      const wav = pcmToWav(pcm, 16000);

      // Check RIFF header
      expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe("RIFF");
      expect(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])).toBe("WAVE");
      expect(String.fromCharCode(wav[12], wav[13], wav[14], wav[15])).toBe("fmt ");
      expect(String.fromCharCode(wav[36], wav[37], wav[38], wav[39])).toBe("data");
    });

    test("sets correct file size", () => {
      const pcm = new Int16Array(100);
      const wav = pcmToWav(pcm, 16000);

      const view = new DataView(wav.buffer);
      const fileSize = view.getUint32(4, true);

      // File size should be 36 + data size (100 * 2 bytes)
      expect(fileSize).toBe(36 + 200);
    });

    test("sets correct sample rate", () => {
      const pcm = new Int16Array(100);
      const wav = pcmToWav(pcm, 44100);

      const view = new DataView(wav.buffer);
      const sampleRate = view.getUint32(24, true);

      expect(sampleRate).toBe(44100);
    });

    test("includes PCM data after header", () => {
      const pcm = new Int16Array([1000, -1000]);
      const wav = pcmToWav(pcm, 16000);

      // Data starts at byte 44
      const dataView = new DataView(wav.buffer);
      expect(dataView.getInt16(44, true)).toBe(1000);
      expect(dataView.getInt16(46, true)).toBe(-1000);
    });

    test("handles empty audio", () => {
      const pcm = new Int16Array(0);
      const wav = pcmToWav(pcm, 16000);

      // Should still have 44-byte header
      expect(wav.length).toBe(44);
    });
  });

  describe("pcmToWavBase64", () => {
    test("returns valid base64 string", () => {
      const pcm = new Int16Array([0, 1000, -1000]);
      const base64 = pcmToWavBase64(pcm, 16000);

      // Should be valid base64
      expect(() => Buffer.from(base64, "base64")).not.toThrow();

      // Decoded should start with RIFF
      const decoded = Buffer.from(base64, "base64");
      expect(decoded.toString("ascii", 0, 4)).toBe("RIFF");
    });
  });

  describe("calculateDuration", () => {
    test("calculates correct duration at 16kHz", () => {
      expect(calculateDuration(16000, 16000)).toBe(1);
      expect(calculateDuration(32000, 16000)).toBe(2);
      expect(calculateDuration(8000, 16000)).toBe(0.5);
    });

    test("calculates correct duration at 44.1kHz", () => {
      expect(calculateDuration(44100, 44100)).toBe(1);
    });

    test("uses default 16kHz sample rate", () => {
      expect(calculateDuration(16000)).toBe(1);
    });
  });

  describe("estimateAudioTokens", () => {
    test("estimates ~32 tokens per second", () => {
      // 1 second = ~32 tokens
      expect(estimateAudioTokens(16000, 16000)).toBe(32);

      // 2 seconds = ~64 tokens
      expect(estimateAudioTokens(32000, 16000)).toBe(64);
    });

    test("rounds up", () => {
      // 0.5 seconds = 16 tokens
      expect(estimateAudioTokens(8000, 16000)).toBe(16);
    });
  });
});

describe("LLMError", () => {
  test("has correct name", () => {
    const error = new LLMError("test", 400);
    expect(error.name).toBe("LLMError");
  });

  test("stores status code", () => {
    const error = new LLMError("test", 401);
    expect(error.statusCode).toBe(401);
  });

  test("stores response body", () => {
    const body = { error: "details" };
    const error = new LLMError("test", 500, body);
    expect(error.responseBody).toEqual(body);
  });
});

describe("LLMClient", () => {
  beforeEach(() => {
    // Restore original env
    delete process.env.OPENROUTER_API_KEY;
  });

  describe("constructor", () => {
    test("throws if no API key provided", () => {
      expect(() => new LLMClient()).toThrow(LLMError);
      expect(() => new LLMClient()).toThrow("OpenRouter API key is required");
    });

    test("accepts API key from options", () => {
      const client = new LLMClient({ apiKey: "test-key" });
      expect(client).toBeInstanceOf(LLMClient);
    });

    test("accepts API key from environment", () => {
      process.env.OPENROUTER_API_KEY = "env-key";
      const client = new LLMClient();
      expect(client).toBeInstanceOf(LLMClient);
    });
  });

  describe("chat", () => {
    test("sends text message and returns response", async () => {
      (globalThis as any).fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: "test-id",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Hello! How can I help you?",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            })
          )
        )
      );

      const client = new LLMClient({ apiKey: "test-key" });
      const response = await client.chat("Hello");

      expect(response).toBe("Hello! How can I help you?");
      expect(globalThis.fetch).toHaveBeenCalled();

      globalThis.fetch = originalFetch;
    });

    test("adds message to history", async () => {
      (globalThis as any).fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: "test-id",
              choices: [
                {
                  message: { role: "assistant", content: "Response" },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            })
          )
        )
      );

      const client = new LLMClient({ apiKey: "test-key" });
      await client.chat("Hello");

      const history = client.getHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({ role: "user", content: "Hello" });
      expect(history[1]).toEqual({ role: "assistant", content: "Response" });

      globalThis.fetch = originalFetch;
    });

    test("throws LLMError on API error", async () => {
      (globalThis as any).fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { message: "Invalid API key" } }),
            { status: 401 }
          )
        )
      );

      const client = new LLMClient({ apiKey: "bad-key" });

      await expect(client.chat("Hello")).rejects.toThrow(LLMError);
      await expect(client.chat("Hello")).rejects.toThrow("Invalid API key");

      globalThis.fetch = originalFetch;
    });
  });

  describe("chatWithAudio", () => {
    test("sends audio message with correct format", async () => {
      let capturedBody: any;
      (globalThis as any).fetch = mock((url: any, options: any) => {
        capturedBody = JSON.parse(options?.body as string);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "test-id",
              choices: [
                {
                  message: { role: "assistant", content: "I heard you" },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 },
            })
          )
        );
      });

      const client = new LLMClient({ apiKey: "test-key" });
      const audio = new Int16Array([0, 1000, -1000, 0]);
      const response = await client.chatWithAudio(audio);

      expect(response).toBe("I heard you");

      // Check that audio was sent correctly
      const userMessage = capturedBody.messages.find((m: any) => m.role === "user");
      expect(Array.isArray(userMessage.content)).toBe(true);
      expect(userMessage.content[1].type).toBe("input_audio");
      expect(userMessage.content[1].input_audio.format).toBe("wav");
      expect(typeof userMessage.content[1].input_audio.data).toBe("string");

      globalThis.fetch = originalFetch;
    });
  });

  describe("clearHistory", () => {
    test("clears conversation history", async () => {
      (globalThis as any).fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: "test-id",
              choices: [
                {
                  message: { role: "assistant", content: "Response" },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            })
          )
        )
      );

      const client = new LLMClient({ apiKey: "test-key" });
      await client.chat("Hello");
      expect(client.getHistory().length).toBe(2);

      client.clearHistory();
      expect(client.getHistory().length).toBe(0);

      globalThis.fetch = originalFetch;
    });
  });

  describe("tool calls", () => {
    test("executes tools and returns final response", async () => {
      let callCount = 0;
      (globalThis as any).fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          // First call: LLM requests tool call
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: "test-id",
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "call_123",
                          type: "function",
                          function: {
                            name: "get_weather",
                            arguments: '{"location":"New York"}',
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
                usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
              })
            )
          );
        } else {
          // Second call: LLM responds with final answer
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: "test-id-2",
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: "The weather in New York is sunny and 72°F.",
                    },
                    finish_reason: "stop",
                  },
                ],
                usage: { prompt_tokens: 150, completion_tokens: 15, total_tokens: 165 },
              })
            )
          );
        }
      });

      const client = new LLMClient({ apiKey: "test-key" });
      const audio = new Int16Array([0, 1000, -1000, 0]);

      const tools = [
        {
          type: "function" as const,
          function: {
            name: "get_weather",
            description: "Get weather for a location",
            parameters: {
              type: "object" as const,
              properties: {
                location: { type: "string", description: "City name" },
              },
              required: ["location"],
            },
          },
        },
      ];

      const executors = [
        {
          name: "get_weather",
          execute: async (args: Record<string, unknown>) => ({
            temperature: 72,
            condition: "sunny",
            location: args.location,
          }),
        },
      ];

      const response = await client.chatWithAudioAndTools(audio, tools, executors);

      expect(response).toBe("The weather in New York is sunny and 72°F.");
      expect(callCount).toBe(2);

      globalThis.fetch = originalFetch;
    });
  });
});
