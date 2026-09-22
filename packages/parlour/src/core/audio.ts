import { spawn } from "node:child_process";
import { endianness } from "node:os";

/**
 * The one audio format everything in core agrees on: 16 kHz, mono, signed 16
 * bit, in frames of 1280 samples. That is openWakeWord's frame, and since the
 * wake word is the first thing to hear the microphone, everything downstream
 * takes the same size rather than re-chunking.
 */
export const FRAME_SAMPLES = 1280;
export const FRAME_MS = 80;

/**
 * Audio is the one thing in the house that arrives constantly whether anybody
 * is talking or not, so it is moved rather than converted: on a little-endian
 * machine, which every machine Parlour runs on is, PCM bytes and 16 bit
 * samples are the same bytes and a frame is one copy. The per-sample path is
 * kept for the machine that proves the assumption wrong.
 */
const LITTLE_ENDIAN = endianness() === "LE";
const EMPTY = Buffer.alloc(0);

/**
 * Little-endian PCM bytes to one frame, copied rather than viewed: the buffer
 * a socket hands over is pooled and is written over long before the utterance
 * it belongs to is finished. Short input leaves the rest of the frame silent.
 */
export function frameFrom(bytes: Buffer, offset = 0, samples = FRAME_SAMPLES): Int16Array {
  const frame = new Int16Array(samples);
  const available = Math.max(0, Math.min(samples * 2, bytes.length - offset));
  if (LITTLE_ENDIAN) new Uint8Array(frame.buffer).set(bytes.subarray(offset, offset + available));
  else for (let i = 0; i * 2 < available; i++) frame[i] = bytes.readInt16LE(offset + i * 2);
  return frame;
}

/**
 * A stream of whatever sized chunks a client sends, cut into the frames the
 * wake word insists on. One per connection: the part-frame left at the end of
 * a chunk belongs to that client and nobody else.
 */
export class FrameCutter {
  #carry: Buffer = EMPTY;

  push(chunk: Buffer): Int16Array[] {
    const bytes = FRAME_SAMPLES * 2;
    const buffer = this.#carry.length ? Buffer.concat([this.#carry, chunk]) : chunk;
    const frames: Int16Array[] = [];
    let at = 0;
    for (; at + bytes <= buffer.length; at += bytes) frames.push(frameFrom(buffer, at));
    // What is kept is always less than one frame, and it is copied because
    // the chunk it came from is the socket's to reuse once we return.
    this.#carry = at < buffer.length ? Buffer.from(buffer.subarray(at)) : EMPTY;
    return frames;
  }

  reset(): void {
    this.#carry = EMPTY;
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
    if (LITTLE_ENDIAN) {
      data.set(new Uint8Array(frame.buffer, frame.byteOffset, frame.length * 2), offset);
      offset += frame.length * 2;
    } else {
      for (const sample of frame) {
        data.writeInt16LE(sample, offset);
        offset += 2;
      }
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
  const end = start + length;
  for (let at = start; at + 2 <= end; at += FRAME_SAMPLES * 2) {
    frames.push(frameFrom(wav.subarray(0, end), at));
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
