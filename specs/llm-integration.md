# LLM Integration

## Overview

Grimm uses Gemini 2.0 Flash via OpenRouter to process audio commands and generate responses. The audio is sent directly to the LLM without transcription.

## Provider

**OpenRouter** - Unified API for multiple LLM providers

## Model

| Property | Value |
|----------|-------|
| Model ID | `google/gemini-2.0-flash-001` |
| Provider | Google AI Studio |
| Context Window | 1,048,576 tokens |
| Max Output | 8,192 tokens |
| Audio Support | Yes (native) |

## Endpoint

```
POST https://openrouter.ai/api/v1/chat/completions
```

## Authentication

```typescript
const headers = {
  "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://grimm.local",  // Optional: your app URL
  "X-Title": "Grimm Smart Speaker",        // Optional: your app name
};
```

## Pricing

| Token Type | Price |
|------------|-------|
| Input (text) | $0.10 / 1M tokens |
| Output | $0.40 / 1M tokens |
| Audio Input | $0.70 / 1M tokens |

Audio token conversion: ~32 tokens per second of audio

## Request Format

### Basic Text Request

```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers,
  body: JSON.stringify({
    model: "google/gemini-2.0-flash-001",
    messages: [
      { role: "system", content: "You are a helpful voice assistant." },
      { role: "user", content: "What time is it?" }
    ]
  })
});
```

### Audio Input Request

```typescript
// Convert audio to base64
const audioBase64 = Buffer.from(audioBuffer).toString("base64");

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers,
  body: JSON.stringify({
    model: "google/gemini-2.0-flash-001",
    messages: [
      {
        role: "system",
        content: "You are Grimm, a helpful voice assistant. Keep responses concise and conversational."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please respond to this audio message:"
          },
          {
            type: "input_audio",
            input_audio: {
              data: audioBase64,
              format: "wav"  // or "mp3", "ogg", "flac"
            }
          }
        ]
      }
    ]
  })
});
```

### Request with Tools (Function Calling)

```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers,
  body: JSON.stringify({
    model: "google/gemini-2.0-flash-001",
    messages: [
      {
        role: "system",
        content: "You are Grimm, a voice assistant with access to various tools."
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Respond to this audio:" },
          {
            type: "input_audio",
            input_audio: { data: audioBase64, format: "wav" }
          }
        ]
      }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "spotify_play",
          description: "Play music on Spotify",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Artist, song, or album to play"
              }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "set_timer",
          description: "Set a timer",
          parameters: {
            type: "object",
            properties: {
              duration: {
                type: "number",
                description: "Timer duration in seconds"
              },
              label: {
                type: "string",
                description: "Optional label for the timer"
              }
            },
            required: ["duration"]
          }
        }
      }
    ],
    tool_choice: "auto"
  })
});
```

## Response Format

### Standard Response

```typescript
interface ChatCompletion {
  id: string;
  choices: [{
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "tool_calls";
  }];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### Tool Call Response

```typescript
interface ToolCallResponse {
  id: string;
  choices: [{
    message: {
      role: "assistant";
      content: null;
      tool_calls: [{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;  // JSON string
        };
      }];
    };
    finish_reason: "tool_calls";
  }];
}
```

## Audio Encoding

### Convert PCM to WAV Base64

```typescript
function pcmToWavBase64(pcmData: Int16Array, sampleRate: number): string {
  // WAV header
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const byteLength = pcmData.length * 2;

  // "RIFF" chunk descriptor
  view.setUint32(0, 0x46464952, true);  // "RIFF"
  view.setUint32(4, 36 + byteLength, true);  // File size - 8
  view.setUint32(8, 0x45564157, true);  // "WAVE"

  // "fmt " sub-chunk
  view.setUint32(12, 0x20746d66, true);  // "fmt "
  view.setUint32(16, 16, true);  // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true);  // NumChannels (1 for mono)
  view.setUint32(24, sampleRate, true);  // SampleRate
  view.setUint32(28, sampleRate * 2, true);  // ByteRate
  view.setUint16(32, 2, true);  // BlockAlign
  view.setUint16(34, 16, true);  // BitsPerSample

  // "data" sub-chunk
  view.setUint32(36, 0x61746164, true);  // "data"
  view.setUint32(40, byteLength, true);  // Subchunk2Size

  // Combine header and PCM data
  const wav = new Uint8Array(44 + byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(new Uint8Array(pcmData.buffer), 44);

  return Buffer.from(wav).toString("base64");
}
```

## Supported Audio Formats

| Format | MIME Type | Notes |
|--------|-----------|-------|
| WAV | `audio/wav` | Recommended (no compression) |
| MP3 | `audio/mp3` | Compressed |
| OGG | `audio/ogg` | Compressed |
| FLAC | `audio/flac` | Lossless compressed |
| AAC | `audio/aac` | Compressed |

## System Prompt

```typescript
const SYSTEM_PROMPT = `You are Grimm, a helpful voice assistant.

Guidelines:
- Keep responses concise and conversational
- Speak naturally, as if having a conversation
- Don't use markdown formatting (responses will be spoken aloud)
- If you need to use a tool, explain what you're doing
- Be friendly but not overly enthusiastic

You have access to various tools to help users with tasks like:
- Playing music
- Controlling smart home devices
- Setting timers and reminders
- Getting weather information
`;
```

## Error Handling

```typescript
async function callLLM(messages: Message[], tools?: Tool[]): Promise<LLMResponse> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages,
        tools,
        tool_choice: tools ? "auto" : undefined
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new LLMError(error.error?.message || "Unknown error", response.status);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof LLMError) throw error;
    throw new LLMError("Network error", 0);
  }
}

class LLMError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "LLMError";
  }
}
```

## Multi-turn Tool Calling

When the LLM requests a tool call, execute it and send the result back:

```typescript
async function processWithTools(
  audio: Int16Array,
  plugins: Plugin[]
): Promise<string> {
  const tools = plugins.flatMap(p => p.tools.map(t => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  })));

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: "Respond to this audio:" },
        { type: "input_audio", input_audio: { data: pcmToWavBase64(audio, 16000), format: "wav" } }
      ]
    }
  ];

  let response = await callLLM(messages, tools);

  // Handle tool calls
  while (response.choices[0].finish_reason === "tool_calls") {
    const toolCalls = response.choices[0].message.tool_calls;

    // Add assistant's tool call message
    messages.push(response.choices[0].message);

    // Execute each tool and add results
    for (const toolCall of toolCalls) {
      const tool = plugins
        .flatMap(p => p.tools)
        .find(t => t.name === toolCall.function.name);

      if (tool) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await tool.execute(args);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }

    // Get next response
    response = await callLLM(messages, tools);
  }

  return response.choices[0].message.content;
}
```

## Rate Limits

OpenRouter applies rate limits based on your plan. Handle rate limit errors:

```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get("Retry-After");
  // Wait and retry
}
```
