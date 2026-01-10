# Spotify Plugin

Control Spotify playback through voice commands with Grimm.

## Features

- Play songs, artists, albums, and playlists by name
- Pause and resume playback
- Skip to next/previous track
- Adjust volume
- Get current playback status

## Setup

### 1. Create Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Fill in the details:
   - App name: "Grimm" (or your choice)
   - Redirect URI: `http://localhost:8888/callback`
4. Save your **Client ID** and **Client Secret**

### 2. Get Refresh Token

You need a refresh token to authenticate. Run the auth helper:

```bash
# Set your credentials first
export SPOTIFY_CLIENT_ID="your_client_id"
export SPOTIFY_CLIENT_SECRET="your_client_secret"

# Run the auth flow (opens browser)
bun run plugins/spotify/auth.ts
```

This will:
1. Open your browser for Spotify login
2. Ask you to authorize the app
3. Print your refresh token

### 3. Set Environment Variables

Add to your `.env` file or export:

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REFRESH_TOKEN=your_refresh_token
```

### 4. Test

```bash
bun run demo:llm --tools

# Then say:
# "Spiel etwas von Depeche Mode"
# "Pause die Musik"
# "Nächster Song"
```

## Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `spotify_play` | Play music | `query` (required), `type` (track/artist/album/playlist) |
| `spotify_pause` | Pause playback | - |
| `spotify_resume` | Resume playback | - |
| `spotify_next` | Skip to next track | - |
| `spotify_previous` | Go to previous track | - |
| `spotify_volume` | Set volume | `volume` (0-100) |
| `spotify_status` | Get current playback | - |

## Example Commands

- "Spiel Shape of You von Ed Sheeran"
- "Spiel das Album Thriller"
- "Spiel die Playlist Workout Mix"
- "Pause"
- "Weiter" / "Nächster Song"
- "Zurück" / "Vorheriger Song"
- "Lautstärke auf 50 Prozent"
- "Was läuft gerade?"

## Requirements

- Active Spotify Premium subscription (required for playback control)
- Spotify app must be open on at least one device
- Internet connection

## Troubleshooting

### "Kein aktives Spotify-Gerät gefunden"

Open Spotify on your phone, computer, or speaker and start playing something. The API requires an active device.

### Token Refresh Errors

Your refresh token may have expired. Run the auth flow again:

```bash
bun run plugins/spotify/auth.ts
```

### Rate Limiting

Spotify has API rate limits. If you hit them, wait a few minutes.

## API Reference

This plugin uses the [Spotify Web API](https://developer.spotify.com/documentation/web-api):

- `/me/player/play` - Start/resume playback
- `/me/player/pause` - Pause playback
- `/me/player/next` - Skip to next
- `/me/player/previous` - Skip to previous
- `/me/player/volume` - Set volume
- `/me/player` - Get playback state
- `/search` - Search for content
