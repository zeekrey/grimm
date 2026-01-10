# Grimm Smart Speaker - Specifications

Grimm is a smart speaker application built with Bun.js for Linux/Raspberry Pi.

## Overview

Grimm provides a complete voice assistant pipeline:
1. Wake word detection ("hey jarvis")
2. Voice activity detection (end-of-speech)
3. Audio capture and processing
4. LLM-powered understanding (Gemini 2.0 Flash)
5. Plugin/tool execution (Spotify, smart home, etc.)
6. Text-to-speech response (ElevenLabs)

## Specification Documents

| Spec | Description | Link |
|------|-------------|------|
| Architecture | System overview, data flow, and state machine | [architecture.md](specs/architecture.md) |
| Wake Word Detection | OpenWakeWord integration (no API key!) | [wake-word-detection.md](specs/wake-word-detection.md) |
| Voice Activity Detection | Silero VAD for end-of-speech (no API key!) | [voice-activity-detection.md](specs/voice-activity-detection.md) |
| Audio Capture | Microphone input handling with PvRecorder | [audio-capture.md](specs/audio-capture.md) |
| LLM Integration | Gemini 2.0 Flash via OpenRouter | [llm-integration.md](specs/llm-integration.md) |
| Text-to-Speech | ElevenLabs streaming TTS | [text-to-speech.md](specs/text-to-speech.md) |
| Configuration | Environment variables and API keys | [configuration.md](specs/configuration.md) |
| Emulation Tools | Testing without physical hardware | [emulation-tools.md](specs/emulation-tools.md) |
| Testing | Bun test runner strategy | [testing.md](specs/testing.md) |
| Plugin System | Tool/function calling architecture | [plugin-system.md](specs/plugin-system.md) |

## Technology Stack

| Component | Technology | API Key Required |
|-----------|------------|------------------|
| Runtime | Bun.js | No |
| Wake Word | OpenWakeWord (ONNX) | No |
| VAD | Silero VAD (avr-vad) | No |
| Audio Recording | PvRecorder | No |
| LLM | Gemini 2.0 Flash (via OpenRouter) | Yes |
| TTS | ElevenLabs | Yes |
| Audio | PvRecorder / ALSA (Linux) | No |
| Platform | Linux / Raspberry Pi / macOS | - |

## Quick Start

```bash
# Install dependencies
bun install

# Download wake word models (required once)
bun run models:download

# Run tests (no API key needed!)
bun test

# Demo wake word detection (no API key needed!)
bun run demo:wake

# Demo VAD (no API key needed!)
bun run demo:vad

# Run grimm (requires OpenRouter + ElevenLabs keys)
bun run start
```

## Audio Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌───────────┐     ┌─────────┐
│ Microphone  │────▶│ OpenWakeWord│────▶│ Silero VAD│────▶│ Buffer  │
│ (PvRecorder)│     │  Wake Word  │     │ End Speech│     │ Audio   │
└─────────────┘     └─────────────┘     └───────────┘     └────┬────┘
                                                               │
┌─────────────┐     ┌───────────┐     ┌───────────┐           │
│   Speaker   │◀────│ ElevenLabs│◀────│  Gemini   │◀──────────┘
│   Output    │     │    TTS    │     │   2.0     │
└─────────────┘     └───────────┘     └───────────┘
```

## Key Benefits

### Open Source Audio Processing
- **Wake Word**: OpenWakeWord - Apache 2.0 licensed, no API key
- **VAD**: Silero VAD - MIT licensed, no API key
- **Audio Recording**: PvRecorder - Apache 2.0 licensed, no API key

### No Vendor Lock-in
- All audio processing runs locally
- Only cloud services (LLM, TTS) require API keys
- Easy to swap providers

### Full Testing Without API Keys
```bash
# All tests run without any API keys
bun test

# Demo scripts work with just a microphone
bun run demo:wake
bun run demo:vad
```
