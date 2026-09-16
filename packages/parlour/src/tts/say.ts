import { readFile } from "node:fs/promises";
import { run, withTempWav } from "./play.ts";

/**
 * `say -r` is words per minute, not a multiplier. This is roughly the default
 * for the system voices, so a speed of 1.0 sounds like an untouched `say`.
 */
const BASE_WPM = 180;

/** Kokoro voice ids look like af_heart or bm_george. macOS voice names do not. */
export function isKokoroVoiceId(voice: string): boolean {
  return /^[ab][fm]_/.test(voice);
}

function args(voice: string | undefined, speed: number, file?: string): string[] {
  const out: string[] = [];
  if (voice) out.push("-v", voice);
  if (speed !== 1) out.push("-r", String(Math.round(BASE_WPM * speed)));
  if (file) out.push("-o", file, "--file-format=WAVE", "--data-format=LEI16@22050");
  // The text goes in on stdin, so a reply that happens to start with a dash is
  // spoken rather than read as a flag.
  out.push("-f", "-");
  return out;
}

/**
 * macOS says it itself, straight out of the speakers. This is the fallback for
 * when Kokoro is not there or has fallen over, and it is a good one: nothing to
 * download, and it starts talking immediately instead of synthesising first.
 */
export function sayAloud(text: string, voice: string | undefined, speed: number, signal?: AbortSignal): Promise<void> {
  return run("say", args(voice, speed), { input: text, signal });
}

/** The same voice, as a WAV, for a client that plays the audio somewhere else. */
export function renderSay(text: string, voice: string | undefined, speed: number): Promise<Buffer> {
  return withTempWav(async (file) => {
    await run("say", args(voice, speed, file), { input: text });
    return readFile(file);
  });
}
