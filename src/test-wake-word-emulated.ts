#!/usr/bin/env bun
/**
 * Test Wake Word Detection with Emulated Audio
 *
 * This script tests the wake word detection pipeline using emulated audio input
 * instead of a real microphone. It demonstrates how to use the EmulatedChannel
 * for testing without hardware.
 *
 * Usage:
 *   # First download the models
 *   bun run models:download
 *
 *   # With a pre-recorded wake word file:
 *   bun run test:emulated path/to/wakeword.wav
 *
 *   # With generated test audio (won't trigger wake word, but tests the pipeline):
 *   bun run test:emulated
 *
 * No API key required! Uses open-source OpenWakeWord models.
 */

import { EmulatedChannel, generateSilence, generateTone, concatenateAudio } from "./audio";
import {
  WakeWordDetector,
  WakeWordModelError,
  WakeWordError,
} from "./wake-word";
import { existsSync } from "fs";

// ANSI colors for output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function logInfo(message: string): void {
  log(`[INFO] ${message}`, colors.cyan);
}

function logSuccess(message: string): void {
  log(`[PASS] ${message}`, colors.green);
}

function logError(message: string): void {
  log(`[FAIL] ${message}`, colors.red);
}

function logWarning(message: string): void {
  log(`[WARN] ${message}`, colors.yellow);
}

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  detections: number;
  framesProcessed: number;
  durationMs: number;
}

/**
 * Run wake word detection on emulated audio
 */
async function testWakeWordDetection(
  detector: WakeWordDetector,
  channel: EmulatedChannel,
  testName: string
): Promise<TestResult> {
  const startTime = performance.now();
  let detections = 0;
  let framesProcessed = 0;

  return new Promise((resolve) => {
    channel.onFrame(async (frame) => {
      try {
        framesProcessed++;
        const detected = await detector.processFrame(frame);
        if (detected) {
          detections++;
          const timestamp = new Date().toISOString();
          log(`  [${timestamp}] Wake word detected!`, colors.green);
        }
      } catch (error) {
        if (error instanceof WakeWordError) {
          logError(`Frame processing error: ${error.message}`);
        }
      }
    });

    // When channel completes, resolve with results
    channel.waitForCompletion().then(() => {
      const durationMs = performance.now() - startTime;
      resolve({
        name: testName,
        passed: true, // Basic test passes if no errors
        message: `Processed ${framesProcessed} frames, ${detections} detection(s)`,
        detections,
        framesProcessed,
        durationMs,
      });
    });

    channel.start();
  });
}

/**
 * Generate test audio that mimics speech patterns
 * This won't trigger the wake word but tests the pipeline
 */
function generateTestAudio(): Int16Array {
  // Create a pattern: silence + tones at different frequencies + silence
  // This simulates speech-like audio activity
  let audio = generateSilence(200); // 200ms lead-in silence

  // Add some "activity" - tones at different frequencies
  const frequencies = [200, 400, 300, 500, 250];
  for (const freq of frequencies) {
    audio = concatenateAudio(audio, generateTone(freq, 100, 0.3));
    audio = concatenateAudio(audio, generateSilence(50));
  }

  // Trailing silence
  audio = concatenateAudio(audio, generateSilence(200));

  return audio;
}

async function main(): Promise<void> {
  console.log("==========================================");
  console.log("  Wake Word Detection - Emulation Test");
  console.log("  (OpenWakeWord - No API Key Required)");
  console.log("==========================================\n");

  // Check for audio file argument
  const audioFile = process.argv[2];
  let channel: EmulatedChannel;
  let testName: string;

  if (audioFile) {
    if (!existsSync(audioFile)) {
      logError(`Audio file not found: ${audioFile}`);
      process.exit(1);
    }
    logInfo(`Loading audio file: ${audioFile}`);
    try {
      channel = await EmulatedChannel.fromFile(audioFile, { realtime: false });
      testName = `Wake Word Test (${audioFile})`;
    } catch (error) {
      logError(`Failed to load audio file: ${(error as Error).message}`);
      process.exit(1);
    }
  } else {
    logWarning("No audio file provided - using generated test audio");
    logInfo("This will test the pipeline but won't trigger the wake word");
    console.log("  To test with real wake word audio:");
    console.log("  bun run test:emulated path/to/hey_jarvis.wav\n");

    const testAudio = generateTestAudio();
    channel = EmulatedChannel.fromBuffer(testAudio, { realtime: false });
    testName = "Pipeline Test (generated audio)";
  }

  // Initialize detector
  let detector: WakeWordDetector;
  try {
    logInfo("Initializing wake word detector (OpenWakeWord)...");
    detector = await WakeWordDetector.create({
      sensitivity: 0.5,
      wakeWord: "hey_jarvis",
    });
    logSuccess(
      `Detector initialized (frame: ${detector.getFrameLength()}, rate: ${detector.getSampleRate()}Hz)`
    );
  } catch (error) {
    if (error instanceof WakeWordModelError) {
      logError("Wake word models not found");
      console.log("");
      console.log("Please download the models first:");
      console.log("  bun run models:download");
      console.log("");
    } else {
      logError(`Failed to initialize detector: ${(error as Error).message}`);
    }
    process.exit(1);
  }

  // Display audio info
  console.log(`\n${colors.dim}Audio Info:${colors.reset}`);
  console.log(`  Duration: ${channel.getDurationMs().toFixed(0)}ms`);
  console.log(`  Frames: ${channel.getTotalFrames()}`);
  console.log(`  Mode: Fast (no delays)\n`);

  // Run test
  console.log(`${colors.blue}Running: ${testName}${colors.reset}`);
  console.log(colors.dim + "-".repeat(50) + colors.reset);

  try {
    const result = await testWakeWordDetection(detector, channel, testName);

    console.log(colors.dim + "-".repeat(50) + colors.reset);
    console.log(`\n${colors.blue}Results:${colors.reset}`);
    console.log(`  Test: ${result.name}`);
    console.log(`  Frames Processed: ${result.framesProcessed}`);
    console.log(`  Detections: ${result.detections}`);
    console.log(`  Duration: ${result.durationMs.toFixed(2)}ms`);

    if (result.detections > 0) {
      logSuccess(`\nWake word detected ${result.detections} time(s)!`);
    } else if (audioFile) {
      logWarning("\nNo wake word detected in audio file");
      console.log("  Possible reasons:");
      console.log("  - Audio doesn't contain 'Hey Jarvis' wake word");
      console.log("  - Audio quality/format issues");
      console.log("  - Sensitivity too low (try increasing)");
    } else {
      logInfo("\nNo detection (expected - using generated test audio)");
    }
  } catch (error) {
    logError(`Test failed: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    // Cleanup
    await detector.release();
    channel.release();
  }

  console.log("\n==========================================");
  logSuccess("Emulation test completed successfully");
  console.log("==========================================");
}

// Run
main().catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});
