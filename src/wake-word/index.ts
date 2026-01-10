/**
 * Wake Word Detection using OpenWakeWord
 *
 * This module provides wake word detection using OpenWakeWord ONNX models.
 * No API key required - models are bundled/downloaded locally.
 *
 * OpenWakeWord processes audio through a pipeline:
 * 1. Audio -> Melspectrogram (melspectrogram.onnx)
 * 2. Melspectrogram -> Embeddings (embedding_model.onnx)
 * 3. Embeddings -> Wake word scores (hey_jarvis_v0.1.onnx)
 *
 * @example
 * ```typescript
 * const detector = await WakeWordDetector.create({
 *   modelPath: "./models",
 *   wakeWord: "hey_jarvis"
 * });
 *
 * // Process audio frames
 * const detected = await detector.processFrame(audioFrame);
 * if (detected) {
 *   console.log("Wake word detected!");
 * }
 *
 * // Cleanup when done
 * await detector.release();
 * ```
 */

import * as ort from "onnxruntime-node";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Available wake words
 */
export type WakeWord = "hey_jarvis" | "alexa";

/**
 * Configuration options for WakeWordDetector
 */
export interface WakeWordDetectorOptions {
  /** Path to directory containing ONNX models (default: ./models) */
  modelPath?: string;
  /** Wake word to detect (default: hey_jarvis) */
  wakeWord?: WakeWord;
  /** Detection sensitivity/threshold 0.0-1.0 (default: 0.5) */
  sensitivity?: number;
}

/**
 * Wake word detection error types
 */
export class WakeWordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WakeWordError";
  }
}

export class WakeWordModelError extends WakeWordError {
  constructor(message: string = "Failed to load wake word model") {
    super(message);
    this.name = "WakeWordModelError";
  }
}

// Constants for OpenWakeWord processing
const SAMPLE_RATE = 16000;
const FRAME_LENGTH = 1280; // 80ms at 16kHz - OpenWakeWord's preferred chunk size
const MEL_FRAMES_PER_CHUNK = 5; // melspectrogram outputs 5 frames per 80ms chunk
const MEL_BUFFER_SIZE = 76; // embedding model needs 76 mel frames
const EMBEDDING_WINDOW_SLIDE = 8; // slide window by 8 frames after processing

/**
 * WakeWordDetector - Detects wake words using OpenWakeWord ONNX models
 *
 * Uses a pipeline of ONNX models:
 * - melspectrogram.onnx: Converts audio to mel spectrogram
 * - embedding_model.onnx: Extracts speech embeddings
 * - hey_jarvis_v0.1.onnx (or other): Detects specific wake word
 */
export class WakeWordDetector {
  private melSession: ort.InferenceSession | null = null;
  private embeddingSession: ort.InferenceSession | null = null;
  private wakeWordSession: ort.InferenceSession | null = null;

  private melBuffer: Float32Array[] = [];
  private embeddingBuffer: Float32Array[] = [];
  private sensitivity: number;
  private isReleased: boolean = false;
  private isInitialized: boolean = false;

  private readonly modelPath: string;
  private readonly wakeWord: WakeWord;

  /**
   * Private constructor - use WakeWordDetector.create() instead
   */
  private constructor(options: WakeWordDetectorOptions) {
    this.modelPath = options.modelPath ?? join(process.cwd(), "models");
    this.wakeWord = options.wakeWord ?? "hey_jarvis";
    this.sensitivity = options.sensitivity ?? 0.5;

    if (this.sensitivity < 0 || this.sensitivity > 1) {
      throw new WakeWordError("Sensitivity must be between 0.0 and 1.0");
    }
  }

  /**
   * Create a new WakeWordDetector instance
   *
   * @param options - Configuration options
   * @returns Promise that resolves to initialized WakeWordDetector
   * @throws {WakeWordModelError} If models cannot be loaded
   */
  static async create(
    options: WakeWordDetectorOptions = {}
  ): Promise<WakeWordDetector> {
    const detector = new WakeWordDetector(options);
    await detector.initialize();
    return detector;
  }

  /**
   * Initialize ONNX sessions
   */
  private async initialize(): Promise<void> {
    const melPath = join(this.modelPath, "melspectrogram.onnx");
    const embeddingPath = join(this.modelPath, "embedding_model.onnx");
    const wakeWordPath = join(this.modelPath, `${this.wakeWord}_v0.1.onnx`);

    // Check if model files exist
    if (!existsSync(melPath)) {
      throw new WakeWordModelError(
        `Melspectrogram model not found at ${melPath}. Run 'bun run models:download' first.`
      );
    }
    if (!existsSync(embeddingPath)) {
      throw new WakeWordModelError(
        `Embedding model not found at ${embeddingPath}. Run 'bun run models:download' first.`
      );
    }
    if (!existsSync(wakeWordPath)) {
      throw new WakeWordModelError(
        `Wake word model not found at ${wakeWordPath}. Run 'bun run models:download' first.`
      );
    }

    try {
      // Load ONNX sessions with CPU execution provider
      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: ["cpu"],
        graphOptimizationLevel: "all",
      };

      this.melSession = await ort.InferenceSession.create(
        melPath,
        sessionOptions
      );
      this.embeddingSession = await ort.InferenceSession.create(
        embeddingPath,
        sessionOptions
      );
      this.wakeWordSession = await ort.InferenceSession.create(
        wakeWordPath,
        sessionOptions
      );

      this.isInitialized = true;
    } catch (error) {
      throw new WakeWordModelError(
        `Failed to initialize ONNX models: ${(error as Error).message}`
      );
    }
  }

  /**
   * Process an audio frame and check for wake word detection
   *
   * @param frame - Audio frame as Int16Array (must be exactly frameLength samples)
   * @returns Promise that resolves to true if wake word was detected, false otherwise
   * @throws {WakeWordError} If detector has been released or frame is invalid
   */
  async processFrame(frame: Int16Array): Promise<boolean> {
    if (this.isReleased) {
      throw new WakeWordError("Detector has been released");
    }

    if (!this.isInitialized) {
      throw new WakeWordError("Detector not initialized");
    }

    if (frame.length !== FRAME_LENGTH) {
      throw new WakeWordError(
        `Invalid frame length: expected ${FRAME_LENGTH}, got ${frame.length}`
      );
    }

    // Convert Int16 to Float32 normalized to [-1, 1]
    const audioFloat = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      audioFloat[i] = frame[i] / 32768.0;
    }

    // Step 1: Compute melspectrogram
    const melFrames = await this.computeMelspectrogram(audioFloat);
    this.melBuffer.push(...melFrames);

    // Step 2: Generate embeddings when we have enough mel frames
    while (this.melBuffer.length >= MEL_BUFFER_SIZE) {
      const embedding = await this.computeEmbedding();
      this.embeddingBuffer.push(embedding);

      // Slide mel buffer forward
      this.melBuffer = this.melBuffer.slice(EMBEDDING_WINDOW_SLIDE);
    }

    // Step 3: Check for wake word when we have embeddings
    // Wake word model expects a sequence of embeddings (typically 16)
    const requiredEmbeddings = 16;
    if (this.embeddingBuffer.length >= requiredEmbeddings) {
      const score = await this.computeWakeWordScore();

      // Slide embedding buffer forward
      this.embeddingBuffer = this.embeddingBuffer.slice(1);

      // Check against sensitivity threshold
      if (score > this.sensitivity) {
        // Clear buffers after detection to avoid repeated triggers
        this.melBuffer = [];
        this.embeddingBuffer = [];
        return true;
      }
    }

    return false;
  }

  /**
   * Compute melspectrogram from audio samples
   */
  private async computeMelspectrogram(audio: Float32Array): Promise<Float32Array[]> {
    if (!this.melSession) {
      throw new WakeWordError("Mel session not initialized");
    }

    // Create input tensor - shape [1, audio_length]
    const inputTensor = new ort.Tensor("float32", audio, [1, audio.length]);

    // Run melspectrogram model
    const feeds: Record<string, ort.Tensor> = {
      [this.melSession.inputNames[0]]: inputTensor,
    };
    const results = await this.melSession.run(feeds);
    const output = results[this.melSession.outputNames[0]];

    // Transform output: (value / 10.0) + 2.0
    const melData = output.data as Float32Array;
    const transformedMel = new Float32Array(melData.length);
    for (let i = 0; i < melData.length; i++) {
      transformedMel[i] = melData[i] / 10.0 + 2.0;
    }

    // Split into frames (each frame is typically 32 mel bins)
    const melBins = 32;
    const numFrames = Math.floor(transformedMel.length / melBins);
    const frames: Float32Array[] = [];

    for (let i = 0; i < numFrames; i++) {
      const frame = transformedMel.slice(i * melBins, (i + 1) * melBins);
      frames.push(frame);
    }

    return frames;
  }

  /**
   * Compute embedding from mel buffer
   */
  private async computeEmbedding(): Promise<Float32Array> {
    if (!this.embeddingSession) {
      throw new WakeWordError("Embedding session not initialized");
    }

    // Take first MEL_BUFFER_SIZE frames
    const melWindow = this.melBuffer.slice(0, MEL_BUFFER_SIZE);

    // Flatten and reshape to [1, 76, 32, 1] for embedding model
    const melBins = 32;
    const melData = new Float32Array(MEL_BUFFER_SIZE * melBins);
    for (let i = 0; i < MEL_BUFFER_SIZE; i++) {
      melData.set(melWindow[i], i * melBins);
    }

    // Create input tensor
    const inputTensor = new ort.Tensor("float32", melData, [
      1,
      MEL_BUFFER_SIZE,
      melBins,
      1,
    ]);

    // Run embedding model
    const feeds: Record<string, ort.Tensor> = {
      [this.embeddingSession.inputNames[0]]: inputTensor,
    };
    const results = await this.embeddingSession.run(feeds);
    const output = results[this.embeddingSession.outputNames[0]];

    // Output shape is [1, 1, 1, 96] - flatten to [96]
    return new Float32Array(output.data as Float32Array);
  }

  /**
   * Compute wake word score from embedding buffer
   */
  private async computeWakeWordScore(): Promise<number> {
    if (!this.wakeWordSession) {
      throw new WakeWordError("Wake word session not initialized");
    }

    // Take last 16 embeddings and stack them
    const numEmbeddings = 16;
    const embeddingSize = 96;
    const embeddings = this.embeddingBuffer.slice(-numEmbeddings);

    // Flatten to [1, 16, 96]
    const embeddingData = new Float32Array(numEmbeddings * embeddingSize);
    for (let i = 0; i < numEmbeddings; i++) {
      embeddingData.set(embeddings[i], i * embeddingSize);
    }

    // Create input tensor
    const inputTensor = new ort.Tensor("float32", embeddingData, [
      1,
      numEmbeddings,
      embeddingSize,
    ]);

    // Run wake word model
    const feeds: Record<string, ort.Tensor> = {
      [this.wakeWordSession.inputNames[0]]: inputTensor,
    };
    const results = await this.wakeWordSession.run(feeds);
    const output = results[this.wakeWordSession.outputNames[0]];

    // Return the score (single value between 0 and 1)
    const scores = output.data as Float32Array;
    return scores[scores.length - 1]; // Take last score
  }

  /**
   * Get the required audio frame length in samples
   *
   * @returns Number of samples per frame (1280 for 80ms at 16kHz)
   */
  getFrameLength(): number {
    if (this.isReleased) {
      throw new WakeWordError("Detector has been released");
    }
    return FRAME_LENGTH;
  }

  /**
   * Get the required audio sample rate
   *
   * @returns Sample rate in Hz (16000)
   */
  getSampleRate(): number {
    if (this.isReleased) {
      throw new WakeWordError("Detector has been released");
    }
    return SAMPLE_RATE;
  }

  /**
   * Release all resources held by the detector
   * Must be called when done to prevent memory leaks
   */
  async release(): Promise<void> {
    if (!this.isReleased) {
      if (this.melSession) {
        await this.melSession.release();
        this.melSession = null;
      }
      if (this.embeddingSession) {
        await this.embeddingSession.release();
        this.embeddingSession = null;
      }
      if (this.wakeWordSession) {
        await this.wakeWordSession.release();
        this.wakeWordSession = null;
      }

      this.melBuffer = [];
      this.embeddingBuffer = [];
      this.isReleased = true;
      this.isInitialized = false;
    }
  }

  /**
   * Check if the detector has been released
   */
  get released(): boolean {
    return this.isReleased;
  }

  /**
   * Reset the internal buffers without releasing the model
   * Useful after detecting a wake word to start fresh
   */
  reset(): void {
    if (this.isReleased) {
      throw new WakeWordError("Detector has been released");
    }
    this.melBuffer = [];
    this.embeddingBuffer = [];
  }
}

// Export available wake words
export const AVAILABLE_WAKE_WORDS: WakeWord[] = ["hey_jarvis", "alexa"];
