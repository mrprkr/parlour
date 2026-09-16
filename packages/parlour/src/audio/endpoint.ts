import { rms } from "./capture.ts";

/**
 * Energy based endpointing: wait for speech to start, then stop once it has
 * been quiet for `silenceMs`. Crude next to a neural VAD, but it costs nothing
 * and the wake word has already told us someone is talking to us. Swap in
 * Silero if the room turns out to be noisy.
 */
export interface EndpointerOptions {
  frameMs: number;
  silenceMs: number;
  maxUtteranceMs: number;
  silenceThreshold: number;
  /** Give up if nothing is said at all. */
  leadingSilenceMs: number;
}

export class Endpointer {
  readonly frames: Int16Array[] = [];
  #speechSeen = false;
  #quietFrames = 0;
  #totalMs = 0;

  readonly #opts: EndpointerOptions;

  constructor(opts: EndpointerOptions) {
    this.#opts = opts;
  }

  /** Returns "listening", "done" (got speech) or "empty" (nobody spoke). */
  push(frame: Int16Array): "listening" | "done" | "empty" {
    this.frames.push(frame);
    this.#totalMs += this.#opts.frameMs;

    const loud = rms(frame) >= this.#opts.silenceThreshold;
    if (loud) {
      this.#speechSeen = true;
      this.#quietFrames = 0;
    } else {
      this.#quietFrames += 1;
    }

    const quietMs = this.#quietFrames * this.#opts.frameMs;
    if (!this.#speechSeen) {
      return this.#totalMs >= this.#opts.leadingSilenceMs ? "empty" : "listening";
    }
    if (quietMs >= this.#opts.silenceMs) return "done";
    return this.#totalMs >= this.#opts.maxUtteranceMs ? "done" : "listening";
  }
}
