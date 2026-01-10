/**
 * Utility for selecting an audio device with timeout
 */

import { PvRecorder } from "@picovoice/pvrecorder-node";
import * as readline from "readline";

/**
 * Read a line from stdin with a timeout
 * @param timeoutMs - Timeout in milliseconds
 * @returns The user input or null if timeout
 */
async function readLineWithTimeout(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const timer = setTimeout(() => {
      rl.close();
      resolve(null);
    }, timeoutMs);

    rl.question("", (answer: string) => {
      clearTimeout(timer);
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Display available audio devices and prompt user to select one
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns The selected device index (-1 for default)
 */
export async function selectAudioDevice(timeoutMs: number = 5000): Promise<number> {
  const devices = PvRecorder.getAvailableDevices();

  // Handle no devices available
  if (devices.length === 0) {
    console.log("\nWarning: No audio devices found. Using default device.");
    return -1;
  }

  // Display available devices
  console.log("\nAvailable audio devices:");
  devices.forEach((device, index) => {
    console.log(`[${index}] ${device}`);
  });

  const maxIndex = devices.length - 1;
  process.stdout.write(`\nSelect device (0-${maxIndex}) or wait ${timeoutMs / 1000}s for default: `);

  // Wait for user input with timeout
  const input = await readLineWithTimeout(timeoutMs);

  // Handle timeout (null) or empty input (Enter pressed)
  if (input === null) {
    console.log("\n(timeout - using default device)");
    return -1;
  }

  if (input.trim() === "") {
    console.log("(using default device)");
    return -1;
  }

  // Parse the input
  const deviceIndex = parseInt(input.trim(), 10);

  // Handle invalid input (not a number)
  if (isNaN(deviceIndex)) {
    console.log(`Invalid input "${input}". Using default device.`);
    return -1;
  }

  // Handle out of range
  if (deviceIndex < 0 || deviceIndex > maxIndex) {
    console.log(`Device index ${deviceIndex} out of range (0-${maxIndex}). Using default device.`);
    return -1;
  }

  // Valid selection
  return deviceIndex;
}

/**
 * Get the device name for display purposes
 * @param deviceIndex - The device index (-1 for default)
 * @returns The device name or "default" if using default device
 */
export function getDeviceName(deviceIndex: number): string {
  if (deviceIndex === -1) {
    return "default";
  }

  const devices = PvRecorder.getAvailableDevices();
  if (deviceIndex >= 0 && deviceIndex < devices.length) {
    return devices[deviceIndex];
  }

  return "default";
}
