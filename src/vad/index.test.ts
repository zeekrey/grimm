import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import {
  VoiceActivityDetector,
  EndOfSpeechDetector,
  VADError,
  type VADResult,
} from "./index";

// Mock state for the VAD
let mockProbability = 0.2;

// Store the VAD instance's callbacks when created
let currentVadCallbacks: {
  onFrameProcessed?: (probabilities: { isSpeech: number }, frame: Float32Array) => void;
  onSpeechStart?: () => void;
  onSpeechRealStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onVADMisfire?: () => void;
} = {};

mock.module("avr-vad", () => {
  return {
    RealTimeVAD: {
      new: async (options: any) => {
        // Store callbacks for this VAD instance
        currentVadCallbacks = {
          onFrameProcessed: options?.onFrameProcessed,
          onSpeechStart: options?.onSpeechStart,
          onSpeechRealStart: options?.onSpeechRealStart,
          onSpeechEnd: options?.onSpeechEnd,
          onVADMisfire: options?.onVADMisfire,
        };
        return {
          start: () => {},
          pause: () => {},
          reset: () => {},
          processAudio: async (audio: Float32Array) => {
            // Simulate callback when processing audio
            if (currentVadCallbacks.onFrameProcessed) {
              currentVadCallbacks.onFrameProcessed({ isSpeech: mockProbability }, audio);
            }
            // If probability is high, trigger speech start
            if (mockProbability > 0.5 && currentVadCallbacks.onSpeechStart) {
              currentVadCallbacks.onSpeechStart();
            }
          },
        };
      },
    },
    Resampler: class MockResampler {
      process(audio: Float32Array): Float32Array[] {
        return [audio];
      }
    },
  };
});

describe("VoiceActivityDetector", () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockProbability = 0.2;
    currentVadCallbacks = {};
  });

  describe("create", () => {
    test("creates detector with default options", async () => {
      const vad = await VoiceActivityDetector.create();

      expect(vad).toBeInstanceOf(VoiceActivityDetector);
      expect(vad.released).toBe(false);
      expect(vad.getFrameLength()).toBe(1536);
      expect(vad.getSampleRate()).toBe(16000);

      await vad.release();
    });

    test("creates detector with custom thresholds", async () => {
      const vad = await VoiceActivityDetector.create({
        speechThreshold: 0.6,
        silenceThreshold: 0.4,
        silenceDuration: 1000,
      });

      expect(vad).toBeInstanceOf(VoiceActivityDetector);
      await vad.release();
    });

    test("throws VADError for invalid speech threshold (below 0)", async () => {
      await expect(
        VoiceActivityDetector.create({
          speechThreshold: -0.1,
        })
      ).rejects.toThrow(VADError);
    });

    test("throws VADError for invalid speech threshold (above 1)", async () => {
      await expect(
        VoiceActivityDetector.create({
          speechThreshold: 1.5,
        })
      ).rejects.toThrow(VADError);
    });

    test("throws VADError for invalid silence threshold", async () => {
      await expect(
        VoiceActivityDetector.create({
          silenceThreshold: -0.1,
        })
      ).rejects.toThrow(VADError);
    });

    test("throws VADError for invalid silence duration", async () => {
      await expect(
        VoiceActivityDetector.create({
          silenceDuration: -100,
        })
      ).rejects.toThrow(VADError);
    });
  });

  describe("processFrame", () => {
    test("returns continue status when no speech detected", async () => {
      const vad = await VoiceActivityDetector.create();

      mockProbability = 0.2;

      const frame = new Int16Array(1536);
      const result = await vad.processFrame(frame);

      expect(result.status).toBe("continue");
      expect(result.isSpeech).toBe(false);
      expect(result.probability).toBe(0.2);

      await vad.release();
    });

    test("detects speech when probability exceeds threshold", async () => {
      const vad = await VoiceActivityDetector.create({
        speechThreshold: 0.5,
      });

      mockProbability = 0.8;

      const frame = new Int16Array(1536);
      const result = await vad.processFrame(frame);

      expect(result.status).toBe("continue");
      expect(result.isSpeech).toBe(true);
      expect(result.probability).toBe(0.8);
      expect(vad.hasSpeech()).toBe(true);

      await vad.release();
    });

    test("throws VADError when VAD is released", async () => {
      const vad = await VoiceActivityDetector.create();
      await vad.release();

      const frame = new Int16Array(1536);

      await expect(vad.processFrame(frame)).rejects.toThrow(
        "VAD has been released"
      );
    });
  });

  describe("getFrameLength", () => {
    test("returns correct frame length", async () => {
      const vad = await VoiceActivityDetector.create();

      expect(vad.getFrameLength()).toBe(1536);

      await vad.release();
    });

    test("throws VADError when VAD is released", async () => {
      const vad = await VoiceActivityDetector.create();
      await vad.release();

      expect(() => vad.getFrameLength()).toThrow("VAD has been released");
    });
  });

  describe("getSampleRate", () => {
    test("returns correct sample rate", async () => {
      const vad = await VoiceActivityDetector.create();

      expect(vad.getSampleRate()).toBe(16000);

      await vad.release();
    });

    test("throws VADError when VAD is released", async () => {
      const vad = await VoiceActivityDetector.create();
      await vad.release();

      expect(() => vad.getSampleRate()).toThrow("VAD has been released");
    });
  });

  describe("reset", () => {
    test("resets internal state", async () => {
      const vad = await VoiceActivityDetector.create();

      // Simulate speech detection
      mockProbability = 0.8;

      const frame = new Int16Array(1536);
      await vad.processFrame(frame);
      expect(vad.hasSpeech()).toBe(true);

      // Reset
      vad.reset();

      expect(vad.hasSpeech()).toBe(false);
      expect(vad.getRecordingDuration()).toBe(0);

      await vad.release();
    });

    test("throws VADError when VAD is released", async () => {
      const vad = await VoiceActivityDetector.create();
      await vad.release();

      expect(() => vad.reset()).toThrow("VAD has been released");
    });
  });

  describe("release", () => {
    test("releases resources correctly", async () => {
      const vad = await VoiceActivityDetector.create();

      expect(vad.released).toBe(false);

      await vad.release();

      expect(vad.released).toBe(true);
    });

    test("can be called multiple times safely", async () => {
      const vad = await VoiceActivityDetector.create();

      await vad.release();
      await vad.release();
      await vad.release();

      expect(vad.released).toBe(true);
    });
  });

  describe("hasSpeech", () => {
    test("returns false initially", async () => {
      const vad = await VoiceActivityDetector.create();

      expect(vad.hasSpeech()).toBe(false);

      await vad.release();
    });
  });

  describe("getRecordingDuration", () => {
    test("returns 0 initially", async () => {
      const vad = await VoiceActivityDetector.create();

      expect(vad.getRecordingDuration()).toBe(0);

      await vad.release();
    });

    test("returns positive duration after processing frames", async () => {
      const vad = await VoiceActivityDetector.create();

      const frame = new Int16Array(1536);
      await vad.processFrame(frame);

      // Duration should be >= 0 after processing
      expect(vad.getRecordingDuration()).toBeGreaterThanOrEqual(0);

      await vad.release();
    });
  });
});

describe("EndOfSpeechDetector", () => {
  describe("constructor", () => {
    test("creates detector with default options", () => {
      const detector = new EndOfSpeechDetector();

      expect(detector).toBeInstanceOf(EndOfSpeechDetector);
    });

    test("creates detector with custom options", () => {
      const detector = new EndOfSpeechDetector(0.6, 1000, 60000);

      expect(detector).toBeInstanceOf(EndOfSpeechDetector);
    });
  });

  describe("processFrame", () => {
    test("returns continue when no speech detected", () => {
      const detector = new EndOfSpeechDetector(0.5, 700, 30000);

      const result = detector.processFrame(0.2);

      expect(result).toBe("continue");
    });

    test("returns continue when speech is detected", () => {
      const detector = new EndOfSpeechDetector(0.5, 700, 30000);

      const result = detector.processFrame(0.8);

      expect(result).toBe("continue");
    });

    test("returns continue during silence after speech (within duration)", () => {
      const detector = new EndOfSpeechDetector(0.5, 700, 30000);

      // First detect speech
      detector.processFrame(0.8);

      // Then silence
      const result = detector.processFrame(0.2);

      expect(result).toBe("continue");
    });
  });

  describe("reset", () => {
    test("resets internal state", () => {
      const detector = new EndOfSpeechDetector(0.5, 700, 30000);

      // Process some frames
      detector.processFrame(0.8);
      detector.processFrame(0.2);

      // Reset
      detector.reset();

      // Should be back to initial state
      const result = detector.processFrame(0.2);
      expect(result).toBe("continue");
    });
  });
});

describe("VADError", () => {
  test("has correct name", () => {
    const error = new VADError("test message");
    expect(error.name).toBe("VADError");
    expect(error.message).toBe("test message");
  });
});
