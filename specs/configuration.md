# Configuration

## Overview

Grimm uses environment variables for configuration, supporting `.env` files for local development.

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key | `sk-or-v1-...` |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | `xi-...` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `GRIMM_WAKE_WORD` | `hey_jarvis` | Wake word to detect |
| `GRIMM_WAKE_SENSITIVITY` | `0.5` | Wake word sensitivity (0.0-1.0) |
| `GRIMM_MODEL_PATH` | `./models` | Path to ONNX models |
| `GRIMM_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | ElevenLabs voice ID |
| `GRIMM_TTS_MODEL` | `eleven_turbo_v2_5` | ElevenLabs model |
| `GRIMM_LLM_MODEL` | `google/gemini-2.0-flash-001` | OpenRouter model |
| `GRIMM_SPEECH_THRESHOLD` | `0.5` | VAD speech threshold |
| `GRIMM_SILENCE_DURATION` | `700` | Silence duration (ms) |
| `GRIMM_MAX_RECORDING` | `30000` | Max recording duration (ms) |
| `GRIMM_AUDIO_DEVICE` | `-1` | Audio device index (-1 = default) |
| `GRIMM_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

## No API Keys Required for Local Processing

The following components work without any API keys:

- **Wake Word Detection** (OpenWakeWord) - Uses local ONNX models
- **Voice Activity Detection** (Silero VAD) - Uses local ONNX models via avr-vad
- **Audio Recording** (PvRecorder) - Direct microphone access

API keys are only required for cloud services:
- **OpenRouter** - LLM inference
- **ElevenLabs** - Text-to-speech

## Getting API Keys

### OpenRouter API Key

1. Go to https://openrouter.ai/
2. Sign up for an account
3. Go to https://openrouter.ai/keys
4. Create a new API key
5. Copy the key to `OPENROUTER_API_KEY`

**Pricing:** Pay per token, add credits to your account

### ElevenLabs API Key

1. Go to https://elevenlabs.io/
2. Sign up for an account
3. Go to Profile Settings -> API Keys
4. Create a new API key
5. Copy the key to `ELEVENLABS_API_KEY`

**Free tier:** 10,000 characters/month

## .env File

Create a `.env` file in the project root:

```bash
# Required API Keys (for cloud services only)
OPENROUTER_API_KEY=sk-or-v1-your_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here

# Optional Settings
GRIMM_WAKE_WORD=hey_jarvis
GRIMM_WAKE_SENSITIVITY=0.5
GRIMM_MODEL_PATH=./models
GRIMM_VOICE_ID=21m00Tcm4TlvDq8ikWAM
GRIMM_SPEECH_THRESHOLD=0.5
GRIMM_SILENCE_DURATION=700
GRIMM_LOG_LEVEL=info
```

## Loading Configuration

Bun automatically loads `.env` files. Access with `process.env`:

```typescript
interface Config {
  wakeWord: {
    wakeWord: string;
    sensitivity: number;
    modelPath: string;
  };
  openrouter: {
    apiKey: string;
    model: string;
  };
  elevenlabs: {
    apiKey: string;
    voiceId: string;
    model: string;
  };
  vad: {
    speechThreshold: number;
    silenceDuration: number;
    maxRecordingDuration: number;
  };
  audio: {
    deviceIndex: number;
  };
  logLevel: string;
}

function loadConfig(): Config {
  // Validate required keys (only for cloud services)
  const required = [
    "OPENROUTER_API_KEY",
    "ELEVENLABS_API_KEY"
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    wakeWord: {
      wakeWord: process.env.GRIMM_WAKE_WORD ?? "hey_jarvis",
      sensitivity: parseFloat(process.env.GRIMM_WAKE_SENSITIVITY ?? "0.5"),
      modelPath: process.env.GRIMM_MODEL_PATH ?? "./models",
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: process.env.GRIMM_LLM_MODEL ?? "google/gemini-2.0-flash-001",
    },
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY!,
      voiceId: process.env.GRIMM_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
      model: process.env.GRIMM_TTS_MODEL ?? "eleven_turbo_v2_5",
    },
    vad: {
      speechThreshold: parseFloat(process.env.GRIMM_SPEECH_THRESHOLD ?? "0.5"),
      silenceDuration: parseInt(process.env.GRIMM_SILENCE_DURATION ?? "700"),
      maxRecordingDuration: parseInt(process.env.GRIMM_MAX_RECORDING ?? "30000"),
    },
    audio: {
      deviceIndex: parseInt(process.env.GRIMM_AUDIO_DEVICE ?? "-1"),
    },
    logLevel: process.env.GRIMM_LOG_LEVEL ?? "info",
  };
}

export const config = loadConfig();
```

## Configuration File (Optional)

For more complex configuration, support a `grimm.config.ts` file:

```typescript
// grimm.config.ts
import type { GrimmConfig } from "./src/types";

export default {
  wakeWord: "hey_jarvis",
  wakeSensitivity: 0.5,
  modelPath: "./models",
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  ttsModel: "eleven_turbo_v2_5",
  llmModel: "google/gemini-2.0-flash-001",
  systemPrompt: `You are Grimm, a helpful voice assistant.`,
  plugins: [
    "./plugins/spotify",
    "./plugins/timer",
  ],
} satisfies GrimmConfig;
```

## Validation

```typescript
import { z } from "zod";  // Optional: use Zod for validation

const configSchema = z.object({
  wakeWord: z.object({
    wakeWord: z.enum(["hey_jarvis", "alexa"]).default("hey_jarvis"),
    sensitivity: z.number().min(0).max(1).default(0.5),
    modelPath: z.string().default("./models"),
  }),
  openrouter: z.object({
    apiKey: z.string().min(1),
    model: z.string().default("google/gemini-2.0-flash-001"),
  }),
  elevenlabs: z.object({
    apiKey: z.string().min(1),
    voiceId: z.string().default("21m00Tcm4TlvDq8ikWAM"),
    model: z.string().default("eleven_turbo_v2_5"),
  }),
  vad: z.object({
    speechThreshold: z.number().min(0).max(1).default(0.5),
    silenceDuration: z.number().min(100).max(5000).default(700),
    maxRecordingDuration: z.number().min(1000).max(60000).default(30000),
  }),
});
```

## Security

### .gitignore

Always exclude sensitive files:

```gitignore
# Environment files
.env
.env.local
.env.*.local

# Config files with secrets
grimm.config.local.ts
```

### Secret Rotation

If a key is compromised:

1. **OpenRouter:** Delete and create new key in Dashboard
2. **ElevenLabs:** Delete and create new key in Profile

## Development vs Production

### Development (.env.development)

```bash
GRIMM_LOG_LEVEL=debug
GRIMM_AUDIO_DEVICE=-1
```

### Production (.env.production)

```bash
GRIMM_LOG_LEVEL=warn
GRIMM_AUDIO_DEVICE=1  # Specific USB mic
```

Load environment-specific config:

```bash
# Development
bun run start

# Production
NODE_ENV=production bun run start
```

## Model Downloads

Before running Grimm, download the required ONNX models:

```bash
bun run models:download
```

This downloads:
- `melspectrogram.onnx` - Audio preprocessing
- `embedding_model.onnx` - Speech embeddings
- `hey_jarvis_v0.1.onnx` - Wake word model

Models are downloaded to the `./models` directory (configurable via `GRIMM_MODEL_PATH`).
