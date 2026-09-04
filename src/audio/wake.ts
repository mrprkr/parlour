import { join } from "node:path";
import ort from "onnxruntime-node";
import { FRAME_SAMPLES } from "./capture.ts";
import { logger } from "../logger.ts";

const log = logger("wake");

const MEL_BINS = 32;
const EMBED_WINDOW = 76;   // mel frames the embedding model consumes
const EMBED_STRIDE = 8;    // mel frames between embeddings
const EMBED_DIM = 96;
const CONTEXT = 16;        // embeddings the wake word model consumes

/**
 * openWakeWord, in three ONNX stages: audio to mel spectrogram, mel to a 96
 * dimensional speech embedding, then a small per-word classifier over the last
 * 16 embeddings. Running it here rather than in a Python sidecar keeps the
 * whole loop in one process, which matters because barge-in needs the wake
 * word detector to stay live while the agent is speaking.
 *
 * Models come from scripts/fetch-models.sh.
 */
export class WakeWord {
  #mel!: ort.InferenceSession;
  #embed!: ort.InferenceSession;
  #words = new Map<string, ort.InferenceSession>();

  #melBuffer: Float32Array[] = [];
  #embedBuffer: Float32Array[] = [];
  #mutedUntil = 0;

  readonly #threshold: number;
  readonly #refractoryMs: number;

  private constructor(threshold: number, refractoryMs: number) {
    this.#threshold = threshold;
    this.#refractoryMs = refractoryMs;
  }

  static async load(opts: {
    modelDir: string;
    words: string[];
    threshold: number;
    refractoryMs: number;
  }): Promise<WakeWord> {
    const self = new WakeWord(opts.threshold, opts.refractoryMs);
    const open = (file: string) => ort.InferenceSession.create(join(opts.modelDir, file));
    self.#mel = await open("melspectrogram.onnx");
    self.#embed = await open("embedding_model.onnx");
    for (const word of opts.words) {
      self.#words.set(word, await open(`${word}.onnx`));
      log.info("loaded wake word", word);
    }
    return self;
  }

  /** Ignore audio for a while, for example while the agent is speaking. */
  suppressFor(ms: number): void {
    this.#mutedUntil = Date.now() + ms;
  }

  /** Feed one 80 ms frame. Returns the word that fired, or null. */
  async push(frame: Int16Array): Promise<string | null> {
    if (frame.length !== FRAME_SAMPLES) throw new Error(`expected ${FRAME_SAMPLES} samples`);

    const audio = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) audio[i] = frame[i]!;

    const melOut = await run(this.#mel, [1, frame.length], audio);
    // openWakeWord's training-time transform, applied to the raw mel output.
    for (let i = 0; i < melOut.length; i += MEL_BINS) {
      const row = new Float32Array(MEL_BINS);
      for (let b = 0; b < MEL_BINS; b++) row[b] = melOut[i + b]! / 10 + 2;
      this.#melBuffer.push(row);
    }

    while (this.#melBuffer.length >= EMBED_WINDOW) {
      const flat = new Float32Array(EMBED_WINDOW * MEL_BINS);
      for (let f = 0; f < EMBED_WINDOW; f++) flat.set(this.#melBuffer[f]!, f * MEL_BINS);
      const embedding = await run(this.#embed, [1, EMBED_WINDOW, MEL_BINS, 1], flat);
      this.#embedBuffer.push(new Float32Array(embedding.slice(0, EMBED_DIM)));
      if (this.#embedBuffer.length > CONTEXT) this.#embedBuffer.shift();
      this.#melBuffer = this.#melBuffer.slice(EMBED_STRIDE);
    }

    if (this.#embedBuffer.length < CONTEXT) return null;
    if (Date.now() < this.#mutedUntil) return null;

    const context = new Float32Array(CONTEXT * EMBED_DIM);
    for (let i = 0; i < CONTEXT; i++) context.set(this.#embedBuffer[i]!, i * EMBED_DIM);

    for (const [word, session] of this.#words) {
      const [score] = await run(session, [1, CONTEXT, EMBED_DIM], context);
      if (score! >= this.#threshold) {
        log.info(`"${word}" fired at ${score!.toFixed(2)}`);
        this.reset();
        this.#mutedUntil = Date.now() + this.#refractoryMs;
        return word;
      }
    }
    return null;
  }

  /** Drop the rolling context, so the next utterance starts clean. */
  reset(): void {
    this.#melBuffer = [];
    this.#embedBuffer = [];
  }
}

async function run(session: ort.InferenceSession, dims: number[], data: Float32Array) {
  const feeds = { [session.inputNames[0]!]: new ort.Tensor("float32", data, dims) };
  const out = await session.run(feeds);
  return out[session.outputNames[0]!]!.data as Float32Array;
}
