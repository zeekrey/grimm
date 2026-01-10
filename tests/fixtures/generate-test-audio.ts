#!/usr/bin/env bun
/**
 * Generate Test Audio Files
 *
 * Creates test audio fixtures for emulation testing.
 * These files are used by unit tests and can be used for manual testing.
 *
 * Usage:
 *   bun run tests/fixtures/generate-test-audio.ts
 */

import { generateSilence, generateTone, saveWavFile, concatenateAudio } from "../../src/audio/utils";

const FIXTURES_DIR = import.meta.dir;

async function main() {
  console.log("Generating test audio fixtures...\n");

  // 1. Pure silence (1 second)
  const silence1s = generateSilence(1000);
  await saveWavFile(`${FIXTURES_DIR}/silence-1s.wav`, silence1s);
  console.log("Created: silence-1s.wav (1 second of silence)");

  // 2. Silence (5 seconds) - for longer tests
  const silence5s = generateSilence(5000);
  await saveWavFile(`${FIXTURES_DIR}/silence-5s.wav`, silence5s);
  console.log("Created: silence-5s.wav (5 seconds of silence)");

  // 3. 440 Hz tone (1 second) - standard A note
  const tone440 = generateTone(440, 1000, 0.5);
  await saveWavFile(`${FIXTURES_DIR}/tone-440hz-1s.wav`, tone440);
  console.log("Created: tone-440hz-1s.wav (440 Hz tone, 1 second)");

  // 4. 1000 Hz tone (500ms) - higher pitch
  const tone1000 = generateTone(1000, 500, 0.5);
  await saveWavFile(`${FIXTURES_DIR}/tone-1000hz-500ms.wav`, tone1000);
  console.log("Created: tone-1000hz-500ms.wav (1000 Hz tone, 500ms)");

  // 5. Mixed pattern: silence + tone + silence (for testing detection timing)
  const mixedPattern = concatenateAudio(
    concatenateAudio(generateSilence(500), generateTone(440, 500, 0.5)),
    generateSilence(500)
  );
  await saveWavFile(`${FIXTURES_DIR}/mixed-pattern.wav`, mixedPattern);
  console.log("Created: mixed-pattern.wav (500ms silence + 500ms tone + 500ms silence)");

  // 6. Short burst for frame testing
  const shortBurst = generateTone(440, 100, 0.5);
  await saveWavFile(`${FIXTURES_DIR}/short-burst-100ms.wav`, shortBurst);
  console.log("Created: short-burst-100ms.wav (100ms tone)");

  // 7. Multi-frame test (exactly 3 frames worth of samples at 512 samples/frame)
  // 512 * 3 = 1536 samples = 96ms at 16kHz
  const threeFrames = generateTone(440, 96, 0.5);
  await saveWavFile(`${FIXTURES_DIR}/three-frames.wav`, threeFrames);
  console.log("Created: three-frames.wav (exactly 3 frames worth, ~96ms)");

  // 8. Single frame test (exactly 512 samples = 32ms at 16kHz)
  const oneFrame = generateTone(440, 32, 0.5);
  await saveWavFile(`${FIXTURES_DIR}/one-frame.wav`, oneFrame);
  console.log("Created: one-frame.wav (exactly 1 frame worth, 32ms)");

  console.log("\n=== Test Audio Fixtures Generated ===");
  console.log(`Location: ${FIXTURES_DIR}`);
  console.log("\nNote: For wake word testing, you'll need to provide a real");
  console.log("recording of the wake word 'Porcupine'. See README for instructions.");
}

main().catch(console.error);
