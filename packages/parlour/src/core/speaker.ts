import type { Logger } from "./logger.ts";
import type { AudioSink, Check, TextToSpeech } from "./ports.ts";
import { sentences } from "./text.ts";

/**
 * A voice with another underneath it. The fallback is not decoration: Kokoro
 * downloads itself on first use, so the very first thing the house is asked
 * can arrive before the voice does, and a house assistant that goes silent is
 * worse than one that sounds like a Mac. Composed here rather than inside a
 * provider so any two voices can be paired from config.
 */
export class FallbackTextToSpeech implements TextToSpeech {
  readonly #primary: TextToSpeech;
  readonly #fallback: TextToSpeech;
  readonly #log: Logger;
  #warned = false;

  constructor(primary: TextToSpeech, fallback: TextToSpeech, log: Logger) {
    this.#primary = primary;
    this.#fallback = fallback;
    this.#log = log;
  }

  async warm(): Promise<void> {
    try {
      await this.#primary.warm();
    } catch (error) {
      this.#failed(error);
    }
    await this.#fallback.warm();
  }

  async render(text: string): Promise<Buffer> {
    try {
      return await this.#primary.render(text);
    } catch (error) {
      this.#failed(error);
      return this.#fallback.render(text);
    }
  }

  async doctor(): Promise<Check[]> {
    return [...((await this.#primary.doctor?.()) ?? []), ...((await this.#fallback.doctor?.()) ?? [])];
  }

  #failed(error: unknown): void {
    // Once is enough. It keeps trying the primary on every reply, so a model
    // that arrives late still takes over without a restart.
    if (this.#warned) return;
    this.#warned = true;
    this.#log.warn("The voice is not speaking, using the fallback:", error);
  }
}

/**
 * Text out of this machine's own speakers, sentence by sentence and
 * interruptibly. The next wake word and barge-in both need to cut a reply off
 * mid-sentence, so every turn cancels the one before it.
 */
export class Speaker {
  readonly #tts: TextToSpeech;
  readonly #sink: AudioSink;
  #controller: AbortController | undefined;

  constructor(tts: TextToSpeech, sink: AudioSink) {
    this.#tts = tts;
    this.#sink = sink;
  }

  async say(text: string, signal?: AbortSignal): Promise<void> {
    const controller = this.#begin();
    const merged = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const parts = sentences(text);
    try {
      // Each sentence is rendered while the one before it plays. Synthesis is
      // the slow part, and this hides all of it but the first sentence's.
      let next: Promise<Buffer> | undefined;
      for (const [index, sentence] of parts.entries()) {
        const wav = await (next ?? this.#tts.render(sentence));
        // A turn cut off while its render was in flight must not start another:
        // synthesis is CPU the interrupting reply needs.
        if (merged.aborted) break;
        const following = parts[index + 1];
        next = following === undefined ? undefined : deferred(this.#tts.render(following));
        await this.#sink.play(wav, merged);
        // Interrupted mid-sentence, the prefetch is abandoned rather than
        // awaited. The session is waiting on this to hand the microphone back,
        // and a render it will never play is not worth the wait.
        if (merged.aborted) break;
      }
    } finally {
      if (this.#controller === controller) this.#controller = undefined;
    }
  }

  stop(): void {
    this.#controller?.abort();
    this.#controller = undefined;
    this.#sink.stop();
  }

  /** True while a reply is being rendered or played, which decides the barge-in rule. */
  isSpeaking(): boolean {
    return this.#controller !== undefined;
  }

  /** Starts a turn, cancelling the last. The sink stops itself when its signal fires. */
  #begin(): AbortController {
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    return controller;
  }
}

/**
 * A render that fails while the previous sentence is still playing would be an
 * unhandled rejection. Marking it handled here means the failure surfaces
 * when it is awaited, and not before.
 */
function deferred<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}
