/**
 * @aid-on/vad - Silero VAD wrapper for browser
 *
 * Provides voice activity detection using Silero VAD model.
 * Handles CDN versioning internally to ensure compatibility.
 * Optional RNNoise-based noise suppression for improved accuracy.
 */
export { audioToWav } from "./audio-utils";
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
export declare function createVAD(callbacks: VADCallbacks, config?: VADConfig): Promise<VADInstance>;
//# sourceMappingURL=index.d.ts.map