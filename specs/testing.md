# Testing

## Overview

Grimm uses Bun's built-in test runner for all testing. This document covers the testing strategy, patterns, and best practices.

## Test Runner

```bash
# Run all tests
bun test

# Run specific test file
bun test src/wake-word/wake-word.test.ts

# Run tests matching pattern
bun test --grep "wake word"

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

## Test Categories

### 1. Unit Tests

Test individual functions and modules in isolation.

```typescript
// src/utils/audio.test.ts
import { describe, it, expect } from "bun:test";
import { pcmToWavBase64, concatenateAudio } from "./audio";

describe("pcmToWavBase64", () => {
  it("converts PCM data to WAV base64", () => {
    const pcm = new Int16Array([0, 100, -100, 0]);
    const result = pcmToWavBase64(pcm, 16000);

    expect(result).toBeString();
    expect(result.length).toBeGreaterThan(0);

    // Verify WAV header
    const decoded = Buffer.from(result, "base64");
    expect(decoded.slice(0, 4).toString()).toBe("RIFF");
    expect(decoded.slice(8, 12).toString()).toBe("WAVE");
  });

  it("handles empty audio", () => {
    const pcm = new Int16Array(0);
    const result = pcmToWavBase64(pcm, 16000);

    expect(result).toBeString();
  });
});

describe("concatenateAudio", () => {
  it("combines two audio buffers", () => {
    const a = new Int16Array([1, 2, 3]);
    const b = new Int16Array([4, 5, 6]);
    const result = concatenateAudio(a, b);

    expect(result).toEqual(new Int16Array([1, 2, 3, 4, 5, 6]));
  });
});
```

### 2. Integration Tests

Test component interactions with mocked external services.

```typescript
// src/llm/llm.test.ts
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { LLMClient } from "./llm";

describe("LLMClient", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends audio to OpenRouter", async () => {
    globalThis.fetch = mock(async (url, options) => {
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.model).toBe("google/gemini-2.0-flash-001");

      return new Response(JSON.stringify({
        choices: [{
          message: { role: "assistant", content: "The time is 3:00 PM." }
        }]
      }));
    });

    const client = new LLMClient({ apiKey: "test-key" });
    const audioBuffer = new Int16Array([0, 100, 200]);
    const response = await client.processAudio(audioBuffer);

    expect(response).toBe("The time is 3:00 PM.");
  });

  it("handles tool calls", async () => {
    let callCount = 0;
    globalThis.fetch = mock(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: LLM requests tool
        return new Response(JSON.stringify({
          choices: [{
            message: {
              role: "assistant",
              tool_calls: [{
                id: "call_123",
                function: { name: "get_time", arguments: "{}" }
              }]
            },
            finish_reason: "tool_calls"
          }]
        }));
      } else {
        // Second call: Final response
        return new Response(JSON.stringify({
          choices: [{
            message: { role: "assistant", content: "It's 3:00 PM." },
            finish_reason: "stop"
          }]
        }));
      }
    });

    const client = new LLMClient({ apiKey: "test-key" });
    client.registerTool({
      name: "get_time",
      description: "Get current time",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ time: "3:00 PM" })
    });

    const response = await client.processAudio(new Int16Array([0]));
    expect(response).toBe("It's 3:00 PM.");
    expect(callCount).toBe(2);
  });
});
```

### 3. End-to-End Tests

Test the full pipeline using emulation tools.

```typescript
// tests/e2e/pipeline.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Pipeline } from "../../src/pipeline";
import { EmulatedChannel } from "../../src/audio/emulated";

describe("E2E: Full Pipeline", () => {
  let pipeline: Pipeline;

  beforeAll(() => {
    // Skip if no API keys (CI environment)
    if (!process.env.OPENROUTER_API_KEY) {
      console.log("Skipping E2E tests - no API keys");
      return;
    }
  });

  it("processes voice command end-to-end", async () => {
    if (!process.env.OPENROUTER_API_KEY) return;

    const channel = new EmulatedChannel();
    await channel.initialize({
      audioFile: "./fixtures/commands/what-time.wav",
      includeWakeWord: true,
      realtime: false,
    });

    pipeline = new Pipeline({
      audioChannel: channel,
      skipTTS: true,  // Don't play audio in tests
    });

    const result = await pipeline.processOnce();

    expect(result.wakeWordDetected).toBe(true);
    expect(result.speechDetected).toBe(true);
    expect(result.response).toBeDefined();
  });
});
```

## Mocking Strategies

### Mock Picovoice APIs

```typescript
// tests/mocks/picovoice.ts
export class MockPorcupine {
  private shouldDetect: boolean;
  private detectAtFrame: number;
  private frameCount = 0;

  constructor(options: { detectAtFrame?: number } = {}) {
    this.detectAtFrame = options.detectAtFrame ?? 10;
    this.shouldDetect = true;
  }

  process(frame: Int16Array): number {
    this.frameCount++;
    if (this.shouldDetect && this.frameCount === this.detectAtFrame) {
      return 0;  // Keyword detected
    }
    return -1;  // No keyword
  }

  get frameLength() { return 512; }
  get sampleRate() { return 16000; }
  release() {}
}

export class MockCobra {
  private speechProbabilities: number[];
  private frameIndex = 0;

  constructor(probabilities: number[] = [0.8, 0.9, 0.8, 0.3, 0.1, 0.1]) {
    this.speechProbabilities = probabilities;
  }

  process(frame: Int16Array): number {
    const prob = this.speechProbabilities[this.frameIndex] ?? 0.1;
    this.frameIndex++;
    return prob;
  }

  get frameLength() { return 512; }
  get sampleRate() { return 16000; }
  release() {}
}
```

### Using Mocks

```typescript
// src/wake-word/wake-word.test.ts
import { describe, it, expect, mock } from "bun:test";
import { WakeWordDetector } from "./wake-word";
import { MockPorcupine } from "../../tests/mocks/picovoice";

// Mock the import
mock.module("@picovoice/porcupine-node", () => ({
  Porcupine: MockPorcupine,
  BuiltinKeyword: { PORCUPINE: "porcupine" }
}));

describe("WakeWordDetector", () => {
  it("detects wake word", async () => {
    const detector = new WakeWordDetector("fake-key");
    const frames = Array(15).fill(new Int16Array(512));

    let detected = false;
    for (const frame of frames) {
      if (detector.processFrame(frame)) {
        detected = true;
        break;
      }
    }

    expect(detected).toBe(true);
  });
});
```

### Mock API Responses

```typescript
// tests/mocks/api.ts
export const mockOpenRouterResponse = (content: string) => ({
  id: "chatcmpl-123",
  choices: [{
    message: { role: "assistant", content },
    finish_reason: "stop"
  }],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
});

export const mockToolCallResponse = (toolName: string, args: object) => ({
  id: "chatcmpl-123",
  choices: [{
    message: {
      role: "assistant",
      tool_calls: [{
        id: `call_${Date.now()}`,
        type: "function",
        function: { name: toolName, arguments: JSON.stringify(args) }
      }]
    },
    finish_reason: "tool_calls"
  }]
});

export const mockElevenLabsResponse = () => {
  // Return minimal valid MP3 data
  return new ArrayBuffer(100);
};
```

## Test File Structure

```
src/
├── audio/
│   ├── channel.ts
│   ├── channel.test.ts      # Unit tests for channel
│   ├── emulated.ts
│   └── emulated.test.ts
├── wake-word/
│   ├── index.ts
│   └── index.test.ts
├── vad/
│   ├── index.ts
│   └── index.test.ts
├── llm/
│   ├── index.ts
│   └── index.test.ts
├── tts/
│   ├── index.ts
│   └── index.test.ts
├── plugins/
│   ├── loader.ts
│   └── loader.test.ts
└── utils/
    ├── audio.ts
    └── audio.test.ts

tests/
├── mocks/
│   ├── picovoice.ts
│   └── api.ts
├── fixtures/
│   ├── wake-word.wav
│   └── commands/
│       └── what-time.wav
└── e2e/
    └── pipeline.test.ts
```

## Audio Fixtures

### Create Test Fixtures

```bash
# Create fixtures directory
mkdir -p tests/fixtures/commands

# Generate silence (1 second)
ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 1 -c:a pcm_s16le tests/fixtures/silence.wav

# Use TTS to generate test commands
bun run scripts/generate-fixtures.ts
```

### Fixture Generator Script

```typescript
// scripts/generate-fixtures.ts
import { TextToSpeech } from "../src/tts";
import { writeFile } from "fs/promises";

const commands = [
  { file: "what-time.wav", text: "What time is it?" },
  { file: "play-music.wav", text: "Play some jazz music" },
  { file: "set-timer.wav", text: "Set a timer for 5 minutes" },
];

async function main() {
  const tts = new TextToSpeech({
    apiKey: process.env.ELEVENLABS_API_KEY!,
    outputFormat: "pcm_16000"
  });

  for (const cmd of commands) {
    console.log(`Generating ${cmd.file}...`);
    const audio = await tts.synthesize(cmd.text);
    await writeFile(`tests/fixtures/commands/${cmd.file}`, Buffer.from(audio));
  }
}

main();
```

## CI Configuration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run unit tests
        run: bun test --grep "unit"

      - name: Run integration tests (mocked)
        run: bun test --grep "integration"

      # E2E tests only on main with secrets
      - name: Run E2E tests
        if: github.ref == 'refs/heads/main'
        env:
          PICOVOICE_ACCESS_KEY: ${{ secrets.PICOVOICE_ACCESS_KEY }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          ELEVENLABS_API_KEY: ${{ secrets.ELEVENLABS_API_KEY }}
        run: bun test tests/e2e/
```

## Coverage

```bash
# Run with coverage
bun test --coverage

# Output coverage report
bun test --coverage --coverage-reporter=lcov
```

### Coverage Targets

| Category | Target |
|----------|--------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

## Test Utilities

```typescript
// tests/utils.ts
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), ms)
  );
  return Promise.race([promise, timeout]);
}

export function createTestAudio(durationMs: number): Int16Array {
  const samples = Math.floor((durationMs / 1000) * 16000);
  return new Int16Array(samples);
}

export async function loadFixture(name: string): Promise<Int16Array> {
  const file = Bun.file(`tests/fixtures/${name}`);
  const buffer = await file.arrayBuffer();
  return new Int16Array(buffer);
}
```

## Skipping Tests

```typescript
import { describe, it, test } from "bun:test";

// Skip individual test
it.skip("requires hardware", () => {
  // This test won't run
});

// Skip if condition
const hasApiKey = !!process.env.OPENROUTER_API_KEY;
(hasApiKey ? it : it.skip)("calls real API", async () => {
  // Only runs if API key is available
});

// Skip entire suite
describe.skip("Hardware tests", () => {
  // None of these run
});
```
