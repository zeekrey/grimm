/**
 * Demo script for wake word detection using OpenWakeWord
 *
 * Usage:
 *   # First download the models
 *   bun run models:download
 *
 *   # Then run the demo
 *   bun run demo:wake
 *
 * No API key required! Uses open-source OpenWakeWord models.
 */

import { PvRecorder } from "@picovoice/pvrecorder-node";
import { WakeWordDetector, WakeWordError, WakeWordModelError } from "./wake-word";
import { selectAudioDevice, getDeviceName } from "./utils/select-audio-device";

let detector: WakeWordDetector | null = null;
let recorder: PvRecorder | null = null;
let isRunning = true;

/**
 * Cleanup function to release all resources
 */
async function cleanup(): Promise<void> {
  console.log("\nShutting down...");

  if (recorder) {
    try {
      recorder.stop();
      recorder.release();
      recorder = null;
      console.log("Recorder released");
    } catch (error) {
      console.error("Error releasing recorder:", error);
    }
  }

  if (detector) {
    try {
      await detector.release();
      detector = null;
      console.log("Detector released");
    } catch (error) {
      console.error("Error releasing detector:", error);
    }
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  // Handle graceful shutdown
  process.on("SIGINT", () => {
    isRunning = false;
  });

  process.on("SIGTERM", () => {
    isRunning = false;
  });

  try {
    // Select audio device
    const deviceIndex = await selectAudioDevice(5000);
    console.log(`\nUsing device: ${getDeviceName(deviceIndex)}`);

    // Initialize wake word detector (OpenWakeWord - no API key needed!)
    console.log("Initializing wake word detector (OpenWakeWord)...");
    detector = await WakeWordDetector.create({
      sensitivity: 0.5,
      wakeWord: "hey_jarvis",
    });
    console.log(`  Frame length: ${detector.getFrameLength()} samples`);
    console.log(`  Sample rate: ${detector.getSampleRate()} Hz`);

    // Initialize recorder with selected device
    console.log("\nInitializing audio recorder...");
    recorder = new PvRecorder(detector.getFrameLength(), deviceIndex);
    console.log(`  Using device: ${recorder.getSelectedDevice()}`);

    // Start recording
    recorder.start();
    console.log("\n===========================================");
    console.log("Listening for wake word 'Hey Jarvis'...");
    console.log("Press Ctrl+C to exit");
    console.log("===========================================\n");

    let detectionCount = 0;

    // Main detection loop
    while (isRunning) {
      // Read audio frame from microphone
      const frame = await recorder.read();

      // Process frame for wake word detection
      const detected = await detector.processFrame(frame);

      if (detected) {
        detectionCount++;
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Wake word detected! (count: ${detectionCount})`);
      }
    }
  } catch (error) {
    if (error instanceof WakeWordModelError) {
      console.error("Error: Wake word model not found");
      console.error("");
      console.error("Please download the models first:");
      console.error("  bun run models:download");
      console.error("");
    } else if (error instanceof WakeWordError) {
      console.error(`Wake word error: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred");
    }
    process.exit(1);
  } finally {
    await cleanup();
    console.log("Goodbye!");
  }
}

// Run the demo
main();
