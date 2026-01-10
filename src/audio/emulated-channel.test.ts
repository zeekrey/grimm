/**
 * Unit Tests for EmulatedChannel
 */

import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { EmulatedChannel } from "./emulated-channel";
import { AUDIO_FORMAT } from "./types";
import {
  generateSilence,
  generateTone,
  saveWavFile,
  loadWavFile,
} from "./utils";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";

const TEST_FIXTURES_DIR = join(import.meta.dir, "../../tests/fixtures");
const TEMP_DIR = join(import.meta.dir, "../../tests/temp");

// Ensure temp directory exists
beforeAll(() => {
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
});

describe("EmulatedChannel", () => {
  let channel: EmulatedChannel | null = null;

  afterEach(() => {
    if (channel) {
      channel.release();
      channel = null;
    }
  });

  describe("Construction", () => {
    it("creates with default options", () => {
      channel = new EmulatedChannel();

      expect(channel.getSampleRate()).toBe(AUDIO_FORMAT.SAMPLE_RATE);
      expect(channel.getFrameLength()).toBe(AUDIO_FORMAT.FRAME_LENGTH);
      expect(channel.isRunning()).toBe(false);
    });

    it("creates with custom frame length", () => {
      channel = new EmulatedChannel({ frameLength: 1024 });

      expect(channel.getFrameLength()).toBe(1024);
    });

    it("creates with custom sample rate", () => {
      channel = new EmulatedChannel({ sampleRate: 44100 });

      expect(channel.getSampleRate()).toBe(44100);
    });

    it("creates with audio buffer", () => {
      const buffer = generateSilence(100);
      channel = new EmulatedChannel({ audioBuffer: buffer });

      expect(channel.getDurationMs()).toBeGreaterThan(0);
    });
  });

  describe("Static Factory Methods", () => {
    it("creates from buffer using fromBuffer()", () => {
      const buffer = generateTone(440, 100);
      channel = EmulatedChannel.fromBuffer(buffer);

      expect(channel.getDurationMs()).toBeCloseTo(100, -1);
    });

    it("creates from file using fromFile()", async () => {
      const filePath = join(TEST_FIXTURES_DIR, "tone-440hz-1s.wav");

      // Skip if test fixtures don't exist
      if (!existsSync(filePath)) {
        console.log("Skipping test - fixtures not generated");
        return;
      }

      channel = await EmulatedChannel.fromFile(filePath);

      expect(channel.getDurationMs()).toBeCloseTo(1000, -1);
    });

    it("fromFile() with options", async () => {
      const filePath = join(TEST_FIXTURES_DIR, "tone-440hz-1s.wav");

      if (!existsSync(filePath)) {
        console.log("Skipping test - fixtures not generated");
        return;
      }

      channel = await EmulatedChannel.fromFile(filePath, { realtime: false });

      expect(channel.isRunning()).toBe(false);
    });
  });

  describe("Audio Loading", () => {
    it("loads audio from WAV file", async () => {
      const filePath = join(TEST_FIXTURES_DIR, "silence-1s.wav");

      if (!existsSync(filePath)) {
        console.log("Skipping test - fixtures not generated");
        return;
      }

      channel = new EmulatedChannel();
      await channel.loadFromFile(filePath);

      // 1 second at 16kHz = 16000 samples
      expect(channel.getDurationMs()).toBeCloseTo(1000, -1);
    });

    it("setAudioBuffer() sets new buffer", () => {
      const buffer1 = generateSilence(100);
      const buffer2 = generateSilence(200);

      channel = new EmulatedChannel({ audioBuffer: buffer1 });
      const duration1 = channel.getDurationMs();

      channel.setAudioBuffer(buffer2);
      const duration2 = channel.getDurationMs();

      expect(duration2).toBeGreaterThan(duration1);
    });

    it("setAudioBuffer() resets position", () => {
      channel = new EmulatedChannel({ audioBuffer: generateSilence(100) });

      // Move position
      channel.start();
      channel.stop();

      // Set new buffer should reset position
      channel.setAudioBuffer(generateSilence(100));
      expect(channel.getPosition()).toBe(0);
    });
  });

  describe("Audio Manipulation", () => {
    it("prependAudio() adds audio at beginning", () => {
      const original = generateSilence(100);
      const prepend = generateTone(440, 50);

      channel = new EmulatedChannel({ audioBuffer: original });
      const originalDuration = channel.getDurationMs();

      channel.prependAudio(prepend);

      expect(channel.getDurationMs()).toBeCloseTo(originalDuration + 50, -1);
    });

    it("appendAudio() adds audio at end", () => {
      const original = generateSilence(100);
      const append = generateTone(440, 50);

      channel = new EmulatedChannel({ audioBuffer: original });
      const originalDuration = channel.getDurationMs();

      channel.appendAudio(append);

      expect(channel.getDurationMs()).toBeCloseTo(originalDuration + 50, -1);
    });
  });

  describe("Frame Emission", () => {
    it("emits frames of correct size", async () => {
      const buffer = generateSilence(100);
      channel = new EmulatedChannel({
        audioBuffer: buffer,
        realtime: false,
      });

      const frames: Int16Array[] = [];
      channel.onFrame((frame) => {
        frames.push(frame);
      });

      channel.start();
      await channel.waitForCompletion();

      // All frames should be exactly frameLength
      for (const frame of frames) {
        expect(frame.length).toBe(AUDIO_FORMAT.FRAME_LENGTH);
      }
    });

    it("pads last frame with zeros if needed", async () => {
      // Create audio that's not a multiple of frame length
      // 600 samples = 512 (1 frame) + 88 samples
      const samples = new Int16Array(600);
      samples.fill(1000); // Non-zero values

      channel = new EmulatedChannel({
        audioBuffer: samples,
        realtime: false,
      });

      const frames: Int16Array[] = [];
      channel.onFrame((frame) => {
        frames.push(new Int16Array(frame)); // Copy to preserve
      });

      channel.start();
      await channel.waitForCompletion();

      expect(frames.length).toBe(2);

      // First frame should be full
      expect(frames[0].length).toBe(512);

      // Second frame should be padded with zeros at the end
      expect(frames[1].length).toBe(512);
      // First 88 samples should be 1000
      for (let i = 0; i < 88; i++) {
        expect(frames[1][i]).toBe(1000);
      }
      // Rest should be zeros
      for (let i = 88; i < 512; i++) {
        expect(frames[1][i]).toBe(0);
      }
    });

    it("emits correct number of frames", async () => {
      // 1536 samples = exactly 3 frames
      const samples = new Int16Array(1536);
      channel = new EmulatedChannel({
        audioBuffer: samples,
        realtime: false,
      });

      let frameCount = 0;
      channel.onFrame(() => {
        frameCount++;
      });

      channel.start();
      await channel.waitForCompletion();

      expect(frameCount).toBe(3);
    });

    it("respects custom frame length", async () => {
      const samples = new Int16Array(1024);
      channel = new EmulatedChannel({
        audioBuffer: samples,
        realtime: false,
        frameLength: 256,
      });

      const frames: Int16Array[] = [];
      channel.onFrame((frame) => {
        frames.push(frame);
      });

      channel.start();
      await channel.waitForCompletion();

      expect(frames.length).toBe(4); // 1024 / 256 = 4
      expect(frames[0].length).toBe(256);
    });
  });

  describe("Real-time vs Fast Mode", () => {
    it("fast mode processes immediately (no delays)", async () => {
      const buffer = generateSilence(500); // 500ms of audio
      channel = new EmulatedChannel({
        audioBuffer: buffer,
        realtime: false,
      });

      let frameCount = 0;
      channel.onFrame(() => {
        frameCount++;
      });

      const startTime = performance.now();
      channel.start();
      await channel.waitForCompletion();
      const elapsed = performance.now() - startTime;

      // Should complete in much less than 500ms (the audio duration)
      expect(elapsed).toBeLessThan(100);
      expect(frameCount).toBeGreaterThan(0);
    });

    it("real-time mode has delays between frames", async () => {
      // Very short audio to keep test fast
      const buffer = generateSilence(100); // 100ms
      channel = new EmulatedChannel({
        audioBuffer: buffer,
        realtime: true,
      });

      let frameCount = 0;
      channel.onFrame(() => {
        frameCount++;
      });

      const startTime = performance.now();
      channel.start();
      await channel.waitForCompletion();
      const elapsed = performance.now() - startTime;

      // Should take at least close to 100ms (with some tolerance)
      expect(elapsed).toBeGreaterThan(50);
      expect(frameCount).toBeGreaterThan(0);
    });
  });

  describe("State Management", () => {
    it("isRunning() reflects current state", async () => {
      const buffer = generateSilence(100);
      channel = new EmulatedChannel({
        audioBuffer: buffer,
        realtime: false,
      });

      expect(channel.isRunning()).toBe(false);

      channel.start();
      // Note: in fast mode, might complete before we check
      // So we just verify it was started

      await channel.waitForCompletion();
      expect(channel.isRunning()).toBe(false);
    });

    it("stop() halts emission", async () => {
      const buffer = generateSilence(1000); // 1 second
      channel = new EmulatedChannel({
        audioBuffer: buffer,
        realtime: true,
      });

      let frameCount = 0;
      channel.onFrame(() => {
        frameCount++;
      });

      channel.start();
      await Bun.sleep(50); // Let some frames emit
      channel.stop();

      const countAtStop = frameCount;
      await Bun.sleep(50);

      // No more frames should have been emitted after stop
      expect(frameCount).toBe(countAtStop);
      expect(channel.isRunning()).toBe(false);
    });

    it("reset() returns to beginning", async () => {
      const buffer = generateSilence(100);
      channel = new EmulatedChannel({
        audioBuffer: buffer,
        realtime: false,
      });

      channel.start();
      await channel.waitForCompletion();

      expect(channel.isComplete()).toBe(true);

      channel.reset();

      expect(channel.getPosition()).toBe(0);
      expect(channel.isComplete()).toBe(false);
    });

    it("getProgress() returns correct percentage", () => {
      const samples = new Int16Array(1000);
      channel = new EmulatedChannel({ audioBuffer: samples });

      expect(channel.getProgress()).toBe(0);

      // Can't easily test mid-progress without exposing internals
      // but we can test completion
    });

    it("isComplete() returns true when all audio emitted", async () => {
      const buffer = generateSilence(50);
      channel = new EmulatedChannel({
        audioBuffer: buffer,
        realtime: false,
      });

      expect(channel.isComplete()).toBe(false);

      channel.start();
      await channel.waitForCompletion();

      expect(channel.isComplete()).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("throws when starting with no audio data", () => {
      channel = new EmulatedChannel();

      expect(() => channel!.start()).toThrow("no audio data");
    });

    it("throws when starting after release", () => {
      const buffer = generateSilence(100);
      channel = new EmulatedChannel({ audioBuffer: buffer });
      channel.release();

      expect(() => channel!.start()).toThrow("released");
    });

    it("start() is idempotent when already running", () => {
      const buffer = generateSilence(1000);
      channel = new EmulatedChannel({
        audioBuffer: buffer,
        realtime: true,
      });

      channel.start();
      channel.start(); // Should not throw
      channel.stop();
    });
  });

  describe("Resource Management", () => {
    it("release() stops and cleans up", () => {
      const buffer = generateSilence(100);
      channel = new EmulatedChannel({ audioBuffer: buffer });

      channel.start();
      channel.release();

      expect(channel.isReleased()).toBe(true);
      expect(channel.isRunning()).toBe(false);
    });

    it("release() is idempotent", () => {
      const buffer = generateSilence(100);
      channel = new EmulatedChannel({ audioBuffer: buffer });

      channel.release();
      channel.release(); // Should not throw
    });
  });

  describe("Integration with WAV Files", () => {
    it("loads and emits test fixture correctly", async () => {
      const filePath = join(TEST_FIXTURES_DIR, "three-frames.wav");

      if (!existsSync(filePath)) {
        console.log("Skipping test - fixtures not generated");
        return;
      }

      channel = await EmulatedChannel.fromFile(filePath, { realtime: false });

      const frames: Int16Array[] = [];
      channel.onFrame((frame) => {
        frames.push(new Int16Array(frame));
      });

      channel.start();
      await channel.waitForCompletion();

      // three-frames.wav has ~1536 samples = 3 frames
      expect(frames.length).toBe(3);
    });

    it("round-trips generated audio correctly", async () => {
      const tempFile = join(TEMP_DIR, "roundtrip-test.wav");
      const originalSamples = generateTone(440, 100, 0.5);

      // Save to file
      await saveWavFile(tempFile, originalSamples);

      // Load via EmulatedChannel
      channel = await EmulatedChannel.fromFile(tempFile, { realtime: false });

      const receivedSamples: number[] = [];
      channel.onFrame((frame) => {
        for (const sample of frame) {
          if (receivedSamples.length < originalSamples.length) {
            receivedSamples.push(sample);
          }
        }
      });

      channel.start();
      await channel.waitForCompletion();

      // Verify samples match (within the original length)
      for (let i = 0; i < originalSamples.length; i++) {
        expect(receivedSamples[i]).toBe(originalSamples[i]);
      }

      // Cleanup
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    });
  });
});
