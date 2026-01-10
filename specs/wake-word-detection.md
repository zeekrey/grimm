# Wake Word Detection

## Overview

Wake word detection is the first stage of the Grimm pipeline. It continuously listens for a specific keyword to activate the assistant.

## Technology

**OpenWakeWord** - Open-source, on-device wake word detection using ONNX models.

- GitHub: https://github.com/dscripka/openWakeWord
- No API key required
- Models bundled locally

## Package

```bash
bun add onnxruntime-node
```

## Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| Wake Word | `hey_jarvis` | Default wake word (can also use `alexa`) |
| Sensitivity | `0.5` | Detection sensitivity (0.0 - 1.0) |
| Sample Rate | `16000` Hz | Required by OpenWakeWord |
| Frame Length | `1280` samples | 80ms per frame |
| Bit Depth | 16-bit | Signed integer PCM |
| Channels | Mono | Single channel |

## Models Required

OpenWakeWord uses a pipeline of ONNX models:

1. `melspectrogram.onnx` - Converts audio to mel spectrogram
2. `embedding_model.onnx` - Extracts speech embeddings
3. `hey_jarvis_v0.1.onnx` - Detects the "Hey Jarvis" wake word

Download models:
```bash
bun run models:download
```

Models are downloaded from: https://github.com/dscripka/openWakeWord/releases

## Available Wake Words

Pre-trained wake words available:
- `hey_jarvis` (default)
- `alexa`

Additional wake words can be trained using OpenWakeWord's training tools.

## API Usage

```typescript
import { WakeWordDetector } from "./wake-word";

// Create detector (async factory)
const detector = await WakeWordDetector.create({
  modelPath: "./models",      // Path to ONNX models
  wakeWord: "hey_jarvis",     // Wake word to detect
  sensitivity: 0.5            // Detection threshold
});

// Process audio frames
const detected = await detector.processFrame(audioFrame);

if (detected) {
  console.log("Wake word detected!");
  // Transition to LISTENING_COMMAND state
}

// Cleanup
await detector.release();
```

## Audio Frame Format

```typescript
// Frame must be Int16Array with exactly frameLength samples
const frameLength = detector.getFrameLength();  // 1280
const sampleRate = detector.getSampleRate();    // 16000

// Each frame: 1280 samples at 16kHz = 80ms of audio
const audioFrame: Int16Array = new Int16Array(frameLength);
```

## Return Values

| Value | Meaning |
|-------|---------|
| `true` | Wake word detected |
| `false` | No wake word detected |

## Sensitivity Tuning

| Sensitivity | False Alarms | Missed Detections |
|-------------|--------------|-------------------|
| `0.0` | Very Low | High |
| `0.5` | Balanced | Balanced |
| `1.0` | High | Very Low |

Recommended: Start with `0.5` and adjust based on environment.

## Error Handling

```typescript
import { WakeWordError, WakeWordModelError } from "./wake-word";

try {
  const detector = await WakeWordDetector.create();
} catch (error) {
  if (error instanceof WakeWordModelError) {
    console.error("Models not found - run 'bun run models:download'");
  } else if (error instanceof WakeWordError) {
    console.error("Configuration error:", error.message);
  }
}
```

## Resource Management

```typescript
// Always release resources when done
process.on("SIGINT", async () => {
  await detector.release();
  process.exit();
});
```

## Integration with Audio Channel

```typescript
import { AudioChannel } from "../audio";
import { WakeWordDetector } from "./wake-word";

class WakeWordListener {
  private detector: WakeWordDetector;
  private channel: AudioChannel;

  static async create(channel: AudioChannel): Promise<WakeWordListener> {
    const detector = await WakeWordDetector.create({
      sensitivity: 0.5,
      wakeWord: "hey_jarvis"
    });
    return new WakeWordListener(detector, channel);
  }

  private constructor(detector: WakeWordDetector, channel: AudioChannel) {
    this.detector = detector;
    this.channel = channel;
  }

  async start(): Promise<void> {
    this.channel.onFrame(async (frame) => {
      const detected = await this.detector.processFrame(frame);
      if (detected) {
        this.onWakeWord();
      }
    });
    this.channel.start();
  }

  private onWakeWord(): void {
    console.log("Wake word detected!");
    // Transition to next state
  }

  async release(): Promise<void> {
    this.channel.stop();
    this.channel.release();
    await this.detector.release();
  }
}
```

## OpenWakeWord Processing Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│   Audio     │────▶│ Melspectrogram│────▶│  Embedding  │────▶│  Wake Word  │
│   Frame     │     │    Model      │     │    Model    │     │    Model    │
│  (1280 PCM) │     │   (ONNX)      │     │   (ONNX)    │     │   (ONNX)    │
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────┘
                                                                     │
                                                                     ▼
                                                              ┌─────────────┐
                                                              │   Score     │
                                                              │  (0.0-1.0)  │
                                                              └─────────────┘
```

## Demo Scripts

```bash
# Download models first
bun run models:download

# Run live demo with microphone (no API key needed!)
bun run demo:wake

# Test with emulated audio
bun run test:emulated
bun run test:emulated path/to/hey_jarvis.wav
```

## Comparison with Porcupine

| Feature | OpenWakeWord | Porcupine |
|---------|--------------|-----------|
| License | Apache 2.0 | Proprietary |
| API Key | Not required | Required |
| Cost | Free | Paid (free tier limited) |
| Wake Words | hey_jarvis, alexa + custom | Many built-in + custom |
| Frame Size | 1280 samples (80ms) | 512 samples (32ms) |
| Processing | Async (ONNX) | Sync (native) |
| Model Size | ~5MB | ~3MB |
