/**
 * Plugin System Types
 *
 * Defines the interfaces for plugins and tools that extend Grimm's capabilities.
 */

/**
 * JSON Schema for tool parameters
 */
export interface JSONSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "array" | "object";
      description?: string;
      enum?: string[];
      items?: { type: string };
    }
  >;
  required?: string[];
}

/**
 * Result returned by a tool execution
 */
export interface ToolResult {
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Result data (sent back to LLM for context) */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Optional message to speak directly to user (bypasses LLM response) */
  speech?: string;
}

/**
 * Tool definition - a function that the LLM can call
 */
export interface Tool {
  /** Tool name (used by LLM to call it) */
  name: string;
  /** Description of what the tool does (LLM uses this to decide when to call) */
  description: string;
  /** JSON Schema for tool parameters */
  parameters: JSONSchema;
  /** Function to execute when tool is called */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Plugin definition
 */
export interface Plugin {
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
  /** Whether the plugin is enabled (set by loader based on config) */
  enabled?: boolean;
}

/**
 * Tool definition format for LLM API
 */
export interface LLMToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/**
 * Plugin loader error
 */
export class PluginError extends Error {
  constructor(
    message: string,
    public pluginName?: string
  ) {
    super(message);
    this.name = "PluginError";
  }
}
