/**
 * Audio Output Device Detection
 *
 * Provides functionality to list and play audio on specific output devices.
 * Primarily designed for Linux/ALSA systems (Raspberry Pi).
 */

import { spawn } from "child_process";
import { createWavBuffer, generateTone } from "./utils";
import { AUDIO_FORMAT } from "./types";

/**
 * Represents an audio output device
 */
export interface AudioOutputDevice {
  /** Card number */
  card: number;
  /** Device number */
  device: number;
  /** Device name/description */
  name: string;
  /** ALSA device identifier (e.g., "plughw:0,0") */
  alsaDevice: string;
}

/**
 * Detect the current platform
 */
function getPlatform(): "linux" | "macos" | "other" {
  const platform = process.platform;
  if (platform === "linux") return "linux";
  if (platform === "darwin") return "macos";
  return "other";
}

/**
 * Parse the output of `aplay -l` to extract device information
 */
function parseAplayList(output: string): AudioOutputDevice[] {
  const devices: AudioOutputDevice[] = [];
  const lines = output.split("\n");

  // Pattern: "card 0: ALSA [bcm2835 ALSA], device 0: bcm2835 ALSA [bcm2835 ALSA]"
  const cardDevicePattern = /^card\s+(\d+):\s+(.+?),\s+device\s+(\d+):\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(cardDevicePattern);
    if (match) {
      const card = parseInt(match[1], 10);
      const device = parseInt(match[3], 10);
      const name = match[4].trim();

      devices.push({
        card,
        device,
        name,
        alsaDevice: `plughw:${card},${device}`,
      });
    }
  }

  return devices;
}

/**
 * List available audio output devices
 *
 * On Linux: Uses `aplay -l` to enumerate ALSA devices
 * On macOS: Returns a single "default" device (afplay doesn't support device selection)
 */
export async function listOutputDevices(): Promise<AudioOutputDevice[]> {
  const platform = getPlatform();

  if (platform === "macos") {
    // macOS afplay doesn't support device selection
    return [
      {
        card: 0,
        device: 0,
        name: "System Default Output",
        alsaDevice: "default",
      },
    ];
  }

  if (platform === "linux") {
    return new Promise((resolve, reject) => {
      const aplay = spawn("aplay", ["-l"]);
      let stdout = "";
      let stderr = "";

      aplay.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      aplay.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      aplay.on("error", (error) => {
        reject(new Error(`Failed to run aplay: ${error.message}`));
      });

      aplay.on("close", (code) => {
        if (code === 0) {
          const devices = parseAplayList(stdout);
          if (devices.length === 0) {
            // Fallback to default device
            resolve([
              {
                card: 0,
                device: 0,
                name: "Default Output",
                alsaDevice: "default",
              },
            ]);
          } else {
            resolve(devices);
          }
        } else {
          // aplay not available or error - fallback to default
          resolve([
            {
              card: 0,
              device: 0,
              name: "Default Output",
              alsaDevice: "default",
            },
          ]);
        }
      });
    });
  }

  // Fallback for other platforms
  return [
    {
      card: 0,
      device: 0,
      name: "Default Output",
      alsaDevice: "default",
    },
  ];
}

/**
 * Play audio samples on a specific device
 *
 * @param device - The ALSA device identifier or "default"
 * @param samples - Audio samples to play
 */
export async function playOnDevice(
  device: string,
  samples: Int16Array
): Promise<void> {
  const platform = getPlatform();

  if (platform === "macos") {
    return playWithAfplay(samples);
  }

  return playWithAplay(device, samples);
}

/**
 * Play audio using aplay (Linux/ALSA)
 */
async function playWithAplay(device: string, samples: Int16Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-D", device,
      "-f", "S16_LE",
      "-r", String(AUDIO_FORMAT.SAMPLE_RATE),
      "-c", "1",
      "-q",
      "-",
    ];

    const aplay = spawn("aplay", args);

    // Convert Int16Array to Buffer
    const buffer = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
      buffer.writeInt16LE(samples[i], i * 2);
    }

    aplay.stdin.write(buffer);
    aplay.stdin.end();

    aplay.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`aplay exited with code ${code}`));
      }
    });

    aplay.on("error", (error) => {
      reject(new Error(`Failed to run aplay: ${error.message}`));
    });
  });
}

/**
 * Play audio using afplay (macOS)
 */
async function playWithAfplay(samples: Int16Array): Promise<void> {
  const { writeFile, unlink } = await import("fs/promises");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  const wavBuffer = createWavBuffer(samples);
  const tempFile = join(tmpdir(), `grimm-test-${Date.now()}.wav`);

  try {
    await writeFile(tempFile, wavBuffer);

    await new Promise<void>((resolve, reject) => {
      const afplay = spawn("afplay", [tempFile]);

      afplay.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`afplay exited with code ${code}`));
        }
      });

      afplay.on("error", reject);
    });
  } finally {
    await unlink(tempFile).catch(() => {});
  }
}

/**
 * Generate a test tone pattern (alternating beeps)
 *
 * Creates an alternating pattern of 440Hz and 880Hz beeps
 * with silence between them.
 *
 * @param durationMs - Total duration in milliseconds
 * @returns Audio samples
 */
export function generateTestPattern(durationMs: number): Int16Array {
  const beepDuration = 400; // ms
  const silenceDuration = 100; // ms
  const cycleLength = beepDuration + silenceDuration;
  const numCycles = Math.ceil(durationMs / cycleLength);

  const segments: Int16Array[] = [];
  const frequencies = [440, 880]; // A4 and A5

  for (let i = 0; i < numCycles; i++) {
    const freq = frequencies[i % 2];
    const beep = generateTone(freq, beepDuration, 0.3);
    const silence = new Int16Array(Math.floor((silenceDuration / 1000) * AUDIO_FORMAT.SAMPLE_RATE));

    segments.push(beep);
    segments.push(silence);
  }

  // Calculate total length
  const totalLength = segments.reduce((sum, seg) => sum + seg.length, 0);
  const result = new Int16Array(totalLength);

  let offset = 0;
  for (const segment of segments) {
    result.set(segment, offset);
    offset += segment.length;
  }

  // Trim to exact duration
  const targetSamples = Math.floor((durationMs / 1000) * AUDIO_FORMAT.SAMPLE_RATE);
  if (result.length > targetSamples) {
    return result.slice(0, targetSamples);
  }

  return result;
}
