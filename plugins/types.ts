/**
 * Plugin Types - Re-exported for plugin developers
 *
 * Import types from here when developing plugins:
 *
 * @example
 * ```typescript
 * import type { Plugin, Tool, ToolResult, JSONSchema } from "../types";
 * ```
 *
 * Or from the source (for plugins in the plugins/ directory):
 *
 * @example
 * ```typescript
 * import type { Plugin, ToolResult } from "../../src/plugins/types";
 * ```
 */

export type {
  Plugin,
  Tool,
  ToolResult,
  JSONSchema,
  LLMToolDefinition,
  PluginError,
} from "../src/plugins/types";
