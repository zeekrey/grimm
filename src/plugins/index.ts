/**
 * Plugin System
 *
 * Provides extensibility through plugins that define tools for the LLM.
 *
 * @example
 * ```typescript
 * import { pluginLoader } from "./plugins";
 *
 * // Load plugins from directory
 * await pluginLoader.loadFromDirectory("./plugins");
 *
 * // Get tool definitions for LLM
 * const tools = pluginLoader.getToolDefinitions();
 *
 * // Execute a tool
 * const result = await pluginLoader.executeTool("spotify_play", { query: "Depeche Mode" });
 * ```
 */

export * from "./types";
export { PluginLoader, pluginLoader } from "./loader";
