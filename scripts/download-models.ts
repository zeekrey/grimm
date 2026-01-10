#!/usr/bin/env bun
/**
 * Download OpenWakeWord ONNX models
 *
 * Downloads the required ONNX models from the OpenWakeWord GitHub releases.
 *
 * Usage:
 *   bun run scripts/download-models.ts
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const MODELS_DIR = join(import.meta.dir, "..", "models");

// Model URLs from OpenWakeWord GitHub releases (v0.5.1)
const MODELS = {
  // Preprocessing models
  "melspectrogram.onnx":
    "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/melspectrogram.onnx",
  "embedding_model.onnx":
    "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/embedding_model.onnx",

  // Wake word model - "hey jarvis"
  "hey_jarvis_v0.1.onnx":
    "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/hey_jarvis_v0.1.onnx",

  // Alternative wake words (optional)
  // "alexa_v0.1.onnx": "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/alexa_v0.1.onnx",
};

async function downloadModel(name: string, url: string): Promise<boolean> {
  const filePath = join(MODELS_DIR, name);

  if (existsSync(filePath)) {
    console.log(`[SKIP] ${name} already exists`);
    return true;
  }

  console.log(`[DOWNLOAD] ${name}...`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[ERROR] Failed to download ${name}: ${response.status} ${response.statusText}`);
      return false;
    }

    const buffer = await response.arrayBuffer();
    await Bun.write(filePath, buffer);

    const sizeKB = (buffer.byteLength / 1024).toFixed(1);
    console.log(`[OK] ${name} (${sizeKB} KB)`);
    return true;
  } catch (error) {
    console.error(`[ERROR] Failed to download ${name}:`, (error as Error).message);
    return false;
  }
}

async function main(): Promise<void> {
  console.log("===========================================");
  console.log("  OpenWakeWord Model Downloader");
  console.log("===========================================\n");

  // Create models directory if it doesn't exist
  if (!existsSync(MODELS_DIR)) {
    mkdirSync(MODELS_DIR, { recursive: true });
    console.log(`Created models directory: ${MODELS_DIR}\n`);
  }

  console.log(`Download directory: ${MODELS_DIR}\n`);

  let success = 0;
  let failed = 0;

  for (const [name, url] of Object.entries(MODELS)) {
    const result = await downloadModel(name, url);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  console.log("\n===========================================");
  console.log(`Downloaded: ${success}, Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nSome models failed to download. Please retry or download manually.");
    process.exit(1);
  }

  console.log("\nAll models downloaded successfully!");
  console.log("===========================================");
}

main().catch((error) => {
  console.error("Unexpected error:", error.message);
  process.exit(1);
});
