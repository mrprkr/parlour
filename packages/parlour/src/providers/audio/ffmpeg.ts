import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
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
  /**
   * ":" and an avfoundation index or name. `ffmpeg -f avfoundation
   * -list_devices true -i ""` lists them; a name survives other devices
   * coming and going, an index does not.
   */
  inputDevice: z.string().default(":0"),
  sampleRate: z.literal(16000).default(16000),
});

export type FfmpegOptions = z.infer<typeof FfmpegSchema>;

const execFileAsync = promisify(execFile);

export interface AudioInput {
  /** As `audio.inputDevice` wants it: avfoundation's index, with the colon. */
  index: string;
  name: string;
}

/**
 * The microphones ffmpeg can see, so the device can be chosen from a list
 * rather than guessed at as a number. Nothing when ffmpeg is not installed,
 * which the Tools step has already complained about.
 */
export function parseAudioInputs(ffmpegOutput: string): AudioInput[] {
  const lines = ffmpegOutput.split("\n");
  const start = lines.findIndex((line) => /audio devices/i.test(line));
  if (start < 0) return [];
  const inputs: AudioInput[] = [];
  for (const line of lines.slice(start + 1)) {
    // `[AVFoundation indev @ 0x...] [0] MacBook Pro Microphone`, and the video
    // list above it has the same shape, which is why only what follows the
    // audio heading is read.
    const match = /\[AVFoundation[^\]]*\]\s*\[(\d+)\]\s*(.+?)\s*$/.exec(line);
    if (!match) break;
    inputs.push({ index: `:${match[1]}`, name: match[2] as string });
  }
  return inputs;
}

export async function audioInputs(): Promise<AudioInput[]> {
  try {
    await execFileAsync("ffmpeg", ["-f", "avfoundation", "-list_devices", "true", "-i", ""]);
    return [];
  } catch (error) {
    // ffmpeg exits non-zero after listing, and the list is on stderr.
    return parseAudioInputs((error as { stderr?: string }).stderr ?? "");
  }
}

/**
 * Whether `inputDevice` names one of `inputs`, by index (":4") or by name
 * (":MacBook Pro Microphone"). Indexes shift when a device comes or goes, so
 * a config that was right last week can point at nothing today.
 */
export function findInput(inputDevice: string, inputs: AudioInput[]): AudioInput | undefined {
  const audio = inputDevice.slice(inputDevice.indexOf(":") + 1);
  return inputs.find((input) => input.index === `:${audio}` || input.name === audio);
}

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
    if (found) {
      const inputs = await audioInputs();
      // An empty list is a Mac that has not granted the microphone, or no
      // ffmpeg; neither is a question about the configured device.
      if (inputs.length > 0) {
        const input = findInput(this.#device, inputs);
        checks.push({
          name: "input device",
          status: input ? "ok" : "fail",
          detail: input
            ? `${this.#device} is ${input.name}`
            : `${this.#device} is not a microphone this Mac has. It has ${inputs
                .map((i) => `${i.index} ${i.name}`)
                .join(
                  ", ",
                )}. Set audio.inputDevice to one, by name (":${inputs[0]?.name}") so it survives devices coming and going.`,
        });
      }
    }
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
