/**
 * Template Plugin Tests
 *
 * Example test file showing how to test your plugin.
 * Copy and adapt this for your own plugin.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { plugin } from "./index";

describe("template plugin", () => {
  // Run setup before tests if needed
  beforeAll(async () => {
    if (plugin.setup) {
      await plugin.setup();
    }
  });

  // Run teardown after tests if needed
  afterAll(async () => {
    if (plugin.teardown) {
      await plugin.teardown();
    }
  });

  describe("metadata", () => {
    test("should have correct name", () => {
      expect(plugin.name).toBe("template");
    });

    test("should have description", () => {
      expect(plugin.description).toBeTruthy();
    });

    test("should have valid version", () => {
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("should have at least one tool", () => {
      expect(plugin.tools.length).toBeGreaterThan(0);
    });
  });

  describe("template_example tool", () => {
    const tool = plugin.tools.find((t) => t.name === "template_example");

    test("should exist", () => {
      expect(tool).toBeDefined();
    });

    test("should have description", () => {
      expect(tool!.description).toBeTruthy();
    });

    test("should require message parameter", () => {
      expect(tool!.parameters.required).toContain("message");
    });

    test("should return success with valid input", async () => {
      const result = await tool!.execute({ message: "Hello" });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    test("should echo message correctly", async () => {
      const result = await tool!.execute({ message: "Test message" });

      expect(result.success).toBe(true);
      expect((result.data as { result: string }).result).toBe("Test message");
    });

    test("should support uppercase option", async () => {
      const result = await tool!.execute({
        message: "hello",
        uppercase: true,
      });

      expect(result.success).toBe(true);
      expect((result.data as { result: string }).result).toBe("HELLO");
    });

    test("should include German speech response", async () => {
      const result = await tool!.execute({ message: "Test" });

      expect(result.speech).toBeDefined();
      expect(result.speech).toContain("Test");
    });
  });

  describe("tool naming", () => {
    test("all tools should be prefixed with plugin name", () => {
      for (const tool of plugin.tools) {
        expect(tool.name.startsWith("template_")).toBe(true);
      }
    });
  });
});
