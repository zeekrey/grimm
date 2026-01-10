/**
 * Tagesschau Plugin for Grimm
 *
 * Provides German news from tagesschau.de via the official API.
 * No authentication required - this is a public API.
 *
 * API Documentation: https://tagesschau.api.bund.dev/
 */

import type { Plugin, ToolResult } from "../../src/plugins/types";

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = "https://www.tagesschau.de/api2u";
const REQUEST_TIMEOUT_MS = 10000;

// ============================================================================
// Types
// ============================================================================

interface NewsItem {
  sophoraId: string;
  title: string;
  teaserImage?: {
    alttext?: string;
    imageVariants?: Record<string, string>;
  };
  date: string;
  firstSentence?: string;
  shareURL: string;
  ressort?: string;
  breakingNews?: boolean;
  regionId?: number;
  regionIds?: number[];
}

interface HomepageResponse {
  news: NewsItem[];
  regional: NewsItem[];
  type: string;
}

interface NewsResponse {
  news: NewsItem[];
  regional?: NewsItem[];
  nextPage?: string;
  type: string;
}

interface SearchResponse {
  searchResults: NewsItem[];
  totalItemCount: number;
}

// ============================================================================
// Region Mapping
// ============================================================================

const REGION_CODES: Record<string, number> = {
  "baden-württemberg": 1,
  "bayern": 2,
  "berlin": 3,
  "brandenburg": 4,
  "bremen": 5,
  "hamburg": 6,
  "hessen": 7,
  "mecklenburg-vorpommern": 8,
  "niedersachsen": 9,
  "nordrhein-westfalen": 10,
  "rheinland-pfalz": 11,
  "saarland": 12,
  "sachsen": 13,
  "sachsen-anhalt": 14,
  "schleswig-holstein": 15,
  "thüringen": 16,
};

const REGION_NAMES: Record<number, string> = {
  1: "Baden-Württemberg",
  2: "Bayern",
  3: "Berlin",
  4: "Brandenburg",
  5: "Bremen",
  6: "Hamburg",
  7: "Hessen",
  8: "Mecklenburg-Vorpommern",
  9: "Niedersachsen",
  10: "Nordrhein-Westfalen",
  11: "Rheinland-Pfalz",
  12: "Saarland",
  13: "Sachsen",
  14: "Sachsen-Anhalt",
  15: "Schleswig-Holstein",
  16: "Thüringen",
};

// Category display names for speech output
const CATEGORY_NAMES: Record<string, string> = {
  inland: "Inland",
  ausland: "Ausland",
  wirtschaft: "Wirtschaft",
  sport: "Sport",
  wissen: "Wissenschaft",
  investigativ: "Investigativ",
};

// ============================================================================
// API Client
// ============================================================================

class TagesschauClient {
  /**
   * Make a request to the Tagesschau API with timeout
   */
  private async request<T>(endpoint: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get homepage news (top stories and breaking news)
   */
  async getHomepage(): Promise<HomepageResponse> {
    return this.request<HomepageResponse>("/homepage/");
  }

  /**
   * Get news with optional filtering
   */
  async getNews(options?: {
    ressort?: string;
    regions?: number;
    pageSize?: number;
  }): Promise<NewsResponse> {
    const params = new URLSearchParams();

    if (options?.ressort) {
      params.set("ressort", options.ressort);
    }
    if (options?.regions) {
      params.set("regions", String(options.regions));
    }
    if (options?.pageSize) {
      params.set("pageSize", String(options.pageSize));
    }

    const queryString = params.toString();
    const endpoint = queryString ? `/news/?${queryString}` : "/news/";

    return this.request<NewsResponse>(endpoint);
  }

  /**
   * Search for news
   */
  async search(query: string, pageSize?: number): Promise<SearchResponse> {
    const params = new URLSearchParams();
    params.set("searchText", query);

    if (pageSize) {
      params.set("pageSize", String(pageSize));
    }

    return this.request<SearchResponse>(`/search/?${params.toString()}`);
  }
}

// Client instance
const client = new TagesschauClient();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a list of news items for speech output
 */
function formatHeadlinesForSpeech(items: NewsItem[], maxItems: number): string {
  const headlines = items.slice(0, Math.min(maxItems, 3));

  if (headlines.length === 0) {
    return "Es gibt momentan keine Nachrichten.";
  }

  const titles = headlines.map((item) => item.title).join(". ");
  return titles + ".";
}

/**
 * Format news items for data response
 */
function formatNewsItems(
  items: NewsItem[],
  count: number
): Array<{
  title: string;
  teaser: string | null;
  date: string;
  url: string;
  breaking: boolean;
}> {
  return items.slice(0, count).map((item) => ({
    title: item.title,
    teaser: item.firstSentence || null,
    date: item.date,
    url: item.shareURL,
    breaking: item.breakingNews || false,
  }));
}

/**
 * Normalize region input to lowercase with proper formatting
 */
function normalizeRegion(region: string): string {
  return region.toLowerCase().trim();
}

/**
 * Get region code from region name (case-insensitive, flexible matching)
 */
function getRegionCode(region: string): number | null {
  const normalized = normalizeRegion(region);

  // Direct match
  if (REGION_CODES[normalized] !== undefined) {
    return REGION_CODES[normalized];
  }

  // Try partial match
  for (const [name, code] of Object.entries(REGION_CODES)) {
    if (name.includes(normalized) || normalized.includes(name)) {
      return code;
    }
  }

  return null;
}

// ============================================================================
// Plugin Definition
// ============================================================================

export const plugin: Plugin = {
  name: "tagesschau",
  description: "Liefert aktuelle deutsche Nachrichten von tagesschau.de",
  version: "1.0.0",

  tools: [
    // -------------------------------------------------------------------------
    // Tool: tagesschau_headlines
    // -------------------------------------------------------------------------
    {
      name: "tagesschau_headlines",
      description:
        "Liefert aktuelle Schlagzeilen und Eilmeldungen von tagesschau.de. " +
        "Nutze dieses Tool wenn der Benutzer nach aktuellen Nachrichten, " +
        "Schlagzeilen oder wissen möchte was gerade in Deutschland oder der Welt passiert.",
      parameters: {
        type: "object",
        properties: {
          count: {
            type: "number",
            description: "Anzahl der Schlagzeilen (1-10, Standard: 5)",
          },
        },
        required: [],
      },
      execute: async (params): Promise<ToolResult> => {
        try {
          const count = Math.min(10, Math.max(1, (params.count as number) || 5));

          const response = await client.getHomepage();
          const headlines = formatNewsItems(response.news, count);

          if (headlines.length === 0) {
            return {
              success: true,
              data: { headlines: [] },
              speech: "Es gibt momentan keine aktuellen Nachrichten.",
            };
          }

          const speechText =
            "Hier sind die aktuellen Schlagzeilen: " +
            formatHeadlinesForSpeech(response.news, count);

          return {
            success: true,
            data: { headlines },
            speech: speechText,
          };
        } catch (error) {
          const message =
            error instanceof Error && error.name === "AbortError"
              ? "Die Tagesschau-API antwortet nicht. Bitte versuche es später erneut."
              : "Fehler beim Abrufen der Nachrichten.";

          return {
            success: false,
            error: error instanceof Error ? error.message : "Unbekannter Fehler",
            speech: message,
          };
        }
      },
    },

    // -------------------------------------------------------------------------
    // Tool: tagesschau_news
    // -------------------------------------------------------------------------
    {
      name: "tagesschau_news",
      description:
        "Liefert Nachrichten aus einer bestimmten Kategorie wie Inland, Ausland, " +
        "Wirtschaft, Sport oder Wissenschaft. Nutze dieses Tool wenn der Benutzer " +
        "nach Nachrichten zu einem bestimmten Themenbereich fragt.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Nachrichtenkategorie",
            enum: ["inland", "ausland", "wirtschaft", "sport", "wissen", "investigativ"],
          },
          count: {
            type: "number",
            description: "Anzahl der Nachrichten (1-10, Standard: 5)",
          },
        },
        required: ["category"],
      },
      execute: async (params): Promise<ToolResult> => {
        try {
          const category = params.category as string;
          const count = Math.min(10, Math.max(1, (params.count as number) || 5));

          const response = await client.getNews({
            ressort: category,
            pageSize: count,
          });

          const news = formatNewsItems(response.news, count);

          if (news.length === 0) {
            const categoryName = CATEGORY_NAMES[category] || category;
            return {
              success: true,
              data: { news: [], category },
              speech: `Es gibt momentan keine ${categoryName}-Nachrichten.`,
            };
          }

          const categoryName = CATEGORY_NAMES[category] || category;
          const speechText =
            `Hier sind die aktuellen ${categoryName}-Nachrichten: ` +
            formatHeadlinesForSpeech(response.news, count);

          return {
            success: true,
            data: { news, category },
            speech: speechText,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unbekannter Fehler",
            speech: "Fehler beim Abrufen der Nachrichten.",
          };
        }
      },
    },

    // -------------------------------------------------------------------------
    // Tool: tagesschau_regional
    // -------------------------------------------------------------------------
    {
      name: "tagesschau_regional",
      description:
        "Liefert regionale Nachrichten aus einem bestimmten Bundesland. " +
        "Nutze dieses Tool wenn der Benutzer nach Nachrichten aus einer " +
        "bestimmten Region oder einem Bundesland fragt.",
      parameters: {
        type: "object",
        properties: {
          region: {
            type: "string",
            description: "Bundesland (z.B. Bayern, Berlin, Nordrhein-Westfalen)",
          },
          count: {
            type: "number",
            description: "Anzahl der Nachrichten (1-10, Standard: 5)",
          },
        },
        required: ["region"],
      },
      execute: async (params): Promise<ToolResult> => {
        try {
          const regionInput = params.region as string;
          const count = Math.min(10, Math.max(1, (params.count as number) || 5));

          const regionCode = getRegionCode(regionInput);

          if (regionCode === null) {
            return {
              success: false,
              error: `Bundesland "${regionInput}" nicht gefunden`,
              speech: `Das Bundesland "${regionInput}" konnte ich nicht finden. ` +
                "Bitte nenne ein gültiges Bundesland wie Bayern, Berlin oder Hamburg.",
            };
          }

          const regionName = REGION_NAMES[regionCode];

          const response = await client.getNews({
            regions: regionCode,
            pageSize: count,
          });

          const news = formatNewsItems(response.news, count);

          if (news.length === 0) {
            return {
              success: true,
              data: { news: [], region: regionName },
              speech: `Es gibt momentan keine Nachrichten aus ${regionName}.`,
            };
          }

          const speechText =
            `Hier sind die Nachrichten aus ${regionName}: ` +
            formatHeadlinesForSpeech(response.news, count);

          return {
            success: true,
            data: { news, region: regionName },
            speech: speechText,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unbekannter Fehler",
            speech: "Fehler beim Abrufen der regionalen Nachrichten.",
          };
        }
      },
    },

    // -------------------------------------------------------------------------
    // Tool: tagesschau_search
    // -------------------------------------------------------------------------
    {
      name: "tagesschau_search",
      description:
        "Sucht nach Nachrichten zu einem bestimmten Thema oder Begriff. " +
        "Nutze dieses Tool wenn der Benutzer nach Nachrichten zu einem " +
        "spezifischen Thema, einer Person oder einem Ereignis sucht.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Suchbegriff",
          },
          count: {
            type: "number",
            description: "Anzahl der Ergebnisse (1-10, Standard: 5)",
          },
        },
        required: ["query"],
      },
      execute: async (params): Promise<ToolResult> => {
        try {
          const query = params.query as string;
          const count = Math.min(10, Math.max(1, (params.count as number) || 5));

          if (!query.trim()) {
            return {
              success: false,
              error: "Suchbegriff fehlt",
              speech: "Bitte nenne mir einen Suchbegriff.",
            };
          }

          const response = await client.search(query, count);
          const results = formatNewsItems(response.searchResults, count);

          if (results.length === 0) {
            return {
              success: true,
              data: { results: [], query, totalResults: 0 },
              speech: `Zu "${query}" habe ich leider keine Nachrichten gefunden.`,
            };
          }

          const speechText =
            `Zu "${query}" habe ich ${response.totalItemCount} Nachrichten gefunden. ` +
            `Hier sind die wichtigsten: ` +
            formatHeadlinesForSpeech(response.searchResults, count);

          return {
            success: true,
            data: {
              results,
              query,
              totalResults: response.totalItemCount,
            },
            speech: speechText,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unbekannter Fehler",
            speech: "Fehler bei der Nachrichtensuche.",
          };
        }
      },
    },
  ],

  // ---------------------------------------------------------------------------
  // Lifecycle Hooks
  // ---------------------------------------------------------------------------

  setup: async () => {
    console.log("Tagesschau plugin initialized");
  },

  teardown: async () => {
    console.log("Tagesschau plugin shutdown");
  },
};

export default plugin;
