/**
 * Tagesschau Plugin Tests
 */

import { describe, test, expect, beforeAll, afterAll, mock, spyOn } from "bun:test";
import { plugin } from "./index";

// Mock API responses
const mockHomepageResponse = {
  news: [
    {
      sophoraId: "1",
      title: "Erste Schlagzeile des Tages",
      date: "2024-01-15T10:00:00Z",
      firstSentence: "Dies ist die erste Nachricht.",
      shareURL: "https://www.tagesschau.de/news/1",
      breakingNews: false,
    },
    {
      sophoraId: "2",
      title: "Eilmeldung: Wichtiges Ereignis",
      date: "2024-01-15T09:30:00Z",
      firstSentence: "Eine wichtige Eilmeldung.",
      shareURL: "https://www.tagesschau.de/news/2",
      breakingNews: true,
    },
    {
      sophoraId: "3",
      title: "Dritte Nachricht",
      date: "2024-01-15T09:00:00Z",
      firstSentence: "Weitere Nachrichten.",
      shareURL: "https://www.tagesschau.de/news/3",
      breakingNews: false,
    },
  ],
  regional: [],
  type: "homepage",
};

const mockNewsResponse = {
  news: [
    {
      sophoraId: "10",
      title: "Sportnachricht",
      date: "2024-01-15T10:00:00Z",
      firstSentence: "Sport News.",
      shareURL: "https://www.tagesschau.de/sport/10",
      ressort: "sport",
    },
  ],
  type: "news",
};

const mockSearchResponse = {
  searchResults: [
    {
      sophoraId: "20",
      title: "Klimawandel Artikel",
      date: "2024-01-15T10:00:00Z",
      firstSentence: "Artikel über Klimawandel.",
      shareURL: "https://www.tagesschau.de/wissen/20",
    },
  ],
  totalItemCount: 42,
};

const mockEmptyResponse = {
  news: [],
  searchResults: [],
  totalItemCount: 0,
  type: "news",
};

// Store original fetch
const originalFetch = globalThis.fetch;

describe("tagesschau plugin", () => {
  beforeAll(async () => {
    if (plugin.setup) {
      await plugin.setup();
    }
  });

  afterAll(async () => {
    // Restore original fetch
    globalThis.fetch = originalFetch;

    if (plugin.teardown) {
      await plugin.teardown();
    }
  });

  // ===========================================================================
  // Metadata Tests
  // ===========================================================================

  describe("metadata", () => {
    test("should have correct name", () => {
      expect(plugin.name).toBe("tagesschau");
    });

    test("should have German description", () => {
      expect(plugin.description).toBeTruthy();
      expect(plugin.description).toContain("Nachrichten");
    });

    test("should have valid semantic version", () => {
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("should have four tools", () => {
      expect(plugin.tools.length).toBe(4);
    });

    test("should have setup function", () => {
      expect(plugin.setup).toBeDefined();
      expect(typeof plugin.setup).toBe("function");
    });

    test("should have teardown function", () => {
      expect(plugin.teardown).toBeDefined();
      expect(typeof plugin.teardown).toBe("function");
    });
  });

  // ===========================================================================
  // Tool Naming Tests
  // ===========================================================================

  describe("tool naming", () => {
    test("all tools should be prefixed with plugin name", () => {
      for (const tool of plugin.tools) {
        expect(tool.name.startsWith("tagesschau_")).toBe(true);
      }
    });

    test("all tools should have descriptions", () => {
      for (const tool of plugin.tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(20);
      }
    });

    test("all tools should have parameter schemas", () => {
      for (const tool of plugin.tools) {
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe("object");
      }
    });
  });

  // ===========================================================================
  // tagesschau_headlines Tests
  // ===========================================================================

  describe("tagesschau_headlines tool", () => {
    const tool = plugin.tools.find((t) => t.name === "tagesschau_headlines");

    test("should exist", () => {
      expect(tool).toBeDefined();
    });

    test("should not require any parameters", () => {
      expect(tool!.parameters.required || []).toEqual([]);
    });

    test("should have count parameter", () => {
      expect(tool!.parameters.properties).toHaveProperty("count");
    });

    test("should return headlines on success", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockHomepageResponse),
        } as Response)
      );

      const result = await tool!.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as { headlines: unknown[] }).headlines).toBeInstanceOf(Array);
      expect((result.data as { headlines: unknown[] }).headlines.length).toBeGreaterThan(0);
    });

    test("should include German speech response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockHomepageResponse),
        } as Response)
      );

      const result = await tool!.execute({});

      expect(result.speech).toBeDefined();
      expect(result.speech).toContain("Schlagzeilen");
    });

    test("should respect count parameter", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockHomepageResponse),
        } as Response)
      );

      const result = await tool!.execute({ count: 2 });

      expect(result.success).toBe(true);
      expect((result.data as { headlines: unknown[] }).headlines.length).toBe(2);
    });

    test("should clamp count to valid range", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockHomepageResponse),
        } as Response)
      );

      const result = await tool!.execute({ count: 100 });

      expect(result.success).toBe(true);
      // Should be clamped to max 10, but we only have 3 in mock
      expect((result.data as { headlines: unknown[] }).headlines.length).toBeLessThanOrEqual(10);
    });

    test("should handle empty response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ news: [], regional: [], type: "homepage" }),
        } as Response)
      );

      const result = await tool!.execute({});

      expect(result.success).toBe(true);
      expect((result.data as { headlines: unknown[] }).headlines).toEqual([]);
      expect(result.speech).toContain("keine");
    });

    test("should handle API error", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          statusText: "Internal Server Error",
        } as Response)
      );

      const result = await tool!.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ===========================================================================
  // tagesschau_news Tests
  // ===========================================================================

  describe("tagesschau_news tool", () => {
    const tool = plugin.tools.find((t) => t.name === "tagesschau_news");

    test("should exist", () => {
      expect(tool).toBeDefined();
    });

    test("should require category parameter", () => {
      expect(tool!.parameters.required).toContain("category");
    });

    test("should have category enum", () => {
      const categoryProp = tool!.parameters.properties.category;
      expect(categoryProp.enum).toBeDefined();
      expect(categoryProp.enum).toContain("inland");
      expect(categoryProp.enum).toContain("ausland");
      expect(categoryProp.enum).toContain("sport");
    });

    test("should return news for category", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockNewsResponse),
        } as Response)
      );

      const result = await tool!.execute({ category: "sport" });

      expect(result.success).toBe(true);
      expect((result.data as { news: unknown[]; category: string }).news).toBeInstanceOf(Array);
      expect((result.data as { news: unknown[]; category: string }).category).toBe("sport");
    });

    test("should include German speech with category name", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockNewsResponse),
        } as Response)
      );

      const result = await tool!.execute({ category: "sport" });

      expect(result.speech).toBeDefined();
      expect(result.speech).toContain("Sport");
    });

    test("should handle empty results", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockEmptyResponse),
        } as Response)
      );

      const result = await tool!.execute({ category: "investigativ" });

      expect(result.success).toBe(true);
      expect((result.data as { news: unknown[] }).news).toEqual([]);
    });
  });

  // ===========================================================================
  // tagesschau_regional Tests
  // ===========================================================================

  describe("tagesschau_regional tool", () => {
    const tool = plugin.tools.find((t) => t.name === "tagesschau_regional");

    test("should exist", () => {
      expect(tool).toBeDefined();
    });

    test("should require region parameter", () => {
      expect(tool!.parameters.required).toContain("region");
    });

    test("should return news for valid region", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockNewsResponse),
        } as Response)
      );

      const result = await tool!.execute({ region: "Bayern" });

      expect(result.success).toBe(true);
      expect((result.data as { region: string }).region).toBe("Bayern");
    });

    test("should handle lowercase region names", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockNewsResponse),
        } as Response)
      );

      const result = await tool!.execute({ region: "berlin" });

      expect(result.success).toBe(true);
      expect((result.data as { region: string }).region).toBe("Berlin");
    });

    test("should handle regions with umlauts", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockNewsResponse),
        } as Response)
      );

      const result = await tool!.execute({ region: "thüringen" });

      expect(result.success).toBe(true);
      expect((result.data as { region: string }).region).toBe("Thüringen");
    });

    test("should reject invalid region", async () => {
      const result = await tool!.execute({ region: "Atlantis" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("nicht gefunden");
      expect(result.speech).toContain("konnte ich nicht finden");
    });

    test("should include German speech with region name", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockNewsResponse),
        } as Response)
      );

      const result = await tool!.execute({ region: "Hamburg" });

      expect(result.speech).toBeDefined();
      expect(result.speech).toContain("Hamburg");
    });
  });

  // ===========================================================================
  // tagesschau_search Tests
  // ===========================================================================

  describe("tagesschau_search tool", () => {
    const tool = plugin.tools.find((t) => t.name === "tagesschau_search");

    test("should exist", () => {
      expect(tool).toBeDefined();
    });

    test("should require query parameter", () => {
      expect(tool!.parameters.required).toContain("query");
    });

    test("should return search results", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const result = await tool!.execute({ query: "Klimawandel" });

      expect(result.success).toBe(true);
      expect((result.data as { results: unknown[] }).results).toBeInstanceOf(Array);
      expect((result.data as { query: string }).query).toBe("Klimawandel");
      expect((result.data as { totalResults: number }).totalResults).toBe(42);
    });

    test("should include total count in speech", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        } as Response)
      );

      const result = await tool!.execute({ query: "Klimawandel" });

      expect(result.speech).toContain("42");
      expect(result.speech).toContain("Klimawandel");
    });

    test("should handle no results", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ searchResults: [], totalItemCount: 0 }),
        } as Response)
      );

      const result = await tool!.execute({ query: "xyznonexistent123" });

      expect(result.success).toBe(true);
      expect((result.data as { results: unknown[] }).results).toEqual([]);
      expect(result.speech).toContain("keine Nachrichten gefunden");
    });

    test("should reject empty query", async () => {
      const result = await tool!.execute({ query: "   " });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Suchbegriff");
    });
  });

  // ===========================================================================
  // Integration-style Tests (with actual API - skip in CI)
  // ===========================================================================

  describe.skipIf(process.env.CI === "true")("integration tests", () => {
    beforeAll(() => {
      // Restore real fetch for integration tests
      globalThis.fetch = originalFetch;
    });

    test("should fetch real headlines", async () => {
      const tool = plugin.tools.find((t) => t.name === "tagesschau_headlines");
      const result = await tool!.execute({ count: 3 });

      expect(result.success).toBe(true);
      expect((result.data as { headlines: unknown[] }).headlines.length).toBeGreaterThan(0);
    });
  });
});
