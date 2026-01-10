/**
 * Audio utilities for LLM integration
 *
 * Converts PCM audio to WAV format for sending to Gemini
 */

/**
 * Convert PCM Int16 audio to WAV format as Base64 string
 *
 * @param pcmData - PCM audio data as Int16Array
 * @param sampleRate - Sample rate in Hz (default: 16000)
 * @returns Base64 encoded WAV audio
 */
export function pcmToWavBase64(pcmData: Int16Array, sampleRate: number = 16000): string {
  const wavBuffer = pcmToWav(pcmData, sampleRate);
  return Buffer.from(wavBuffer).toString("base64");
}

/**
 * Convert PCM Int16 audio to WAV format as Uint8Array
 *
 * @param pcmData - PCM audio data as Int16Array
 * @param sampleRate - Sample rate in Hz (default: 16000)
 * @returns WAV audio as Uint8Array
 */
export function pcmToWav(pcmData: Int16Array, sampleRate: number = 16000): Uint8Array {
  const numChannels = 1; // Mono
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length * 2; // 2 bytes per sample

  // Create WAV header (44 bytes)
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // "RIFF" chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // File size - 8
  writeString(view, 8, "WAVE");

  // "fmt " sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // "data" sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // Combine header and PCM data
  const wav = new Uint8Array(44 + dataSize);
  wav.set(new Uint8Array(header), 0);
  wav.set(new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength), 44);

  return wav;
}

/**
 * Helper to write ASCII string to DataView
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Calculate approximate audio duration from sample count
 *
 * @param sampleCount - Number of audio samples
 * @param sampleRate - Sample rate in Hz (default: 16000)
 * @returns Duration in seconds
 */
export function calculateDuration(sampleCount: number, sampleRate: number = 16000): number {
  return sampleCount / sampleRate;
}

/**
 * Estimate token count for audio
 * Based on OpenRouter's estimate of ~32 tokens per second of audio
 *
 * @param sampleCount - Number of audio samples
 * @param sampleRate - Sample rate in Hz (default: 16000)
 * @returns Estimated token count
 */
export function estimateAudioTokens(sampleCount: number, sampleRate: number = 16000): number {
  const durationSeconds = calculateDuration(sampleCount, sampleRate);
  return Math.ceil(durationSeconds * 32);
}
