# Test Audio Fixtures

This directory contains audio files used for testing the emulation tools.

## Generated Files

Run the generator script to create test audio files:

```bash
bun run tests/fixtures/generate-test-audio.ts
```

This creates:
- `silence-1s.wav` - 1 second of silence
- `silence-5s.wav` - 5 seconds of silence
- `tone-440hz-1s.wav` - 440 Hz sine wave (1 second)
- `tone-1000hz-500ms.wav` - 1000 Hz sine wave (500ms)
- `mixed-pattern.wav` - Silence + tone + silence pattern
- `short-burst-100ms.wav` - 100ms tone burst
- `three-frames.wav` - Exactly 3 frames of audio
- `one-frame.wav` - Exactly 1 frame of audio

## Audio Format

All test files use:
- Sample Rate: 16000 Hz
- Bit Depth: 16-bit signed integer
- Channels: Mono (1 channel)
- Format: PCM WAV

This matches the requirements of Porcupine wake word detection.

## Wake Word Test Audio

For testing actual wake word detection, you need a recording of the wake word "Porcupine".

### Option 1: Record Your Own

```bash
# On Linux (with ALSA)
arecord -f S16_LE -r 16000 -c 1 -d 3 tests/fixtures/porcupine-wakeword.wav

# On macOS (with sox)
brew install sox
rec -r 16000 -c 1 -b 16 tests/fixtures/porcupine-wakeword.wav trim 0 3
```

### Option 2: Use Picovoice Resources

Picovoice provides sample audio files in their SDK. Check:
- https://github.com/Picovoice/porcupine/tree/master/resources/audio_samples

### Option 3: Text-to-Speech

Use any TTS service to generate "Porcupine" audio, then convert:

```bash
# Convert to correct format
ffmpeg -i porcupine-tts.mp3 -ar 16000 -ac 1 -f wav tests/fixtures/porcupine-wakeword.wav
```

## Usage in Tests

```typescript
import { EmulatedChannel } from "../../src/audio";

// Load a test audio file
const channel = await EmulatedChannel.fromFile(
  "tests/fixtures/tone-440hz-1s.wav",
  { realtime: false }
);

channel.onFrame((frame) => {
  // Process frame
});

channel.start();
await channel.waitForCompletion();
```
