/**
 * TTS Types for ElevenLabs Integration
 */

/**
 * Available ElevenLabs voice models
 */
export type TTSModel =
  | "eleven_turbo_v2_5" // Fast, high quality (~75ms latency)
  | "eleven_multilingual_v2" // Best quality, multilingual
  | "eleven_monolingual_v1"; // English only

/**
 * Output audio formats
 */
export type OutputFormat =
  | "mp3_44100_128" // High quality MP3
  | "mp3_22050_32" // Medium quality MP3
  | "pcm_16000" // Raw PCM 16kHz
  | "pcm_22050" // Raw PCM 22kHz
  | "pcm_24000"; // Raw PCM 24kHz

/**
 * Voice settings for speech synthesis
 */
export interface VoiceSettings {
  /** Stability: 0.0 (expressive) to 1.0 (consistent) */
  stability?: number;
  /** Similarity boost: 0.0 to 1.0 */
  similarity_boost?: number;
  /** Style exaggeration: 0.0 to 1.0 (v2 models only) */
  style?: number;
  /** Enhance voice clarity */
  use_speaker_boost?: boolean;
}

/**
 * TTS Client configuration
 */
export interface TTSClientOptions {
  /** ElevenLabs API key (defaults to ELEVENLABS_API_KEY env var) */
  apiKey?: string;
  /** Voice ID to use */
  voiceId?: string;
  /** Model to use (default: eleven_turbo_v2_5) */
  model?: TTSModel;
  /** Output format (default: mp3_44100_128) */
  outputFormat?: OutputFormat;
  /** Voice settings */
  voiceSettings?: VoiceSettings;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Voice information from ElevenLabs API
 */
export interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  labels?: Record<string, string>;
}

/**
 * TTS Error class
 */
export class TTSError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: unknown
  ) {
    super(message);
    this.name = "TTSError";
  }
}

/**
 * Default voice IDs
 */
export const DEFAULT_VOICES = {
  rachel: "21m00Tcm4TlvDq8ikWAM", // Calm, friendly
  domi: "AZnzlk1XvdvUeBnXmlld", // Expressive
  bella: "EXAVITQu4vr4xnSDxMaL", // Warm
  antoni: "ErXwobaYiN019PkySvjV", // Authoritative
  elli: "MF3mGyEYCl7XYWbV9V6O", // Youthful
} as const;
