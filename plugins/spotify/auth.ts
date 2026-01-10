#!/usr/bin/env bun
/**
 * Spotify OAuth Helper
 *
 * Run this script to get a refresh token for the Spotify plugin.
 *
 * Usage:
 *   export SPOTIFY_CLIENT_ID="your_client_id"
 *   export SPOTIFY_CLIENT_SECRET="your_client_secret"
 *   bun run plugins/spotify/auth.ts
 */

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:8888/callback";
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
].join(" ");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Error: Missing credentials");
  console.error("");
  console.error("Set these environment variables:");
  console.error("  export SPOTIFY_CLIENT_ID='your_client_id'");
  console.error("  export SPOTIFY_CLIENT_SECRET='your_client_secret'");
  console.error("");
  console.error("Get these from: https://developer.spotify.com/dashboard");
  process.exit(1);
}

// Generate authorization URL
const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPES);

console.log("Spotify OAuth Setup");
console.log("===================");
console.log("");
console.log("1. Open this URL in your browser:");
console.log("");
console.log(`   ${authUrl.toString()}`);
console.log("");
console.log("2. Log in and authorize the app");
console.log("3. You'll be redirected to a localhost URL");
console.log("4. Copy the 'code' parameter from the URL");
console.log("");

// Start local server to catch the callback
const server = Bun.serve({
  port: 8888,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        console.error(`\nError: ${error}`);
        setTimeout(() => process.exit(1), 100);
        return new Response(
          `<html><body><h1>Error</h1><p>${error}</p></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      if (code) {
        console.log("\nReceived authorization code, exchanging for tokens...");

        try {
          // Exchange code for tokens
          const response = await fetch(
            "https://accounts.spotify.com/api/token",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
              },
              body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI,
              }),
            }
          );

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token exchange failed: ${error}`);
          }

          const data = (await response.json()) as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
          };

          console.log("\n===========================================");
          console.log("Success! Add this to your .env file:");
          console.log("===========================================\n");
          console.log(`SPOTIFY_CLIENT_ID=${CLIENT_ID}`);
          console.log(`SPOTIFY_CLIENT_SECRET=${CLIENT_SECRET}`);
          console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}`);
          console.log("\n===========================================\n");

          setTimeout(() => process.exit(0), 100);

          return new Response(
            `<html>
              <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #1DB954;">Success!</h1>
                <p>Your refresh token has been printed to the terminal.</p>
                <p>Add it to your <code>.env</code> file:</p>
                <pre style="background: #f0f0f0; padding: 20px; border-radius: 8px; overflow-x: auto;">SPOTIFY_REFRESH_TOKEN=${data.refresh_token}</pre>
                <p>You can close this window.</p>
              </body>
            </html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        } catch (err) {
          console.error("\nError:", err);
          setTimeout(() => process.exit(1), 100);
          return new Response(
            `<html><body><h1>Error</h1><p>${err}</p></body></html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        }
      }
    }

    return new Response("Waiting for callback...");
  },
});

console.log(`Waiting for callback on ${REDIRECT_URI}...`);
console.log("(Press Ctrl+C to cancel)\n");

// Try to open browser automatically
try {
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  Bun.spawn([opener, authUrl.toString()], { stdout: "ignore", stderr: "ignore" });
  console.log("Opening browser...\n");
} catch {
  // Ignore - user will open manually
}
