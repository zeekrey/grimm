# Grimm Plugin Development Guide

This guide explains how to create plugins for Grimm, the voice assistant. Plugins extend Grimm's capabilities by providing tools that the LLM can call based on user requests.

## Table of Contents

- [Quick Start](#quick-start)
- [Plugin Architecture](#plugin-architecture)
- [Creating a Plugin](#creating-a-plugin)
- [Plugin Interface](#plugin-interface)
- [Tool Definition](#tool-definition)
- [Best Practices](#best-practices)
- [Testing Your Plugin](#testing-your-plugin)
- [Examples](#examples)

## Quick Start

1. Create a new folder in `plugins/` with your plugin name
2. Create an `index.ts` file that exports a `Plugin` object
3. Define your tools with descriptions and parameter schemas
4. Implement the `execute` function for each tool
5. Test with `bun run demo:llm --tools`

```bash
# Create plugin folder
mkdir plugins/my-plugin

# Create the plugin file
touch plugins/my-plugin/index.ts
```

## Plugin Architecture

```
plugins/
├── README.md              # This file
├── CONTRIBUTING.md        # Contribution guidelines
├── CLAUDE.md              # LLM context for plugin development
├── _template/             # Plugin template (copy this to start)
│   └── index.ts
├── spotify/               # Example: Spotify plugin
│   ├── index.ts
│   └── auth.ts
└── your-plugin/           # Your plugin here
    └── index.ts
```

### How Plugins Work

1. **Discovery**: On startup, `PluginLoader` scans the `plugins/` directory
2. **Loading**: Each plugin's `index.ts` is imported dynamically
3. **Setup**: The plugin's `setup()` function is called (if defined)
4. **Registration**: Tools are registered and sent to the LLM
5. **Execution**: When a user speaks, the LLM decides which tools to call
6. **Response**: Tool results are sent back to the LLM for response generation

## Creating a Plugin

### Minimal Plugin

```typescript
import type { Plugin, ToolResult } from "../../src/plugins/types";

export const plugin: Plugin = {
  name: "my-plugin",
  description: "A brief description of what your plugin does",
  version: "1.0.0",

  tools: [
    {
      name: "my_tool",
      description: "What this tool does - the LLM uses this to decide when to call it",
      parameters: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "Description of this parameter",
          },
        },
        required: ["input"],
      },
      execute: async (params): Promise<ToolResult> => {
        const input = params.input as string;

        // Your logic here

        return {
          success: true,
          data: { result: "some data" },
          speech: "Optional text that Grimm will speak",
        };
      },
    },
  ],
};

export default plugin;
```

## Plugin Interface

```typescript
interface Plugin {
  /** Unique plugin identifier (lowercase, no spaces) */
  name: string;

  /** Human-readable description */
  description: string;

  /** Semantic version (e.g., "1.0.0") */
  version: string;

  /** Array of tools provided by this plugin */
  tools: Tool[];

  /** Optional: Called when plugin is loaded */
  setup?: () => Promise<void>;

  /** Optional: Called when plugin is unloaded */
  teardown?: () => Promise<void>;

  /** Set by loader - do not set manually */
  enabled?: boolean;
}
```

### Lifecycle Hooks

#### `setup()`

Called once when the plugin is loaded. Use this for:
- Validating configuration/environment variables
- Initializing API clients
- Establishing connections

```typescript
setup: async () => {
  if (!process.env.MY_API_KEY) {
    throw new Error("MY_API_KEY environment variable is required");
  }
  await myClient.connect();
  console.log("My plugin initialized");
},
```

**Important**: If `setup()` throws an error, the plugin is disabled but other plugins continue loading.

#### `teardown()`

Called when Grimm shuts down. Use this for:
- Closing connections
- Cleaning up resources

```typescript
teardown: async () => {
  await myClient.disconnect();
  console.log("My plugin shutdown");
},
```

## Tool Definition

```typescript
interface Tool {
  /** Tool name - used by LLM to call it (use snake_case) */
  name: string;

  /** Description - LLM uses this to decide when to call the tool */
  description: string;

  /** JSON Schema for parameters */
  parameters: JSONSchema;

  /** Function that executes the tool */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}
```

### Parameter Schema (JSON Schema)

```typescript
parameters: {
  type: "object",
  properties: {
    // String parameter
    query: {
      type: "string",
      description: "Search query",
    },
    // Number parameter
    count: {
      type: "number",
      description: "Number of results (1-10)",
    },
    // Boolean parameter
    includeDetails: {
      type: "boolean",
      description: "Whether to include detailed information",
    },
    // Enum parameter
    category: {
      type: "string",
      description: "Category to search in",
      enum: ["music", "movies", "books"],
    },
    // Array parameter
    tags: {
      type: "array",
      description: "Tags to filter by",
      items: { type: "string" },
    },
  },
  required: ["query"], // List required parameters
}
```

### Tool Result

```typescript
interface ToolResult {
  /** Whether the tool execution succeeded */
  success: boolean;

  /** Result data - sent to LLM for context */
  data?: unknown;

  /** Error message if failed */
  error?: string;

  /** Optional: Text for Grimm to speak (bypasses LLM reformulation) */
  speech?: string;
}
```

#### Success Response

```typescript
return {
  success: true,
  data: {
    temperature: 22,
    condition: "sunny",
    location: "Berlin",
  },
  speech: "Es sind 22 Grad und sonnig in Berlin.",
};
```

#### Error Response

```typescript
return {
  success: false,
  error: "Could not fetch weather data: API timeout",
};
```

## Best Practices

### 1. Naming Conventions

- **Plugin name**: lowercase, hyphenated (e.g., `home-assistant`)
- **Tool names**: snake_case, prefixed with plugin name (e.g., `spotify_play`, `spotify_pause`)
- This prevents tool name collisions between plugins

### 2. Descriptions

Write descriptions from the LLM's perspective:

```typescript
// Good - tells LLM when to use it
description: "Play music on Spotify. Use when the user wants to listen to songs, artists, or playlists."

// Bad - too vague
description: "Spotify playback control"
```

### 3. German Language Support

Grimm is a German voice assistant. Include German in your speech responses:

```typescript
return {
  success: true,
  data: { playing: true },
  speech: "Musik wird abgespielt.", // German response
};
```

### 4. Error Handling

Always handle errors gracefully:

```typescript
execute: async (params): Promise<ToolResult> => {
  try {
    const result = await myApiCall(params);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
},
```

### 5. Environment Variables

- Document required environment variables in your plugin's README
- Check for them in `setup()` and throw descriptive errors
- Never log sensitive values

```typescript
setup: async () => {
  const requiredVars = ["MY_CLIENT_ID", "MY_CLIENT_SECRET"];
  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
},
```

### 6. Stateless Tools

Prefer stateless tool execution. If you need state:
- Store it in a class instance (see Spotify plugin example)
- Handle token refresh and reconnection gracefully

### 7. Timeouts

Add timeouts to external API calls:

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);

try {
  const response = await fetch(url, { signal: controller.signal });
  // ...
} finally {
  clearTimeout(timeout);
}
```

## Testing Your Plugin

### Manual Testing

```bash
# Run with tools enabled
bun run demo:llm --tools

# Then type commands like:
# "Spiel etwas Musik" (for Spotify)
# "Wie spät ist es?" (for time tools)
```

### Unit Testing

Create a test file next to your plugin:

```typescript
// plugins/my-plugin/index.test.ts
import { describe, test, expect, mock } from "bun:test";
import { plugin } from "./index";

describe("my-plugin", () => {
  test("should have correct metadata", () => {
    expect(plugin.name).toBe("my-plugin");
    expect(plugin.tools.length).toBeGreaterThan(0);
  });

  test("my_tool should return success", async () => {
    const tool = plugin.tools.find(t => t.name === "my_tool");
    const result = await tool!.execute({ input: "test" });
    expect(result.success).toBe(true);
  });
});
```

Run tests:

```bash
bun test plugins/my-plugin
```

## Examples

### Simple Tool (No External API)

```typescript
// plugins/calculator/index.ts
import type { Plugin, ToolResult } from "../../src/plugins/types";

export const plugin: Plugin = {
  name: "calculator",
  description: "Mathematical calculations",
  version: "1.0.0",

  tools: [
    {
      name: "calculator_evaluate",
      description: "Evaluate a mathematical expression",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Math expression (e.g., '2 + 2', '15 * 7')",
          },
        },
        required: ["expression"],
      },
      execute: async (params): Promise<ToolResult> => {
        try {
          const expr = String(params.expression).replace(/[^0-9+\-*/().%\s]/g, "");
          const result = Function(`"use strict"; return (${expr})`)();
          return {
            success: true,
            data: { expression: params.expression, result },
            speech: `Das Ergebnis ist ${result}.`,
          };
        } catch {
          return { success: false, error: "Ungültiger Ausdruck" };
        }
      },
    },
  ],
};

export default plugin;
```

### API Client Plugin (With State)

See `plugins/spotify/index.ts` for a complete example with:
- OAuth token refresh
- Multiple tools sharing a client
- Error handling
- German speech responses

## Need Help?

- Check existing plugins for patterns
- Read CONTRIBUTING.md for contribution guidelines
- Open an issue on GitHub for questions
