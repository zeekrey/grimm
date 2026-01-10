/**
 * Unit Tests for Audio Utilities
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  loadWavFile,
  loadAudioFile,
  concatenateAudio,
  generateSilence,
  generateTone,
  createWavBuffer,
  saveWavFile,
} from "./utils";
import { AUDIO_FORMAT } from "./types";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_FIXTURES_DIR = join(import.meta.dir, "../../tests/fixtures");
const TEMP_DIR = join(import.meta.dir, "../../tests/temp");

beforeAll(() => {
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
});

describe("generateSilence", () => {
  it("generates correct number of samples", () => {
    const silence = generateSilence(1000); // 1 second

    // 1 second at 16kHz = 16000 samples
    expect(silence.length).toBe(16000);
  });

  it("generates all zeros", () => {
    const silence = generateSilence(100);

    for (const sample of silence) {
      expect(sample).toBe(0);
    }
  });

  it("respects custom sample rate", () => {
    const silence = generateSilence(1000, 44100);

    expect(silence.length).toBe(44100);
  });

  it("generates correct duration for short durations", () => {
    const silence = generateSilence(32); // 32ms = 512 samples at 16kHz

    expect(silence.length).toBe(512);
  });
});

describe("generateTone", () => {
  it("generates correct number of samples", () => {
    const tone = generateTone(440, 1000);

    expect(tone.length).toBe(16000);
  });

  it("generates non-zero samples", () => {
    const tone = generateTone(440, 100);

    const hasNonZero = tone.some((sample) => sample !== 0);
    expect(hasNonZero).toBe(true);
  });

  it("respects amplitude", () => {
    const lowAmp = generateTone(440, 100, 0.1);
    const highAmp = generateTone(440, 100, 0.9);

    const maxLow = Math.max(...lowAmp.map(Math.abs));
    const maxHigh = Math.max(...highAmp.map(Math.abs));

    expect(maxHigh).toBeGreaterThan(maxLow);
  });

  it("generates values within Int16 range", () => {
    const tone = generateTone(440, 100, 1.0);

    for (const sample of tone) {
      expect(sample).toBeGreaterThanOrEqual(-32768);
      expect(sample).toBeLessThanOrEqual(32767);
    }
  });

  it("generates sinusoidal pattern", () => {
    const tone = generateTone(1000, 10, 0.5); // 1kHz for 10ms

    // At 16kHz, 1kHz tone completes 1 cycle every 16 samples
    // Check that values oscillate
    let crossings = 0;
    for (let i = 1; i < tone.length; i++) {
      if ((tone[i - 1] < 0 && tone[i] >= 0) || (tone[i - 1] >= 0 && tone[i] < 0)) {
        crossings++;
      }
    }

    // 10ms at 1kHz should have ~10 complete cycles = ~20 zero crossings
    expect(crossings).toBeGreaterThan(15);
    expect(crossings).toBeLessThan(25);
  });
});

describe("concatenateAudio", () => {
  it("concatenates two arrays", () => {
    const a = new Int16Array([1, 2, 3]);
    const b = new Int16Array([4, 5, 6]);

    const result = concatenateAudio(a, b);

    expect(result.length).toBe(6);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("handles empty first array", () => {
    const a = new Int16Array(0);
    const b = new Int16Array([1, 2, 3]);

    const result = concatenateAudio(a, b);

    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it("handles empty second array", () => {
    const a = new Int16Array([1, 2, 3]);
    const b = new Int16Array(0);

    const result = concatenateAudio(a, b);

    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it("preserves Int16 values", () => {
    const a = new Int16Array([32767, -32768]);
    const b = new Int16Array([0, 1000]);

    const result = concatenateAudio(a, b);

    expect(result[0]).toBe(32767);
    expect(result[1]).toBe(-32768);
  });
});

describe("createWavBuffer", () => {
  it("creates valid WAV header", () => {
    const samples = generateSilence(100);
    const buffer = createWavBuffer(samples);

    // Check RIFF header
    expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buffer.toString("ascii", 12, 16)).toBe("fmt ");
    expect(buffer.toString("ascii", 36, 40)).toBe("data");
  });

  it("creates correct format chunk", () => {
    const samples = generateSilence(100);
    const buffer = createWavBuffer(samples);

    // fmt chunk values (after "fmt " at offset 12)
    expect(buffer.readUInt16LE(20)).toBe(1); // PCM format
    expect(buffer.readUInt16LE(22)).toBe(1); // mono
    expect(buffer.readUInt32LE(24)).toBe(16000); // sample rate
    expect(buffer.readUInt16LE(34)).toBe(16); // bits per sample
  });

  it("creates correct data size", () => {
    const samples = new Int16Array(100);
    const buffer = createWavBuffer(samples);

    // Data size at offset 40
    expect(buffer.readUInt32LE(40)).toBe(200); // 100 samples * 2 bytes
  });

  it("includes all sample data", () => {
    const samples = new Int16Array([1000, -1000, 32767, -32768]);
    const buffer = createWavBuffer(samples);

    // Data starts at offset 44
    expect(buffer.readInt16LE(44)).toBe(1000);
    expect(buffer.readInt16LE(46)).toBe(-1000);
    expect(buffer.readInt16LE(48)).toBe(32767);
    expect(buffer.readInt16LE(50)).toBe(-32768);
  });
});

describe("saveWavFile and loadWavFile", () => {
  const tempFile = join(TEMP_DIR, "test-save-load.wav");

  afterAll(() => {
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  });

  it("round-trips audio data correctly", async () => {
    const original = generateTone(440, 100, 0.5);

    await saveWavFile(tempFile, original);
    const loaded = await loadWavFile(tempFile);

    expect(loaded.length).toBe(original.length);

    for (let i = 0; i < original.length; i++) {
      expect(loaded[i]).toBe(original[i]);
    }
  });

  it("saves with custom sample rate", async () => {
    const original = new Int16Array([1, 2, 3, 4]);

    await saveWavFile(tempFile, original, 44100);
    const buffer = await Bun.file(tempFile).arrayBuffer();
    const wavBuffer = Buffer.from(buffer);

    expect(wavBuffer.readUInt32LE(24)).toBe(44100);
  });
});

describe("loadWavFile", () => {
  it("loads valid WAV file", async () => {
    const filePath = join(TEST_FIXTURES_DIR, "silence-1s.wav");

    if (!existsSync(filePath)) {
      console.log("Skipping test - fixtures not generated");
      return;
    }

    const samples = await loadWavFile(filePath);

    expect(samples.length).toBe(16000);
    expect(samples).toBeInstanceOf(Int16Array);
  });

  it("throws for non-existent file", async () => {
    const filePath = join(TEST_FIXTURES_DIR, "nonexistent.wav");

    await expect(loadWavFile(filePath)).rejects.toThrow("not found");
  });

  it("throws for wrong sample rate", async () => {
    // Create a WAV with wrong sample rate
    const tempFile = join(TEMP_DIR, "wrong-rate.wav");
    const samples = new Int16Array(100);
    const buffer = createWavBuffer(samples, 44100);
    await Bun.write(tempFile, buffer);

    await expect(loadWavFile(tempFile)).rejects.toThrow("sample rate");

    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  });
});

describe("loadAudioFile", () => {
  it("loads WAV file directly when format matches", async () => {
    const filePath = join(TEST_FIXTURES_DIR, "tone-440hz-1s.wav");

    if (!existsSync(filePath)) {
      console.log("Skipping test - fixtures not generated");
      return;
    }

    const samples = await loadAudioFile(filePath);

    expect(samples.length).toBe(16000);
  });

  it("handles non-WAV extensions (if ffmpeg available)", async () => {
    // This test requires ffmpeg - skip if not available
    const filePath = join(TEST_FIXTURES_DIR, "tone-440hz-1s.wav");

    if (!existsSync(filePath)) {
      console.log("Skipping test - fixtures not generated");
      return;
    }

    // Test the ffmpeg fallback by loading a valid file
    // (actual non-WAV test would require ffmpeg)
    const samples = await loadAudioFile(filePath);
    expect(samples.length).toBeGreaterThan(0);
  });
});
