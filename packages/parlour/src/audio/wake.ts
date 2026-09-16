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

export interface WakeOptions {
  modelDir: string;
  words: string[];
  threshold: number;
  refractoryMs: number;
}

/**
 * openWakeWord, in three ONNX stages: audio to mel spectrogram, mel to a 96
 * dimensional speech embedding, then a small per-word classifier over the last
 * 16 embeddings. Running it here rather than in a Python sidecar keeps the
 * whole loop in one process, which matters because barge-in needs the wake
 * word detector to stay live while the agent is speaking.
 *
 * The models are loaded once and shared; the rolling state is per stream, so
 * a room full of satellites costs one copy of the weights and one small ring
 * buffer each. Models come from scripts/fetch-models.sh.
 */
export class WakeModels {
  #mel!: ort.InferenceSession;
  #embed!: ort.InferenceSession;
  readonly #words = new Map<string, ort.InferenceSession>();
  readonly #options: WakeOptions;

  private constructor(options: WakeOptions) {
    this.#options = options;
  }

  static async load(options: WakeOptions): Promise<WakeModels> {
    const self = new WakeModels(options);
    const open = (file: string) => ort.InferenceSession.create(join(options.modelDir, file));
    self.#mel = await open("melspectrogram.onnx");
    self.#embed = await open("embedding_model.onnx");
    for (const word of options.words) {
      self.#words.set(word, await open(`${word}.onnx`));
      log.info("loaded wake word", word);
    }
    return self;
  }

  /** One detector per audio stream. They share the weights, not the state. */
  detector(label = "local"): WakeWord {
    return new WakeWord(this.#mel, this.#embed, this.#words, this.#options, label);
  }
}

export class WakeWord {
  #melBuffer: Float32Array[] = [];
  #embedBuffer: Float32Array[] = [];
  #mutedUntil = 0;

  readonly #mel: ort.InferenceSession;
  readonly #embed: ort.InferenceSession;
  readonly #words: Map<string, ort.InferenceSession>;
  readonly #options: WakeOptions;
  readonly #label: string;

  constructor(
    mel: ort.InferenceSession,
    embed: ort.InferenceSession,
    words: Map<string, ort.InferenceSession>,
    options: WakeOptions,
    label: string,
  ) {
    this.#mel = mel;
    this.#embed = embed;
    this.#words = words;
    this.#options = options;
    this.#label = label;
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
      if (score! >= this.#options.threshold) {
        log.info(`"${word}" fired at ${score!.toFixed(2)} on ${this.#label}`);
        this.reset();
        this.#mutedUntil = Date.now() + this.#options.refractoryMs;
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
