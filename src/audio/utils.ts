/**
 * Audio Utility Functions
 *
 * Functions for loading, converting, and manipulating audio data.
 */

import { spawn } from "child_process";
import { AUDIO_FORMAT } from "./types";

/**
 * WAV file header structure
 */
interface WavHeader {
  riffId: string;
  fileSize: number;
  waveId: string;
  fmtId: string;
  fmtSize: number;
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataId: string;
  dataSize: number;
  dataOffset: number;
}

/**
 * Parse a WAV file header
 * @param buffer Buffer containing WAV file data
 * @returns Parsed header information
 */
function parseWavHeader(buffer: Buffer): WavHeader {
  // RIFF header
  const riffId = buffer.toString("ascii", 0, 4);
  if (riffId !== "RIFF") {
    throw new Error("Invalid WAV file: missing RIFF header");
  }

  const fileSize = buffer.readUInt32LE(4);
  const waveId = buffer.toString("ascii", 8, 12);

  if (waveId !== "WAVE") {
    throw new Error("Invalid WAV file: missing WAVE header");
  }

  // Find fmt chunk
  let offset = 12;
  let fmtId = "";
  let fmtSize = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      fmtId = chunkId;
      fmtSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
  }

  if (fmtId !== "fmt ") {
    throw new Error("Invalid WAV file: missing fmt chunk");
  }

  const fmtOffset = offset + 8;
  const audioFormat = buffer.readUInt16LE(fmtOffset);
  const numChannels = buffer.readUInt16LE(fmtOffset + 2);
  const sampleRate = buffer.readUInt32LE(fmtOffset + 4);
  const byteRate = buffer.readUInt32LE(fmtOffset + 8);
  const blockAlign = buffer.readUInt16LE(fmtOffset + 12);
  const bitsPerSample = buffer.readUInt16LE(fmtOffset + 14);

  // Find data chunk
  offset = fmtOffset + fmtSize;
  let dataId = "";
  let dataSize = 0;
  let dataOffset = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "data") {
      dataId = chunkId;
      dataSize = chunkSize;
      dataOffset = offset + 8;
      break;
    }

    offset += 8 + chunkSize;
  }

  if (dataId !== "data") {
    throw new Error("Invalid WAV file: missing data chunk");
  }

  return {
    riffId,
    fileSize,
    waveId,
    fmtId,
    fmtSize,
    audioFormat,
    numChannels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    dataId,
    dataSize,
    dataOffset,
  };
}

/**
 * Load a WAV file and return audio samples as Int16Array
 *
 * Supports 16-bit PCM WAV files. Will validate format and throw
 * if the file doesn't match expected parameters.
 *
 * @param filePath Path to the WAV file
 * @returns Audio samples as Int16Array
 */
export async function loadWavFile(filePath: string): Promise<Int16Array> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new Error(`WAV file not found: ${filePath}`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const header = parseWavHeader(buffer);

  // Validate format
  if (header.audioFormat !== 1) {
    throw new Error(
      `Unsupported audio format: ${header.audioFormat} (only PCM/1 is supported)`
    );
  }

  if (header.bitsPerSample !== 16) {
    throw new Error(
      `Unsupported bit depth: ${header.bitsPerSample} (only 16-bit is supported)`
    );
  }

  if (header.numChannels !== 1) {
    throw new Error(
      `Unsupported channel count: ${header.numChannels} (only mono is supported)`
    );
  }

  if (header.sampleRate !== AUDIO_FORMAT.SAMPLE_RATE) {
    throw new Error(
      `Unsupported sample rate: ${header.sampleRate} (expected ${AUDIO_FORMAT.SAMPLE_RATE})`
    );
  }

  // Extract audio data
  const dataBuffer = buffer.subarray(
    header.dataOffset,
    header.dataOffset + header.dataSize
  );

  // Convert to Int16Array
  const samples = new Int16Array(
    dataBuffer.buffer,
    dataBuffer.byteOffset,
    dataBuffer.length / 2
  );

  return samples;
}

/**
 * Load an audio file using ffmpeg for format conversion
 *
 * Converts any audio format to 16kHz mono 16-bit PCM.
 * Requires ffmpeg to be installed on the system.
 *
 * @param filePath Path to the audio file
 * @returns Audio samples as Int16Array
 */
export async function loadAudioFile(filePath: string): Promise<Int16Array> {
  // Check if it's a WAV file with correct format - try native loading first
  if (filePath.toLowerCase().endsWith(".wav")) {
    try {
      return await loadWavFile(filePath);
    } catch (error) {
      // Fall through to ffmpeg conversion
      console.log(
        `WAV file needs conversion, using ffmpeg: ${(error as Error).message}`
      );
    }
  }

  // Use ffmpeg to convert to correct format
  return convertWithFfmpeg(filePath);
}

/**
 * Convert audio file to 16kHz mono 16-bit PCM using ffmpeg
 *
 * @param filePath Path to the audio file
 * @returns Audio samples as Int16Array
 */
export async function convertWithFfmpeg(filePath: string): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      filePath,
      "-f",
      "s16le", // 16-bit signed little-endian
      "-ar",
      String(AUDIO_FORMAT.SAMPLE_RATE), // 16kHz
      "-ac",
      "1", // mono
      "-loglevel",
      "error",
      "-", // output to stdout
    ]);

    const chunks: Buffer[] = [];
    let stderrData = "";

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    ffmpeg.stderr.on("data", (data: Buffer) => {
      stderrData += data.toString();
    });

    ffmpeg.on("error", (error) => {
      reject(new Error(`Failed to spawn ffmpeg: ${error.message}`));
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          reject(new Error("ffmpeg produced no output"));
          return;
        }

        // Create Int16Array from buffer
        // We need to handle the alignment properly
        const samples = new Int16Array(buffer.length / 2);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = buffer.readInt16LE(i * 2);
        }

        resolve(samples);
      } else {
        reject(
          new Error(
            `ffmpeg exited with code ${code}${stderrData ? `: ${stderrData}` : ""}`
          )
        );
      }
    });
  });
}

/**
 * Concatenate two audio buffers
 *
 * @param a First audio buffer
 * @param b Second audio buffer
 * @returns Combined audio buffer
 */
export function concatenateAudio(a: Int16Array, b: Int16Array): Int16Array {
  const result = new Int16Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

/**
 * Generate silence as Int16Array
 *
 * @param durationMs Duration in milliseconds
 * @param sampleRate Sample rate in Hz (default: 16000)
 * @returns Audio samples (all zeros)
 */
export function generateSilence(
  durationMs: number,
  sampleRate: number = AUDIO_FORMAT.SAMPLE_RATE
): Int16Array {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  return new Int16Array(numSamples);
}

/**
 * Generate a sine wave tone as Int16Array
 *
 * @param frequency Frequency in Hz
 * @param durationMs Duration in milliseconds
 * @param amplitude Amplitude (0.0 to 1.0)
 * @param sampleRate Sample rate in Hz (default: 16000)
 * @returns Audio samples
 */
export function generateTone(
  frequency: number,
  durationMs: number,
  amplitude: number = 0.5,
  sampleRate: number = AUDIO_FORMAT.SAMPLE_RATE
): Int16Array {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Int16Array(numSamples);

  const maxAmplitude = 32767 * amplitude;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    samples[i] = Math.round(Math.sin(2 * Math.PI * frequency * t) * maxAmplitude);
  }

  return samples;
}

/**
 * Create a WAV file buffer from audio samples
 *
 * @param samples Audio samples as Int16Array
 * @param sampleRate Sample rate in Hz (default: 16000)
 * @returns Buffer containing WAV file data
 */
export function createWavBuffer(
  samples: Int16Array,
  sampleRate: number = AUDIO_FORMAT.SAMPLE_RATE
): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * 2;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  // RIFF header
  buffer.write("RIFF", offset);
  offset += 4;
  buffer.writeUInt32LE(fileSize, offset);
  offset += 4;
  buffer.write("WAVE", offset);
  offset += 4;

  // fmt chunk
  buffer.write("fmt ", offset);
  offset += 4;
  buffer.writeUInt32LE(16, offset); // fmt chunk size
  offset += 4;
  buffer.writeUInt16LE(1, offset); // PCM format
  offset += 2;
  buffer.writeUInt16LE(numChannels, offset);
  offset += 2;
  buffer.writeUInt32LE(sampleRate, offset);
  offset += 4;
  buffer.writeUInt32LE(byteRate, offset);
  offset += 4;
  buffer.writeUInt16LE(blockAlign, offset);
  offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset);
  offset += 2;

  // data chunk
  buffer.write("data", offset);
  offset += 4;
  buffer.writeUInt32LE(dataSize, offset);
  offset += 4;

  // Write samples
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], offset);
    offset += 2;
  }

  return buffer;
}

/**
 * Save audio samples to a WAV file
 *
 * @param filePath Path to save the WAV file
 * @param samples Audio samples as Int16Array
 * @param sampleRate Sample rate in Hz (default: 16000)
 */
export async function saveWavFile(
  filePath: string,
  samples: Int16Array,
  sampleRate: number = AUDIO_FORMAT.SAMPLE_RATE
): Promise<void> {
  const buffer = createWavBuffer(samples, sampleRate);
  await Bun.write(filePath, buffer);
}
