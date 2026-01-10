/**
 * Voice Activity Detection using Silero VAD
 *
 * This module provides voice activity detection using the Silero VAD model
 * via the avr-vad package. No API key required.
 *
 * Features:
 * - Real-time voice activity detection
 * - Speech start/end detection
 * - Configurable thresholds and timing
 * - End-of-speech detection for command capture
 *
 * @example
 * ```typescript
 * const vad = await VoiceActivityDetector.create({
 *   speechThreshold: 0.5,
 *   silenceDuration: 700
 * });
 *
 * // Process audio frames
 * const result = await vad.processFrame(audioFrame);
 * if (result.status === "end") {
 *   console.log("Speech ended, captured audio:", result.audio);
 * }
 *
 * // Cleanup when done
 * await vad.release();
 * ```
 */

import { RealTimeVAD } from "avr-vad";

/**
 * VAD result status
 */
export type VADStatus = "continue" | "end" | "timeout";

/**
 * Result from processing an audio frame
 */
export interface VADResult {
  /** Current status of speech detection */
  status: VADStatus;
  /** Voice probability for this frame (0.0 to 1.0) */
  probability: number;
  /** Whether speech is currently detected */
  isSpeech: boolean;
  /** Captured audio when speech ends (only present when status is "end" or "timeout") */
  audio?: Int16Array;
}

/**
 * Configuration options for VoiceActivityDetector
 */
export interface VoiceActivityDetectorOptions {
  /** Threshold for detecting speech start (0.0-1.0, default: 0.5) */
  speechThreshold?: number;
  /** Threshold for detecting speech end (0.0-1.0, default: 0.35) */
  silenceThreshold?: number;
  /** Duration of silence (in ms) before considering speech ended (default: 700) */
  silenceDuration?: number;
  /** Maximum recording duration in ms (default: 30000) */
  maxRecordingDuration?: number;
  /** Minimum speech duration in ms before accepting (default: 200) */
  minSpeechDuration?: number;
  /** Input sample rate if different from 16000 Hz */
  inputSampleRate?: number;
}

/**
 * VAD error types
 */
export class VADError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VADError";
  }
}

// Constants
const TARGET_SAMPLE_RATE = 16000;
const VAD_FRAME_SAMPLES = 1536; // Silero VAD frame size
const FRAME_DURATION_MS = (VAD_FRAME_SAMPLES / TARGET_SAMPLE_RATE) * 1000; // ~96ms

/**
 * VoiceActivityDetector - Detects voice activity using Silero VAD
 *
 * This class wraps the avr-vad package to provide:
 * - Real-time speech detection
 * - End-of-speech detection with configurable silence duration
 * - Audio buffering for capturing speech segments
 */
export class VoiceActivityDetector {
  private vad: RealTimeVAD | null = null;

  private readonly speechThreshold: number;
  private readonly silenceThreshold: number;
  private readonly silenceDuration: number;
  private readonly maxRecordingDuration: number;
  private readonly minSpeechDuration: number;
  private readonly inputSampleRate: number;

  private audioBuffer: Int16Array[] = [];
  private silenceStartTime: number | null = null;
  private recordingStartTime: number | null = null;
  private hasDetectedSpeech: boolean = false;
  private speechStartTime: number | null = null;

  private isReleased: boolean = false;
  private isInitialized: boolean = false;

  // Track the latest probability from the callback
  private lastProbability: number = 0;
  private lastIsSpeech: boolean = false;

  /**
   * Private constructor - use VoiceActivityDetector.create() instead
   */
  private constructor(options: VoiceActivityDetectorOptions = {}) {
    this.speechThreshold = options.speechThreshold ?? 0.5;
    this.silenceThreshold = options.silenceThreshold ?? 0.35;
    this.silenceDuration = options.silenceDuration ?? 700;
    this.maxRecordingDuration = options.maxRecordingDuration ?? 30000;
    this.minSpeechDuration = options.minSpeechDuration ?? 200;
    this.inputSampleRate = options.inputSampleRate ?? TARGET_SAMPLE_RATE;

    // Validate options
    if (this.speechThreshold < 0 || this.speechThreshold > 1) {
      throw new VADError("Speech threshold must be between 0.0 and 1.0");
    }
    if (this.silenceThreshold < 0 || this.silenceThreshold > 1) {
      throw new VADError("Silence threshold must be between 0.0 and 1.0");
    }
    if (this.silenceDuration < 0) {
      throw new VADError("Silence duration must be non-negative");
    }
    if (this.maxRecordingDuration < 0) {
      throw new VADError("Max recording duration must be non-negative");
    }
  }

  /**
   * Create a new VoiceActivityDetector instance
   *
   * @param options - Configuration options
   * @returns Promise that resolves to initialized VoiceActivityDetector
   */
  static async create(
    options: VoiceActivityDetectorOptions = {}
  ): Promise<VoiceActivityDetector> {
    const detector = new VoiceActivityDetector(options);
    await detector.initialize();
    return detector;
  }

  /**
   * Initialize the VAD engine
   */
  private async initialize(): Promise<void> {
    try {
      // Initialize Silero VAD via avr-vad with callbacks
      // Note: Using legacy model as v5 has ONNX shape issues with current onnxruntime-node
      this.vad = await RealTimeVAD.new({
        model: "legacy",
        positiveSpeechThreshold: this.speechThreshold,
        negativeSpeechThreshold: this.silenceThreshold,
        preSpeechPadFrames: 1,
        redemptionFrames: 8,
        frameSamples: VAD_FRAME_SAMPLES,
        minSpeechFrames: 3,
        sampleRate: this.inputSampleRate,
        onFrameProcessed: (probabilities, _frame) => {
          this.lastProbability = probabilities.isSpeech;
          this.lastIsSpeech = probabilities.isSpeech > this.speechThreshold;
        },
        onSpeechStart: () => {
          this.hasDetectedSpeech = true;
          this.speechStartTime = Date.now();
          this.silenceStartTime = null;
        },
        onSpeechRealStart: () => {
          // Real speech start confirmed
        },
        onSpeechEnd: (_audio) => {
          // Speech ended - this is handled in processFrame
        },
        onVADMisfire: () => {
          // VAD misfire - reset speech detection
          this.hasDetectedSpeech = false;
          this.speechStartTime = null;
        },
      });

      this.vad.start();
      this.isInitialized = true;
    } catch (error) {
      throw new VADError(
        `Failed to initialize VAD: ${(error as Error).message}`
      );
    }
  }

  /**
   * Process an audio frame and detect voice activity
   *
   * @param frame - Audio frame as Int16Array
   * @returns Promise that resolves to VADResult
   */
  async processFrame(frame: Int16Array): Promise<VADResult> {
    if (this.isReleased) {
      throw new VADError("VAD has been released");
    }

    if (!this.isInitialized || !this.vad) {
      throw new VADError("VAD not initialized");
    }

    const now = Date.now();

    // Initialize recording start time
    if (this.recordingStartTime === null) {
      this.recordingStartTime = now;
    }

    // Buffer the audio
    this.audioBuffer.push(frame.slice());

    // Convert Int16 to Float32 for VAD
    const audioFloat = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      audioFloat[i] = frame[i] / 32768.0;
    }

    // Process with VAD - this triggers the callbacks
    await this.vad.processAudio(audioFloat);

    const probability = this.lastProbability;
    const isSpeech = this.lastIsSpeech;

    // Check max duration
    if (now - this.recordingStartTime > this.maxRecordingDuration) {
      const audio = this.getBufferedAudio();
      this.reset();
      return {
        status: "timeout",
        probability,
        isSpeech,
        audio,
      };
    }

    // Track speech start (backup in case callback didn't fire)
    if (isSpeech && !this.hasDetectedSpeech) {
      this.hasDetectedSpeech = true;
      this.speechStartTime = now;
      this.silenceStartTime = null;
    }

    // If speech detected, reset silence timer
    if (isSpeech) {
      this.silenceStartTime = null;
      return {
        status: "continue",
        probability,
        isSpeech,
      };
    }

    // Only start counting silence after speech has been detected
    if (!this.hasDetectedSpeech) {
      return {
        status: "continue",
        probability,
        isSpeech,
      };
    }

    // Check minimum speech duration
    const speechDuration = this.speechStartTime
      ? now - this.speechStartTime
      : 0;
    if (speechDuration < this.minSpeechDuration) {
      return {
        status: "continue",
        probability,
        isSpeech,
      };
    }

    // Start/continue silence timer
    if (this.silenceStartTime === null) {
      this.silenceStartTime = now;
    }

    // Check if silence duration exceeded
    if (now - this.silenceStartTime > this.silenceDuration) {
      const audio = this.getBufferedAudio();
      this.reset();
      return {
        status: "end",
        probability,
        isSpeech,
        audio,
      };
    }

    return {
      status: "continue",
      probability,
      isSpeech,
    };
  }

  /**
   * Get the buffered audio as a single Int16Array
   */
  private getBufferedAudio(): Int16Array {
    const totalLength = this.audioBuffer.reduce(
      (sum, f) => sum + f.length,
      0
    );
    const combined = new Int16Array(totalLength);
    let offset = 0;
    for (const frame of this.audioBuffer) {
      combined.set(frame, offset);
      offset += frame.length;
    }
    return combined;
  }

  /**
   * Reset the VAD state for a new recording
   */
  reset(): void {
    if (this.isReleased) {
      throw new VADError("VAD has been released");
    }
    this.audioBuffer = [];
    this.silenceStartTime = null;
    this.recordingStartTime = null;
    this.hasDetectedSpeech = false;
    this.speechStartTime = null;
    this.lastProbability = 0;
    this.lastIsSpeech = false;
    if (this.vad) {
      this.vad.reset();
    }
  }

  /**
   * Get the required audio frame length in samples
   *
   * @returns Number of samples per frame
   */
  getFrameLength(): number {
    if (this.isReleased) {
      throw new VADError("VAD has been released");
    }
    return VAD_FRAME_SAMPLES;
  }

  /**
   * Get the required audio sample rate
   *
   * @returns Sample rate in Hz (16000)
   */
  getSampleRate(): number {
    if (this.isReleased) {
      throw new VADError("VAD has been released");
    }
    return TARGET_SAMPLE_RATE;
  }

  /**
   * Check if speech has been detected in current session
   */
  hasSpeech(): boolean {
    return this.hasDetectedSpeech;
  }

  /**
   * Get current recording duration in milliseconds
   */
  getRecordingDuration(): number {
    if (this.recordingStartTime === null) {
      return 0;
    }
    return Date.now() - this.recordingStartTime;
  }

  /**
   * Release all resources
   */
  async release(): Promise<void> {
    if (!this.isReleased) {
      if (this.vad) {
        try {
          this.vad.pause();
        } catch {
          // Ignore pause errors
        }
        this.vad = null;
      }
      this.audioBuffer = [];
      this.isReleased = true;
      this.isInitialized = false;
    }
  }

  /**
   * Check if the VAD has been released
   */
  get released(): boolean {
    return this.isReleased;
  }
}

/**
 * End-of-speech detector - standalone logic for detecting end of speech
 * Can be used independently of the full VoiceActivityDetector
 */
export class EndOfSpeechDetector {
  private readonly speechThreshold: number;
  private readonly silenceDuration: number;
  private readonly maxDuration: number;

  private silenceStartTime: number | null = null;
  private recordingStartTime: number | null = null;
  private hasDetectedSpeech: boolean = false;

  constructor(
    speechThreshold: number = 0.5,
    silenceDuration: number = 700,
    maxDuration: number = 30000
  ) {
    this.speechThreshold = speechThreshold;
    this.silenceDuration = silenceDuration;
    this.maxDuration = maxDuration;
  }

  /**
   * Process a voice probability value
   *
   * @param voiceProbability - Voice probability from VAD (0.0 to 1.0)
   * @returns Status: "continue", "end", or "timeout"
   */
  processFrame(voiceProbability: number): VADStatus {
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

  /**
   * Reset the detector state
   */
  reset(): void {
    this.silenceStartTime = null;
    this.recordingStartTime = null;
    this.hasDetectedSpeech = false;
  }
}

// Re-export types
export type { VADStatus as VADResultStatus };
