/**
 * Audio Channel Types and Interfaces
 *
 * Provides a unified interface for audio input sources,
 * allowing seamless switching between real microphone input
 * and emulated audio for testing.
 */

/**
 * Callback function for processing audio frames
 */
export type FrameCallback = (frame: Int16Array) => void;

/**
 * Audio format requirements for Porcupine wake word detection
 */
export const AUDIO_FORMAT = {
  /** Sample rate in Hz (required by Porcupine) */
  SAMPLE_RATE: 16000,
  /** Bit depth in bits */
  BIT_DEPTH: 16,
  /** Number of audio channels */
  CHANNELS: 1,
  /** Frame length in samples (required by Porcupine) */
  FRAME_LENGTH: 512,
} as const;

/**
 * AudioChannel interface - unified interface for audio input sources
 *
 * Implementations:
 * - MicrophoneChannel: Real microphone input via PvRecorder
 * - EmulatedChannel: Emulated input from audio files/buffers
 */
export interface AudioChannel {
  /**
   * Start emitting audio frames
   * Frames will be delivered via the callback set with onFrame()
   */
  start(): void;

  /**
   * Stop emitting audio frames
   */
  stop(): void;

  /**
   * Register a callback to receive audio frames
   * @param callback Function to call with each audio frame
   */
  onFrame(callback: FrameCallback): void;

  /**
   * Get the audio sample rate
   * @returns Sample rate in Hz (typically 16000)
   */
  getSampleRate(): number;

  /**
   * Get the frame length in samples
   * @returns Number of samples per frame (typically 512)
   */
  getFrameLength(): number;

  /**
   * Check if the channel is currently running
   */
  isRunning(): boolean;

  /**
   * Release all resources held by the channel
   */
  release(): void;
}

/**
 * Options for EmulatedChannel
 */
export interface EmulatedChannelOptions {
  /** Audio buffer to emit (Int16Array of 16-bit PCM samples) */
  audioBuffer?: Int16Array;
  /** Path to audio file to load (.wav, .mp3, etc.) */
  audioFile?: string;
  /** If true, emit frames in real-time (with delays). If false, emit as fast as possible */
  realtime?: boolean;
  /** Frame length in samples (default: 512) */
  frameLength?: number;
  /** Sample rate in Hz (default: 16000) */
  sampleRate?: number;
}

/**
 * Options for creating an audio channel
 */
export interface AudioChannelFactoryOptions {
  /** Audio device index for microphone (-1 for default) */
  deviceIndex?: number;
  /** Emulation options (if using emulated channel) */
  emulatedOptions?: EmulatedChannelOptions;
}

/**
 * Audio channel mode
 */
export type AudioChannelMode = "microphone" | "emulated";

/**
 * Factory function to create an audio channel
 * @param mode The type of channel to create
 * @param options Configuration options
 * @returns An AudioChannel instance
 */
export type AudioChannelFactory = (
  mode: AudioChannelMode,
  options?: AudioChannelFactoryOptions
) => AudioChannel | Promise<AudioChannel>;
