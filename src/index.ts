/**
 * @aid-on/vad - Silero VAD wrapper for browser
 *
 * Provides voice activity detection using Silero VAD model.
 * Handles CDN versioning internally to ensure compatibility.
 * Optional RNNoise-based noise suppression for improved accuracy.
 */

export { audioToWav } from "./audio-utils";

import { Rnnoise, type DenoiseState } from "@shiguredo/rnnoise-wasm";

export interface VADConfig {
  /** Threshold for positive speech detection (0-1, default: 0.5) */
  positiveSpeechThreshold?: number;
  /** Threshold for negative speech detection (0-1, default: 0.35) */
  negativeSpeechThreshold?: number;
  /** Minimum frames to count as speech (default: 3) */
  minSpeechFrames?: number;
  /** Frames to include before speech start (default: 3) */
  preSpeechPadFrames?: number;
  /** Frames to wait before considering speech ended (default: 8) */
  redemptionFrames?: number;
  /** Enable RNNoise-based noise suppression (default: true) */
  noiseSuppression?: boolean;
}

export interface VADCallbacks {
  /** Called when user starts speaking */
  onSpeechStart?: () => void;
  /** Called when user stops speaking, with audio data */
  onSpeechEnd?: (audio: Float32Array) => void;
  /** Called on each frame with speech probability */
  onFrameProcessed?: (probability: number) => void;
  /** Called when VAD misfires (too short) */
  onVADMisfire?: () => void;
}

export interface VADInstance {
  /** Start listening for speech */
  start: () => void;
  /** Pause listening */
  pause: () => void;
  /** Check if currently listening */
  listening: boolean;
  /** Destroy and cleanup */
  destroy: () => void;
}

// Tested working CDN versions (vad-web 0.0.18 + onnxruntime-web 1.14.0)
const VAD_CDN_BASE = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.18/dist/";
const ONNX_CDN_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/";

// RNNoise frame size (480 samples at 48kHz = 10ms)
const RNNOISE_FRAME_SIZE = 480;
// ScriptProcessorNode buffer size must be power of 2
const AUDIO_BUFFER_SIZE = 4096;

const DEFAULT_CONFIG: Required<VADConfig> = {
  positiveSpeechThreshold: 0.5,
  negativeSpeechThreshold: 0.35,
  minSpeechFrames: 3,
  preSpeechPadFrames: 3,
  redemptionFrames: 8,
  noiseSuppression: true,
};

/**
 * Create a noise-suppressed MediaStream using RNNoise
 */
async function createDenoisedStream(
  inputStream: MediaStream
): Promise<{ stream: MediaStream; cleanup: () => void }> {
  const rnnoise = await Rnnoise.load();

  const audioContext = new AudioContext({ sampleRate: 48000 });
  const source = audioContext.createMediaStreamSource(inputStream);
  const destination = audioContext.createMediaStreamDestination();

  // Create ScriptProcessorNode for RNNoise processing
  // Buffer size must be power of 2 (256, 512, 1024, 2048, 4096, etc.)
  const processor = audioContext.createScriptProcessor(AUDIO_BUFFER_SIZE, 1, 1);

  // Create denoise state for processing
  const denoiseState = rnnoise.createDenoiseState();

  // Buffer for accumulating samples for RNNoise (480 samples per frame)
  let inputBuffer = new Float32Array(0);
  let outputBuffer = new Float32Array(0);

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const output = event.outputBuffer.getChannelData(0);

    // Accumulate input samples
    const newInputBuffer = new Float32Array(inputBuffer.length + input.length);
    newInputBuffer.set(inputBuffer);
    newInputBuffer.set(input, inputBuffer.length);
    inputBuffer = newInputBuffer;

    // Process complete RNNoise frames (480 samples each)
    while (inputBuffer.length >= RNNOISE_FRAME_SIZE) {
      // Extract frame for RNNoise
      const frame = inputBuffer.slice(0, RNNOISE_FRAME_SIZE);
      inputBuffer = inputBuffer.slice(RNNOISE_FRAME_SIZE);

      // Process frame in-place
      denoiseState.processFrame(frame);

      // Add processed frame to output buffer
      const newOutputBuffer = new Float32Array(outputBuffer.length + RNNOISE_FRAME_SIZE);
      newOutputBuffer.set(outputBuffer);
      newOutputBuffer.set(frame, outputBuffer.length);
      outputBuffer = newOutputBuffer;
    }

    // Fill output from processed buffer
    const toCopy = Math.min(outputBuffer.length, output.length);
    output.set(outputBuffer.subarray(0, toCopy));
    outputBuffer = outputBuffer.slice(toCopy);

    // Fill remaining with silence if not enough processed data
    for (let i = toCopy; i < output.length; i++) {
      output[i] = 0;
    }
  };

  // Connect: source -> processor -> destination
  source.connect(processor);
  processor.connect(destination);

  return {
    stream: destination.stream,
    cleanup: () => {
      processor.disconnect();
      source.disconnect();
      denoiseState.destroy();
      audioContext.close().catch(() => { /* AudioContext close may fail after destroy */ });
    },
  };
}

/**
 * Create a new VAD instance
 *
 * @param callbacks - Event callbacks for speech detection
 * @param config - VAD configuration options
 * @returns Promise resolving to VAD instance
 *
 * @example
 * ```ts
 * import { createVAD } from "@aid-on/vad";
 *
 * const vad = await createVAD({
 *   onSpeechStart: () => console.log("Speaking started"),
 *   onSpeechEnd: (audio) => {
 *     // audio is Float32Array at 16kHz
 *     sendToSTT(audio);
 *   },
 *   onFrameProcessed: (prob) => {
 *     // Update UI with speech probability
 *   },
 * });
 *
 * vad.start();
 * ```
 */
export async function createVAD(
  callbacks: VADCallbacks,
  config?: VADConfig
): Promise<VADInstance> {
  // Configure onnxruntime-web FIRST, before importing vad-web
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = ONNX_CDN_BASE;

  // Dynamic import vad-web after ONNX is configured
  const vad = await import("@ricky0123/vad-web");

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Get microphone stream
  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000, // RNNoise expects 48kHz
    },
  });

  // Verify stream is active
  const audioTracks = rawStream.getAudioTracks();

  if (audioTracks.length === 0 || audioTracks[0].readyState !== "live") {
    throw new Error("Failed to get active audio track");
  }

  // Apply RNNoise if enabled
  let stream: MediaStream;
  let rnnoiseCleanup: (() => void) | null = null;

  if (mergedConfig.noiseSuppression) {
    const result = await createDenoisedStream(rawStream);
    stream = result.stream;
    rnnoiseCleanup = result.cleanup;
  } else {
    stream = rawStream;
  }

  // Create MicVAD instance with vad-web 0.0.18 API
  const micVAD = await vad.MicVAD.new({
    // Asset URLs for vad-web 0.0.18
    workletURL: VAD_CDN_BASE + "vad.worklet.bundle.min.js",
    modelURL: VAD_CDN_BASE + "silero_vad.onnx",
    modelFetcher: async (path: string) => {
      const response = await fetch(path);
      return response.arrayBuffer();
    },
    // Pass microphone stream (raw or denoised)
    stream,
    // VAD configuration
    positiveSpeechThreshold: mergedConfig.positiveSpeechThreshold,
    negativeSpeechThreshold: mergedConfig.negativeSpeechThreshold,
    minSpeechFrames: mergedConfig.minSpeechFrames,
    preSpeechPadFrames: mergedConfig.preSpeechPadFrames,
    redemptionFrames: mergedConfig.redemptionFrames,
    // Callbacks
    onSpeechStart: () => {
      callbacks.onSpeechStart?.();
    },
    onSpeechEnd: (audio: Float32Array) => {
      callbacks.onSpeechEnd?.(audio);
    },
    onFrameProcessed: (probs: { isSpeech: number }) => {
      callbacks.onFrameProcessed?.(probs.isSpeech);
    },
    onVADMisfire: () => {
      callbacks.onVADMisfire?.();
    },
  });

  let isListening = false;
  let isDestroyed = false;

  return {
    start() {
      if (isDestroyed) {
        return;
      }
      micVAD.start();
      isListening = true;
    },
    pause() {
      if (isDestroyed) return;
      micVAD.pause();
      isListening = false;
    },
    get listening() {
      return isListening;
    },
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      isListening = false;
      micVAD.pause();
      // Cleanup RNNoise if it was used
      if (rnnoiseCleanup) {
        rnnoiseCleanup();
      }
      // Stop microphone stream
      rawStream.getTracks().forEach((track) => track.stop());
    },
  };
}
