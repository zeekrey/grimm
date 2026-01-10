# Voice Activity Detection

## Overview

Voice Activity Detection (VAD) is used to detect when the user has finished speaking their command. This enables Grimm to know when to stop recording and send the audio to the LLM.

## Technology

**Silero VAD** - Open-source, on-device voice activity detection using deep learning.

- GitHub: https://github.com/snakers4/silero-vad
- No API key required
- Available via `avr-vad` npm package

## Package

```bash
bun add avr-vad
```

## Why Silero VAD?

| Feature | Silero VAD | Alternatives |
|---------|-----------|--------------|
| Accuracy | 99%+ | Lower |
| Latency | Low (on-device) | Varies |
| Platform | Node.js native | Limited |
| API Key | Not required | Some require |
| License | MIT | Varies |
| Cost | Free | Some paid |

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `speechThreshold` | `0.5` | Probability threshold for speech start |
| `silenceThreshold` | `0.35` | Probability threshold for speech end |
| `silenceDuration` | `700` ms | Duration of silence before considering speech ended |
| `maxRecordingDuration` | `30000` ms | Maximum recording time (safety limit) |
| `minSpeechDuration` | `200` ms | Minimum speech duration before accepting |
| `inputSampleRate` | `16000` Hz | Input audio sample rate |

## API Usage

```typescript
import { VoiceActivityDetector } from "./vad";

// Create detector (async factory)
const vad = await VoiceActivityDetector.create({
  speechThreshold: 0.5,
  silenceThreshold: 0.35,
  silenceDuration: 700,
  maxRecordingDuration: 30000
});

// Process audio frames
const result = await vad.processFrame(audioFrame);

if (result.status === "end") {
  console.log("Speech ended, captured audio:", result.audio);
  // Send audio to transcription
}

// Cleanup
await vad.release();
```

## VAD Result

```typescript
interface VADResult {
  /** Current status: "continue", "end", or "timeout" */
  status: "continue" | "end" | "timeout";

  /** Voice probability for this frame (0.0 to 1.0) */
  probability: number;

  /** Whether speech is currently detected */
  isSpeech: boolean;

  /** Captured audio when status is "end" or "timeout" */
  audio?: Int16Array;
}
```

## Voice Probability

Silero VAD returns a floating-point value between 0.0 and 1.0:

| Probability | Interpretation |
|-------------|----------------|
| `0.0 - 0.3` | Silence or background noise |
| `0.3 - 0.5` | Uncertain (possible speech) |
| `0.5 - 0.7` | Likely speech |
| `0.7 - 1.0` | Definite speech |

## End-of-Speech Detection Logic

```typescript
class EndOfSpeechDetector {
  private speechThreshold = 0.5;
  private silenceDuration = 700; // ms
  private maxDuration = 30000;   // ms

  private silenceStartTime: number | null = null;
  private recordingStartTime: number | null = null;
  private hasDetectedSpeech = false;

  processFrame(voiceProbability: number): "continue" | "end" | "timeout" {
    const now = Date.now();

    // Initialize recording start time
    if (this.recordingStartTime === null) {
      this.recordingStartTime = now;
    }

    // Check max duration
    if (now - this.recordingStartTime > this.maxDuration) {
      return "timeout";
    }

    // Check if speech is detected
    if (voiceProbability > this.speechThreshold) {
      this.hasDetectedSpeech = true;
      this.silenceStartTime = null;
      return "continue";
    }

    // Only start counting silence after speech has been detected
    if (!this.hasDetectedSpeech) {
      return "continue";
    }

    // Start/continue silence timer
    if (this.silenceStartTime === null) {
      this.silenceStartTime = now;
    }

    // Check if silence duration exceeded
    if (now - this.silenceStartTime > this.silenceDuration) {
      return "end";
    }

    return "continue";
  }

  reset(): void {
    this.silenceStartTime = null;
    this.recordingStartTime = null;
    this.hasDetectedSpeech = false;
  }
}
```

## Integration with Wake Word Detection

```
┌─────────────────────────────────────────────────────────────┐
│                     Audio Stream                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              OpenWakeWord (Wake Word Detection)              │
│                                                              │
│   State: LISTENING_WAKE_WORD                                │
│   Output: Wake word detected → Switch to VAD                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ Wake word detected
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Silero VAD (End-of-Speech Detection)            │
│                                                              │
│   State: LISTENING_COMMAND                                  │
│   Actions:                                                   │
│     1. Buffer audio frames                                   │
│     2. Monitor voice probability                             │
│     3. Detect end of speech (probability < threshold)        │
│   Output: Speech ended → Send buffered audio to LLM          │
└─────────────────────────────────────────────────────────────┘
```

## Audio Buffer Management

The VAD automatically buffers audio while listening:

```typescript
// Buffer is managed internally by VoiceActivityDetector
const result = await vad.processFrame(frame);

if (result.status === "end") {
  // Audio buffer is returned with the result
  const capturedAudio = result.audio;
  console.log(`Captured ${capturedAudio.length} samples`);
}

// Reset clears the buffer
vad.reset();
```

## Complete VAD Usage

```typescript
import { VoiceActivityDetector, VADError } from "./vad";

async function captureCommand(): Promise<Int16Array | null> {
  const vad = await VoiceActivityDetector.create({
    speechThreshold: 0.5,
    silenceDuration: 700,
    maxRecordingDuration: 30000
  });

  try {
    while (true) {
      const frame = await getAudioFrame(); // From microphone
      const result = await vad.processFrame(frame);

      if (result.status === "end") {
        return result.audio || null;
      }

      if (result.status === "timeout") {
        console.warn("Recording timeout");
        return result.audio || null;
      }
    }
  } finally {
    await vad.release();
  }
}
```

## Error Handling

```typescript
import { VADError } from "./vad";

try {
  const vad = await VoiceActivityDetector.create();
} catch (error) {
  if (error instanceof VADError) {
    console.error("VAD error:", error.message);
  }
}
```

## Resource Cleanup

```typescript
process.on("SIGINT", async () => {
  await vad.release();
  process.exit();
});
```

## Demo Script

```bash
# Run VAD demo with microphone (no API key needed!)
bun run demo:vad
```

## Frame Size Considerations

Silero VAD uses a frame size of 1536 samples (96ms at 16kHz). This is different from:
- OpenWakeWord: 1280 samples (80ms)
- Original Porcupine: 512 samples (32ms)

When integrating both, you may need to handle different frame sizes or resample.

## Comparison with Cobra VAD

| Feature | Silero VAD | Cobra VAD |
|---------|------------|-----------|
| License | MIT | Proprietary |
| API Key | Not required | Required |
| Cost | Free | Paid |
| Accuracy | 99%+ | 99% |
| Frame Size | 1536 samples | 512 samples |
| npm Package | avr-vad | @picovoice/cobra-node |
