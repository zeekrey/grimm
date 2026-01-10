/**
 * Plugin Loader
 *
 * Discovers, loads, and manages plugins from the plugins/ directory.
 */

import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { Plugin, Tool, ToolResult, LLMToolDefinition } from "./types";
import { PluginError } from "./types";

/**
 * Plugin Loader - manages plugin lifecycle and tool execution
 */
export class PluginLoader {
  private plugins: Map<string, Plugin> = new Map();
  private tools: Map<string, { plugin: Plugin; tool: Tool }> = new Map();
  private initialized: boolean = false;

  /**
   * Load all plugins from a directory
   *
   * @param dir - Directory containing plugin folders
   */
  async loadFromDirectory(dir: string): Promise<void> {
    try {
      const dirStat = await stat(dir);
      if (!dirStat.isDirectory()) {
        console.warn(`Plugin directory ${dir} is not a directory`);
        return;
      }
    } catch {
      console.warn(`Plugin directory ${dir} does not exist`);
      return;
    }

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(dir, entry.name, "index.ts");
        try {
          await this.loadPlugin(pluginPath);
        } catch (error) {
          console.warn(
            `Failed to load plugin ${entry.name}:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Load a single plugin from a file path
   *
   * @param path - Path to plugin index.ts file
   */
  async loadPlugin(path: string): Promise<void> {
    try {
      const module = await import(path);
      const plugin: Plugin = module.default || module.plugin;

      if (!plugin || !plugin.name) {
        throw new PluginError(`Invalid plugin at ${path}: missing name`);
      }

      if (!plugin.tools || !Array.isArray(plugin.tools)) {
        throw new PluginError(
          `Invalid plugin ${plugin.name}: missing tools array`
        );
      }

      // Run setup if defined
      if (plugin.setup) {
        try {
          await plugin.setup();
          plugin.enabled = true;
        } catch (error) {
          console.warn(
            `Plugin ${plugin.name} setup failed:`,
            error instanceof Error ? error.message : error
          );
          plugin.enabled = false;
          // Don't throw - plugin is disabled but loader continues
          return;
        }
      } else {
        plugin.enabled = true;
      }

      // Register plugin
      this.plugins.set(plugin.name, plugin);

      // Register tools
      for (const tool of plugin.tools) {
        if (this.tools.has(tool.name)) {
          console.warn(
            `Tool ${tool.name} already registered, skipping duplicate from ${plugin.name}`
          );
          continue;
        }
        this.tools.set(tool.name, { plugin, tool });
      }

      console.log(
        `Loaded plugin: ${plugin.name} v${plugin.version} (${plugin.tools.length} tools)`
      );
    } catch (error) {
      if (error instanceof PluginError) {
        throw error;
      }
      throw new PluginError(
        `Failed to load plugin from ${path}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /**
   * Register a plugin directly (without loading from file)
   *
   * @param plugin - Plugin to register
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    if (plugin.setup) {
      try {
        await plugin.setup();
        plugin.enabled = true;
      } catch (error) {
        console.warn(
          `Plugin ${plugin.name} setup failed:`,
          error instanceof Error ? error.message : error
        );
        plugin.enabled = false;
        return;
      }
    } else {
      plugin.enabled = true;
    }

    this.plugins.set(plugin.name, plugin);

    for (const tool of plugin.tools) {
      if (!this.tools.has(tool.name)) {
        this.tools.set(tool.name, { plugin, tool });
      }
    }
  }

  /**
   * Get tool definitions for LLM API
   *
   * @returns Array of tool definitions in LLM format
   */
  getToolDefinitions(): LLMToolDefinition[] {
    const definitions: LLMToolDefinition[] = [];

    for (const { plugin, tool } of this.tools.values()) {
      // Only include tools from enabled plugins
      if (plugin.enabled) {
        definitions.push({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        });
      }
    }

    return definitions;
  }

  /**
   * Execute a tool by name
   *
   * @param name - Tool name
   * @param params - Tool parameters
   * @returns Tool execution result
   */
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

    if (!entry.plugin.enabled) {
      return {
        success: false,
        error: `Plugin ${entry.plugin.name} is disabled`,
      };
    }

    try {
      console.log(`Executing tool: ${name}`, params);
      const result = await entry.tool.execute(params);
      console.log(`Tool ${name} result:`, result);
      return result;
    } catch (error) {
      console.error(`Tool ${name} error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
      };
    }
  }

  /**
   * Get a list of loaded plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a list of available tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values())
      .filter(({ plugin }) => plugin.enabled)
      .map(({ tool }) => tool);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    const entry = this.tools.get(name);
    return entry !== undefined && entry.plugin.enabled === true;
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.teardown) {
        try {
          await plugin.teardown();
        } catch (error) {
          console.warn(
            `Plugin ${plugin.name} teardown failed:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }

    this.plugins.clear();
    this.tools.clear();
    this.initialized = false;
  }

  /**
   * Check if loader is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Default global instance
export const pluginLoader = new PluginLoader();
