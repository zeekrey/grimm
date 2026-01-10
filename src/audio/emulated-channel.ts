/**
 * EmulatedChannel - Emulated audio input from files/buffers
 *
 * Provides the AudioChannel interface using pre-recorded or
 * generated audio data instead of a real microphone.
 * Essential for testing, CI/CD, and development without hardware.
 */

import {
  AudioChannel,
  FrameCallback,
  EmulatedChannelOptions,
  AUDIO_FORMAT,
} from "./types";
import { loadAudioFile, concatenateAudio } from "./utils";

/**
 * EmulatedChannel - Emulated audio input for testing
 *
 * @example
 * ```typescript
 * // Create from audio file
 * const channel = await EmulatedChannel.fromFile("test.wav");
 *
 * channel.onFrame((frame) => {
 *   // Process audio frame
 *   const detected = detector.processFrame(frame);
 * });
 *
 * channel.start();
 * ```
 *
 * @example
 * ```typescript
 * // Create from buffer with fast mode for tests
 * const channel = new EmulatedChannel({
 *   audioBuffer: myAudioData,
 *   realtime: false  // No delays - process as fast as possible
 * });
 * ```
 */
export class EmulatedChannel implements AudioChannel {
  private audioBuffer: Int16Array;
  private frameCallback: FrameCallback | null = null;
  private running: boolean = false;
  private released: boolean = false;
  private position: number = 0;
  private readonly frameLength: number;
  private readonly sampleRate: number;
  private readonly realtime: boolean;
  private emitPromise: Promise<void> | null = null;

  /**
   * Creates a new EmulatedChannel with the provided options
   *
   * @param options Configuration options including audio buffer
   */
  constructor(options: EmulatedChannelOptions = {}) {
    this.frameLength = options.frameLength ?? AUDIO_FORMAT.FRAME_LENGTH;
    this.sampleRate = options.sampleRate ?? AUDIO_FORMAT.SAMPLE_RATE;
    this.realtime = options.realtime ?? true;
    this.audioBuffer = options.audioBuffer ?? new Int16Array(0);
  }

  /**
   * Create an EmulatedChannel from an audio file
   *
   * @param filePath Path to the audio file
   * @param options Additional options
   * @returns EmulatedChannel instance
   */
  static async fromFile(
    filePath: string,
    options: Omit<EmulatedChannelOptions, "audioBuffer" | "audioFile"> = {}
  ): Promise<EmulatedChannel> {
    const audioBuffer = await loadAudioFile(filePath);
    return new EmulatedChannel({
      ...options,
      audioBuffer,
    });
  }

  /**
   * Create an EmulatedChannel from an audio buffer
   *
   * @param buffer Audio samples as Int16Array
   * @param options Additional options
   * @returns EmulatedChannel instance
   */
  static fromBuffer(
    buffer: Int16Array,
    options: Omit<EmulatedChannelOptions, "audioBuffer" | "audioFile"> = {}
  ): EmulatedChannel {
    return new EmulatedChannel({
      ...options,
      audioBuffer: buffer,
    });
  }

  /**
   * Set the audio buffer to emit
   *
   * @param buffer Audio samples as Int16Array
   */
  setAudioBuffer(buffer: Int16Array): void {
    this.audioBuffer = buffer;
    this.position = 0;
  }

  /**
   * Load audio from a file and set it as the buffer
   *
   * @param filePath Path to the audio file
   */
  async loadFromFile(filePath: string): Promise<void> {
    this.audioBuffer = await loadAudioFile(filePath);
    this.position = 0;
  }

  /**
   * Prepend audio data (e.g., wake word) to the current buffer
   *
   * @param prependBuffer Audio to prepend
   */
  prependAudio(prependBuffer: Int16Array): void {
    this.audioBuffer = concatenateAudio(prependBuffer, this.audioBuffer);
    this.position = 0;
  }

  /**
   * Append audio data to the current buffer
   *
   * @param appendBuffer Audio to append
   */
  appendAudio(appendBuffer: Int16Array): void {
    this.audioBuffer = concatenateAudio(this.audioBuffer, appendBuffer);
  }

  /**
   * Get the total duration of the audio in milliseconds
   */
  getDurationMs(): number {
    return (this.audioBuffer.length / this.sampleRate) * 1000;
  }

  /**
   * Get the total number of frames
   */
  getTotalFrames(): number {
    return Math.ceil(this.audioBuffer.length / this.frameLength);
  }

  /**
   * Get current position in samples
   */
  getPosition(): number {
    return this.position;
  }

  /**
   * Get current position as a percentage (0-100)
   */
  getProgress(): number {
    if (this.audioBuffer.length === 0) return 100;
    return (this.position / this.audioBuffer.length) * 100;
  }

  /**
   * Check if all audio has been emitted
   */
  isComplete(): boolean {
    return this.position >= this.audioBuffer.length;
  }

  /**
   * Reset position to the beginning
   */
  reset(): void {
    this.position = 0;
  }

  /**
   * Start emitting audio frames
   */
  start(): void {
    if (this.released) {
      throw new Error("EmulatedChannel has been released");
    }

    if (this.running) {
      return;
    }

    if (this.audioBuffer.length === 0) {
      throw new Error("EmulatedChannel has no audio data to emit");
    }

    this.running = true;
    this.emitPromise = this.emitLoop();
  }

  /**
   * Internal loop that emits audio frames
   */
  private async emitLoop(): Promise<void> {
    const frameIntervalMs = (this.frameLength / this.sampleRate) * 1000;

    while (this.running && !this.released && this.position < this.audioBuffer.length) {
      const endPos = Math.min(
        this.position + this.frameLength,
        this.audioBuffer.length
      );
      const frameData = this.audioBuffer.slice(this.position, endPos);

      // Create frame, padding with zeros if needed for the last frame
      let frame: Int16Array;
      if (frameData.length < this.frameLength) {
        frame = new Int16Array(this.frameLength);
        frame.set(frameData);
      } else {
        frame = frameData;
      }

      // Emit the frame
      if (this.frameCallback && this.running) {
        this.frameCallback(frame);
      }

      this.position += this.frameLength;

      // Wait for real-time interval if in realtime mode
      if (this.realtime && this.running && this.position < this.audioBuffer.length) {
        await Bun.sleep(frameIntervalMs);
      }
    }

    // Mark as no longer running when complete
    this.running = false;
  }

  /**
   * Stop emitting audio frames
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Wait for all audio to be emitted
   * Useful in non-realtime mode to ensure all frames are processed
   */
  async waitForCompletion(): Promise<void> {
    if (this.emitPromise) {
      await this.emitPromise;
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
   * @returns Sample rate in Hz
   */
  getSampleRate(): number {
    return this.sampleRate;
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
    this.audioBuffer = new Int16Array(0);
    this.frameCallback = null;
  }

  /**
   * Check if the channel has been released
   */
  isReleased(): boolean {
    return this.released;
  }
}
