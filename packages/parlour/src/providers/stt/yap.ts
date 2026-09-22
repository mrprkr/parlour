import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { Check, SpeechToText } from "../../core/ports.ts";
import { findOnPath, run, withTempWav } from "../../core/process.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

export const yapSchema = z.object({
  /** A locale such as `en-GB`. Absent means the Mac's own. */
  locale: z.string().optional(),
  /** The yap binary, for one that is not on the PATH. */
  command: z.string().default("yap"),
  timeoutMs: z.number().int().positive().default(20000),
});

export type YapOptions = z.infer<typeof yapSchema>;

export function yapArgs(wav: string, out: string, locale: string | undefined): string[] {
  const args = ["transcribe", wav, "--txt", "-o", out];
  if (locale) args.push("--locale", locale);
  return args;
}

/** yap breaks its text output into short lines for subtitles; a transcript is one sentence. */
export function joinTranscript(text: string): string {
  return text
    .split(/\s*\n\s*/)
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Apple's on-device speech recogniser (SpeechAnalyzer, macOS 26), through the
 * yap command line tool. There is no model to fetch and no server to keep
 * warm: the model ships with the system and the OS keeps it loaded, so one
 * process per utterance costs little.
 */
export function createYap(options: YapOptions, context: ProviderContext): SpeechToText {
  const { locale, command, timeoutMs } = options;
  const { log } = context;

  return {
    transcribe(wav) {
      return withTempWav(async (file) => {
        const out = join(dirname(file), "transcript.txt");
        await writeFile(file, wav);
        const started = Date.now();
        const signal = AbortSignal.timeout(timeoutMs);
        await run(command, yapArgs(file, out, locale), { signal });
        // `run` resolves on abort, because an interrupted `say` is not a
        // failure. A transcript that never arrived is.
        if (signal.aborted) throw new Error(`yap took longer than ${timeoutMs}ms`);
        const text = joinTranscript(await readFile(out, "utf8"));
        log.debug(`transcribed in ${Date.now() - started}ms:`, text);
        return text;
      });
    },

    async doctor(): Promise<Check[]> {
      if (process.platform !== "darwin") {
        return [{ name: "yap", status: "fail", detail: "yap is macOS only. Pick another stt provider." }];
      }
      const found = await findOnPath(command);
      return [
        {
          name: "yap",
          status: found ? "ok" : "fail",
          detail: found ?? `${command} is not on the PATH. brew install yap (it needs macOS 26).`,
        },
      ];
    },
  };
}

export const yap = defineProvider<SpeechToText>({
  kind: "stt",
  name: "yap",
  description: "Apple's on-device speech recogniser on macOS 26, through the yap command line tool",
  schema: yapSchema,
  create: (options, context) => createYap(options as YapOptions, context),
});

registerProvider(yap);
