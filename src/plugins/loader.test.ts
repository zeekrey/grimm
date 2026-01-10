/**
 * Plugin Loader Tests
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { PluginLoader } from "./loader";
import type { Plugin, Tool, ToolResult } from "./types";

// Helper to create a mock tool
function createMockTool(name: string, returnValue: ToolResult): Tool {
  return {
    name,
    description: `Mock tool: ${name}`,
    parameters: {
      type: "object",
      properties: {
        input: { type: "string", description: "Test input" },
      },
    },
    execute: async () => returnValue,
  };
}

// Helper to create a mock plugin
function createMockPlugin(
  name: string,
  tools: Tool[],
  options?: {
    setup?: () => Promise<void>;
    teardown?: () => Promise<void>;
  }
): Plugin {
  return {
    name,
    description: `Mock plugin: ${name}`,
    version: "1.0.0",
    tools,
    setup: options?.setup,
    teardown: options?.teardown,
  };
}

describe("PluginLoader", () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader();
  });

  afterEach(async () => {
    await loader.shutdown();
  });

  describe("registerPlugin", () => {
    test("should register a plugin successfully", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool]);

      await loader.registerPlugin(plugin);

      const plugins = loader.getPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe("test_plugin");
      expect(plugins[0].enabled).toBe(true);
    });

    test("should call setup if defined", async () => {
      let setupCalled = false;
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool], {
        setup: async () => {
          setupCalled = true;
        },
      });

      await loader.registerPlugin(plugin);

      expect(setupCalled).toBe(true);
    });

    test("should disable plugin if setup fails", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool], {
        setup: async () => {
          throw new Error("Setup failed");
        },
      });

      await loader.registerPlugin(plugin);

      const plugins = loader.getPlugins();
      expect(plugins).toHaveLength(0); // Plugin not added when setup fails
    });

    test("should register multiple plugins", async () => {
      const tool1 = createMockTool("tool1", { success: true });
      const tool2 = createMockTool("tool2", { success: true });
      const plugin1 = createMockPlugin("plugin1", [tool1]);
      const plugin2 = createMockPlugin("plugin2", [tool2]);

      await loader.registerPlugin(plugin1);
      await loader.registerPlugin(plugin2);

      const plugins = loader.getPlugins();
      expect(plugins).toHaveLength(2);
    });

    test("should not register duplicate tools", async () => {
      const tool = createMockTool("shared_tool", { success: true });
      const plugin1 = createMockPlugin("plugin1", [tool]);
      const plugin2 = createMockPlugin("plugin2", [tool]);

      await loader.registerPlugin(plugin1);
      await loader.registerPlugin(plugin2);

      const tools = loader.getTools();
      expect(tools).toHaveLength(1); // Only one tool registered
    });
  });

  describe("getToolDefinitions", () => {
    test("should return tool definitions for enabled plugins", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool]);

      await loader.registerPlugin(plugin);

      const definitions = loader.getToolDefinitions();
      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toEqual({
        type: "function",
        function: {
          name: "test_tool",
          description: "Mock tool: test_tool",
          parameters: {
            type: "object",
            properties: {
              input: { type: "string", description: "Test input" },
            },
          },
        },
      });
    });

    test("should not include tools from disabled plugins", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool], {
        setup: async () => {
          throw new Error("Setup failed");
        },
      });

      await loader.registerPlugin(plugin);

      const definitions = loader.getToolDefinitions();
      expect(definitions).toHaveLength(0);
    });

    test("should return definitions for multiple tools", async () => {
      const tool1 = createMockTool("tool1", { success: true });
      const tool2 = createMockTool("tool2", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool1, tool2]);

      await loader.registerPlugin(plugin);

      const definitions = loader.getToolDefinitions();
      expect(definitions).toHaveLength(2);
    });
  });

  describe("executeTool", () => {
    test("should execute a tool successfully", async () => {
      const expectedResult: ToolResult = {
        success: true,
        data: { message: "Hello" },
      };
      const tool = createMockTool("test_tool", expectedResult);
      const plugin = createMockPlugin("test_plugin", [tool]);

      await loader.registerPlugin(plugin);

      const result = await loader.executeTool("test_tool", { input: "test" });
      expect(result).toEqual(expectedResult);
    });

    test("should return error for unknown tool", async () => {
      const result = await loader.executeTool("unknown_tool", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool");
    });

    test("should return error for disabled plugin tool", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool], {
        setup: async () => {
          throw new Error("Setup failed");
        },
      });

      await loader.registerPlugin(plugin);

      const result = await loader.executeTool("test_tool", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool");
    });

    test("should handle tool execution errors", async () => {
      const tool: Tool = {
        name: "error_tool",
        description: "A tool that throws",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          throw new Error("Tool execution error");
        },
      };
      const plugin = createMockPlugin("test_plugin", [tool]);

      await loader.registerPlugin(plugin);

      const result = await loader.executeTool("error_tool", {});
      expect(result.success).toBe(false);
      expect(result.error).toBe("Tool execution error");
    });
  });

  describe("hasTool", () => {
    test("should return true for registered tool", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool]);

      await loader.registerPlugin(plugin);

      expect(loader.hasTool("test_tool")).toBe(true);
    });

    test("should return false for unknown tool", () => {
      expect(loader.hasTool("unknown_tool")).toBe(false);
    });

    test("should return false for disabled plugin tool", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool], {
        setup: async () => {
          throw new Error("Setup failed");
        },
      });

      await loader.registerPlugin(plugin);

      expect(loader.hasTool("test_tool")).toBe(false);
    });
  });

  describe("getTools", () => {
    test("should return tools from enabled plugins only", async () => {
      const tool1 = createMockTool("tool1", { success: true });
      const tool2 = createMockTool("tool2", { success: true });
      const plugin1 = createMockPlugin("plugin1", [tool1]);
      const plugin2 = createMockPlugin("plugin2", [tool2], {
        setup: async () => {
          throw new Error("Setup failed");
        },
      });

      await loader.registerPlugin(plugin1);
      await loader.registerPlugin(plugin2);

      const tools = loader.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("tool1");
    });
  });

  describe("shutdown", () => {
    test("should call teardown on all plugins", async () => {
      let teardownCalled = false;
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool], {
        teardown: async () => {
          teardownCalled = true;
        },
      });

      await loader.registerPlugin(plugin);
      await loader.shutdown();

      expect(teardownCalled).toBe(true);
    });

    test("should clear all plugins and tools", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool]);

      await loader.registerPlugin(plugin);
      await loader.shutdown();

      expect(loader.getPlugins()).toHaveLength(0);
      expect(loader.getTools()).toHaveLength(0);
      expect(loader.isInitialized()).toBe(false);
    });

    test("should handle teardown errors gracefully", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool], {
        teardown: async () => {
          throw new Error("Teardown failed");
        },
      });

      await loader.registerPlugin(plugin);

      // Should not throw
      await loader.shutdown();

      expect(loader.getPlugins()).toHaveLength(0);
    });
  });

  describe("isInitialized", () => {
    test("should return false initially", () => {
      expect(loader.isInitialized()).toBe(false);
    });

    test("should return false after shutdown", async () => {
      const tool = createMockTool("test_tool", { success: true });
      const plugin = createMockPlugin("test_plugin", [tool]);

      await loader.registerPlugin(plugin);
      await loader.shutdown();

      expect(loader.isInitialized()).toBe(false);
    });
  });
});
