/**
 * MicrophoneChannel - Real microphone input using PvRecorder
 *
 * Wraps PvRecorder to provide the AudioChannel interface,
 * allowing seamless swapping with EmulatedChannel for testing.
 */

import { PvRecorder } from "@picovoice/pvrecorder-node";
import { AudioChannel, FrameCallback, AUDIO_FORMAT } from "./types";

/**
 * Options for MicrophoneChannel
 */
export interface MicrophoneChannelOptions {
  /** Audio device index (-1 for default device) */
  deviceIndex?: number;
  /** Frame length in samples (default: 512) */
  frameLength?: number;
}

/**
 * MicrophoneChannel - Real microphone input via PvRecorder
 *
 * @example
 * ```typescript
 * const mic = new MicrophoneChannel({ deviceIndex: -1 });
 *
 * mic.onFrame((frame) => {
 *   // Process audio frame
 *   console.log(`Received ${frame.length} samples`);
 * });
 *
 * mic.start();
 * // ... later
 * mic.stop();
 * mic.release();
 * ```
 */
export class MicrophoneChannel implements AudioChannel {
  private recorder: PvRecorder;
  private frameCallback: FrameCallback | null = null;
  private running: boolean = false;
  private released: boolean = false;
  private readonly frameLength: number;

  /**
   * Creates a new MicrophoneChannel
   *
   * @param options Configuration options
   */
  constructor(options: MicrophoneChannelOptions = {}) {
    const { deviceIndex = -1, frameLength = AUDIO_FORMAT.FRAME_LENGTH } = options;

    this.frameLength = frameLength;
    this.recorder = new PvRecorder(frameLength, deviceIndex);
  }

  /**
   * Start recording and emitting audio frames
   * Frames will be delivered via the callback set with onFrame()
   */
  start(): void {
    if (this.released) {
      throw new Error("MicrophoneChannel has been released");
    }

    if (this.running) {
      return;
    }

    this.running = true;
    this.recorder.start();
    this.recordingLoop();
  }

  /**
   * Internal recording loop that reads frames and emits them
   */
  private async recordingLoop(): Promise<void> {
    while (this.running && !this.released) {
      try {
        const frame = await this.recorder.read();
        if (this.frameCallback && this.running) {
          this.frameCallback(frame);
        }
      } catch (error) {
        if (this.running) {
          console.error("Error reading from microphone:", error);
        }
        break;
      }
    }
  }

  /**
   * Stop recording
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    try {
      this.recorder.stop();
    } catch (error) {
      // Ignore errors when stopping (may already be stopped)
    }
  }

  /**
   * Register a callback to receive audio frames
   * @param callback Function to call with each audio frame
   */
  onFrame(callback: FrameCallback): void {
    this.frameCallback = callback;
  }

  /**
   * Get the audio sample rate
   * @returns Sample rate in Hz (16000)
   */
  getSampleRate(): number {
    return AUDIO_FORMAT.SAMPLE_RATE;
  }

  /**
   * Get the frame length in samples
   * @returns Number of samples per frame
   */
  getFrameLength(): number {
    return this.frameLength;
  }

  /**
   * Check if the channel is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Release all resources held by the channel
   */
  release(): void {
    if (this.released) {
      return;
    }

    this.stop();
    this.released = true;

    try {
      this.recorder.release();
    } catch (error) {
      // Ignore errors during release
    }
  }

  /**
   * Get the name of the selected audio device
   */
  getSelectedDevice(): string {
    return this.recorder.getSelectedDevice();
  }

  /**
   * Get a list of available audio devices
   * @returns Array of device names
   */
  static getAvailableDevices(): string[] {
    return PvRecorder.getAvailableDevices();
  }
}
