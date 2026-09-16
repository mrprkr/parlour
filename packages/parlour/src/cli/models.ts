import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { type Command, parseCli, subcommand } from "./args.ts";
import { humanReporter, type Reporter } from "./output.ts";

const USAGE = [
  "parlour models fetch [--wake w1,w2] [--whisper ggml-small.en.bin]   download what is missing",
];

const OPENWAKEWORD = "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1";
const WHISPER = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/** The shared front end: audio to mel spectrogram, mel to speech embedding. */
const SHARED = ["melspectrogram.onnx", "embedding_model.onnx"];
export const DEFAULT_WAKE_WORDS = ["hey_jarvis", "alexa", "hey_mycroft"];
/**
 * small.en is the sweet spot on Apple silicon: near enough to medium on short
 * commands, and fast enough that nobody notices it running.
 */
export const DEFAULT_WHISPER_MODEL = "ggml-small.en.bin";

export interface FetchModelsOptions {
  modelsDir: string;
  wake?: string[];
  /** Null fetches no whisper model, for a satellite. */
  whisper?: string | null;
  report?: Reporter;
}

/**
 * The models the agent needs, into the cache. They are large and not ours to
 * redistribute, so they are fetched rather than shipped. Anything already
 * there is left alone, so this is safe to run again and cheap when nothing
 * is missing.
 */
export async function fetchModels(options: FetchModelsOptions): Promise<void> {
  const report = options.report ?? humanReporter();
  const wakeDir = join(options.modelsDir, "openwakeword");
  const whisperDir = join(options.modelsDir, "whisper");
  mkdirSync(wakeDir, { recursive: true });
  mkdirSync(whisperDir, { recursive: true });

  for (const file of SHARED) await fetchFile(`${OPENWAKEWORD}/${file}`, join(wakeDir, file), report);
  // One classifier per wake word. The version suffix is dropped so config can
  // name them as plain words.
  for (const word of options.wake ?? DEFAULT_WAKE_WORDS) {
    await fetchFile(`${OPENWAKEWORD}/${word}_v0.1.onnx`, join(wakeDir, `${word}.onnx`), report);
  }
  const whisper = options.whisper === undefined ? DEFAULT_WHISPER_MODEL : options.whisper;
  if (whisper) await fetchFile(`${WHISPER}/${whisper}`, join(whisperDir, whisper), report);

  report.ok("Kokoro downloads itself on first use, into the transformers.js cache.");
}

/** An answer that will not change on a retry: a mistyped wake word is a 404 every time. */
class NotFetchable extends Error {}

/**
 * Downloaded to a `.part` file and renamed, so a half-finished file is never
 * mistaken for a model. A dropped connection or a server error is tried
 * again; a 4xx is reported straight away, since asking three times does not
 * make a file exist.
 */
async function fetchFile(url: string, file: string, report: Reporter): Promise<void> {
  if (existsSync(file)) {
    report.ok(`have ${file}`);
    return;
  }
  report.ok(`fetching ${file}`);
  const part = `${file}.part`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok || !response.body) {
        const message = `${url} answered ${response.status}`;
        throw response.status >= 400 && response.status < 500
          ? new NotFetchable(message)
          : new Error(message);
      }
      // The fetch body is typed as the DOM stream; node's own web stream type
      // is what fromWeb wants, and the two are the same object at run time.
      await pipeline(Readable.fromWeb(response.body as unknown as ReadableStream), createWriteStream(part));
      await rename(part, file);
      return;
    } catch (error) {
      lastError = error;
      await rm(part, { force: true });
      if (error instanceof NotFetchable) break;
    }
  }
  throw new Error(
    `could not fetch ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export const command: Command = {
  name: "models",
  summary: "Fetch the wake word and whisper models into the cache.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, {
      wake: { type: "string" },
      whisper: { type: "string" },
    });
    subcommand(positionals, ["fetch"] as const, USAGE);
    await fetchModels({
      modelsDir: paths.modelsDir,
      wake: typeof values.wake === "string" ? values.wake.split(",").filter(Boolean) : undefined,
      whisper: typeof values.whisper === "string" ? values.whisper : undefined,
    });
  },
};
