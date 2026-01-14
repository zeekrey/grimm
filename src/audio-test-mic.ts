#!/usr/bin/env bun
/**
 * Audio Input (Microphone) Test Script
 *
 * Helps identify the correct microphone device on Raspberry Pi.
 * Cycles through all available microphones, visualizing audio input
 * in real-time so users can identify which device is working.
 *
 * Usage: bun run audio:test-mic
 */

import { PvRecorder } from "@picovoice/pvrecorder-node";
import * as readline from "readline";

const TEST_DURATION_MS = 5000; // 5 seconds per device
const FRAME_LENGTH = 512;
const SAMPLE_RATE = 16000;
const BAR_WIDTH = 30;
const UPDATE_INTERVAL_MS = 50; // Update visualization every 50ms

/**
 * Calculate RMS (Root Mean Square) of audio samples
 * Returns a value between 0 and 1
 */
function calculateRMS(samples: Int16Array): number {
  if (samples.length === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    // Normalize to -1 to 1 range
    const normalized = samples[i] / 32768;
    sumSquares += normalized * normalized;
  }

  return Math.sqrt(sumSquares / samples.length);
}

/**
 * Convert RMS to a more perceptual level (0-100)
 * Uses a logarithmic scale for better visualization
 */
function rmsToLevel(rms: number): number {
  if (rms < 0.001) return 0;

  // Apply logarithmic scaling for better perception
  // Human hearing is roughly logarithmic
  const db = 20 * Math.log10(rms);
  // Map -60dB to 0dB range to 0-100
  const level = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

  return Math.round(level);
}

/**
 * Create a visual bar representation of the audio level
 */
function createLevelBar(level: number): string {
  const filledCount = Math.round((level / 100) * BAR_WIDTH);
  const emptyCount = BAR_WIDTH - filledCount;

  const filled = "\u2588".repeat(filledCount); // █
  const empty = "\u2591".repeat(emptyCount); // ░

  const levelStr = level.toString().padStart(3, " ");

  // Color coding: green for low, yellow for medium, red for high
  let color = "\x1b[32m"; // green
  if (level > 60) color = "\x1b[31m"; // red
  else if (level > 30) color = "\x1b[33m"; // yellow

  const reset = "\x1b[0m";

  return `[${color}${filled}${reset}${empty}] ${levelStr}%`;
}

/**
 * Test a single microphone device
 */
async function testDevice(deviceIndex: number, deviceName: string): Promise<void> {
  console.log(`\n\x1b[1mTesting microphone [${deviceIndex}]: ${deviceName}\x1b[0m`);
  console.log("Speak into the microphone to see the level visualization...\n");

  let recorder: PvRecorder | null = null;
  let currentLevel = 0;
  let running = true;

  try {
    recorder = new PvRecorder(FRAME_LENGTH, deviceIndex);
    recorder.start();

    const startTime = Date.now();

    // Audio reading loop
    const readLoop = async () => {
      while (running && recorder) {
        try {
          const frame = await recorder.read();
          const rms = calculateRMS(frame);
          currentLevel = rmsToLevel(rms);
        } catch {
          break;
        }
      }
    };

    // Start reading audio
    const readPromise = readLoop();

    // Visualization loop
    while (Date.now() - startTime < TEST_DURATION_MS) {
      const elapsed = Date.now() - startTime;
      const remaining = Math.ceil((TEST_DURATION_MS - elapsed) / 1000);

      // Clear line and write new visualization
      process.stdout.write(`\r${createLevelBar(currentLevel)}  (${remaining}s remaining)`);

      await new Promise((resolve) => setTimeout(resolve, UPDATE_INTERVAL_MS));
    }

    running = false;
    await readPromise;

    // Clear the line and show completion
    process.stdout.write("\r" + " ".repeat(60) + "\r");
    console.log(`\x1b[32m✓ Device [${deviceIndex}] test complete\x1b[0m`);
  } catch (error) {
    console.log(`\x1b[31m✗ Error testing device [${deviceIndex}]: ${(error as Error).message}\x1b[0m`);
  } finally {
    if (recorder) {
      try {
        recorder.stop();
        recorder.release();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Prompt user to select a device
 */
async function promptDeviceSelection(devices: string[]): Promise<number | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("\n" + "=".repeat(50));
    console.log("\x1b[1mAvailable microphones:\x1b[0m\n");

    devices.forEach((device, index) => {
      console.log(`  [${index}] ${device}`);
    });

    console.log("\n" + "=".repeat(50));

    rl.question(
      "\nEnter the number of the working microphone (or press Enter to skip): ",
      (answer) => {
        rl.close();

        if (answer.trim() === "") {
          resolve(null);
          return;
        }

        const index = parseInt(answer.trim(), 10);
        if (isNaN(index) || index < 0 || index >= devices.length) {
          console.log("Invalid selection.");
          resolve(null);
          return;
        }

        resolve(index);
      }
    );
  });
}

/**
 * Main function
 */
async function main() {
  console.log("\n" + "=".repeat(50));
  console.log("\x1b[1m  Grimm Audio Input (Microphone) Test\x1b[0m");
  console.log("=".repeat(50));
  console.log("\nThis tool will cycle through all available microphones");
  console.log("and show a visual level meter for each one.");
  console.log("Speak into your microphone to see which device picks up audio.\n");

  // Get available devices
  const devices = PvRecorder.getAvailableDevices();

  if (devices.length === 0) {
    console.log("\x1b[31mNo audio input devices found!\x1b[0m");
    console.log("\nPlease check:");
    console.log("  - Your microphone is connected");
    console.log("  - ALSA drivers are installed (sudo apt install alsa-utils)");
    console.log("  - Your user has permission to access audio devices");
    process.exit(1);
  }

  console.log(`Found ${devices.length} audio input device(s):\n`);
  devices.forEach((device, index) => {
    console.log(`  [${index}] ${device}`);
  });

  console.log("\nStarting tests in 2 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test each device
  for (let i = 0; i < devices.length; i++) {
    await testDevice(i, devices[i]);
  }

  // Prompt for selection
  const selectedIndex = await promptDeviceSelection(devices);

  if (selectedIndex !== null) {
    console.log(`\n\x1b[32m✓ Selected microphone [${selectedIndex}]: ${devices[selectedIndex]}\x1b[0m`);
    console.log("\nTo use this device with Grimm, set the device index in your configuration.");
    console.log(`Device index: ${selectedIndex}`);
  } else {
    console.log("\nNo device selected. You can re-run this tool anytime with:");
    console.log("  bun run audio:test-mic");
  }

  console.log();
}

// Run
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
