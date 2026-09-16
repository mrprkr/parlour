import { spawn } from "node:child_process";

/**
 * The one audio format everything in core agrees on: 16 kHz, mono, signed 16
 * bit, in frames of 1280 samples. That is openWakeWord's frame, and since the
 * wake word is the first thing to hear the microphone, everything downstream
 * takes the same size rather than re-chunking.
 */
export const FRAME_SAMPLES = 1280;
export const FRAME_MS = 80;

/** Root mean square of a frame, normalised to 0..1. Used for endpointing. */
export function rms(frame: Int16Array): number {
  let sum = 0;
  for (const s of frame) sum += s * s;
  return Math.sqrt(sum / frame.length) / 32768;
}

/** 16 bit PCM frames to a WAV buffer, which is what whisper.cpp wants. */
export function toWav(frames: Int16Array[], sampleRate: number): Buffer {
  const samples = frames.reduce((n, f) => n + f.length, 0);
  const data = Buffer.alloc(samples * 2);
  let offset = 0;
  for (const frame of frames) {
    for (const sample of frame) {
      data.writeInt16LE(sample, offset);
      offset += 2;
    }
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** WAV bytes back to frames, for clients that hand over whole utterances. */
export function wavToFrames(wav: Buffer): Int16Array[] {
  // Walk the RIFF chunks rather than assuming a 44 byte header: ffmpeg writes
  // a LIST chunk before the data, and browsers write stranger things still.
  let offset = 12;
  let start = 44;
  let length = wav.length - 44;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") {
      start = offset + 8;
      length = Math.min(size, wav.length - start);
      break;
    }
    offset += 8 + size + (size % 2);
  }

  const frames: Int16Array[] = [];
  for (let at = start; at + 2 <= start + length; at += FRAME_SAMPLES * 2) {
    const samples = Math.min(FRAME_SAMPLES, Math.floor((start + length - at) / 2));
    const frame = new Int16Array(FRAME_SAMPLES);
    for (let i = 0; i < samples; i++) frame[i] = wav.readInt16LE(at + i * 2);
    frames.push(frame);
  }
  return frames;
}

/**
 * Anything ffmpeg understands, to the 16 kHz mono WAV the rest of the pipeline
 * expects. Phones record Opus in WebM or AAC in MP4 depending on the browser,
 * and neither is worth teaching whisper about.
 */
export function decodeToWav(input: Buffer, sampleRate = 16000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-f",
      "wav",
      "pipe:1",
    ]);

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(Buffer.concat(err).toString().trim() || `ffmpeg exited ${code}`)),
    );
    proc.stdin.on("error", () => {});
    proc.stdin.end(input);
  });
}
