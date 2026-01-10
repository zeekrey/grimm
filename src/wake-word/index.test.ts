import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import {
  WakeWordDetector,
  WakeWordError,
  WakeWordModelError,
  type WakeWordDetectorOptions,
} from "./index";

// Mock the onnxruntime-node module
const mockRun = mock(async () => ({
  output: { data: new Float32Array([0.1, 0.2, 0.3]) },
}));
const mockRelease = mock(async () => {});

const mockSession = {
  run: mockRun,
  release: mockRelease,
  inputNames: ["input"],
  outputNames: ["output"],
};

// Track create calls for testing
let createCallCount = 0;
let shouldFailCreate = false;
let modelPathChecks: string[] = [];

mock.module("onnxruntime-node", () => {
  return {
    InferenceSession: {
      create: mock(async (path: string) => {
        createCallCount++;
        if (shouldFailCreate) {
          throw new Error("Mock ONNX error");
        }
        return mockSession;
      }),
    },
    Tensor: class MockTensor {
      constructor(
        public type: string,
        public data: Float32Array,
        public dims: number[]
      ) {}
    },
  };
});

// Mock fs.existsSync
mock.module("fs", () => {
  return {
    existsSync: mock((path: string) => {
      modelPathChecks.push(path);
      // Return true for model files in the default path
      if (path.includes("models/")) {
        return path.includes("melspectrogram.onnx") ||
               path.includes("embedding_model.onnx") ||
               path.includes("hey_jarvis_v0.1.onnx");
      }
      return false;
    }),
  };
});

describe("WakeWordDetector", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockRun.mockReset();
    mockRelease.mockReset();
    createCallCount = 0;
    shouldFailCreate = false;
    modelPathChecks = [];

    // Default mock return value - low score (no detection)
    mockRun.mockResolvedValue({
      output: { data: new Float32Array([0.1]) },
    });
  });

  afterEach(async () => {
    // Cleanup is handled in individual tests
  });

  describe("create", () => {
    test("creates detector with default options", async () => {
      const detector = await WakeWordDetector.create();

      expect(detector).toBeInstanceOf(WakeWordDetector);
      expect(detector.released).toBe(false);
      expect(detector.getFrameLength()).toBe(1280);
      expect(detector.getSampleRate()).toBe(16000);

      await detector.release();
    });

    test("creates detector with custom sensitivity", async () => {
      const detector = await WakeWordDetector.create({
        sensitivity: 0.7,
      });

      expect(detector).toBeInstanceOf(WakeWordDetector);
      await detector.release();
    });

    test("creates detector with custom wake word", async () => {
      const detector = await WakeWordDetector.create({
        wakeWord: "hey_jarvis",
      });

      expect(detector).toBeInstanceOf(WakeWordDetector);
      await detector.release();
    });

    test("throws WakeWordError for invalid sensitivity (below 0)", async () => {
      await expect(
        WakeWordDetector.create({
          sensitivity: -0.1,
        })
      ).rejects.toThrow(WakeWordError);
    });

    test("throws WakeWordError for invalid sensitivity (above 1)", async () => {
      await expect(
        WakeWordDetector.create({
          sensitivity: 1.5,
        })
      ).rejects.toThrow(WakeWordError);
    });

    test("throws WakeWordModelError when ONNX fails to load", async () => {
      shouldFailCreate = true;

      await expect(WakeWordDetector.create()).rejects.toThrow(WakeWordModelError);
    });
  });

  describe("processFrame", () => {
    test("returns false when no wake word detected", async () => {
      const detector = await WakeWordDetector.create();

      // Mock low scores
      mockRun.mockResolvedValue({
        output: { data: new Float32Array([0.1]) },
      });

      const frame = new Int16Array(1280);
      const result = await detector.processFrame(frame);

      expect(result).toBe(false);

      await detector.release();
    });

    test("throws WakeWordError for invalid frame length", async () => {
      const detector = await WakeWordDetector.create();

      const invalidFrame = new Int16Array(256); // Wrong size

      await expect(detector.processFrame(invalidFrame)).rejects.toThrow(
        WakeWordError
      );

      await detector.release();
    });

    test("throws WakeWordError when detector is released", async () => {
      const detector = await WakeWordDetector.create();
      await detector.release();

      const frame = new Int16Array(1280);

      await expect(detector.processFrame(frame)).rejects.toThrow(
        "Detector has been released"
      );
    });
  });

  describe("getFrameLength", () => {
    test("returns correct frame length", async () => {
      const detector = await WakeWordDetector.create();

      expect(detector.getFrameLength()).toBe(1280);

      await detector.release();
    });

    test("throws WakeWordError when detector is released", async () => {
      const detector = await WakeWordDetector.create();
      await detector.release();

      expect(() => detector.getFrameLength()).toThrow("Detector has been released");
    });
  });

  describe("getSampleRate", () => {
    test("returns correct sample rate", async () => {
      const detector = await WakeWordDetector.create();

      expect(detector.getSampleRate()).toBe(16000);

      await detector.release();
    });

    test("throws WakeWordError when detector is released", async () => {
      const detector = await WakeWordDetector.create();
      await detector.release();

      expect(() => detector.getSampleRate()).toThrow("Detector has been released");
    });
  });

  describe("release", () => {
    test("releases resources correctly", async () => {
      const detector = await WakeWordDetector.create();

      expect(detector.released).toBe(false);

      await detector.release();

      expect(detector.released).toBe(true);
    });

    test("can be called multiple times safely", async () => {
      const detector = await WakeWordDetector.create();

      await detector.release();
      await detector.release();
      await detector.release();

      expect(detector.released).toBe(true);
    });
  });

  describe("reset", () => {
    test("resets internal buffers", async () => {
      const detector = await WakeWordDetector.create();

      // Process some frames
      const frame = new Int16Array(1280);
      await detector.processFrame(frame);

      // Reset
      detector.reset();

      // Should be able to continue processing
      const result = await detector.processFrame(frame);
      expect(result).toBe(false);

      await detector.release();
    });

    test("throws WakeWordError when detector is released", async () => {
      const detector = await WakeWordDetector.create();
      await detector.release();

      expect(() => detector.reset()).toThrow("Detector has been released");
    });
  });

  describe("error handling", () => {
    test("WakeWordError has correct name", () => {
      const error = new WakeWordError("test message");
      expect(error.name).toBe("WakeWordError");
      expect(error.message).toBe("test message");
    });

    test("WakeWordModelError has correct name", () => {
      const error = new WakeWordModelError();
      expect(error.name).toBe("WakeWordModelError");
      expect(error.message).toBe("Failed to load wake word model");
    });

    test("WakeWordModelError accepts custom message", () => {
      const error = new WakeWordModelError("custom message");
      expect(error.message).toBe("custom message");
    });
  });
});
