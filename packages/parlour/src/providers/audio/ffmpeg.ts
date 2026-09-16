import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { z } from "zod";
import { FRAME_SAMPLES } from "../../core/audio.ts";
import type { Logger } from "../../core/logger.ts";
import type { AudioSource, Check } from "../../core/ports.ts";
import { findOnPath, killOnExit, orphans } from "../../core/process.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

/**
 * The rest of the `audio` slice (sink, silence, barge-in) belongs to core and
 * to the sink, so it is left to fall away here rather than listed.
 */
export const FfmpegSchema = z.object({
  /** `ffmpeg -f avfoundation -list_devices true -i ""` lists the indexes. */
  inputDevice: z.string().default(":0"),
  sampleRate: z.literal(16000).default(16000),
});

export type FfmpegOptions = z.infer<typeof FfmpegSchema>;

/**
 * The command line `frames()` spawns, as `ps` prints it. Anchored to the
 * executable so a `grep ffmpeg` or an editor with the word in its arguments
 * is not mistaken for one.
 */
export const STRAY_FFMPEG = /^(\S*\/)?ffmpeg\s.*-f avfoundation/;

/**
 * Opens the microphone with ffmpeg and yields fixed-size frames forever.
 *
 * ffmpeg is used rather than a native binding so there is nothing to compile,
 * and because avfoundation is the only reliable way to name a specific input
 * on macOS. ":0" means "no video, audio device 0".
 */
export class Microphone implements AudioSource {
  #proc: ChildProcessWithoutNullStreams | undefined;
  #tail: Buffer = Buffer.alloc(0);

  readonly #device: string;
  readonly #sampleRate: number;
  readonly #log: Logger;

  constructor(options: FfmpegOptions, log: Logger) {
    this.#device = options.inputDevice;
    this.#sampleRate = options.sampleRate;
    this.#log = log;
  }

  async *frames(signal?: AbortSignal): AsyncGenerator<Int16Array> {
    // Never detached: ffmpeg must belong to this process's group so a signal
    // to the group reaches it too. If this process still dies without closing
    // it, the exit hook is the last resort, because an orphaned ffmpeg holds
    // the microphone until something kills it by hand.
    const proc = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "avfoundation",
        "-i",
        this.#device,
        "-ac",
        "1",
        "-ar",
        String(this.#sampleRate),
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "-",
      ],
      { detached: false },
    );
    this.#proc = proc;
    killOnExit(proc);
    proc.stderr.on("data", (b: Buffer) => this.#log.warn(b.toString().trim()));
    proc.on("exit", (code) => this.#log.debug("ffmpeg exited", code));
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

  async doctor(): Promise<Check[]> {
    const found = await findOnPath("ffmpeg");
    const checks: Check[] = [
      {
        name: "ffmpeg",
        status: found ? "ok" : "fail",
        detail: found ?? "brew install ffmpeg. It is how the microphone is read.",
      },
    ];
    // An ffmpeg left behind by an earlier run keeps the device open, and
    // enough of them stop the next run opening it. Name them, and how to
    // clear them, rather than leave "it hears nothing" to be worked out.
    const stray = await orphans(STRAY_FFMPEG);
    if (stray.length > 0) {
      checks.push({
        name: "microphone",
        status: "warn",
        detail: `${stray.length} orphaned ffmpeg process(es) still hold it: kill -9 ${stray.join(" ")}`,
      });
    }
    return checks;
  }
}

export function createFfmpeg(options: FfmpegOptions, context: ProviderContext): AudioSource {
  return new Microphone(options, context.log);
}

export const ffmpegDefinition = defineProvider<AudioSource>({
  kind: "audioSource",
  name: "ffmpeg",
  description: "The microphone, read through ffmpeg and avfoundation",
  schema: FfmpegSchema,
  create: (options, context) => createFfmpeg(options as FfmpegOptions, context),
});

registerProvider(ffmpegDefinition);
