/**
 * Audio Playback Utilities
 *
 * Provides cross-platform audio playback for TTS output.
 * Supports macOS (afplay) and Linux (mpv, aplay).
 */

import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Detect available audio player
 */
async function detectPlayer(): Promise<"afplay" | "mpv" | "aplay" | null> {
  const players = ["afplay", "mpv", "aplay"] as const;

  for (const player of players) {
    try {
      const result = Bun.spawnSync(["which", player]);
      if (result.exitCode === 0) {
        return player;
      }
    } catch {
      continue;
    }
  }

  return null;
}

let cachedPlayer: "afplay" | "mpv" | "aplay" | null | undefined;

/**
 * Get the available audio player (cached)
 */
async function getPlayer(): Promise<"afplay" | "mpv" | "aplay"> {
  if (cachedPlayer === undefined) {
    cachedPlayer = await detectPlayer();
  }

  if (!cachedPlayer) {
    throw new Error(
      "No audio player found. Please install mpv, afplay (macOS), or aplay (Linux)."
    );
  }

  return cachedPlayer;
}

/**
 * Play audio buffer using afplay (macOS)
 */
async function playWithAfplay(audioBuffer: ArrayBuffer, format: string): Promise<void> {
  const ext = format.startsWith("mp3") ? "mp3" : "wav";
  const tempFile = join(tmpdir(), `grimm-${Date.now()}.${ext}`);

  try {
    await writeFile(tempFile, Buffer.from(audioBuffer));

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("afplay", [tempFile]);

      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`afplay exited with code ${code}`));
      });

      proc.on("error", reject);
    });
  } finally {
    await unlink(tempFile).catch(() => {});
  }
}

/**
 * Play audio buffer using mpv
 */
async function playWithMpv(audioBuffer: ArrayBuffer, format: string): Promise<void> {
  const ext = format.startsWith("mp3") ? "mp3" : "wav";
  const tempFile = join(tmpdir(), `grimm-${Date.now()}.${ext}`);

  try {
    await writeFile(tempFile, Buffer.from(audioBuffer));

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("mpv", ["--no-video", "--really-quiet", tempFile]);

      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`mpv exited with code ${code}`));
      });

      proc.on("error", reject);
    });
  } finally {
    await unlink(tempFile).catch(() => {});
  }
}

/**
 * Play audio buffer using aplay (Linux/ALSA)
 */
async function playWithAplay(audioBuffer: ArrayBuffer, format: string): Promise<void> {
  // aplay only supports raw PCM or WAV, not MP3
  // For MP3, fall back to temp file with mpv or error
  if (format.startsWith("mp3")) {
    throw new Error("aplay does not support MP3. Please install mpv.");
  }

  // Parse PCM format
  const sampleRate = format.includes("16000")
    ? 16000
    : format.includes("22050")
    ? 22050
    : format.includes("24000")
    ? 24000
    : 44100;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("aplay", [
      "-f", "S16_LE",
      "-r", String(sampleRate),
      "-c", "1",
      "-q",
      "-",
    ]);

    proc.stdin.write(Buffer.from(audioBuffer));
    proc.stdin.end();

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`aplay exited with code ${code}`));
    });

    proc.on("error", reject);
  });
}

/**
 * Play audio buffer
 *
 * @param audioBuffer - Audio data
 * @param format - Audio format (e.g., "mp3_44100_128", "pcm_16000")
 */
export async function playAudio(
  audioBuffer: ArrayBuffer,
  format: string = "mp3_44100_128"
): Promise<void> {
  const player = await getPlayer();

  switch (player) {
    case "afplay":
      return playWithAfplay(audioBuffer, format);
    case "mpv":
      return playWithMpv(audioBuffer, format);
    case "aplay":
      return playWithAplay(audioBuffer, format);
  }
}

/**
 * Play streaming audio chunks using mpv
 *
 * @param audioStream - Async generator of audio chunks
 */
export async function playStreamingAudio(
  audioStream: AsyncGenerator<Uint8Array>
): Promise<void> {
  const player = await getPlayer();

  if (player === "aplay") {
    throw new Error("Streaming playback requires mpv or afplay.");
  }

  // For streaming, we collect chunks and play - true streaming would require
  // more complex handling with mpv's stdin
  const chunks: Uint8Array[] = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return playAudio(combined.buffer as ArrayBuffer, "mp3_44100_128");
}

/**
 * Check if audio playback is available
 */
export async function isPlaybackAvailable(): Promise<boolean> {
  try {
    await getPlayer();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the name of the detected audio player
 */
export async function getPlayerName(): Promise<string | null> {
  try {
    return await getPlayer();
  } catch {
    return null;
  }
}
