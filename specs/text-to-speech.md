# Text-to-Speech

## Overview

Text-to-Speech (TTS) converts the LLM's text response into audio that can be played through the speaker. Grimm uses ElevenLabs for high-quality, low-latency speech synthesis.

## Provider

**ElevenLabs** - AI voice generation platform

## Features

- High-quality natural-sounding voices
- Streaming support for low latency
- Multiple voice options
- Multilingual support

## Endpoint

### Standard TTS
```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
```

### Streaming TTS
```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream
```

## Authentication

```typescript
const headers = {
  "xi-api-key": process.env.ELEVENLABS_API_KEY,
  "Content-Type": "application/json",
};
```

## Pricing

| Plan | Characters/Month | Notes |
|------|------------------|-------|
| Free | 10,000 | Limited voices |
| Starter | 30,000 | $5/month |
| Creator | 100,000 | $22/month |

## Voice Options

### Default Voices

| Voice ID | Name | Style |
|----------|------|-------|
| `21m00Tcm4TlvDq8ikWAM` | Rachel | Calm, friendly |
| `AZnzlk1XvdvUeBnXmlld` | Domi | Expressive |
| `EXAVITQu4vr4xnSDxMaL` | Bella | Warm |
| `ErXwobaYiN019PkySvjV` | Antoni | Authoritative |
| `MF3mGyEYCl7XYWbV9V6O` | Elli | Youthful |

### Get Available Voices

```typescript
const response = await fetch("https://api.elevenlabs.io/v1/voices", {
  headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }
});
const { voices } = await response.json();
```

## Request Format

### Standard Request

```typescript
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
  {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: "Hello, how can I help you today?",
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      }
    })
  }
);

const audioBuffer = await response.arrayBuffer();
```

### Streaming Request

```typescript
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
  {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: "Hello, how can I help you today?",
      model_id: "eleven_turbo_v2_5",
      output_format: "mp3_44100_128"
    })
  }
);

// Stream audio chunks
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  playAudioChunk(value);
}
```

## Models

| Model ID | Latency | Quality | Notes |
|----------|---------|---------|-------|
| `eleven_turbo_v2_5` | ~75ms | High | Recommended for real-time |
| `eleven_multilingual_v2` | Higher | Highest | Best quality, multilingual |
| `eleven_monolingual_v1` | Medium | Good | English only |

## Output Formats

| Format | Quality | Size |
|--------|---------|------|
| `mp3_44100_128` | High | Medium |
| `mp3_22050_32` | Medium | Small |
| `pcm_16000` | Raw | Large |
| `pcm_22050` | Raw | Large |
| `pcm_24000` | Raw | Large |

## Voice Settings

| Parameter | Range | Description |
|-----------|-------|-------------|
| `stability` | 0.0 - 1.0 | Higher = more consistent, lower = more expressive |
| `similarity_boost` | 0.0 - 1.0 | How closely to match original voice |
| `style` | 0.0 - 1.0 | Style exaggeration (v2 models only) |
| `use_speaker_boost` | boolean | Enhance voice clarity |

## Complete TTS Module

```typescript
interface TTSConfig {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  stability?: number;
  similarityBoost?: number;
}

class TextToSpeech {
  private apiKey: string;
  private voiceId: string;
  private modelId: string;
  private outputFormat: string;
  private stability: number;
  private similarityBoost: number;

  constructor(config: TTSConfig) {
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
    this.modelId = config.modelId ?? "eleven_turbo_v2_5";
    this.outputFormat = config.outputFormat ?? "mp3_44100_128";
    this.stability = config.stability ?? 0.5;
    this.similarityBoost = config.similarityBoost ?? 0.75;
  }

  async synthesize(text: string): Promise<ArrayBuffer> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          output_format: this.outputFormat,
          voice_settings: {
            stability: this.stability,
            similarity_boost: this.similarityBoost,
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new TTSError(error.detail?.message || "TTS failed", response.status);
    }

    return await response.arrayBuffer();
  }

  async *synthesizeStream(text: string): AsyncGenerator<Uint8Array> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          output_format: this.outputFormat,
          voice_settings: {
            stability: this.stability,
            similarity_boost: this.similarityBoost,
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new TTSError(error.detail?.message || "TTS failed", response.status);
    }

    const reader = response.body!.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  }
}

class TTSError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "TTSError";
  }
}
```

## Audio Playback

### Using ALSA (Linux)

```typescript
import { spawn } from "child_process";

function playAudio(audioBuffer: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use aplay for ALSA playback
    const aplay = spawn("aplay", [
      "-f", "S16_LE",
      "-r", "44100",
      "-c", "2",
      "-"
    ]);

    aplay.stdin.write(Buffer.from(audioBuffer));
    aplay.stdin.end();

    aplay.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`aplay exited with code ${code}`));
    });
  });
}
```

### Using mpv (Alternative)

```typescript
import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

async function playMp3(audioBuffer: ArrayBuffer): Promise<void> {
  const tempFile = join(tmpdir(), `grimm-${Date.now()}.mp3`);

  try {
    await writeFile(tempFile, Buffer.from(audioBuffer));

    await new Promise<void>((resolve, reject) => {
      const mpv = spawn("mpv", ["--no-video", tempFile]);
      mpv.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`mpv exited with code ${code}`));
      });
    });
  } finally {
    await unlink(tempFile).catch(() => {});
  }
}
```

### Streaming Playback

```typescript
import { spawn } from "child_process";

async function playStreamingAudio(
  audioStream: AsyncGenerator<Uint8Array>
): Promise<void> {
  const mpv = spawn("mpv", ["--no-video", "-"]);

  for await (const chunk of audioStream) {
    mpv.stdin.write(chunk);
  }

  mpv.stdin.end();

  return new Promise((resolve, reject) => {
    mpv.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mpv exited with code ${code}`));
    });
  });
}
```

## Error Handling

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 401 | Invalid API key | Check credentials |
| 422 | Invalid request | Check parameters |
| 429 | Rate limited | Wait and retry |
| 500 | Server error | Retry with backoff |

```typescript
async function synthesizeWithRetry(
  tts: TextToSpeech,
  text: string,
  maxRetries = 3
): Promise<ArrayBuffer> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await tts.synthesize(text);
    } catch (error) {
      if (error instanceof TTSError && error.statusCode === 429) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
```

## Latency Optimization

1. **Use streaming** - Start playback before full audio is generated
2. **Use turbo model** - `eleven_turbo_v2_5` has ~75ms latency
3. **Keep text short** - Break long responses into chunks
4. **Pre-warm connection** - Make a test request on startup
