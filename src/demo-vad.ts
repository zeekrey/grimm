/**
 * Demo script for Voice Activity Detection using Silero VAD
 *
 * Usage:
 *   bun run demo:vad
 *
 * No API key required! Uses open-source Silero VAD model via avr-vad.
 */

import { PvRecorder } from "@picovoice/pvrecorder-node";
import { VoiceActivityDetector, VADError } from "./vad";
import { selectAudioDevice, getDeviceName } from "./utils/select-audio-device";

let vad: VoiceActivityDetector | null = null;
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

  if (vad) {
    try {
      await vad.release();
      vad = null;
      console.log("VAD released");
    } catch (error) {
      console.error("Error releasing VAD:", error);
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

    // Initialize VAD (Silero VAD - no API key needed!)
    console.log("Initializing Voice Activity Detector (Silero VAD)...");
    vad = await VoiceActivityDetector.create({
      speechThreshold: 0.5,
      silenceThreshold: 0.35,
      silenceDuration: 700,
      maxRecordingDuration: 30000,
    });
    console.log(`  Frame length: ${vad.getFrameLength()} samples`);
    console.log(`  Sample rate: ${vad.getSampleRate()} Hz`);

    // Initialize recorder with selected device
    // Note: VAD frame size is 1536 samples (96ms at 16kHz)
    console.log("\nInitializing audio recorder...");
    recorder = new PvRecorder(vad.getFrameLength(), deviceIndex);
    console.log(`  Using device: ${recorder.getSelectedDevice()}`);

    // Start recording
    recorder.start();
    console.log("\n===========================================");
    console.log("Listening for voice activity...");
    console.log("Speak to see VAD probabilities");
    console.log("Press Ctrl+C to exit");
    console.log("===========================================\n");

    let speechCount = 0;
    let lastProbability = 0;

    // Main detection loop
    while (isRunning) {
      // Read audio frame from microphone
      const frame = await recorder.read();

      // Process frame for voice activity
      const result = await vad.processFrame(frame);

      // Show visual indicator of voice probability
      const barLength = Math.round(result.probability * 40);
      const bar = "#".repeat(barLength) + "-".repeat(40 - barLength);
      const speechIndicator = result.isSpeech ? " [SPEECH]" : "";

      // Only update display when probability changes significantly
      if (Math.abs(result.probability - lastProbability) > 0.05) {
        process.stdout.write(`\r  [${bar}] ${(result.probability * 100).toFixed(1).padStart(5)}%${speechIndicator.padEnd(10)}`);
        lastProbability = result.probability;
      }

      // Check for end of speech
      if (result.status === "end") {
        speechCount++;
        console.log(`\n\n[${new Date().toISOString()}] Speech segment ended! (count: ${speechCount})`);
        console.log(`  Audio captured: ${result.audio?.length || 0} samples (${((result.audio?.length || 0) / 16000).toFixed(2)}s)`);
        console.log("");
        vad.reset();
      } else if (result.status === "timeout") {
        console.log(`\n\n[${new Date().toISOString()}] Recording timeout reached`);
        console.log(`  Audio captured: ${result.audio?.length || 0} samples (${((result.audio?.length || 0) / 16000).toFixed(2)}s)`);
        console.log("");
        vad.reset();
      }
    }
  } catch (error) {
    if (error instanceof VADError) {
      console.error(`VAD error: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred");
    }
    process.exit(1);
  } finally {
    console.log(""); // New line after progress bar
    await cleanup();
    console.log("Goodbye!");
  }
}

// Run the demo
main();
