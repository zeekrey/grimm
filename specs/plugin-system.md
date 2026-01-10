# Plugin System

## Overview

The plugin system enables Grimm to interact with external services like Spotify, smart home devices, weather APIs, and more. It leverages LLM function calling to intelligently route user requests to the appropriate plugins.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Plugin System                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Plugin Loader                              │   │
│  │  - Auto-discovers plugins from plugins/ directory             │   │
│  │  - Loads and initializes each plugin                          │   │
│  │  - Collects tool definitions for LLM                          │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                               │                                      │
│  ┌────────────────────────────┼──────────────────────────────────┐  │
│  │                            │                                   │  │
│  │  ┌─────────────┐  ┌────────▼────────┐  ┌─────────────────┐   │  │
│  │  │   Spotify   │  │  Home Assistant │  │     Timer       │   │  │
│  │  │   Plugin    │  │     Plugin      │  │    Plugin       │   │  │
│  │  └─────────────┘  └─────────────────┘  └─────────────────┘   │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │   Weather   │  │    Calendar     │  │    Custom...    │   │  │
│  │  │   Plugin    │  │     Plugin      │  │    Plugin       │   │  │
│  │  └─────────────┘  └─────────────────┘  └─────────────────┘   │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Plugin Interface

```typescript
// src/plugins/types.ts

interface Plugin {
  /** Unique plugin identifier */
  name: string;

  /** Human-readable description */
  description: string;

  /** Plugin version */
  version: string;

  /** Tools provided by this plugin */
  tools: Tool[];

  /** Optional setup function called on load */
  setup?: () => Promise<void>;

  /** Optional cleanup function called on shutdown */
  teardown?: () => Promise<void>;
}

interface Tool {
  /** Tool name (used by LLM to call it) */
  name: string;

  /** Description of what the tool does (LLM uses this to decide when to call) */
  description: string;

  /** JSON Schema for tool parameters */
  parameters: JSONSchema;

  /** Function to execute when tool is called */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

interface ToolResult {
  /** Whether the tool execution succeeded */
  success: boolean;

  /** Result data (sent back to LLM) */
  data?: unknown;

  /** Error message if failed */
  error?: string;

  /** Optional message to speak to user */
  speech?: string;
}

interface JSONSchema {
  type: "object";
  properties: Record<string, {
    type: "string" | "number" | "boolean" | "array" | "object";
    description: string;
    enum?: string[];
    items?: JSONSchema;
  }>;
  required?: string[];
}
```

## Plugin Loader

```typescript
// src/plugins/loader.ts
import { readdir } from "fs/promises";
import { join } from "path";
import type { Plugin, Tool } from "./types";

class PluginLoader {
  private plugins: Map<string, Plugin> = new Map();
  private tools: Map<string, { plugin: Plugin; tool: Tool }> = new Map();

  async loadFromDirectory(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(dir, entry.name, "index.ts");
        await this.loadPlugin(pluginPath);
      }
    }
  }

  async loadPlugin(path: string): Promise<void> {
    try {
      const module = await import(path);
      const plugin: Plugin = module.default || module.plugin;

      if (!plugin || !plugin.name) {
        console.warn(`Invalid plugin at ${path}`);
        return;
      }

      // Run setup if defined
      if (plugin.setup) {
        await plugin.setup();
      }

      // Register plugin
      this.plugins.set(plugin.name, plugin);

      // Register tools
      for (const tool of plugin.tools) {
        const toolId = `${plugin.name}_${tool.name}`;
        this.tools.set(tool.name, { plugin, tool });
        console.log(`Registered tool: ${tool.name}`);
      }

      console.log(`Loaded plugin: ${plugin.name} v${plugin.version}`);
    } catch (error) {
      console.error(`Failed to load plugin from ${path}:`, error);
    }
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(({ tool }) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async executeTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const entry = this.tools.get(name);

    if (!entry) {
      return {
        success: false,
        error: `Unknown tool: ${name}`,
      };
    }

    try {
      return await entry.tool.execute(params);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
      };
    }
  }

  async shutdown(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.teardown) {
        await plugin.teardown();
      }
    }
  }
}

export const pluginLoader = new PluginLoader();
```

## Example Plugins

### Timer Plugin

```typescript
// plugins/timer/index.ts
import type { Plugin, ToolResult } from "../../src/plugins/types";

interface Timer {
  id: string;
  label?: string;
  duration: number;
  startTime: number;
  timeout: ReturnType<typeof setTimeout>;
}

const activeTimers: Map<string, Timer> = new Map();

export const plugin: Plugin = {
  name: "timer",
  description: "Set and manage timers",
  version: "1.0.0",

  tools: [
    {
      name: "set_timer",
      description: "Set a timer for a specified duration. Use this when the user wants to be reminded or alerted after a certain time.",
      parameters: {
        type: "object",
        properties: {
          duration: {
            type: "number",
            description: "Timer duration in seconds",
          },
          label: {
            type: "string",
            description: "Optional label for the timer (e.g., 'pasta', 'meeting')",
          },
        },
        required: ["duration"],
      },
      execute: async (params): Promise<ToolResult> => {
        const duration = params.duration as number;
        const label = params.label as string | undefined;

        const id = `timer_${Date.now()}`;
        const timer: Timer = {
          id,
          label,
          duration,
          startTime: Date.now(),
          timeout: setTimeout(() => {
            console.log(`Timer ${label || id} finished!`);
            // TODO: Trigger audio alert
            activeTimers.delete(id);
          }, duration * 1000),
        };

        activeTimers.set(id, timer);

        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const timeStr = minutes > 0
          ? `${minutes} minute${minutes !== 1 ? "s" : ""}`
          : `${seconds} second${seconds !== 1 ? "s" : ""}`;

        return {
          success: true,
          data: { timerId: id, duration, label },
          speech: label
            ? `Timer set for ${timeStr} for ${label}.`
            : `Timer set for ${timeStr}.`,
        };
      },
    },
    {
      name: "cancel_timer",
      description: "Cancel an active timer",
      parameters: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Label of the timer to cancel",
          },
        },
        required: [],
      },
      execute: async (params): Promise<ToolResult> => {
        const label = params.label as string | undefined;

        // Find timer by label or cancel most recent
        let timerToCancel: Timer | undefined;

        if (label) {
          for (const timer of activeTimers.values()) {
            if (timer.label?.toLowerCase() === label.toLowerCase()) {
              timerToCancel = timer;
              break;
            }
          }
        } else {
          // Cancel most recent
          const timers = Array.from(activeTimers.values());
          timerToCancel = timers[timers.length - 1];
        }

        if (!timerToCancel) {
          return {
            success: false,
            error: "No matching timer found",
          };
        }

        clearTimeout(timerToCancel.timeout);
        activeTimers.delete(timerToCancel.id);

        return {
          success: true,
          speech: timerToCancel.label
            ? `Cancelled the ${timerToCancel.label} timer.`
            : "Timer cancelled.",
        };
      },
    },
  ],

  teardown: async () => {
    // Cancel all timers on shutdown
    for (const timer of activeTimers.values()) {
      clearTimeout(timer.timeout);
    }
    activeTimers.clear();
  },
};

export default plugin;
```

### Spotify Plugin

```typescript
// plugins/spotify/index.ts
import type { Plugin, ToolResult } from "../../src/plugins/types";

// Spotify API client (simplified)
class SpotifyClient {
  private accessToken: string | null = null;

  async authenticate(): Promise<void> {
    // OAuth flow or use refresh token
    // This is simplified - real implementation needs proper OAuth
  }

  async search(query: string, type: "track" | "artist" | "album"): Promise<any> {
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=1`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );
    return response.json();
  }

  async play(uri: string): Promise<void> {
    await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [uri] }),
    });
  }

  async pause(): Promise<void> {
    await fetch("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
  }
}

const spotify = new SpotifyClient();

export const plugin: Plugin = {
  name: "spotify",
  description: "Control Spotify music playback",
  version: "1.0.0",

  tools: [
    {
      name: "spotify_play",
      description: "Play music on Spotify. Can play songs, artists, albums, or playlists.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to play - artist name, song title, album name, or genre",
          },
          type: {
            type: "string",
            description: "Type of content to search for",
            enum: ["track", "artist", "album", "playlist"],
          },
        },
        required: ["query"],
      },
      execute: async (params): Promise<ToolResult> => {
        const query = params.query as string;
        const type = (params.type as string) || "track";

        try {
          const results = await spotify.search(query, type as any);
          const item = results[`${type}s`]?.items?.[0];

          if (!item) {
            return {
              success: false,
              error: `Couldn't find ${type} matching "${query}"`,
            };
          }

          await spotify.play(item.uri);

          return {
            success: true,
            data: { name: item.name, uri: item.uri },
            speech: `Now playing ${item.name}${type === "track" ? ` by ${item.artists[0].name}` : ""}.`,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Spotify error",
          };
        }
      },
    },
    {
      name: "spotify_pause",
      description: "Pause the currently playing music on Spotify",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (): Promise<ToolResult> => {
        try {
          await spotify.pause();
          return {
            success: true,
            speech: "Music paused.",
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Spotify error",
          };
        }
      },
    },
  ],

  setup: async () => {
    await spotify.authenticate();
  },
};

export default plugin;
```

### Weather Plugin

```typescript
// plugins/weather/index.ts
import type { Plugin, ToolResult } from "../../src/plugins/types";

export const plugin: Plugin = {
  name: "weather",
  description: "Get weather information",
  version: "1.0.0",

  tools: [
    {
      name: "get_weather",
      description: "Get current weather or forecast for a location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name or location",
          },
          forecast: {
            type: "boolean",
            description: "If true, get forecast instead of current weather",
          },
        },
        required: ["location"],
      },
      execute: async (params): Promise<ToolResult> => {
        const location = params.location as string;
        const forecast = params.forecast as boolean;

        try {
          // Using Open-Meteo (free, no API key)
          const geoResponse = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`
          );
          const geoData = await geoResponse.json();

          if (!geoData.results?.length) {
            return {
              success: false,
              error: `Location "${location}" not found`,
            };
          }

          const { latitude, longitude, name } = geoData.results[0];

          const weatherResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius`
          );
          const weatherData = await weatherResponse.json();

          const temp = Math.round(weatherData.current.temperature_2m);
          const condition = getWeatherCondition(weatherData.current.weather_code);

          return {
            success: true,
            data: { location: name, temperature: temp, condition },
            speech: `In ${name}, it's currently ${temp} degrees and ${condition}.`,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Weather error",
          };
        }
      },
    },
  ],
};

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: "clear",
    1: "mainly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "foggy",
    48: "foggy",
    51: "light drizzle",
    61: "light rain",
    63: "moderate rain",
    65: "heavy rain",
    71: "light snow",
    73: "moderate snow",
    75: "heavy snow",
    95: "thunderstorm",
  };
  return conditions[code] || "unknown conditions";
}

export default plugin;
```

## LLM Integration

```typescript
// src/llm/index.ts (partial)

import { pluginLoader } from "../plugins/loader";

async function processWithPlugins(audio: Int16Array): Promise<string> {
  // Get tool definitions from all plugins
  const tools = pluginLoader.getToolDefinitions();

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: "Respond to this audio:" },
        { type: "input_audio", input_audio: { data: pcmToWavBase64(audio, 16000), format: "wav" } }
      ]
    }
  ];

  let response = await callLLM(messages, tools);

  // Handle tool calls
  while (response.choices[0].finish_reason === "tool_calls") {
    const toolCalls = response.choices[0].message.tool_calls;
    messages.push(response.choices[0].message);

    for (const toolCall of toolCalls) {
      const args = JSON.parse(toolCall.function.arguments);
      const result = await pluginLoader.executeTool(toolCall.function.name, args);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });

      // If tool has speech override, use it
      if (result.speech) {
        return result.speech;
      }
    }

    response = await callLLM(messages, tools);
  }

  return response.choices[0].message.content;
}
```

## Plugin Directory Structure

```
plugins/
├── spotify/
│   ├── index.ts        # Main plugin file
│   ├── client.ts       # Spotify API client
│   └── types.ts        # Plugin-specific types
├── timer/
│   └── index.ts
├── weather/
│   └── index.ts
├── home-assistant/
│   ├── index.ts
│   └── entities.ts     # Home Assistant entities
└── custom/
    └── index.ts        # User's custom plugins
```

## Creating a Custom Plugin

```typescript
// plugins/my-plugin/index.ts
import type { Plugin } from "../../src/plugins/types";

export const plugin: Plugin = {
  name: "my-plugin",
  description: "My custom plugin",
  version: "1.0.0",

  tools: [
    {
      name: "my_tool",
      description: "Does something useful",
      parameters: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "The input parameter",
          },
        },
        required: ["input"],
      },
      execute: async (params) => {
        const input = params.input as string;

        // Your logic here
        const result = `Processed: ${input}`;

        return {
          success: true,
          data: { result },
          speech: result,  // Optional: override LLM response
        };
      },
    },
  ],

  setup: async () => {
    // Initialize connections, load config, etc.
    console.log("My plugin initialized");
  },

  teardown: async () => {
    // Cleanup resources
    console.log("My plugin shutdown");
  },
};

export default plugin;
```

## Configuration

Plugins can read their own configuration from environment variables:

```bash
# .env
SPOTIFY_CLIENT_ID=xxx
SPOTIFY_CLIENT_SECRET=xxx
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=xxx
```

```typescript
// plugins/spotify/index.ts
const config = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
};

export const plugin: Plugin = {
  // ...
  setup: async () => {
    if (!config.clientId || !config.clientSecret) {
      console.warn("Spotify plugin: Missing credentials, plugin disabled");
      return;
    }
    await spotify.authenticate(config);
  },
};
```
