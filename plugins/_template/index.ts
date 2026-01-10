/**
 * Plugin Template for Grimm
 *
 * Copy this folder to create a new plugin:
 *   cp -r plugins/_template plugins/your-plugin-name
 *
 * Then customize:
 *   1. Update plugin name, description, version
 *   2. Add your tools
 *   3. Implement execute functions
 *   4. Add setup/teardown if needed
 */

import type { Plugin, ToolResult } from "../../src/plugins/types";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Plugin configuration from environment variables.
 * Add your required env vars here.
 */
const config = {
  // Example: apiKey: process.env.YOUR_API_KEY || "",
};

// ============================================================================
// Client / Service (Optional)
// ============================================================================

/**
 * If your plugin needs to maintain state or a connection,
 * create a client class here.
 *
 * Example:
 *
 * class MyApiClient {
 *   async initialize(): Promise<void> { ... }
 *   async doSomething(): Promise<Result> { ... }
 * }
 *
 * const client = new MyApiClient();
 */

// ============================================================================
// Plugin Definition
// ============================================================================

export const plugin: Plugin = {
  // --------------------------------------------------------------------------
  // Metadata
  // --------------------------------------------------------------------------

  /** Unique plugin identifier (lowercase, hyphenated) */
  name: "template",

  /** Brief description of what your plugin does */
  description: "Template plugin - copy this to create your own",

  /** Semantic version */
  version: "1.0.0",

  // --------------------------------------------------------------------------
  // Tools
  // --------------------------------------------------------------------------

  tools: [
    {
      /**
       * Tool name: use snake_case, prefixed with plugin name.
       * Example: template_example, spotify_play, weather_current
       */
      name: "template_example",

      /**
       * Description: Write this for the LLM.
       * Explain WHEN and WHY to use this tool.
       * Be specific - the LLM uses this to decide which tool to call.
       */
      description:
        "Example tool that echoes input. Use this when the user wants to test the template plugin.",

      /**
       * Parameters: JSON Schema format.
       * Always include descriptions for each parameter.
       */
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to echo back",
          },
          uppercase: {
            type: "boolean",
            description: "Whether to convert to uppercase (optional)",
          },
        },
        required: ["message"],
      },

      /**
       * Execute function: Called when the LLM invokes this tool.
       *
       * @param params - Parameters passed by the LLM (match your schema)
       * @returns ToolResult with success/failure and optional data/speech
       */
      execute: async (params): Promise<ToolResult> => {
        // Always wrap in try/catch for error handling
        try {
          // Extract and cast parameters
          const message = params.message as string;
          const uppercase = params.uppercase as boolean | undefined;

          // Your logic here
          const result = uppercase ? message.toUpperCase() : message;

          // Return success with data and optional speech
          return {
            success: true,
            data: {
              original: message,
              result: result,
            },
            // German speech response (optional - will be spoken by TTS)
            speech: `Du hast gesagt: ${result}`,
          };
        } catch (error) {
          // Return error on failure
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unbekannter Fehler",
          };
        }
      },
    },

    // Add more tools here...
    // {
    //   name: "template_another",
    //   description: "Another tool in this plugin",
    //   parameters: { type: "object", properties: {}, required: [] },
    //   execute: async (params): Promise<ToolResult> => {
    //     return { success: true, data: {} };
    //   },
    // },
  ],

  // --------------------------------------------------------------------------
  // Lifecycle Hooks (Optional)
  // --------------------------------------------------------------------------

  /**
   * Setup: Called once when plugin is loaded.
   *
   * Use for:
   * - Validating environment variables
   * - Initializing API clients
   * - Establishing connections
   *
   * If this throws, the plugin is disabled (but others continue loading).
   */
  setup: async () => {
    // Example: Validate required environment variables
    // const requiredVars = ["YOUR_API_KEY"];
    // const missing = requiredVars.filter(v => !process.env[v]);
    // if (missing.length > 0) {
    //   throw new Error(`Missing environment variables: ${missing.join(", ")}`);
    // }

    // Example: Initialize client
    // await client.initialize();

    console.log("Template plugin initialized");
  },

  /**
   * Teardown: Called when Grimm shuts down.
   *
   * Use for:
   * - Closing connections
   * - Cleaning up resources
   */
  teardown: async () => {
    // Example: Disconnect client
    // await client.disconnect();

    console.log("Template plugin shutdown");
  },
};

// Default export (required for plugin loader)
export default plugin;
