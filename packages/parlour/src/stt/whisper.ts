import type { Config } from "../config.ts";
import { logger } from "../logger.ts";

const log = logger("stt");

/**
 * whisper.cpp's HTTP server, kept warm by scripts/whisper-server.sh. Talking
 * to a running server rather than spawning whisper-cli per utterance saves the
 * model load, which on a Mac mini is most of the wall clock for a short
 * sentence.
 */
export async function transcribe(wav: Buffer, config: Config): Promise<string> {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "utterance.wav");
  form.set("temperature", "0");
  form.set("response_format", "json");
  form.set("language", config.stt.language);

  const started = Date.now();
  const response = await fetch(config.stt.url, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(config.stt.timeoutMs),
  });
  if (!response.ok) throw new Error(`whisper ${response.status}: ${await response.text()}`);

  const body = (await response.json()) as { text?: string };
  const text = (body.text ?? "").trim();
  log.debug(`transcribed in ${Date.now() - started}ms:`, text);
  return text;
}

/** Whisper hallucinates these on silence. Treat them as nothing said. */
const NOISE = /^[\s.,!?]*(\[.*\]|\(.*\)|thanks? for watching|you|thank you|bye)?[\s.,!?]*$/i;

export function isNoise(text: string): boolean {
  return NOISE.test(text);
}
