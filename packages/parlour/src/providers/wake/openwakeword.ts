import { existsSync } from "node:fs";
import { join } from "node:path";
import ort from "onnxruntime-node";
import { z } from "zod";
import { FRAME_SAMPLES } from "../../core/audio.ts";
import type { Logger } from "../../core/logger.ts";
import type { Check, WakeWordDetector, WakeWordEngine } from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

const MEL_BINS = 32;
const EMBED_WINDOW = 76; // mel frames the embedding model consumes
const EMBED_STRIDE = 8; // mel frames between embeddings
const EMBED_DIM = 96;
const CONTEXT = 16; // embeddings the wake word model consumes

/** The two models every word shares. */
const SHARED_MODELS = ["melspectrogram.onnx", "embedding_model.onnx"];

export const OpenWakeWordSchema = z.object({
  /** Model names as the files are called, without the .onnx. */
  words: z.array(z.string()).default(["hey_jarvis"]),
  threshold: z.number().min(0).max(1).default(0.5),
  /** Ignore further detections for this long after one fires, in ms. */
  refractoryMs: z.number().int().nonnegative().default(1500),
});

export type OpenWakeWordOptions = z.infer<typeof OpenWakeWordSchema>;

/**
 * openWakeWord, in three ONNX stages: audio to mel spectrogram, mel to a 96
 * dimensional speech embedding, then a small per-word classifier over the last
 * 16 embeddings. Running it here rather than in a Python sidecar keeps the
 * whole loop in one process, which matters because barge-in needs the wake
 * word detector to stay live while the agent is speaking.
 *
 * The models are loaded once and shared; the rolling state is per stream, so
 * a room full of satellites costs one copy of the weights and one small ring
 * buffer each. The files come from `parlour models fetch`.
 */
export class OpenWakeWord implements WakeWordEngine {
  #mel: ort.InferenceSession | undefined;
  #embed: ort.InferenceSession | undefined;
  readonly #words = new Map<string, ort.InferenceSession>();
  readonly #options: OpenWakeWordOptions;
  readonly #modelDir: string;
  readonly #log: Logger;

  constructor(options: OpenWakeWordOptions, modelDir: string, log: Logger) {
    this.#options = options;
    this.#modelDir = modelDir;
    this.#log = log;
  }

  async load(): Promise<void> {
    const open = (file: string) => {
      // onnxruntime's own error for a missing file is a protobuf parse
      // failure, which tells nobody what to fetch.
      const path = join(this.#modelDir, file);
      if (!existsSync(path)) throw new Error(`${path} is missing. Run parlour models fetch.`);
      return ort.InferenceSession.create(path);
    };
    this.#mel = await open("melspectrogram.onnx");
    this.#embed = await open("embedding_model.onnx");
    for (const word of this.#options.words) {
      this.#words.set(word, await open(`${word}.onnx`));
      this.#log.info("loaded wake word", word);
    }
  }

  /** One detector per audio stream. They share the weights, not the state. */
  detector(label = "local"): WakeWord {
    if (!this.#mel || !this.#embed) throw new Error("openWakeWord models are not loaded; call load() first.");
    return new WakeWord(
      { mel: this.#mel, embed: this.#embed, words: this.#words },
      this.#options,
      label,
      this.#log,
    );
  }

  async doctor(): Promise<Check[]> {
    const missing = [...SHARED_MODELS, ...this.#options.words.map((word) => `${word}.onnx`)].filter(
      (file) => !existsSync(join(this.#modelDir, file)),
    );
    return [
      {
        name: "wake word models",
        status: missing.length ? "fail" : "ok",
        detail: missing.length
          ? `missing from ${this.#modelDir}: ${missing.join(", ")}. Run parlour models fetch.`
          : this.#modelDir,
      },
    ];
  }
}

interface Sessions {
  mel: ort.InferenceSession;
  embed: ort.InferenceSession;
  words: Map<string, ort.InferenceSession>;
}

export class WakeWord implements WakeWordDetector {
  #melBuffer: Float32Array[] = [];
  #embedBuffer: Float32Array[] = [];
  #mutedUntil = 0;

  readonly #sessions: Sessions;
  readonly #options: OpenWakeWordOptions;
  readonly #label: string;
  readonly #log: Logger;

  constructor(sessions: Sessions, options: OpenWakeWordOptions, label: string, log: Logger) {
    this.#sessions = sessions;
    this.#options = options;
    this.#label = label;
    this.#log = log;
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

    const melOut = await run(this.#sessions.mel, [1, frame.length], audio);
    // openWakeWord's training-time transform, applied to the raw mel output.
    for (let i = 0; i < melOut.length; i += MEL_BINS) {
      const row = new Float32Array(MEL_BINS);
      for (let b = 0; b < MEL_BINS; b++) row[b] = melOut[i + b]! / 10 + 2;
      this.#melBuffer.push(row);
    }

    while (this.#melBuffer.length >= EMBED_WINDOW) {
      const flat = new Float32Array(EMBED_WINDOW * MEL_BINS);
      for (let f = 0; f < EMBED_WINDOW; f++) flat.set(this.#melBuffer[f]!, f * MEL_BINS);
      const embedding = await run(this.#sessions.embed, [1, EMBED_WINDOW, MEL_BINS, 1], flat);
      this.#embedBuffer.push(new Float32Array(embedding.slice(0, EMBED_DIM)));
      if (this.#embedBuffer.length > CONTEXT) this.#embedBuffer.shift();
      this.#melBuffer = this.#melBuffer.slice(EMBED_STRIDE);
    }

    if (this.#embedBuffer.length < CONTEXT) return null;
    if (Date.now() < this.#mutedUntil) return null;

    const context = new Float32Array(CONTEXT * EMBED_DIM);
    for (let i = 0; i < CONTEXT; i++) context.set(this.#embedBuffer[i]!, i * EMBED_DIM);

    for (const [word, session] of this.#sessions.words) {
      const [score] = await run(session, [1, CONTEXT, EMBED_DIM], context);
      if (score! >= this.#options.threshold) {
        this.#log.info(`"${word}" fired at ${score!.toFixed(2)} on ${this.#label}`);
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

export function createOpenWakeWord(options: OpenWakeWordOptions, context: ProviderContext): WakeWordEngine {
  return new OpenWakeWord(options, join(context.paths.modelsDir, "openwakeword"), context.log);
}

export const openWakeWordDefinition = defineProvider<WakeWordEngine>({
  kind: "wake",
  name: "openwakeword",
  description: "openWakeWord, run in process with onnxruntime",
  schema: OpenWakeWordSchema,
  create: (options, context) => createOpenWakeWord(options as OpenWakeWordOptions, context),
});

registerProvider(openWakeWordDefinition);
