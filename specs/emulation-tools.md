# Emulation Tools

## Overview

Emulation tools allow testing Grimm without physical microphone hardware. This is essential for development, CI/CD, and debugging.

## Purpose

- **Development:** Test changes without speaking to a microphone
- **CI/CD:** Run automated tests in headless environments
- **Debugging:** Reproduce specific inputs consistently
- **Demo:** Showcase functionality without hardware setup

## Emulation Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      Emulation Mode                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   1. Text Input                                                   │
│      ┌─────────────────────────────────────────┐                 │
│      │ grimm --emulate "What's the weather?"   │                 │
│      └───────────────────┬─────────────────────┘                 │
│                          │                                        │
│   2. Text-to-Speech                                               │
│      ┌───────────────────▼─────────────────────┐                 │
│      │        ElevenLabs TTS                    │                 │
│      │        "What's the weather?"             │                 │
│      │              ↓                           │                 │
│      │         Audio Buffer                     │                 │
│      └───────────────────┬─────────────────────┘                 │
│                          │                                        │
│   3. Inject into Audio Channel                                    │
│      ┌───────────────────▼─────────────────────┐                 │
│      │      Emulated Audio Channel              │                 │
│      │      (replaces MicrophoneChannel)        │                 │
│      └───────────────────┬─────────────────────┘                 │
│                          │                                        │
│   4. Normal Pipeline                                              │
│      ┌───────────────────▼─────────────────────┐                 │
│      │  Wake Word → VAD → LLM → TTS → Speaker  │                 │
│      └─────────────────────────────────────────┘                 │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## CLI Commands

### Emulate Text Command

```bash
# Convert text to speech and inject into pipeline
grimm --emulate "What time is it?"

# Short form
grimm -e "Play some jazz music"
```

### Emulate Wake Word Only

```bash
# Trigger wake word detection directly (skip audio conversion)
grimm --emulate-wake

# Then wait for actual microphone input for the command
```

### Emulate Audio File

```bash
# Inject existing audio file into pipeline
grimm --emulate-file /path/to/command.wav

# Supports: .wav, .mp3, .ogg, .flac
```

### Skip Wake Word

```bash
# Process audio without waiting for wake word
grimm --emulate "Set a timer for 5 minutes" --skip-wake

# Useful for testing VAD and LLM directly
```

### Dry Run

```bash
# Show what would happen without executing
grimm --emulate "Turn on the lights" --dry-run
```

## Audio Channel Abstraction

The key to emulation is the audio channel abstraction that provides a unified interface:

```typescript
interface AudioChannel {
  start(): void;
  stop(): void;
  onFrame(callback: (frame: Int16Array) => void): void;
  getSampleRate(): number;
  getFrameLength(): number;
}

// Real microphone
class MicrophoneChannel implements AudioChannel { ... }

// Emulated input
class EmulatedChannel implements AudioChannel { ... }

// Factory function
function createAudioChannel(mode: "real" | "emulated", options?: EmulatedOptions): AudioChannel {
  if (mode === "emulated") {
    return new EmulatedChannel(options);
  }
  return new MicrophoneChannel();
}
```

## Emulated Channel Implementation

```typescript
interface EmulatedOptions {
  audioBuffer?: Int16Array;
  audioFile?: string;
  textToSpeak?: string;
  includeWakeWord?: boolean;
}

class EmulatedChannel implements AudioChannel {
  private audioBuffer: Int16Array | null = null;
  private frameLength: number = 512;
  private frameCallback: ((frame: Int16Array) => void) | null = null;
  private isRunning = false;
  private position = 0;

  async initialize(options: EmulatedOptions): Promise<void> {
    if (options.textToSpeak) {
      // Convert text to audio using ElevenLabs
      this.audioBuffer = await this.textToAudio(options.textToSpeak);
    } else if (options.audioFile) {
      // Load audio file
      this.audioBuffer = await this.loadAudioFile(options.audioFile);
    } else if (options.audioBuffer) {
      // Use provided buffer
      this.audioBuffer = options.audioBuffer;
    }

    if (options.includeWakeWord && this.audioBuffer) {
      // Prepend wake word audio
      const wakeWordAudio = await this.loadWakeWordAudio();
      this.audioBuffer = this.concatenateAudio(wakeWordAudio, this.audioBuffer);
    }
  }

  private async textToAudio(text: string): Promise<Int16Array> {
    const tts = new TextToSpeech({
      apiKey: process.env.ELEVENLABS_API_KEY!,
      outputFormat: "pcm_16000"  // PCM format for direct use
    });

    const audioBuffer = await tts.synthesize(text);
    return new Int16Array(audioBuffer);
  }

  private async loadAudioFile(path: string): Promise<Int16Array> {
    // Use ffmpeg to convert to required format
    const { spawn } = await import("child_process");

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", path,
        "-f", "s16le",
        "-ar", "16000",
        "-ac", "1",
        "-"
      ]);

      const chunks: Buffer[] = [];
      ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          const buffer = Buffer.concat(chunks);
          resolve(new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2));
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
    });
  }

  private async loadWakeWordAudio(): Promise<Int16Array> {
    // Load pre-recorded wake word audio
    return this.loadAudioFile("./fixtures/wake-word.wav");
  }

  private concatenateAudio(a: Int16Array, b: Int16Array): Int16Array {
    const result = new Int16Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
  }

  start(): void {
    if (!this.audioBuffer) {
      throw new Error("EmulatedChannel not initialized");
    }
    if (this.isRunning) return;

    this.isRunning = true;
    this.position = 0;
    this.emitLoop();
  }

  private async emitLoop(): Promise<void> {
    const frameInterval = (this.frameLength / 16000) * 1000;

    while (this.isRunning && this.position < this.audioBuffer!.length) {
      const endPos = Math.min(this.position + this.frameLength, this.audioBuffer!.length);
      const frame = this.audioBuffer!.slice(this.position, endPos);

      // Pad with zeros if needed
      if (frame.length < this.frameLength) {
        const padded = new Int16Array(this.frameLength);
        padded.set(frame);
        this.frameCallback?.(padded);
      } else {
        this.frameCallback?.(frame);
      }

      this.position += this.frameLength;

      // Simulate real-time by waiting
      await Bun.sleep(frameInterval);
    }

    // Signal end of audio
    this.isRunning = false;
  }

  stop(): void {
    this.isRunning = false;
  }

  onFrame(callback: (frame: Int16Array) => void): void {
    this.frameCallback = callback;
  }

  getSampleRate(): number {
    return 16000;
  }

  getFrameLength(): number {
    return this.frameLength;
  }
}
```

## CLI Implementation

```typescript
// src/cli.ts
import { parseArgs } from "util";

interface CLIOptions {
  emulate?: string;
  emulateWake?: boolean;
  emulateFile?: string;
  skipWake?: boolean;
  dryRun?: boolean;
  help?: boolean;
}

function parseCLI(): CLIOptions {
  const { values } = parseArgs({
    options: {
      emulate: { type: "string", short: "e" },
      "emulate-wake": { type: "boolean" },
      "emulate-file": { type: "string" },
      "skip-wake": { type: "boolean" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  return {
    emulate: values.emulate,
    emulateWake: values["emulate-wake"],
    emulateFile: values["emulate-file"],
    skipWake: values["skip-wake"],
    dryRun: values["dry-run"],
    help: values.help,
  };
}

async function main() {
  const options = parseCLI();

  if (options.help) {
    printHelp();
    return;
  }

  const isEmulated = !!(options.emulate || options.emulateWake || options.emulateFile);

  if (isEmulated) {
    await runEmulated(options);
  } else {
    await runProduction();
  }
}

async function runEmulated(options: CLIOptions) {
  console.log("Running in emulation mode...");

  const channel = new EmulatedChannel();

  if (options.emulate) {
    await channel.initialize({
      textToSpeak: options.emulate,
      includeWakeWord: !options.skipWake,
    });
  } else if (options.emulateFile) {
    await channel.initialize({
      audioFile: options.emulateFile,
      includeWakeWord: !options.skipWake,
    });
  } else if (options.emulateWake) {
    // Just trigger wake word, then switch to real mic
    console.log("Triggering wake word...");
    // Implementation depends on architecture
  }

  if (options.dryRun) {
    console.log("Dry run - would process audio through pipeline");
    return;
  }

  // Start the pipeline with emulated channel
  await startPipeline(channel);
}

function printHelp() {
  console.log(`
Grimm Smart Speaker

Usage:
  grimm [options]

Options:
  -e, --emulate <text>     Emulate voice command with text
  --emulate-wake           Trigger wake word detection
  --emulate-file <path>    Inject audio file into pipeline
  --skip-wake              Skip wake word detection
  --dry-run                Show what would happen
  -h, --help               Show this help message

Examples:
  grimm                                    # Normal mode with microphone
  grimm -e "What's the weather?"           # Emulate text command
  grimm --emulate-file command.wav         # Inject audio file
  grimm -e "Set timer" --skip-wake         # Skip wake word detection
`);
}
```

## Test Fixtures

### Audio Fixtures Directory

```
fixtures/
├── wake-word.wav           # Recording of "porcupine" wake word
├── commands/
│   ├── what-time.wav       # "What time is it?"
│   ├── play-music.wav      # "Play some music"
│   └── set-timer.wav       # "Set a timer for 5 minutes"
└── noise/
    ├── silence.wav         # Pure silence
    ├── background.wav      # Background noise
    └── mixed.wav           # Speech with background noise
```

### Generating Test Audio

```bash
# Generate silence (5 seconds)
ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 5 -c:a pcm_s16le fixtures/noise/silence.wav

# Record wake word
arecord -f S16_LE -r 16000 -c 1 -d 2 fixtures/wake-word.wav
```

## Integration with Tests

```typescript
// tests/pipeline.test.ts
import { describe, it, expect } from "bun:test";
import { EmulatedChannel } from "../src/audio/emulated";
import { Pipeline } from "../src/pipeline";

describe("Pipeline with emulated audio", () => {
  it("processes emulated command", async () => {
    const channel = new EmulatedChannel();
    await channel.initialize({
      textToSpeak: "What time is it?",
      includeWakeWord: true,
    });

    const pipeline = new Pipeline({ audioChannel: channel });
    const result = await pipeline.processOnce();

    expect(result.response).toContain("time");
  });

  it("processes audio file", async () => {
    const channel = new EmulatedChannel();
    await channel.initialize({
      audioFile: "./fixtures/commands/set-timer.wav",
      includeWakeWord: true,
    });

    const pipeline = new Pipeline({ audioChannel: channel });
    const result = await pipeline.processOnce();

    expect(result.toolCalls).toContainEqual(
      expect.objectContaining({ name: "set_timer" })
    );
  });
});
```

## Real-time vs Fast Mode

```typescript
interface EmulatedChannelOptions {
  // ...
  realtime?: boolean;  // Default: true - simulate real-time playback
}

// Fast mode for tests (no delays)
const channel = new EmulatedChannel();
await channel.initialize({
  textToSpeak: "Hello",
  realtime: false,  // Process as fast as possible
});
```
