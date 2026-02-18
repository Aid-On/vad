# @aid-on/vad

<div align="center">

[![npm version](https://img.shields.io/npm/v/@aid-on/vad.svg?style=flat-square&color=00DC82)](https://www.npmjs.com/package/@aid-on/vad)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

<br />

<h3>
<b>vad</b> - Browser Voice Activity Detection with Noise Suppression
</h3>

<p align="center">
<b>Know when your user is speaking.</b><br/>
Silero VAD with built-in RNNoise suppression, designed for real-time browser audio applications.
</p>

<br/>

[**日本語**](./README.ja.md) | **English**

<br/>

</div>

## Why @aid-on/vad?

Building voice-driven browser applications means solving two hard problems: detecting when the user is actually speaking, and filtering out background noise before processing. This package solves both:

- **Silero VAD** - State-of-the-art speech detection model via ONNX Runtime
- **RNNoise suppression** - Optional noise reduction pipeline using WebAssembly
- **Simple callback API** - `onSpeechStart`, `onSpeechEnd`, `onFrameProcessed`, `onVADMisfire`
- **WAV conversion** - Built-in `audioToWav()` for sending captured audio to STT APIs
- **Auto CDN versioning** - Pinned, tested versions of vad-web and ONNX Runtime loaded from CDN
- **Zero configuration** - Sensible defaults, start detecting speech in 5 lines of code

## Installation

```bash
npm install @aid-on/vad
```

**Note:** This package is browser-only. It requires WebAssembly support and access to `navigator.mediaDevices.getUserMedia`.

## Quick Start

```typescript
import { createVAD } from "@aid-on/vad";

const vad = await createVAD({
  onSpeechStart: () => {
    console.log("User started speaking");
  },
  onSpeechEnd: (audio) => {
    // audio is Float32Array at 16kHz
    console.log(`Captured ${audio.length} samples`);
  },
});

vad.start();
```

## API Reference

### `createVAD(callbacks, config?)`

Create a new VAD instance. Requests microphone access, loads the Silero VAD model, and optionally sets up the RNNoise noise suppression pipeline.

```typescript
import { createVAD } from "@aid-on/vad";

const vad = await createVAD(
  {
    onSpeechStart: () => {
      // User began speaking
      updateUI("listening");
    },
    onSpeechEnd: (audio: Float32Array) => {
      // User stopped speaking
      // audio contains the captured speech at 16kHz mono
      sendToSTT(audio);
    },
    onFrameProcessed: (probability: number) => {
      // Called on each audio frame with speech probability (0-1)
      updateMeter(probability);
    },
    onVADMisfire: () => {
      // Speech was too short (below minSpeechFrames threshold)
      console.log("Too short, ignoring");
    },
  },
  {
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    minSpeechFrames: 3,
    noiseSuppression: true,
  }
);
```

**Returns:** `Promise<VADInstance>`

### VADInstance

The object returned by `createVAD()`.

| Method/Property | Type | Description |
|----------------|------|-------------|
| `start()` | `() => void` | Start listening for speech |
| `pause()` | `() => void` | Pause listening (retains resources) |
| `listening` | `boolean` | Whether VAD is currently listening |
| `destroy()` | `() => void` | Stop listening, release microphone, and clean up all resources |

```typescript
// Lifecycle
vad.start();              // Begin speech detection
console.log(vad.listening); // true

vad.pause();              // Temporarily stop
console.log(vad.listening); // false

vad.start();              // Resume

vad.destroy();            // Fully clean up (cannot restart after this)
```

### `audioToWav(samples, sampleRate?)`

Convert a `Float32Array` of audio samples to a WAV `Blob`. Useful for sending captured speech to STT APIs.

```typescript
import { audioToWav } from "@aid-on/vad";

const vad = await createVAD({
  onSpeechEnd: (audio) => {
    // Convert to WAV for uploading to an STT API
    const wavBlob = audioToWav(audio, 16000);

    const formData = new FormData();
    formData.append("file", wavBlob, "speech.wav");

    fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });
  },
});
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `samples` | `Float32Array` | required | Audio sample data (values between -1 and 1) |
| `sampleRate` | `number` | `16000` | Sample rate in Hz |

**Returns:** `Blob` with MIME type `audio/wav`

The output is a standard PCM WAV file: mono, 16-bit, with the specified sample rate.

### Configuration

#### VADConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `positiveSpeechThreshold` | `number` | `0.5` | Probability threshold to detect speech start (0-1) |
| `negativeSpeechThreshold` | `number` | `0.35` | Probability threshold to detect speech end (0-1) |
| `minSpeechFrames` | `number` | `3` | Minimum frames to count as speech (prevents misfires) |
| `preSpeechPadFrames` | `number` | `3` | Number of frames to include before speech start |
| `redemptionFrames` | `number` | `8` | Frames to wait before considering speech ended |
| `noiseSuppression` | `boolean` | `true` | Enable RNNoise-based noise suppression |

#### VADCallbacks

| Callback | Type | Description |
|----------|------|-------------|
| `onSpeechStart` | `() => void` | Called when speech is detected |
| `onSpeechEnd` | `(audio: Float32Array) => void` | Called when speech ends, with captured audio data |
| `onFrameProcessed` | `(probability: number) => void` | Called on each frame with speech probability (0-1) |
| `onVADMisfire` | `() => void` | Called when detected speech was too short |

## Real-World Example: Voice Chat with STT

```typescript
import { createVAD, audioToWav } from "@aid-on/vad";

// Create VAD with noise suppression for a voice chat application
const vad = await createVAD(
  {
    onSpeechStart: () => {
      statusIndicator.textContent = "Listening...";
      statusIndicator.classList.add("active");
    },
    onSpeechEnd: async (audio) => {
      statusIndicator.textContent = "Processing...";

      // Convert to WAV and send to STT
      const wavBlob = audioToWav(audio, 16000);
      const formData = new FormData();
      formData.append("file", wavBlob, "speech.wav");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const { text } = await response.json();
      chatMessages.append(createMessage(text, "user"));

      statusIndicator.textContent = "Ready";
      statusIndicator.classList.remove("active");
    },
    onFrameProcessed: (probability) => {
      // Update a visual speech probability meter
      meterElement.style.width = `${probability * 100}%`;
    },
    onVADMisfire: () => {
      statusIndicator.textContent = "Ready";
    },
  },
  {
    positiveSpeechThreshold: 0.6,   // Slightly higher for noisy environments
    negativeSpeechThreshold: 0.35,
    minSpeechFrames: 5,             // Require longer speech to trigger
    redemptionFrames: 10,           // Wait longer before cutting off
    noiseSuppression: true,         // Enable RNNoise
  }
);

// Start/stop via button
toggleButton.addEventListener("click", () => {
  if (vad.listening) {
    vad.pause();
    toggleButton.textContent = "Start";
  } else {
    vad.start();
    toggleButton.textContent = "Stop";
  }
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  vad.destroy();
});
```

## Architecture

The audio processing pipeline:

```
Microphone (48kHz)
  |
  +-- [RNNoise] (optional, WebAssembly noise suppression)
  |     480-sample frames at 48kHz
  |
  +-- Silero VAD (ONNX Runtime, speech probability per frame)
  |
  +-- Speech segmentation
        |
        +-- onSpeechStart()
        +-- onSpeechEnd(Float32Array @ 16kHz)
        +-- onVADMisfire()
```

**CDN Dependencies (loaded at runtime):**

| Package | Version | Purpose |
|---------|---------|---------|
| `@ricky0123/vad-web` | `0.0.18` | Silero VAD model and worklet |
| `onnxruntime-web` | `1.14.0` | ONNX Runtime for WebAssembly inference |
| `@shiguredo/rnnoise-wasm` | `^2025.1.5` | RNNoise noise suppression (bundled) |

## License

MIT (C) Aid-On

---

<div align="center">

**Real-time voice detection for the browser. Hear what matters.**

<br/>

[NPM](https://www.npmjs.com/package/@aid-on/vad) •
[GitHub](https://github.com/Aid-On/aid-on-platform)

</div>
