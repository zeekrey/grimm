# Audio Capture

## Overview

Audio capture handles the microphone input for Grimm. It provides a continuous stream of audio frames to the wake word detector and VAD.

## Platform

**Target:** Linux / Raspberry Pi
**Audio System:** ALSA (Advanced Linux Sound Architecture)

## Dependencies

```bash
# System dependencies (Raspberry Pi / Linux)
sudo apt-get install alsa-utils libasound2-dev

# Bun package
bun add mic @picovoice/pvrecorder-node
```

## Audio Format Requirements

| Parameter | Value | Required By |
|-----------|-------|-------------|
| Sample Rate | 16000 Hz | Porcupine, Cobra |
| Bit Depth | 16-bit | Porcupine, Cobra |
| Encoding | Signed Integer PCM | Porcupine, Cobra |
| Channels | Mono | Porcupine, Cobra |
| Frame Length | 512 samples | Porcupine |

## Option 1: PvRecorder (Recommended)

Picovoice provides PvRecorder, optimized for use with Porcupine and Cobra.

```typescript
import { PvRecorder } from "@picovoice/pvrecorder-node";

// List available audio devices
const devices = PvRecorder.getAvailableDevices();
console.log(devices);

// Create recorder with frame length matching Porcupine
const recorder = new PvRecorder(
  512,  // frameLength (must match porcupine.frameLength)
  0     // deviceIndex (-1 for default)
);

// Start recording
recorder.start();

// Read frames in a loop
while (isRecording) {
  const frame = recorder.read();  // Returns Int16Array
  processFrame(frame);
}

// Stop and cleanup
recorder.stop();
recorder.release();
```

## Option 2: mic Package

Alternative using the `mic` npm package.

```typescript
import mic from "mic";

const micInstance = mic({
  rate: "16000",
  channels: "1",
  bitwidth: "16",
  encoding: "signed-integer",
  endian: "little",
  device: "default",  // or specific ALSA device
});

const micInputStream = micInstance.getAudioStream();

micInputStream.on("data", (data: Buffer) => {
  // Convert Buffer to Int16Array
  const frame = new Int16Array(
    data.buffer,
    data.byteOffset,
    data.length / 2
  );
  processFrame(frame);
});

micInputStream.on("error", (err) => {
  console.error("Microphone error:", err);
});

micInstance.start();

// Stop recording
micInstance.stop();
```

## Audio Channel Abstraction

To support both real microphone and emulation mode, use an abstraction:

```typescript
interface AudioChannel {
  start(): void;
  stop(): void;
  onFrame(callback: (frame: Int16Array) => void): void;
  getSampleRate(): number;
  getFrameLength(): number;
}
```

### Microphone Channel Implementation

```typescript
import { PvRecorder } from "@picovoice/pvrecorder-node";

class MicrophoneChannel implements AudioChannel {
  private recorder: PvRecorder;
  private frameCallback: ((frame: Int16Array) => void) | null = null;
  private isRunning = false;

  constructor(frameLength: number, deviceIndex: number = -1) {
    this.recorder = new PvRecorder(frameLength, deviceIndex);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.recorder.start();
    this.readLoop();
  }

  private async readLoop(): Promise<void> {
    while (this.isRunning) {
      const frame = this.recorder.read();
      if (this.frameCallback) {
        this.frameCallback(frame);
      }
    }
  }

  stop(): void {
    this.isRunning = false;
    this.recorder.stop();
  }

  onFrame(callback: (frame: Int16Array) => void): void {
    this.frameCallback = callback;
  }

  getSampleRate(): number {
    return 16000; // PvRecorder always uses 16kHz
  }

  getFrameLength(): number {
    return this.recorder.frameLength;
  }

  release(): void {
    this.stop();
    this.recorder.release();
  }
}
```

### Emulated Channel Implementation

```typescript
class EmulatedChannel implements AudioChannel {
  private audioBuffer: Int16Array;
  private frameLength: number;
  private frameCallback: ((frame: Int16Array) => void) | null = null;
  private isRunning = false;
  private position = 0;

  constructor(audioBuffer: Int16Array, frameLength: number) {
    this.audioBuffer = audioBuffer;
    this.frameLength = frameLength;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.position = 0;
    this.emitLoop();
  }

  private async emitLoop(): Promise<void> {
    const frameInterval = (this.frameLength / 16000) * 1000; // ms per frame

    while (this.isRunning && this.position < this.audioBuffer.length) {
      const frame = this.audioBuffer.slice(
        this.position,
        this.position + this.frameLength
      );

      // Pad with zeros if needed
      if (frame.length < this.frameLength) {
        const padded = new Int16Array(this.frameLength);
        padded.set(frame);
        if (this.frameCallback) this.frameCallback(padded);
      } else {
        if (this.frameCallback) this.frameCallback(frame);
      }

      this.position += this.frameLength;
      await new Promise((resolve) => setTimeout(resolve, frameInterval));
    }

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

## ALSA Configuration

### List Audio Devices

```bash
# List recording devices
arecord -l

# List playback devices
aplay -l
```

### Test Recording

```bash
# Record 5 seconds of audio
arecord -d 5 -f S16_LE -r 16000 -c 1 test.wav

# Play back
aplay test.wav
```

### USB Microphone Setup

For Raspberry Pi with USB microphone:

```bash
# Create/edit ALSA config
sudo nano /etc/asound.conf
```

```
pcm.!default {
    type asym
    playback.pcm {
        type plug
        slave.pcm "hw:0,0"  # Built-in audio
    }
    capture.pcm {
        type plug
        slave.pcm "hw:1,0"  # USB microphone
    }
}
```

## Error Handling

```typescript
class MicrophoneChannel implements AudioChannel {
  // ...

  start(): void {
    try {
      this.recorder.start();
    } catch (error) {
      if (error.message.includes("device")) {
        throw new Error("Microphone device not found. Check ALSA configuration.");
      }
      throw error;
    }
  }
}
```

## Frame Timing

```
Frame Length: 512 samples
Sample Rate: 16000 Hz
Frame Duration: 512 / 16000 = 0.032 seconds = 32 ms

Frames per second: 16000 / 512 ≈ 31.25 frames/sec
```

## Buffer Considerations

For audio buffering during command recording:

```typescript
// 30 seconds of audio at 16kHz
const maxDurationMs = 30000;
const sampleRate = 16000;
const maxSamples = (maxDurationMs / 1000) * sampleRate; // 480,000 samples
const bytesRequired = maxSamples * 2; // 960,000 bytes (16-bit = 2 bytes)
```
