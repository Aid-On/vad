import { describe, it, expect } from "vitest";
import { audioToWav } from "./audio-utils";

describe("audioToWav", () => {
  it("should return a Blob with audio/wav MIME type", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const blob = audioToWav(samples);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("audio/wav");
  });

  it("should produce correct WAV file size", () => {
    const samples = new Float32Array([0, 0.5, -0.5]);
    const blob = audioToWav(samples);

    // WAV header is 44 bytes + 2 bytes per sample (16-bit PCM)
    const expectedSize = 44 + samples.length * 2;
    expect(blob.size).toBe(expectedSize);
  });

  it("should produce valid RIFF header", async () => {
    const samples = new Float32Array([0.1, -0.2, 0.3]);
    const blob = audioToWav(samples);

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    // "RIFF" magic
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    expect(riff).toBe("RIFF");

    // File size (total - 8 bytes for RIFF header)
    const fileSize = view.getUint32(4, true);
    expect(fileSize).toBe(36 + samples.length * 2);

    // "WAVE" format
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11)
    );
    expect(wave).toBe("WAVE");
  });

  it("should produce valid fmt chunk", async () => {
    const samples = new Float32Array([0.5]);
    const blob = audioToWav(samples, 16000);

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    // "fmt " chunk ID
    const fmt = String.fromCharCode(
      view.getUint8(12),
      view.getUint8(13),
      view.getUint8(14),
      view.getUint8(15)
    );
    expect(fmt).toBe("fmt ");

    // Chunk size
    expect(view.getUint32(16, true)).toBe(16);

    // Audio format: PCM = 1
    expect(view.getUint16(20, true)).toBe(1);

    // Channels: mono = 1
    expect(view.getUint16(22, true)).toBe(1);

    // Sample rate
    expect(view.getUint32(24, true)).toBe(16000);

    // Byte rate (sampleRate * 2)
    expect(view.getUint32(28, true)).toBe(32000);

    // Block align
    expect(view.getUint16(32, true)).toBe(2);

    // Bits per sample
    expect(view.getUint16(34, true)).toBe(16);
  });

  it("should use default sample rate of 16000", async () => {
    const samples = new Float32Array([0]);
    const blob = audioToWav(samples);

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    expect(view.getUint32(24, true)).toBe(16000);
  });

  it("should accept custom sample rate", async () => {
    const samples = new Float32Array([0]);
    const blob = audioToWav(samples, 48000);

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(96000); // byteRate = sampleRate * 2
  });

  it("should clamp samples to [-1, 1] range", async () => {
    const samples = new Float32Array([2.0, -2.0, 0.5]);
    const blob = audioToWav(samples);

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    // Sample at 2.0 should be clamped to 1.0 -> 0x7FFF
    const sample0 = view.getInt16(44, true);
    expect(sample0).toBe(0x7fff);

    // Sample at -2.0 should be clamped to -1.0 -> -0x8000
    const sample1 = view.getInt16(46, true);
    expect(sample1).toBe(-0x8000);
  });

  it("should handle empty samples array", () => {
    const samples = new Float32Array([]);
    const blob = audioToWav(samples);

    expect(blob.size).toBe(44); // Header only
  });

  it("should produce valid data chunk header", async () => {
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const blob = audioToWav(samples);

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    // "data" chunk ID
    const data = String.fromCharCode(
      view.getUint8(36),
      view.getUint8(37),
      view.getUint8(38),
      view.getUint8(39)
    );
    expect(data).toBe("data");

    // Data size
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
  });

  it("should encode silence as zero", async () => {
    const samples = new Float32Array([0, 0, 0]);
    const blob = audioToWav(samples);

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    for (let i = 0; i < samples.length; i++) {
      expect(view.getInt16(44 + i * 2, true)).toBe(0);
    }
  });
});
