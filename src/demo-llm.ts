/**
 * Demo script for LLM Integration with OpenRouter/Gemini
 *
 * Usage:
 *   bun run demo:llm              # Text chat mode
 *   bun run demo:llm --audio      # Audio chat mode (uses microphone)
 *   bun run demo:llm --tools      # Demo with tool calling (+ loaded plugins)
 *   bun run demo:llm --full       # Full pipeline: wake word + VAD + LLM
 *
 * Requires: OPENROUTER_API_KEY environment variable
 */

import { PvRecorder } from "@picovoice/pvrecorder-node";
import { LLMClient, LLMError, type Tool, type ToolExecutor } from "./llm";
import { VoiceActivityDetector } from "./vad";
import { WakeWordDetector } from "./wake-word";
import { TTSClient, TTSError, isPlaybackAvailable } from "./tts";
import { pluginLoader } from "./plugins";
import { selectAudioDevice, getDeviceName } from "./utils/select-audio-device";
import * as readline from "readline";
import { join } from "path";

// Check for API key
if (!process.env.OPENROUTER_API_KEY) {
  console.error("Error: OPENROUTER_API_KEY environment variable is required");
  console.error("Get your API key from https://openrouter.ai/keys");
  process.exit(1);
}

// Check for TTS API key in full mode
const hasTTSKey = !!process.env.ELEVENLABS_API_KEY;

// Parse command line arguments
const args = process.argv.slice(2);
const audioMode = args.includes("--audio");
const toolsMode = args.includes("--tools");
const fullMode = args.includes("--full");

// German system prompt for all modes
const GERMAN_SYSTEM_PROMPT = `Du bist Grimm, ein hilfreicher Sprachassistent.

Richtlinien:
- Antworte immer auf Deutsch
- Halte Antworten kurz und gesprächig
- Sprich natürlich, wie in einem Gespräch
- Verwende keine Markdown-Formatierung (Antworten werden vorgelesen)
- Wenn du ein Tool verwendest, erkläre kurz was du tust
- Sei freundlich aber nicht übertrieben enthusiastisch`;

const GERMAN_TOOLS_PROMPT = `Du bist Grimm, ein hilfreicher Sprachassistent mit Zugriff auf Tools.
Du kannst die Uhrzeit sagen, Berechnungen durchführen, Erinnerungen setzen, und wenn Plugins geladen sind auch weitere Funktionen wie Musik abspielen.

Richtlinien:
- Antworte immer auf Deutsch
- Halte Antworten kurz und gesprächig
- Verwende keine Markdown-Formatierung (Antworten werden vorgelesen)
- Wenn ein Tool eine "speech" Antwort zurückgibt, verwende diese als Basis für deine Antwort`;

/**
 * Load plugins from plugins/ directory
 */
async function loadPlugins(): Promise<void> {
  const pluginsDir = join(import.meta.dir, "..", "plugins");
  console.log(`Loading plugins from ${pluginsDir}...`);
  await pluginLoader.loadFromDirectory(pluginsDir);

  const plugins = pluginLoader.getPlugins();
  if (plugins.length > 0) {
    console.log(`Loaded ${plugins.length} plugin(s): ${plugins.map(p => p.name).join(", ")}`);
  } else {
    console.log("No plugins loaded");
  }
}

/**
 * Get combined tools (demo + plugins)
 */
function getCombinedTools(): Tool[] {
  const pluginTools = pluginLoader.getToolDefinitions();
  return [...demoTools, ...pluginTools];
}

/**
 * Get combined executors (demo + plugins)
 */
function getCombinedExecutors(): ToolExecutor[] {
  // Plugin tools are executed via pluginLoader.executeTool
  const pluginExecutors: ToolExecutor[] = pluginLoader.getTools().map(tool => ({
    name: tool.name,
    execute: async (args: Record<string, unknown>) => {
      const result = await pluginLoader.executeTool(tool.name, args);
      // Return the data or error for LLM context
      if (result.success) {
        return result.data ?? { success: true, speech: result.speech };
      }
      return { error: result.error };
    },
  }));

  return [...demoExecutors, ...pluginExecutors];
}

// Demo tools for tool calling mode
const demoTools: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current time and date",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "Timezone (e.g., 'America/New_York'). Defaults to local time.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Perform a mathematical calculation",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Mathematical expression to evaluate (e.g., '2 + 2', '15 * 7')",
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Set a reminder for something",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The reminder message",
          },
          minutes: {
            type: "number",
            description: "Minutes from now to remind",
          },
        },
        required: ["message", "minutes"],
      },
    },
  },
];

const demoExecutors: ToolExecutor[] = [
  {
    name: "get_current_time",
    execute: async (args) => {
      const now = new Date();
      return {
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString(),
        timezone: args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    },
  },
  {
    name: "calculate",
    execute: async (args) => {
      try {
        // Safe evaluation of simple math expressions
        const expr = String(args.expression).replace(/[^0-9+\-*/().%\s]/g, "");
        const result = Function(`"use strict"; return (${expr})`)();
        return { expression: args.expression, result };
      } catch {
        return { error: "Could not evaluate expression" };
      }
    },
  },
  {
    name: "set_reminder",
    execute: async (args) => {
      console.log(`\n[TOOL] Setting reminder: "${args.message}" in ${args.minutes} minutes`);
      // In a real app, this would schedule an actual reminder
      return {
        success: true,
        message: args.message,
        scheduled_for: new Date(Date.now() + Number(args.minutes) * 60 * 1000).toLocaleTimeString(),
      };
    },
  },
];

/**
 * Text chat mode - interactive text conversation
 */
async function runTextChat(): Promise<void> {
  console.log("===========================================");
  console.log("LLM Text Chat Demo");
  console.log("Using: google/gemini-2.0-flash-001 via OpenRouter");
  if (toolsMode) {
    await loadPlugins();
    const tools = getCombinedTools();
    console.log(`Tools enabled (${tools.length}): ${tools.map(t => t.function.name).join(", ")}`);
  }
  console.log("Type 'quit' to exit, 'clear' to reset conversation");
  console.log("===========================================\n");

  const llm = new LLMClient({
    systemPrompt: toolsMode ? GERMAN_TOOLS_PROMPT : GERMAN_SYSTEM_PROMPT,
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (): void => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === "quit") {
        console.log("Goodbye!");
        rl.close();
        return;
      }

      if (trimmed.toLowerCase() === "clear") {
        llm.clearHistory();
        console.log("[Conversation cleared]\n");
        prompt();
        return;
      }

      if (!trimmed) {
        prompt();
        return;
      }

      try {
        console.log("\nThinking...");
        const response = toolsMode
          ? await llm.chatWithAudioAndTools(
              new Int16Array(0), // Empty audio, will be text
              getCombinedTools(),
              getCombinedExecutors()
            ).catch(() => llm.chat(trimmed, { tools: getCombinedTools(), toolChoice: "auto" }))
          : await llm.chat(trimmed);

        console.log(`\nGrimm: ${response}\n`);
      } catch (error) {
        if (error instanceof LLMError) {
          console.error(`\nError (${error.statusCode}): ${error.message}\n`);
        } else {
          console.error(`\nError: ${error}\n`);
        }
      }

      prompt();
    });
  };

  prompt();
}

/**
 * Audio chat mode - speak to the assistant
 */
async function runAudioChat(): Promise<void> {
  console.log("===========================================");
  console.log("LLM Audio Chat Demo");
  console.log("Using: google/gemini-2.0-flash-001 via OpenRouter");
  if (toolsMode) {
    await loadPlugins();
    const tools = getCombinedTools();
    console.log(`Tools enabled (${tools.length}): ${tools.map(t => t.function.name).join(", ")}`);
  }
  console.log("Speak after the prompt, audio will be sent to LLM");
  console.log("Press Ctrl+C to exit");
  console.log("===========================================\n");

  // Select audio device
  const deviceIndex = await selectAudioDevice(5000);
  console.log(`\nUsing device: ${getDeviceName(deviceIndex)}`);

  // Initialize components
  console.log("Initializing VAD...");
  const vad = await VoiceActivityDetector.create({
    speechThreshold: 0.5,
    silenceThreshold: 0.35,
    silenceDuration: 1000, // 1 second of silence to end
    maxRecordingDuration: 30000,
  });

  console.log("Initializing recorder...");
  const recorder = new PvRecorder(vad.getFrameLength(), deviceIndex);

  const llm = new LLMClient({
    systemPrompt: toolsMode ? GERMAN_TOOLS_PROMPT : GERMAN_SYSTEM_PROMPT,
  });

  let isRunning = true;

  // Handle shutdown
  process.on("SIGINT", () => {
    isRunning = false;
  });

  recorder.start();
  console.log("\n[Ready] Listening for speech...\n");

  try {
    while (isRunning) {
      // Wait for speech
      vad.reset();
      let result;

      process.stdout.write("Listening... ");

      while (isRunning) {
        const frame = await recorder.read();
        result = await vad.processFrame(frame);

        if (result.isSpeech) {
          process.stdout.write("\rSpeaking...  ");
        }

        if (result.status === "end" || result.status === "timeout") {
          break;
        }
      }

      if (!isRunning || !result?.audio || result.audio.length < 8000) {
        // Less than 0.5 seconds of audio, skip
        console.log("\r[Skipped - too short]");
        continue;
      }

      console.log(`\r[Captured ${(result.audio.length / 16000).toFixed(1)}s of audio]`);
      console.log("Processing...");

      try {
        const response = toolsMode
          ? await llm.chatWithAudioAndTools(result.audio, getCombinedTools(), getCombinedExecutors())
          : await llm.chatWithAudio(result.audio);

        console.log(`\nGrimm: ${response}\n`);
      } catch (error) {
        if (error instanceof LLMError) {
          console.error(`\nError (${error.statusCode}): ${error.message}\n`);
        } else {
          console.error(`\nError: ${error}\n`);
        }
      }
    }
  } finally {
    console.log("\nShutting down...");
    recorder.stop();
    recorder.release();
    await vad.release();
    await pluginLoader.shutdown();
    console.log("Goodbye!");
  }
}

/**
 * Full pipeline mode - wake word + VAD + LLM + TTS
 */
async function runFullPipeline(): Promise<void> {
  console.log("===========================================");
  console.log("Grimm Voice Assistant - Full Pipeline");
  console.log("Using: google/gemini-2.0-flash-001 via OpenRouter");
  if (hasTTSKey) {
    console.log("TTS: ElevenLabs (enabled)");
  } else {
    console.log("TTS: Disabled (set ELEVENLABS_API_KEY to enable)");
  }
  if (toolsMode) {
    await loadPlugins();
    const tools = getCombinedTools();
    console.log(`Tools enabled (${tools.length}): ${tools.map(t => t.function.name).join(", ")}`);
  }
  console.log('Say "Hey Jarvis" to activate, then speak your command');
  console.log("Press Ctrl+C to exit");
  console.log("===========================================\n");

  // Check playback availability
  if (hasTTSKey && !(await isPlaybackAvailable())) {
    console.warn("Warning: No audio player found. Install mpv for audio playback.\n");
  }

  // Select audio device
  const deviceIndex = await selectAudioDevice(5000);
  console.log(`\nUsing device: ${getDeviceName(deviceIndex)}`);

  // Initialize wake word detector
  console.log("Initializing wake word detector...");
  const wakeWordDetector = await WakeWordDetector.create({
    wakeWord: "hey_jarvis",
    sensitivity: 0.5,
  });

  // Initialize VAD
  console.log("Initializing VAD...");
  const vad = await VoiceActivityDetector.create({
    speechThreshold: 0.5,
    silenceThreshold: 0.35,
    silenceDuration: 1000,
    maxRecordingDuration: 30000,
  });

  // Initialize recorder - use wake word frame length (larger)
  console.log("Initializing recorder...");
  const recorder = new PvRecorder(wakeWordDetector.getFrameLength(), deviceIndex);

  // Initialize LLM
  const llm = new LLMClient({
    systemPrompt: toolsMode ? GERMAN_TOOLS_PROMPT : GERMAN_SYSTEM_PROMPT,
  });

  // Initialize TTS (optional)
  let tts: TTSClient | null = null;
  if (hasTTSKey) {
    console.log("Initializing TTS...");
    tts = new TTSClient({
      model: "eleven_multilingual_v2", // Best for German
      voiceSettings: {
        stability: 0.6,
        similarity_boost: 0.8,
      },
    });
  }

  let isRunning = true;

  // Handle shutdown
  process.on("SIGINT", () => {
    isRunning = false;
  });

  recorder.start();
  console.log('\n[Ready] Listening for "Hey Jarvis"...\n');

  try {
    while (isRunning) {
      // Phase 1: Wait for wake word
      process.stdout.write('Waiting for "Hey Jarvis"... ');

      let wakeWordDetected = false;
      while (isRunning && !wakeWordDetected) {
        const frame = await recorder.read();
        const detected = await wakeWordDetector.processFrame(frame);

        if (detected) {
          wakeWordDetected = true;
          console.log("\r[Wake word erkannt: Hey Jarvis]");
        }
      }

      if (!isRunning) break;

      // Phase 2: Capture speech with VAD
      console.log("Listening for your command...");
      vad.reset();

      let vadResult;
      while (isRunning) {
        const frame = await recorder.read();

        // Resample frame for VAD if needed (wake word uses 512, VAD uses 1536)
        // For simplicity, we'll process what we have
        vadResult = await vad.processFrame(frame);

        if (vadResult.isSpeech) {
          process.stdout.write("\rSpeaking...  ");
        }

        if (vadResult.status === "end" || vadResult.status === "timeout") {
          break;
        }
      }

      if (!isRunning) break;

      if (!vadResult?.audio || vadResult.audio.length < 8000) {
        console.log("\r[Zu kurz - bitte nochmal versuchen]");
        console.log("");
        continue;
      }

      console.log(`\r[${(vadResult.audio.length / 16000).toFixed(1)}s Audio aufgenommen]`);
      console.log("Verarbeite...");

      // Phase 3: Send to LLM
      try {
        const response = toolsMode
          ? await llm.chatWithAudioAndTools(vadResult.audio, getCombinedTools(), getCombinedExecutors())
          : await llm.chatWithAudio(vadResult.audio);

        console.log(`\nGrimm: ${response}\n`);

        // Phase 4: Speak the response (if TTS enabled)
        if (tts && response) {
          console.log("Spreche...");
          try {
            await tts.speak(response);
          } catch (ttsError) {
            if (ttsError instanceof TTSError) {
              console.error(`TTS Fehler: ${ttsError.message}`);
            }
          }
        }
      } catch (error) {
        if (error instanceof LLMError) {
          console.error(`\nFehler (${error.statusCode}): ${error.message}\n`);
        } else {
          console.error(`\nFehler: ${error}\n`);
        }
      }

      // Reset for next iteration
      llm.clearHistory();
    }
  } finally {
    console.log("\nBeende...");
    recorder.stop();
    recorder.release();
    await wakeWordDetector.release();
    await vad.release();
    await pluginLoader.shutdown();
    console.log("Auf Wiedersehen!");
  }
}

// Run the appropriate mode
if (fullMode) {
  runFullPipeline().catch(console.error);
} else if (audioMode) {
  runAudioChat().catch(console.error);
} else {
  runTextChat().catch(console.error);
}
