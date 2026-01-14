#!/usr/bin/env bun
/**
 * Audio Output (Speaker) Test Script
 *
 * Helps identify the correct audio output device on Raspberry Pi.
 * Cycles through all available speakers, playing a test tone
 * so users can identify which device is working.
 *
 * Usage: bun run audio:test-speaker
 */

import * as readline from "readline";
import {
  listOutputDevices,
  playOnDevice,
  generateTestPattern,
  type AudioOutputDevice,
} from "./audio/output-devices";

const TEST_DURATION_MS = 5000; // 5 seconds per device

/**
 * Test a single speaker device
 */
async function testDevice(device: AudioOutputDevice, index: number): Promise<void> {
  console.log(`\n\x1b[1mTesting speaker [${index}]: ${device.name}\x1b[0m`);
  console.log(`ALSA device: ${device.alsaDevice}`);
  console.log("Playing test tone (alternating beeps)...\n");

  try {
    // Generate test pattern
    const testTone = generateTestPattern(TEST_DURATION_MS);

    // Show progress
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((TEST_DURATION_MS - elapsed) / 1000));
      process.stdout.write(`\rPlaying... (${remaining}s remaining)`);
    }, 100);

    // Play the tone
    await playOnDevice(device.alsaDevice, testTone);

    clearInterval(progressInterval);
    process.stdout.write("\r" + " ".repeat(40) + "\r");
    console.log(`\x1b[32m✓ Device [${index}] test complete\x1b[0m`);
  } catch (error) {
    console.log(`\x1b[31m✗ Error testing device [${index}]: ${(error as Error).message}\x1b[0m`);
  }
}

/**
 * Prompt user to select a device
 */
async function promptDeviceSelection(devices: AudioOutputDevice[]): Promise<number | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("\n" + "=".repeat(50));
    console.log("\x1b[1mAvailable speakers:\x1b[0m\n");

    devices.forEach((device, index) => {
      console.log(`  [${index}] ${device.name}`);
      console.log(`       ALSA: ${device.alsaDevice}`);
    });

    console.log("\n" + "=".repeat(50));

    rl.question(
      "\nEnter the number of the working speaker (or press Enter to skip): ",
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
  console.log("\x1b[1m  Grimm Audio Output (Speaker) Test\x1b[0m");
  console.log("=".repeat(50));
  console.log("\nThis tool will cycle through all available audio outputs");
  console.log("and play a test tone on each one.");
  console.log("Listen for the alternating beep pattern to identify your speaker.\n");

  // Get available devices
  let devices: AudioOutputDevice[];

  try {
    devices = await listOutputDevices();
  } catch (error) {
    console.log(`\x1b[31mError detecting audio devices: ${(error as Error).message}\x1b[0m`);
    process.exit(1);
  }

  if (devices.length === 0) {
    console.log("\x1b[31mNo audio output devices found!\x1b[0m");
    console.log("\nPlease check:");
    console.log("  - Your speakers are connected");
    console.log("  - ALSA drivers are installed (sudo apt install alsa-utils)");
    console.log("  - Audio output is not muted (alsamixer)");
    process.exit(1);
  }

  console.log(`Found ${devices.length} audio output device(s):\n`);
  devices.forEach((device, index) => {
    console.log(`  [${index}] ${device.name}`);
    console.log(`       ALSA: ${device.alsaDevice}`);
  });

  console.log("\nStarting tests in 2 seconds...");
  console.log("Make sure your volume is at a comfortable level!\n");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test each device
  for (let i = 0; i < devices.length; i++) {
    await testDevice(devices[i], i);
  }

  // Prompt for selection
  const selectedIndex = await promptDeviceSelection(devices);

  if (selectedIndex !== null) {
    const selected = devices[selectedIndex];
    console.log(`\n\x1b[32m✓ Selected speaker [${selectedIndex}]: ${selected.name}\x1b[0m`);
    console.log("\nTo use this device with Grimm, you can configure ALSA:");
    console.log("\n  1. Edit /etc/asound.conf or ~/.asoundrc");
    console.log("  2. Set the default device:");
    console.log(`\n     pcm.!default {`);
    console.log(`         type plug`);
    console.log(`         slave.pcm "${selected.alsaDevice}"`);
    console.log(`     }`);
  } else {
    console.log("\nNo device selected. You can re-run this tool anytime with:");
    console.log("  bun run audio:test-speaker");
  }

  console.log();
}

// Run
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
