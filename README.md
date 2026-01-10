# Grimm

A German voice assistant for Raspberry Pi, powered by AI.

Grimm listens for a wake word ("Hey Jarvis"), captures your voice command, processes it with an LLM (Gemini 2.0 Flash), and responds via text-to-speech. It supports plugins for extending functionality (e.g., Spotify control).

## Features

- **Wake Word Detection**: Uses OpenWakeWord (ONNX) - runs locally, no cloud required
- **Voice Activity Detection**: Silero VAD - detects when you stop speaking
- **LLM Integration**: Gemini 2.0 Flash via OpenRouter - understands natural language
- **Text-to-Speech**: ElevenLabs - natural German voice responses
- **Plugin System**: Extensible with custom plugins (Spotify included)
- **German Language**: Optimized for German voice commands and responses

## Table of Contents

- [Hardware Requirements](#hardware-requirements)
- [Software Requirements](#software-requirements)
- [Quick Start (Development)](#quick-start-development)
- [Raspberry Pi Deployment](#raspberry-pi-deployment)
- [Configuration](#configuration)
- [Usage](#usage)
- [Plugin System](#plugin-system)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Hardware Requirements

### For Raspberry Pi

| Component | Recommendation | Notes |
|-----------|---------------|-------|
| **Raspberry Pi** | Pi 4 (4GB+) or Pi 5 | Pi 3 may work but slower |
| **Microphone** | USB microphone or USB sound card with mic | Must support 16kHz sample rate |
| **Speakers** | 3.5mm speakers, USB speakers, or Bluetooth | Any audio output works |
| **Power Supply** | Official Pi power supply | 5V 3A for Pi 4/5 |
| **SD Card** | 32GB+ Class 10 | For OS and application |
| **Network** | WiFi or Ethernet | Required for API calls |

### Recommended Microphones

- **ReSpeaker USB Mic Array** - Best for voice, has LED ring
- **PlayStation Eye** - Budget option, good quality
- **Any USB webcam with mic** - Most work fine
- **USB sound card + lavalier mic** - Flexible option

### Recommended Speakers

- Any powered 3.5mm speakers
- USB speakers (no drivers needed)
- Bluetooth speakers (requires pairing)

## Software Requirements

- **Bun** v1.0 or later (JavaScript runtime)
- **ALSA** audio drivers (included in Raspberry Pi OS)
- **Node.js compatible audio libraries** (installed automatically)

### API Keys Required

| Service | Purpose | Cost |
|---------|---------|------|
| [OpenRouter](https://openrouter.ai/keys) | LLM (Gemini 2.0 Flash) | Pay per use (~$0.10/1M tokens) |
| [ElevenLabs](https://elevenlabs.io) | Text-to-Speech | Free tier available |
| [Spotify](https://developer.spotify.com) | Music control (optional) | Free (requires Premium for playback) |

## Quick Start (Development)

### On Your Development Machine

```bash
# Clone the repository
git clone https://github.com/yourusername/grimm.git
cd grimm

# Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Download wake word models
bun run models:download

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run the voice assistant
bun run demo:llm --full
```

## Raspberry Pi Deployment

### Step 1: Prepare the Raspberry Pi

#### Install Raspberry Pi OS

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Flash **Raspberry Pi OS Lite (64-bit)** to SD card
3. Enable SSH in the imager settings
4. Set username/password and WiFi credentials
5. Boot the Pi and SSH into it

```bash
ssh pi@raspberrypi.local
```

#### Update the System

```bash
sudo apt update && sudo apt upgrade -y
```

#### Install Audio Dependencies

```bash
# Install ALSA utilities
sudo apt install -y alsa-utils

# Test microphone
arecord -l  # List recording devices
arecord -d 5 test.wav  # Record 5 seconds
aplay test.wav  # Play it back

# Test speakers
speaker-test -t wav -c 2
```

#### Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### Step 2: Build and Deploy

#### Option A: Build on Pi (Simpler)

```bash
# On Raspberry Pi
git clone https://github.com/yourusername/grimm.git
cd grimm
bun install
bun run models:download
```

#### Option B: Build Locally and Copy (Faster)

```bash
# On your development machine
cd grimm

# Create deployment package
tar -czvf grimm-deploy.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.env \
  .

# Copy to Raspberry Pi
scp grimm-deploy.tar.gz pi@raspberrypi.local:~/

# On Raspberry Pi
ssh pi@raspberrypi.local
tar -xzvf grimm-deploy.tar.gz -C ~/grimm
cd ~/grimm
bun install
bun run models:download
```

### Step 3: Configure Environment

```bash
# On Raspberry Pi
cd ~/grimm

# Create environment file
cat > .env << 'EOF'
# Required
OPENROUTER_API_KEY=your_openrouter_key

# Optional (for TTS)
ELEVENLABS_API_KEY=your_elevenlabs_key

# Optional (for Spotify)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REFRESH_TOKEN=your_spotify_refresh_token
EOF

# Secure the file
chmod 600 .env
```

### Step 4: Test the Installation

```bash
# Test wake word detection (no API keys needed)
bun run demo:wake

# Test full pipeline
bun run demo:llm --full
```

### Step 5: Run as a Service

Create a systemd service for auto-start:

```bash
sudo tee /etc/systemd/system/grimm.service << 'EOF'
[Unit]
Description=Grimm Voice Assistant
After=network.target sound.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/grimm
ExecStart=/home/pi/.bun/bin/bun run demo:llm --full --tools
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable grimm
sudo systemctl start grimm

# Check status
sudo systemctl status grimm

# View logs
journalctl -u grimm -f
```

### Step 6: Configure Audio (if needed)

#### Set Default Microphone

```bash
# List devices
arecord -l

# Edit ALSA config
sudo nano /etc/asound.conf
```

Add:

```
pcm.!default {
    type asym
    playback.pcm "plughw:0,0"
    capture.pcm "plughw:1,0"  # Adjust to your mic device
}

ctl.!default {
    type hw
    card 0
}
```

#### Adjust Microphone Volume

```bash
alsamixer
# Press F6 to select sound card
# Press F4 to show capture devices
# Adjust levels with arrow keys
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | API key for LLM |
| `ELEVENLABS_API_KEY` | No | API key for TTS (text output if not set) |
| `SPOTIFY_CLIENT_ID` | No | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify app client secret |
| `SPOTIFY_REFRESH_TOKEN` | No | Spotify OAuth refresh token |

### Example .env File

```bash
# Required - Get from https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx

# Optional - Get from https://elevenlabs.io
ELEVENLABS_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

# Optional - Get from https://developer.spotify.com
SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_REFRESH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
```

## Usage

### Voice Commands

Say "Hey Jarvis" to activate, then speak your command:

- "Wie spät ist es?" - Get current time
- "Was ist das Wetter heute?" - Ask about weather
- "Spiel etwas von Depeche Mode" - Play music (with Spotify plugin)
- "Pause die Musik" - Pause playback
- "Lautstärke auf 50 Prozent" - Set volume

### Command Line Options

```bash
# Text chat mode (type commands)
bun run demo:llm

# Audio chat mode (speak commands, no wake word)
bun run demo:llm --audio

# Full pipeline (wake word + voice + TTS)
bun run demo:llm --full

# With plugins enabled
bun run demo:llm --full --tools
```

## Plugin System

Grimm supports plugins to extend functionality. See [plugins/README.md](plugins/README.md) for the full development guide.

### Included Plugins

| Plugin | Description | Setup |
|--------|-------------|-------|
| Spotify | Control Spotify playback | [plugins/spotify/README.md](plugins/spotify/README.md) |

### Creating a Plugin

```bash
# Copy the template
cp -r plugins/_template plugins/my-plugin

# Edit your plugin
nano plugins/my-plugin/index.ts

# Test
bun run demo:llm --tools
```

### Plugin Structure

```typescript
import type { Plugin, ToolResult } from "../../src/plugins/types";

export const plugin: Plugin = {
  name: "my-plugin",
  description: "What it does",
  version: "1.0.0",
  tools: [
    {
      name: "myplugin_action",
      description: "When to use this tool",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Input parameter" },
        },
        required: ["input"],
      },
      execute: async (params): Promise<ToolResult> => {
        return { success: true, data: { result: "value" } };
      },
    },
  ],
};

export default plugin;
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Grimm Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐   ┌───────┐   ┌───────┐   ┌───────┐          │
│  │   Mic    │──▶│ Wake  │──▶│  VAD  │──▶│  LLM  │          │
│  │ (16kHz)  │   │ Word  │   │       │   │       │          │
│  └──────────┘   └───────┘   └───────┘   └───┬───┘          │
│                                              │               │
│                                              ▼               │
│  ┌──────────┐   ┌───────┐   ┌───────────────────┐          │
│  │ Speaker  │◀──│  TTS  │◀──│     Plugins       │          │
│  │          │   │       │   │ (Spotify, etc.)   │          │
│  └──────────┘   └───────┘   └───────────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Component | Technology | Runs On |
|-----------|------------|---------|
| Wake Word | OpenWakeWord (ONNX) | Local |
| VAD | Silero VAD | Local |
| Audio Capture | PvRecorder | Local |
| LLM | Gemini 2.0 Flash | Cloud (OpenRouter) |
| TTS | ElevenLabs | Cloud |
| Plugins | Dynamic loading | Local |

## Development

### Project Structure

```
grimm/
├── src/
│   ├── audio/          # Audio capture and utilities
│   ├── llm/            # LLM client (OpenRouter)
│   ├── plugins/        # Plugin system
│   ├── tts/            # Text-to-speech (ElevenLabs)
│   ├── vad/            # Voice activity detection
│   ├── wake-word/      # Wake word detection
│   └── demo-llm.ts     # Main demo script
├── plugins/
│   ├── _template/      # Plugin template
│   ├── spotify/        # Spotify plugin
│   ├── README.md       # Plugin development guide
│   └── CONTRIBUTING.md # Contribution guidelines
├── models/             # Wake word models (downloaded)
├── tests/              # Test fixtures
└── scripts/            # Utility scripts
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific module tests
bun test src/audio/
bun test src/plugins/
bun test plugins/_template/

# Check TypeScript
bunx tsc --noEmit
```

### Key Commands

```bash
# Development
bun run demo:llm          # Text chat
bun run demo:llm --audio  # Voice chat
bun run demo:llm --full   # Full pipeline
bun run demo:wake         # Test wake word
bun run demo:vad          # Test VAD

# Maintenance
bun run models:download   # Download ONNX models
bun run fixtures:generate # Generate test audio
```

## Troubleshooting

### No Microphone Detected

```bash
# Check if microphone is recognized
arecord -l

# If not listed, try unplugging and replugging
# Check dmesg for USB errors
dmesg | tail -20
```

### Wake Word Not Detecting

```bash
# Test with the wake word demo
bun run demo:wake

# Speak clearly and not too far from mic
# Try adjusting sensitivity in the code
```

### No Audio Output

```bash
# Test speakers
speaker-test -t wav -c 2

# Check audio output device
aplay -l

# Set correct output
sudo raspi-config
# -> System Options -> Audio -> Select output
```

### API Errors

```bash
# Check your API keys
cat .env

# Test OpenRouter API
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

### High CPU/Memory Usage

- Raspberry Pi 3 may struggle - use Pi 4 or 5
- Close other applications
- Consider disabling TTS (text output only)

### Service Won't Start

```bash
# Check logs
journalctl -u grimm -n 50

# Test manually first
cd ~/grimm
bun run demo:llm --full

# Check permissions
ls -la .env
```

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- [OpenWakeWord](https://github.com/dscripka/openWakeWord) - Wake word detection
- [Silero VAD](https://github.com/snakers4/silero-vad) - Voice activity detection
- [OpenRouter](https://openrouter.ai) - LLM API gateway
- [ElevenLabs](https://elevenlabs.io) - Text-to-speech
- [Bun](https://bun.sh) - JavaScript runtime
