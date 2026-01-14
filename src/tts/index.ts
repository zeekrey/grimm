/**
 * Text-to-Speech Module
 *
 * Provides text-to-speech synthesis using ElevenLabs API.
 * Supports both synchronous and streaming audio generation.
 *
 * @example
 * ```typescript
 * const tts = new TTSClient({
 *   apiKey: process.env.ELEVENLABS_API_KEY,
 *   voiceId: "21m00Tcm4TlvDq8ikWAM" // Rachel
 * });
 *
 * // Synthesize and get audio buffer
 * const audio = await tts.synthesize("Hallo, wie kann ich dir helfen?");
 *
 * // Play the audio
 * await tts.speak("Hallo, wie kann ich dir helfen?");
 *
 * // Streaming synthesis
 * for await (const chunk of tts.synthesizeStream("Long text...")) {
 *   // Process audio chunks
 * }
 * ```
 */

import {
  type TTSClientOptions,
  type TTSModel,
  type OutputFormat,
  type VoiceSettings,
  type Voice,
  TTSError,
  DEFAULT_VOICES,
} from "./types";
import { playAudio, playStreamingAudio, isPlaybackAvailable, getPlayerName } from "./player";

// Re-export types and utilities
export * from "./types";
export { playAudio, playStreamingAudio, isPlaybackAvailable, getPlayerName } from "./player";

// Default configuration
const DEFAULT_MODEL: TTSModel = "eleven_turbo_v2_5";
// Use PCM on Linux (for aplay), MP3 on macOS (for afplay)
const DEFAULT_OUTPUT_FORMAT: OutputFormat = process.platform === "linux" ? "pcm_24000" : "mp3_44100_128";
const DEFAULT_VOICE_ID = DEFAULT_VOICES.rachel;
const DEFAULT_TIMEOUT = 30000;
const API_BASE_URL = "https://api.elevenlabs.io/v1";

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};

/**
 * TTS Client for ElevenLabs integration
 */
export class TTSClient {
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly model: TTSModel;
  private readonly outputFormat: OutputFormat;
  private readonly voiceSettings: VoiceSettings;
  private readonly timeout: number;

  constructor(options: TTSClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.ELEVENLABS_API_KEY || "";
    this.voiceId = options.voiceId || DEFAULT_VOICE_ID;
    this.model = options.model || DEFAULT_MODEL;
    this.outputFormat = options.outputFormat || DEFAULT_OUTPUT_FORMAT;
    this.voiceSettings = { ...DEFAULT_VOICE_SETTINGS, ...options.voiceSettings };
    this.timeout = options.timeout || DEFAULT_TIMEOUT;

    if (!this.apiKey) {
      throw new TTSError(
        "ElevenLabs API key is required. Set ELEVENLABS_API_KEY environment variable.",
        0
      );
    }
  }

  /**
   * Synthesize text to audio
   *
   * @param text - Text to synthesize
   * @returns Audio data as ArrayBuffer
   */
  async synthesize(text: string): Promise<ArrayBuffer> {
    if (!text.trim()) {
      throw new TTSError("Text cannot be empty", 0);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${API_BASE_URL}/text-to-speech/${this.voiceId}?output_format=${this.outputFormat}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: this.model,
          voice_settings: this.voiceSettings,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text();
        }

        const errorMessage =
          typeof errorBody === "object" &&
          errorBody !== null &&
          "detail" in errorBody
            ? (errorBody as { detail: { message?: string } }).detail?.message ||
              "TTS synthesis failed"
            : String(errorBody);

        throw new TTSError(errorMessage, response.status, errorBody);
      }

      return await response.arrayBuffer();
    } catch (error) {
      if (error instanceof TTSError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new TTSError("Request timeout", 0);
      }

      throw new TTSError(
        error instanceof Error ? error.message : "Unknown error",
        0
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Synthesize text to streaming audio chunks
   *
   * @param text - Text to synthesize
   * @yields Audio chunks as Uint8Array
   */
  async *synthesizeStream(text: string): AsyncGenerator<Uint8Array> {
    if (!text.trim()) {
      throw new TTSError("Text cannot be empty", 0);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${API_BASE_URL}/text-to-speech/${this.voiceId}/stream?output_format=${this.outputFormat}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: this.model,
          voice_settings: this.voiceSettings,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text();
        }

        const errorMessage =
          typeof errorBody === "object" &&
          errorBody !== null &&
          "detail" in errorBody
            ? (errorBody as { detail: { message?: string } }).detail?.message ||
              "TTS synthesis failed"
            : String(errorBody);

        throw new TTSError(errorMessage, response.status, errorBody);
      }

      if (!response.body) {
        throw new TTSError("No response body", 0);
      }

      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } catch (error) {
      if (error instanceof TTSError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new TTSError("Request timeout", 0);
      }

      throw new TTSError(
        error instanceof Error ? error.message : "Unknown error",
        0
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Synthesize text and play audio
   *
   * @param text - Text to speak
   */
  async speak(text: string): Promise<void> {
    const audio = await this.synthesize(text);
    await playAudio(audio, this.outputFormat);
  }

  /**
   * Synthesize text with streaming and play audio
   *
   * @param text - Text to speak
   */
  async speakStream(text: string): Promise<void> {
    const stream = this.synthesizeStream(text);
    await playStreamingAudio(stream);
  }

  /**
   * Get available voices from ElevenLabs
   *
   * @returns List of available voices
   */
  async getVoices(): Promise<Voice[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${API_BASE_URL}/voices`, {
        headers: {
          "xi-api-key": this.apiKey,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new TTSError("Failed to fetch voices", response.status);
      }

      const data = (await response.json()) as { voices: Voice[] };
      return data.voices;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get current voice ID
   */
  getVoiceId(): string {
    return this.voiceId;
  }

  /**
   * Get current model
   */
  getModel(): TTSModel {
    return this.model;
  }

  /**
   * Get output format
   */
  getOutputFormat(): OutputFormat {
    return this.outputFormat;
  }
}

/**
 * Create a TTS client with sensible defaults for German speech
 */
export function createGermanTTS(options: Partial<TTSClientOptions> = {}): TTSClient {
  return new TTSClient({
    model: "eleven_multilingual_v2", // Best for German
    voiceSettings: {
      stability: 0.6,
      similarity_boost: 0.8,
    },
    ...options,
  });
}
