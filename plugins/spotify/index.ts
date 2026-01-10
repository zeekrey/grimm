/**
 * Spotify Plugin for Grimm
 *
 * Controls Spotify playback via the Spotify Web API.
 *
 * Setup:
 * 1. Create app at https://developer.spotify.com/dashboard
 * 2. Set environment variables:
 *    - SPOTIFY_CLIENT_ID
 *    - SPOTIFY_CLIENT_SECRET
 *    - SPOTIFY_REFRESH_TOKEN (get via auth flow)
 *
 * To get refresh token, run: bun run plugins/spotify/auth.ts
 */

import type { Plugin, ToolResult } from "../../src/plugins/types";

// Spotify API endpoints
const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

// Configuration from environment
const config = {
  clientId: process.env.SPOTIFY_CLIENT_ID || "",
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN || "",
  accessToken: process.env.SPOTIFY_ACCESS_TOKEN || "", // Optional: direct token
};

/**
 * Spotify API Client
 */
class SpotifyClient {
  private accessToken: string = "";
  private tokenExpiry: number = 0;

  /**
   * Initialize the client and get access token
   */
  async initialize(): Promise<void> {
    // If direct access token provided, use it
    if (config.accessToken) {
      this.accessToken = config.accessToken;
      this.tokenExpiry = Date.now() + 3600 * 1000; // Assume 1 hour
      return;
    }

    // Otherwise, use refresh token
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      throw new Error(
        "Spotify credentials missing. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN"
      );
    }

    await this.refreshAccessToken();
  }

  /**
   * Refresh the access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh Spotify token: ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureToken(): Promise<void> {
    if (Date.now() >= this.tokenExpiry - 60000) {
      // Refresh 1 minute before expiry
      await this.refreshAccessToken();
    }
  }

  /**
   * Make an authenticated API request
   */
  private async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    await this.ensureToken();

    const response = await fetch(`${SPOTIFY_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    return response;
  }

  /**
   * Search for tracks, artists, albums, or playlists
   */
  async search(
    query: string,
    type: "track" | "artist" | "album" | "playlist" = "track",
    limit: number = 5
  ): Promise<SpotifySearchResult> {
    const response = await this.request(
      `/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`Spotify search failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Start or resume playback
   */
  async play(options?: { uris?: string[]; context_uri?: string }): Promise<void> {
    const response = await this.request("/me/player/play", {
      method: "PUT",
      body: options ? JSON.stringify(options) : undefined,
    });

    // 204 = success, 404 = no active device
    if (!response.ok && response.status !== 204) {
      if (response.status === 404) {
        throw new Error("Kein aktives Spotify-Gerät gefunden. Bitte öffne Spotify auf einem Gerät.");
      }
      throw new Error(`Spotify play failed: ${response.statusText}`);
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    const response = await this.request("/me/player/pause", {
      method: "PUT",
    });

    if (!response.ok && response.status !== 204) {
      if (response.status === 404) {
        throw new Error("Kein aktives Spotify-Gerät gefunden.");
      }
      throw new Error(`Spotify pause failed: ${response.statusText}`);
    }
  }

  /**
   * Skip to next track
   */
  async next(): Promise<void> {
    const response = await this.request("/me/player/next", {
      method: "POST",
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Spotify next failed: ${response.statusText}`);
    }
  }

  /**
   * Go to previous track
   */
  async previous(): Promise<void> {
    const response = await this.request("/me/player/previous", {
      method: "POST",
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Spotify previous failed: ${response.statusText}`);
    }
  }

  /**
   * Set volume (0-100)
   */
  async setVolume(percent: number): Promise<void> {
    const volume = Math.max(0, Math.min(100, Math.round(percent)));
    const response = await this.request(
      `/me/player/volume?volume_percent=${volume}`,
      { method: "PUT" }
    );

    if (!response.ok && response.status !== 204) {
      throw new Error(`Spotify volume failed: ${response.statusText}`);
    }
  }

  /**
   * Get current playback state
   */
  async getPlaybackState(): Promise<SpotifyPlaybackState | null> {
    const response = await this.request("/me/player");

    if (response.status === 204) {
      return null; // No active playback
    }

    if (!response.ok) {
      throw new Error(`Spotify playback state failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// Type definitions for Spotify API responses
interface SpotifySearchResult {
  tracks?: { items: SpotifyTrack[] };
  artists?: { items: SpotifyArtist[] };
  albums?: { items: SpotifyAlbum[] };
  playlists?: { items: SpotifyPlaylist[] };
}

interface SpotifyTrack {
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { name: string };
}

interface SpotifyArtist {
  uri: string;
  name: string;
}

interface SpotifyAlbum {
  uri: string;
  name: string;
  artists: { name: string }[];
}

interface SpotifyPlaylist {
  uri: string;
  name: string;
  owner: { display_name: string };
}

interface SpotifyPlaybackState {
  is_playing: boolean;
  item?: SpotifyTrack;
  device?: { name: string; volume_percent: number };
}

// Client instance
const spotify = new SpotifyClient();

/**
 * Spotify Plugin Definition
 */
export const plugin: Plugin = {
  name: "spotify",
  description: "Steuert die Spotify-Musikwiedergabe",
  version: "1.0.0",

  tools: [
    {
      name: "spotify_play",
      description:
        "Spielt Musik auf Spotify ab. Kann Songs, Künstler, Alben oder Playlists abspielen. Nutze dies wenn der Benutzer Musik hören möchte.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Was abgespielt werden soll - Künstlername, Songtitel, Albumname oder Genre",
          },
          type: {
            type: "string",
            description: "Art des Inhalts",
            enum: ["track", "artist", "album", "playlist"],
          },
        },
        required: ["query"],
      },
      execute: async (params): Promise<ToolResult> => {
        const query = params.query as string;
        const type = (params.type as string) || "track";

        try {
          const results = await spotify.search(
            query,
            type as "track" | "artist" | "album" | "playlist"
          );

          // Get first result based on type
          let item: { uri: string; name: string; artist?: string } | null = null;

          if (type === "track" && results.tracks?.items.length) {
            const track = results.tracks.items[0];
            item = {
              uri: track.uri,
              name: track.name,
              artist: track.artists[0]?.name,
            };
          } else if (type === "artist" && results.artists?.items.length) {
            const artist = results.artists.items[0];
            item = { uri: artist.uri, name: artist.name };
          } else if (type === "album" && results.albums?.items.length) {
            const album = results.albums.items[0];
            item = {
              uri: album.uri,
              name: album.name,
              artist: album.artists[0]?.name,
            };
          } else if (type === "playlist" && results.playlists?.items.length) {
            const playlist = results.playlists.items[0];
            item = { uri: playlist.uri, name: playlist.name };
          }

          if (!item) {
            return {
              success: false,
              error: `Konnte "${query}" nicht finden`,
              speech: `Ich konnte leider nichts zu "${query}" finden.`,
            };
          }

          // Play the item
          if (type === "track") {
            await spotify.play({ uris: [item.uri] });
          } else {
            await spotify.play({ context_uri: item.uri });
          }

          const speech = item.artist
            ? `Spiele jetzt ${item.name} von ${item.artist}.`
            : `Spiele jetzt ${item.name}.`;

          return {
            success: true,
            data: { name: item.name, uri: item.uri, type },
            speech,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Spotify-Fehler",
            speech:
              error instanceof Error
                ? error.message
                : "Es gab einen Fehler mit Spotify.",
          };
        }
      },
    },

    {
      name: "spotify_pause",
      description: "Pausiert die aktuelle Spotify-Wiedergabe",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (): Promise<ToolResult> => {
        try {
          await spotify.pause();
          return {
            success: true,
            speech: "Musik pausiert.",
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Spotify-Fehler",
          };
        }
      },
    },

    {
      name: "spotify_resume",
      description: "Setzt die pausierte Spotify-Wiedergabe fort",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (): Promise<ToolResult> => {
        try {
          await spotify.play();
          return {
            success: true,
            speech: "Musik wird fortgesetzt.",
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Spotify-Fehler",
          };
        }
      },
    },

    {
      name: "spotify_next",
      description: "Springt zum nächsten Song auf Spotify",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (): Promise<ToolResult> => {
        try {
          await spotify.next();
          return {
            success: true,
            speech: "Nächster Song.",
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Spotify-Fehler",
          };
        }
      },
    },

    {
      name: "spotify_previous",
      description: "Springt zum vorherigen Song auf Spotify",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (): Promise<ToolResult> => {
        try {
          await spotify.previous();
          return {
            success: true,
            speech: "Vorheriger Song.",
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Spotify-Fehler",
          };
        }
      },
    },

    {
      name: "spotify_volume",
      description: "Stellt die Spotify-Lautstärke ein (0-100)",
      parameters: {
        type: "object",
        properties: {
          volume: {
            type: "number",
            description: "Lautstärke in Prozent (0-100)",
          },
        },
        required: ["volume"],
      },
      execute: async (params): Promise<ToolResult> => {
        const volume = params.volume as number;

        try {
          await spotify.setVolume(volume);
          return {
            success: true,
            speech: `Lautstärke auf ${Math.round(volume)} Prozent gesetzt.`,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Spotify-Fehler",
          };
        }
      },
    },

    {
      name: "spotify_status",
      description: "Zeigt an, was gerade auf Spotify gespielt wird",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (): Promise<ToolResult> => {
        try {
          const state = await spotify.getPlaybackState();

          if (!state || !state.item) {
            return {
              success: true,
              data: { playing: false },
              speech: "Gerade wird nichts auf Spotify abgespielt.",
            };
          }

          const track = state.item;
          const artist = track.artists[0]?.name || "Unbekannt";
          const status = state.is_playing ? "spielt" : "pausiert";

          return {
            success: true,
            data: {
              playing: state.is_playing,
              track: track.name,
              artist,
              device: state.device?.name,
            },
            speech: `${track.name} von ${artist} ${status} gerade${state.device ? ` auf ${state.device.name}` : ""}.`,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Spotify-Fehler",
          };
        }
      },
    },
  ],

  setup: async () => {
    // Check if we have credentials
    const hasCredentials =
      config.accessToken ||
      (config.clientId && config.clientSecret && config.refreshToken);

    if (!hasCredentials) {
      console.warn(
        "Spotify plugin: Missing credentials. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN (or SPOTIFY_ACCESS_TOKEN)"
      );
      throw new Error("Spotify credentials not configured");
    }

    await spotify.initialize();
    console.log("Spotify plugin initialized");
  },

  teardown: async () => {
    console.log("Spotify plugin shutdown");
  },
};

export default plugin;
