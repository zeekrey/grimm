# Architecture

## Overview

Grimm is a voice-activated smart speaker that processes spoken commands through an LLM and responds with synthesized speech.

## System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                           GRIMM                                     │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Audio Channel Abstraction                 │   │
│  │  ┌─────────────────┐    ┌─────────────────┐                │   │
│  │  │  Real Mic Input │    │ Emulated Input  │                │   │
│  │  │  (ALSA/Linux)   │    │ (File/Buffer)   │                │   │
│  │  └────────┬────────┘    └────────┬────────┘                │   │
│  │           └──────────┬───────────┘                          │   │
│  └──────────────────────┼──────────────────────────────────────┘   │
│                         │                                           │
│                         ▼                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Wake Word Detection                         │  │
│  │                   (Picovoice Porcupine)                       │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                              │ Wake word detected                   │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                Voice Activity Detection                       │  │
│  │                (Picovoice Cobra VAD)                          │  │
│  │                + Audio Buffering                              │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                              │ Speech ended                         │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    LLM Processing                             │  │
│  │            (Gemini 2.0 Flash via OpenRouter)                  │  │
│  │                  + Plugin/Tool Execution                      │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                              │ Response text                        │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Text-to-Speech                              │  │
│  │                   (ElevenLabs)                                │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                              │ Audio stream                         │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Audio Output                                │  │
│  │                   (Speaker)                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

## State Machine

```
                    ┌─────────┐
                    │  IDLE   │◀──────────────────────┐
                    └────┬────┘                       │
                         │ Start                      │
                         ▼                            │
              ┌──────────────────────┐                │
              │ LISTENING_WAKE_WORD  │                │
              │ (Porcupine active)   │                │
              └──────────┬───────────┘                │
                         │ Wake word detected         │
                         ▼                            │
              ┌──────────────────────┐                │
              │ LISTENING_COMMAND    │                │
              │ (Cobra VAD active)   │                │
              │ (Audio buffering)    │                │
              └──────────┬───────────┘                │
                         │ Speech ended               │
                         ▼                            │
              ┌──────────────────────┐                │
              │    PROCESSING        │                │
              │ (LLM + Tools)        │                │
              └──────────┬───────────┘                │
                         │ Response ready             │
                         ▼                            │
              ┌──────────────────────┐                │
              │     SPEAKING         │                │
              │ (TTS playback)       │────────────────┘
              └──────────────────────┘   Playback complete
```

## States

| State | Description | Active Components |
|-------|-------------|-------------------|
| `IDLE` | System not running | None |
| `LISTENING_WAKE_WORD` | Waiting for wake word | Porcupine |
| `LISTENING_COMMAND` | Recording user command | Cobra VAD, Audio Buffer |
| `PROCESSING` | Sending to LLM, executing tools | OpenRouter, Plugins |
| `SPEAKING` | Playing TTS response | ElevenLabs, Audio Output |

## Audio Channel Abstraction

The audio channel abstraction provides a unified interface for audio input, supporting both real microphone input and emulated input for testing.

```typescript
interface AudioChannel {
  start(): void;
  stop(): void;
  onFrame(callback: (frame: Int16Array) => void): void;
  getSampleRate(): number;
  getFrameLength(): number;
}

class MicrophoneChannel implements AudioChannel { /* ALSA input */ }
class EmulatedChannel implements AudioChannel { /* File/buffer input */ }
```

## Data Flow

### Normal Operation
1. Microphone captures PCM audio (16-bit, 16kHz, mono)
2. Audio frames fed to Porcupine for wake word detection
3. On wake word: Switch to Cobra VAD, start buffering
4. Cobra detects end of speech
5. Buffered audio encoded as base64
6. Sent to Gemini 2.0 Flash with system prompt and tools
7. LLM may call tools (plugins), results sent back
8. Final response text streamed to ElevenLabs
9. Audio output played through speaker
10. Return to listening for wake word

### Emulation Mode
1. Text command received via CLI
2. Text → ElevenLabs TTS → Audio buffer
3. Audio injected into emulated channel
4. Normal pipeline processes (steps 2-10 above)

## Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| AudioChannel | `src/audio/channel.ts` | Abstract audio input |
| WakeWord | `src/wake-word/index.ts` | Porcupine integration |
| VAD | `src/vad/index.ts` | Cobra VAD integration |
| LLM | `src/llm/index.ts` | OpenRouter/Gemini calls |
| TTS | `src/tts/index.ts` | ElevenLabs integration |
| Plugins | `src/plugins/index.ts` | Plugin loading & execution |
| Emulator | `src/emulator/index.ts` | CLI emulation tools |

## Mode Switching

Grimm supports two modes:

1. **Production Mode** (default)
   - Real microphone input via ALSA
   - Full pipeline active

2. **Emulation Mode** (`--emulate` flag)
   - Text input converted to audio
   - No microphone required
   - Useful for testing and development
