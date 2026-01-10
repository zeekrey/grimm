/**
 * Audio Module
 *
 * Provides audio channel abstractions for both real microphone input
 * and emulated audio for testing.
 */

// Types and interfaces
export type {
  AudioChannel,
  FrameCallback,
  EmulatedChannelOptions,
  AudioChannelFactoryOptions,
  AudioChannelMode,
  AudioChannelFactory,
} from "./types";

export { AUDIO_FORMAT } from "./types";

// Implementations
export { MicrophoneChannel } from "./microphone-channel";
export type { MicrophoneChannelOptions } from "./microphone-channel";
export { EmulatedChannel } from "./emulated-channel";

// Utilities
export {
  loadWavFile,
  loadAudioFile,
  convertWithFfmpeg,
  concatenateAudio,
  generateSilence,
  generateTone,
  createWavBuffer,
  saveWavFile,
} from "./utils";

// Re-export types for convenience
import { AudioChannel, AudioChannelMode, AudioChannelFactoryOptions } from "./types";
import { MicrophoneChannel } from "./microphone-channel";
import { EmulatedChannel } from "./emulated-channel";

/**
 * Create an audio channel based on mode
 *
 * @param mode "microphone" for real input, "emulated" for testing
 * @param options Configuration options
 * @returns AudioChannel instance (may be async for emulated with file)
 */
export async function createAudioChannel(
  mode: AudioChannelMode,
  options: AudioChannelFactoryOptions = {}
): Promise<AudioChannel> {
  if (mode === "emulated") {
    if (options.emulatedOptions?.audioFile) {
      return EmulatedChannel.fromFile(
        options.emulatedOptions.audioFile,
        options.emulatedOptions
      );
    }
    return new EmulatedChannel(options.emulatedOptions);
  }

  return new MicrophoneChannel({ deviceIndex: options.deviceIndex });
}
