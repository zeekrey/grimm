import { describe, expect, test, mock, beforeEach } from "bun:test";
import { TTSClient, TTSError, DEFAULT_VOICES, createGermanTTS } from "./index";

// Store original fetch for restoration
const originalFetch = globalThis.fetch;

describe("TTSError", () => {
  test("has correct name", () => {
    const error = new TTSError("test", 400);
    expect(error.name).toBe("TTSError");
  });

  test("stores status code", () => {
    const error = new TTSError("test", 401);
    expect(error.statusCode).toBe(401);
  });

  test("stores response body", () => {
    const body = { detail: { message: "error details" } };
    const error = new TTSError("test", 500, body);
    expect(error.responseBody).toEqual(body);
  });
});

describe("DEFAULT_VOICES", () => {
  test("has expected voice IDs", () => {
    expect(DEFAULT_VOICES.rachel).toBe("21m00Tcm4TlvDq8ikWAM");
    expect(DEFAULT_VOICES.domi).toBe("AZnzlk1XvdvUeBnXmlld");
    expect(DEFAULT_VOICES.bella).toBe("EXAVITQu4vr4xnSDxMaL");
    expect(DEFAULT_VOICES.antoni).toBe("ErXwobaYiN019PkySvjV");
    expect(DEFAULT_VOICES.elli).toBe("MF3mGyEYCl7XYWbV9V6O");
  });
});

describe("TTSClient", () => {
  beforeEach(() => {
    // Restore original env
    delete process.env.ELEVENLABS_API_KEY;
  });

  describe("constructor", () => {
    test("throws if no API key provided", () => {
      expect(() => new TTSClient()).toThrow(TTSError);
      expect(() => new TTSClient()).toThrow("ElevenLabs API key is required");
    });

    test("accepts API key from options", () => {
      const client = new TTSClient({ apiKey: "test-key" });
      expect(client).toBeInstanceOf(TTSClient);
    });

    test("accepts API key from environment", () => {
      process.env.ELEVENLABS_API_KEY = "env-key";
      const client = new TTSClient();
      expect(client).toBeInstanceOf(TTSClient);
    });

    test("uses default voice ID", () => {
      const client = new TTSClient({ apiKey: "test-key" });
      expect(client.getVoiceId()).toBe(DEFAULT_VOICES.rachel);
    });

    test("accepts custom voice ID", () => {
      const client = new TTSClient({
        apiKey: "test-key",
        voiceId: "custom-voice",
      });
      expect(client.getVoiceId()).toBe("custom-voice");
    });

    test("uses default model", () => {
      const client = new TTSClient({ apiKey: "test-key" });
      expect(client.getModel()).toBe("eleven_turbo_v2_5");
    });

    test("accepts custom model", () => {
      const client = new TTSClient({
        apiKey: "test-key",
        model: "eleven_multilingual_v2",
      });
      expect(client.getModel()).toBe("eleven_multilingual_v2");
    });

    test("uses default output format", () => {
      const client = new TTSClient({ apiKey: "test-key" });
      expect(client.getOutputFormat()).toBe("mp3_44100_128");
    });
  });

  describe("synthesize", () => {
    test("sends correct request to ElevenLabs API", async () => {
      let capturedUrl: string = "";
      let capturedOptions: RequestInit = {};

      (globalThis as any).fetch = mock((url: string, options: RequestInit) => {
        capturedUrl = url;
        capturedOptions = options;
        return Promise.resolve(
          new Response(new ArrayBuffer(100), {
            status: 200,
            headers: { "Content-Type": "audio/mpeg" },
          })
        );
      });

      const client = new TTSClient({
        apiKey: "test-key",
        voiceId: "test-voice",
      });

      await client.synthesize("Hallo Welt");

      expect(capturedUrl).toBe(
        "https://api.elevenlabs.io/v1/text-to-speech/test-voice"
      );
      expect(capturedOptions.method).toBe("POST");

      const headers = capturedOptions.headers as Record<string, string>;
      expect(headers["xi-api-key"]).toBe("test-key");
      expect(headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(capturedOptions.body as string);
      expect(body.text).toBe("Hallo Welt");
      expect(body.model_id).toBe("eleven_turbo_v2_5");

      globalThis.fetch = originalFetch;
    });

    test("returns audio buffer on success", async () => {
      const audioData = new Uint8Array([0, 1, 2, 3, 4]).buffer;

      (globalThis as any).fetch = mock(() =>
        Promise.resolve(
          new Response(audioData, {
            status: 200,
            headers: { "Content-Type": "audio/mpeg" },
          })
        )
      );

      const client = new TTSClient({ apiKey: "test-key" });
      const result = await client.synthesize("Test");

      expect(result.byteLength).toBe(5);

      globalThis.fetch = originalFetch;
    });

    test("throws TTSError on empty text", async () => {
      const client = new TTSClient({ apiKey: "test-key" });

      await expect(client.synthesize("")).rejects.toThrow(TTSError);
      await expect(client.synthesize("")).rejects.toThrow("Text cannot be empty");

      await expect(client.synthesize("   ")).rejects.toThrow("Text cannot be empty");
    });

    test("throws TTSError on API error", async () => {
      (globalThis as any).fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ detail: { message: "Invalid API key" } }),
            { status: 401 }
          )
        )
      );

      const client = new TTSClient({ apiKey: "bad-key" });

      await expect(client.synthesize("Test")).rejects.toThrow(TTSError);

      globalThis.fetch = originalFetch;
    });
  });

  describe("getVoices", () => {
    test("fetches voices from API", async () => {
      const mockVoices = [
        { voice_id: "voice1", name: "Voice 1" },
        { voice_id: "voice2", name: "Voice 2" },
      ];

      (globalThis as any).fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ voices: mockVoices }), {
            status: 200,
          })
        )
      );

      const client = new TTSClient({ apiKey: "test-key" });
      const voices = await client.getVoices();

      expect(voices).toHaveLength(2);
      expect(voices[0].voice_id).toBe("voice1");
      expect(voices[1].name).toBe("Voice 2");

      globalThis.fetch = originalFetch;
    });
  });
});

describe("createGermanTTS", () => {
  test("creates client with multilingual model", () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    const client = createGermanTTS();
    expect(client.getModel()).toBe("eleven_multilingual_v2");
  });

  test("allows overriding options", () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    const client = createGermanTTS({ model: "eleven_turbo_v2_5" });
    expect(client.getModel()).toBe("eleven_turbo_v2_5");
  });
});
