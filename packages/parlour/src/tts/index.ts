import type { Config } from "../config.ts";
import { logger } from "../logger.ts";
import { loadKokoro, renderKokoro } from "./kokoro.ts";
import { playWav } from "./play.ts";
import { isKokoroVoiceId, renderSay, sayAloud } from "./say.ts";

const log = logger("tts");

/** Text to a WAV buffer, for a client that plays the audio at its end. */
export interface Synthesiser {
  render(text: string): Promise<Buffer>;
}

/** Text out of this machine's own speakers, interruptibly. */
export interface Speaker {
  say(text: string, signal?: AbortSignal): Promise<void>;
  stop(): void;
}

/** Holds whatever is currently coming out of the speakers, so it can be cut off. */
abstract class Interruptible {
  #controller: AbortController | undefined;

  stop(): void {
    this.#controller?.abort();
    this.#controller = undefined;
  }

  /** Starts a turn, cancelling the last, and folds in the caller's own signal. */
  protected begin(signal?: AbortSignal): AbortSignal {
    this.stop();
    const controller = new AbortController();
    this.#controller = controller;
    return signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  }
}

class SayVoice extends Interruptible implements Synthesiser, Speaker {
  readonly #voice: string | undefined;
  readonly #speed: number;

  constructor(voice: string | undefined, speed: number) {
    super();
    this.#voice = voice;
    this.#speed = speed;
  }

  async warm(): Promise<void> {}

  render(text: string): Promise<Buffer> {
    return renderSay(speakable(text), this.#voice, this.#speed);
  }

  say(text: string, signal?: AbortSignal): Promise<void> {
    return sayAloud(speakable(text), this.#voice, this.#speed, this.begin(signal));
  }
}

/**
 * Kokoro, with `say` underneath it. The fallback is not decoration: the model
 * downloads itself on first use, so the very first thing the house is asked can
 * arrive before the voice does, and a house assistant that goes silent is worse
 * than one that sounds like a Mac.
 */
class KokoroVoice extends Interruptible implements Synthesiser, Speaker {
  readonly #voice: string;
  readonly #speed: number;
  /** A Kokoro voice id means nothing to `say`, so the fallback takes the system one. */
  readonly #plainVoice: string | undefined;
  #warned = false;

  constructor(voice: string, speed: number) {
    super();
    this.#voice = voice;
    this.#speed = speed;
    this.#plainVoice = isKokoroVoiceId(voice) ? undefined : voice;
  }

  async warm(): Promise<void> {
    try {
      await loadKokoro();
    } catch (error) {
      this.#failed(error);
    }
  }

  async render(text: string): Promise<Buffer> {
    const clean = speakable(text);
    try {
      return await renderKokoro(clean, this.#voice, this.#speed);
    } catch (error) {
      this.#failed(error);
      return renderSay(clean, this.#plainVoice, this.#speed);
    }
  }

  async say(text: string, signal?: AbortSignal): Promise<void> {
    const merged = this.begin(signal);
    const clean = speakable(text);

    let wav: Buffer;
    try {
      wav = await renderKokoro(clean, this.#voice, this.#speed);
    } catch (error) {
      this.#failed(error);
      return sayAloud(clean, this.#plainVoice, this.#speed, merged);
    }
    await playWav(wav, merged);
  }

  #failed(error: unknown): void {
    // Once is enough. It keeps trying Kokoro on every reply, so a model that
    // arrives late still takes over without a restart.
    if (this.#warned) return;
    this.#warned = true;
    log.warn("Kokoro is not speaking, falling back to macOS say:", error);
  }
}

function voiceFor(config: Config): KokoroVoice | SayVoice {
  const { engine, voice, speed } = config.tts;
  return engine === "kokoro" ? new KokoroVoice(voice, speed) : new SayVoice(voice, speed);
}

export function createSpeaker(config: Config): Speaker {
  return voiceFor(config);
}

export function createSynthesiser(config: Config): Synthesiser {
  const voice = voiceFor(config);
  // This is built once the agent is committed to listening, unlike the speaker,
  // so it is the right moment to pull the model in. Nobody should wait for a
  // download after saying the wake word.
  void voice.warm();
  return voice;
}

/** Speaking a reply this short and then stopping sounds broken, so glue it on. */
const MIN_CHUNK = 40;

/**
 * A reply, cut into speakable pieces. Latency is cumulative and synthesis is
 * the last link in it, so the first sentence goes to the speakers while the
 * rest is still being made.
 */
export function sentences(text: string): string[] {
  const clean = speakable(text);
  if (!clean) return [];

  const pieces = clean.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g) ?? [clean];
  const out: string[] = [];
  for (const piece of pieces) {
    const part = piece.trim();
    if (!part) continue;
    const last = out.at(-1);
    if (last !== undefined && last.length < MIN_CHUNK) out[out.length - 1] = `${last} ${part}`;
    else out.push(part);
  }
  return out;
}

/**
 * Models write for a screen even when told not to. Nothing here should be read
 * out as punctuation.
 */
function speakable(text: string): string {
  const spoken = tidy(text.replace(/```[\s\S]*?```/g, " "));
  // A reply that was nothing but a code block still has to say something.
  return spoken || tidy(text.replaceAll("```", " "));
}

function tidy(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
