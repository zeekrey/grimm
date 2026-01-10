# Grimm Plugin Development - LLM Context

This file provides essential context for LLMs (Claude, GPT, etc.) to quickly understand and generate Grimm plugins.

## Quick Reference

**Grimm** is a German voice assistant built with Bun.js. Plugins extend its capabilities through LLM function calling.

## Plugin File Structure

```
plugins/
└── your-plugin/
    └── index.ts    # Must export: plugin or default
```

## Complete Plugin Template

```typescript
import type { Plugin, ToolResult } from "../../src/plugins/types";

export const plugin: Plugin = {
  name: "plugin-name",           // lowercase, hyphenated
  description: "What it does",   // Brief description
  version: "1.0.0",              // Semantic version

  tools: [
    {
      name: "pluginname_action", // snake_case, prefix with plugin name
      description: "Detailed description for LLM to understand when to use this tool",
      parameters: {
        type: "object",
        properties: {
          param1: { type: "string", description: "What this param is for" },
          param2: { type: "number", description: "Optional number" },
        },
        required: ["param1"],
      },
      execute: async (params): Promise<ToolResult> => {
        try {
          const param1 = params.param1 as string;
          // Your logic here
          return {
            success: true,
            data: { result: "value" },
            speech: "German response for TTS", // Optional
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Error",
          };
        }
      },
    },
  ],

  // Optional lifecycle hooks
  setup: async () => {
    // Validate env vars, init clients
    if (!process.env.REQUIRED_VAR) {
      throw new Error("REQUIRED_VAR not set");
    }
  },

  teardown: async () => {
    // Cleanup resources
  },
};

export default plugin;
```

## Type Definitions

```typescript
interface Plugin {
  name: string;
  description: string;
  version: string;
  tools: Tool[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  enabled?: boolean; // Set by loader
}

interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

interface JSONSchema {
  type: "object";
  properties: Record<string, {
    type: "string" | "number" | "boolean" | "array" | "object";
    description?: string;
    enum?: string[];
    items?: { type: string };
  }>;
  required?: string[];
}

interface ToolResult {
  success: boolean;
  data?: unknown;      // Sent to LLM for context
  error?: string;      // Error message if failed
  speech?: string;     // Direct TTS output (German)
}
```

## Import Path

Always import types from:
```typescript
import type { Plugin, ToolResult } from "../../src/plugins/types";
```

## Key Rules

1. **Tool names**: Use `pluginname_action` format (snake_case, prefixed)
2. **Descriptions**: Write for LLM - explain WHEN to use the tool
3. **Parameters**: Use JSON Schema format with descriptions
4. **Errors**: Always wrap in try/catch, return `{ success: false, error }`
5. **German**: Use German for `speech` responses
6. **Env vars**: Check in `setup()`, never hardcode secrets

## Parameter Types

```typescript
// String
{ type: "string", description: "Text input" }

// Number
{ type: "number", description: "Numeric value" }

// Boolean
{ type: "boolean", description: "True or false" }

// Enum (predefined options)
{ type: "string", enum: ["option1", "option2"], description: "Choose one" }

// Array
{ type: "array", items: { type: "string" }, description: "List of items" }
```

## Common Patterns

### API Client with Auth

```typescript
class MyClient {
  private token: string = "";

  async initialize() {
    // Get/refresh token
  }

  async request(endpoint: string) {
    // Make authenticated request
  }
}

const client = new MyClient();

export const plugin: Plugin = {
  name: "my-api",
  // ...
  setup: async () => {
    await client.initialize();
  },
};
```

### Multiple Related Tools

```typescript
tools: [
  { name: "music_play", description: "Start playback", ... },
  { name: "music_pause", description: "Pause playback", ... },
  { name: "music_next", description: "Skip to next", ... },
  { name: "music_volume", description: "Set volume", ... },
]
```

### Tool with Validation

```typescript
execute: async (params): Promise<ToolResult> => {
  const value = params.value as number;

  if (value < 0 || value > 100) {
    return {
      success: false,
      error: "Value must be between 0 and 100",
    };
  }

  // Proceed with valid value
}
```

## Testing Command

```bash
# Test your plugin
bun run demo:llm --tools

# Then say or type commands in German
```

## Example Plugins

- `plugins/spotify/index.ts` - Full API client example with OAuth
- `plugins/_template/index.ts` - Minimal starting template

## Common Mistakes to Avoid

1. Forgetting `async` on execute function
2. Not handling errors with try/catch
3. Tool names without plugin prefix
4. Missing parameter descriptions
5. Using English instead of German for speech
6. Hardcoding API keys instead of env vars
7. Not casting params (e.g., `params.x as string`)
