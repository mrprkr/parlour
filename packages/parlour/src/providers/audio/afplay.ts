import { writeFile } from "node:fs/promises";
import { z } from "zod";
import type { AudioSink, Check } from "../../core/ports.ts";
import { findOnPath, run, withTempWav } from "../../core/process.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

export const AfplaySchema = z.object({
  /** Null (the only way JSON can say so) or absent means the system default. */
  outputDevice: z.string().nullish(),
});

export type AfplayOptions = z.infer<typeof AfplaySchema>;

/**
 * Plays a WAV out of this machine's speakers. afplay is always on a Mac and
 * needs no arguments to get the default output right, but it will only read a
 * file, so the audio goes to a temporary one and is cleaned up after.
 */
export class Afplay implements AudioSink {
  #controller: AbortController | undefined;

  async play(wav: Buffer, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    // One thing at a time: a new play cuts off the last, and the caller's own
    // signal is folded in so either side can end it.
    this.stop();
    const controller = new AbortController();
    this.#controller = controller;
    const merged = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      await withTempWav(async (file) => {
        await writeFile(file, wav);
        await run("afplay", [file], { signal: merged });
      });
    } finally {
      if (this.#controller === controller) this.#controller = undefined;
    }
  }

  stop(): void {
    this.#controller?.abort();
    this.#controller = undefined;
  }

  async doctor(): Promise<Check[]> {
    const found = await findOnPath("afplay");
    return [
      {
        name: "afplay",
        status: found ? "ok" : "fail",
        detail: found ?? "not on the PATH, so this is not a Mac. Set audio.sink to another provider.",
      },
    ];
  }
}

export function createAfplay(options: AfplayOptions, context: ProviderContext): AudioSink {
  // afplay has no way to choose an output, so a named device would be silently
  // ignored. Say so once rather than let someone hunt for the wrong speaker.
  if (options.outputDevice) {
    context.log.warn(
      `afplay cannot pick an output device; "${options.outputDevice}" is ignored and the system default is used.`,
    );
  }
  return new Afplay();
}

export const afplayDefinition = defineProvider<AudioSink>({
  kind: "audioSink",
  name: "afplay",
  description: "This Mac's speakers, through afplay",
  schema: AfplaySchema,
  create: (options, context) => createAfplay(options as AfplayOptions, context),
});

registerProvider(afplayDefinition);
