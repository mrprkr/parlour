import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { logger } from "../logger.ts";

const log = logger("mic");

/** openWakeWord's frame: 1280 samples of 16 kHz mono, so 80 ms. */
export const FRAME_SAMPLES = 1280;

/**
 * Opens the microphone with ffmpeg and yields fixed-size frames forever.
 *
 * ffmpeg is used rather than a native binding so there is nothing to compile,
 * and because avfoundation is the only reliable way to name a specific input
 * on macOS. `ffmpeg -f avfoundation -list_devices true -i ""` prints the
 * indexes; ":0" means "no video, audio device 0".
 */
export class Microphone {
  #proc: ChildProcessWithoutNullStreams | undefined;
  #tail: Buffer = Buffer.alloc(0);

  readonly #device: string;
  readonly #sampleRate: number;

  constructor(device: string, sampleRate: number) {
    this.#device = device;
    this.#sampleRate = sampleRate;
  }

  async *frames(signal?: AbortSignal): AsyncGenerator<Int16Array> {
    const proc = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-f", "avfoundation",
      "-i", this.#device,
      "-ac", "1",
      "-ar", String(this.#sampleRate),
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-",
    ]);
    this.#proc = proc;
    proc.stderr.on("data", (b: Buffer) => log.warn(b.toString().trim()));
    proc.on("exit", (code) => log.debug("ffmpeg exited", code));
    signal?.addEventListener("abort", () => proc.kill("SIGKILL"), { once: true });

    const bytes = FRAME_SAMPLES * 2;
    for await (const chunk of proc.stdout as AsyncIterable<Buffer>) {
      this.#tail = this.#tail.length === 0 ? chunk : Buffer.concat([this.#tail, chunk]);
      while (this.#tail.length >= bytes) {
        const frame = this.#tail.subarray(0, bytes);
        this.#tail = this.#tail.subarray(bytes);
        // Copy, because the caller may hold onto the frame past the next read.
        yield new Int16Array(new Int16Array(frame.buffer, frame.byteOffset, FRAME_SAMPLES));
      }
    }
  }

  close(): void {
    this.#proc?.kill("SIGKILL");
  }
}

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
  header.writeUInt16LE(1, 20);            // PCM
  header.writeUInt16LE(1, 22);            // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
