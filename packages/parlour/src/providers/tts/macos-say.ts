import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";
import type { Check, TextToSpeech } from "../../core/ports.ts";
import { run, withTempWav } from "../../core/process.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";
import { speakable } from "../../core/text.ts";
import { isKokoroVoiceId } from "./voices.ts";

export const macosSaySchema = z.object({
  /** A macOS voice name. Absent means the system default. */
  voice: z.string().optional(),
  speed: z.number().positive().default(1),
});

export type MacosSayOptions = z.infer<typeof macosSaySchema>;

/**
 * `say -r` is words per minute, not a multiplier. This is roughly the default
 * for the system voices, so a speed of 1.0 sounds like an untouched `say`.
 */
const BASE_WPM = 180;

function args(voice: string | undefined, speed: number, file: string): string[] {
  const out: string[] = [];
  if (voice) out.push("-v", voice);
  if (speed !== 1) out.push("-r", String(Math.round(BASE_WPM * speed)));
  out.push("-o", file, "--file-format=WAVE", "--data-format=LEI16@22050");
  // The text goes in on stdin, so a reply that happens to start with a dash is
  // spoken rather than read as a flag.
  out.push("-f", "-");
  return out;
}

/** The macOS voice, as a WAV, for whichever speaker is going to play it. */
export function renderSay(text: string, voice: string | undefined, speed: number): Promise<Buffer> {
  return withTempWav(async (file) => {
    await run("say", args(voice, speed, file), { input: text });
    return readFile(file);
  });
}

/**
 * macOS says it itself. This is the fallback for when Kokoro is not there or
 * has fallen over, and it is a good one: nothing to download, and it is on
 * every Mac.
 */
export function createMacosSay(options: MacosSayOptions, _context: ProviderContext): TextToSpeech {
  const { speed } = options;
  // The same `tts.voice` reaches the fallback as the primary, and a Kokoro
  // voice id means nothing to `say`, so it takes the system voice instead.
  const voice = options.voice && !isKokoroVoiceId(options.voice) ? options.voice : undefined;

  return {
    async warm() {},

    render(text) {
      return renderSay(speakable(text), voice, speed);
    },

    async doctor(): Promise<Check[]> {
      if (process.platform !== "darwin") {
        return [
          { name: "say", status: "fail", detail: "say is a macOS command. Pick another tts provider." },
        ];
      }
      const voices = await installedVoices();
      if (voice && !voices.includes(voice)) {
        return [
          {
            name: "say",
            status: "warn",
            detail: `"${voice}" is not an installed voice (say -v ?), so the system default will speak instead`,
          },
        ];
      }
      return [{ name: "say", status: "ok", detail: voice ? `voice ${voice}` : "the system voice" }];
    },
  };
}

const execFileAsync = promisify(execFile);

/**
 * `say -v ?` prints one voice per line: the name, the locale, then a `#`
 * comment. The name is padded to a fixed column, but a long one such as
 * "Daniel (English (UK))" overflows it and is followed by a single space, so
 * the name is whatever is left once the comment and the locale come off the
 * right rather than everything before the padding.
 */
async function installedVoices(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("say", ["-v", "?"]);
    return stdout
      .split("\n")
      .map((line) =>
        line
          .replace(/\s*#.*$/, "")
          .replace(/\s+\S+$/, "")
          .trim(),
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

export const macosSay = defineProvider<TextToSpeech>({
  kind: "tts",
  name: "macos-say",
  description: "The voice built into macOS, with nothing to download",
  schema: macosSaySchema,
  create: (options, context) => createMacosSay(options as MacosSayOptions, context),
});

registerProvider(macosSay);
