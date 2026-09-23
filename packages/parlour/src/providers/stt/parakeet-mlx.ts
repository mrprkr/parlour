import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Logger } from "../../core/logger.ts";
import type { Check, SpeechToText } from "../../core/ports.ts";
import { findOnPath, withTempWav } from "../../core/process.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

export const parakeetMlxSchema = z.object({
  /** Hugging Face id or local path. v3 trades a little English for 25 languages. */
  model: z.string().default("mlx-community/parakeet-tdt-0.6b-v2"),
  /** A Python that can import parakeet_mlx, such as a venv's own. */
  python: z.string().default("python3"),
  /** How long to wait for the worker to load the model, which the first time includes the download. */
  loadTimeoutMs: z.number().int().positive().default(300_000),
  /** How long one utterance may take once the model is warm. */
  timeoutMs: z.number().int().positive().default(20_000),
});

export type ParakeetMlxOptions = z.infer<typeof parakeetMlxSchema>;

export type WorkerMessage =
  | { kind: "ready"; model?: string }
  | { kind: "failed"; error: string }
  | { kind: "reply"; id: string; ok: true; text: string }
  | { kind: "reply"; id: string; ok: false; error: string };

/** One line from the worker, or null for anything that is not part of the protocol. */
export function parseWorkerLine(line: string): WorkerMessage | null {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (message.ready === true) {
    return { kind: "ready", model: typeof message.model === "string" ? message.model : undefined };
  }
  if (message.ready === false) {
    return { kind: "failed", error: String(message.error ?? "Parakeet failed to start") };
  }
  if (message.id === null || message.id === undefined) return null;
  const id = String(message.id);
  if (message.ok === true) return { kind: "reply", id, ok: true, text: String(message.text ?? "").trim() };
  return { kind: "reply", id, ok: false, error: String(message.error ?? "Parakeet transcription failed") };
}

type Pending = { resolve: (text: string) => void; reject: (error: Error) => void };

/**
 * NVIDIA's Parakeet TDT, ported to Apple's MLX by parakeet-mlx. A warm Python
 * worker keeps the model loaded, because loading it is seconds and an
 * utterance is a fraction of one. The worker starts on the first utterance,
 * not at boot, so `parlour text` and `parlour doctor` never pay for it.
 * @see https://github.com/senstella/parakeet-mlx
 */
export class ParakeetMlx implements SpeechToText {
  readonly #options: ParakeetMlxOptions;
  readonly #log: Logger;
  readonly #workerPath: string;
  #proc: ChildProcessWithoutNullStreams | null = null;
  #ready: Promise<void> | null = null;
  #buffer = "";
  #nextId = 1;
  readonly #pending = new Map<string, Pending>();

  constructor(options: ParakeetMlxOptions, log: Logger, workerPath = defaultWorkerPath()) {
    this.#options = options;
    this.#log = log;
    this.#workerPath = workerPath;
  }

  async transcribe(wav: Buffer): Promise<string> {
    await this.#ensureReady();
    return withTempWav(async (file) => {
      await writeFile(file, wav);
      const started = Date.now();
      const text = await this.#request(file);
      this.#log.debug(`transcribed in ${Date.now() - started}ms:`, text);
      return text;
    });
  }

  async doctor(): Promise<Check[]> {
    if (process.platform !== "darwin" || process.arch !== "arm64") {
      return [{ name: "parakeet-mlx", status: "fail", detail: "parakeet-mlx needs Apple silicon." }];
    }
    const checks: Check[] = [];
    const ffmpeg = await findOnPath("ffmpeg");
    checks.push({
      name: "ffmpeg for parakeet",
      status: ffmpeg ? "ok" : "fail",
      detail: ffmpeg ?? "parakeet-mlx reads audio through ffmpeg. brew install ffmpeg",
    });
    if (!existsSync(this.#workerPath)) {
      checks.push({ name: "parakeet-mlx", status: "fail", detail: `worker missing at ${this.#workerPath}` });
      return checks;
    }
    const importable = await canImport(this.#options.python);
    checks.push({
      name: "parakeet-mlx",
      status: importable ? "ok" : "fail",
      detail: importable
        ? `${this.#options.model}, loaded on the first utterance`
        : `${this.#options.python} cannot import parakeet_mlx. pip install parakeet-mlx, or point stt.python at a venv that has it.`,
    });
    return checks;
  }

  close(): void {
    this.#rejectAll(new Error("Parakeet worker closed"));
    this.#ready = null;
    const proc = this.#proc;
    this.#proc = null;
    if (!proc) return;
    proc.stdin.end();
    proc.kill("SIGTERM");
  }

  #request(path: string): Promise<string> {
    const id = String(this.#nextId++);
    const { timeoutMs } = this.#options;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`parakeet took longer than ${timeoutMs}ms`));
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (text) => {
          clearTimeout(timer);
          resolve(text);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        this.#proc!.stdin.write(`${JSON.stringify({ id, path })}\n`);
      } catch (error) {
        this.#pending.get(id)?.reject(error instanceof Error ? error : new Error(String(error)));
        this.#pending.delete(id);
      }
    });
  }

  #ensureReady(): Promise<void> {
    if (!this.#ready) this.#ready = this.#start();
    return this.#ready;
  }

  #start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!existsSync(this.#workerPath)) {
        this.#ready = null;
        reject(new Error(`Parakeet worker not found at ${this.#workerPath}`));
        return;
      }

      let settled = false;
      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#ready = null;
        this.#proc = null;
        reject(error);
      };

      const proc = spawn(this.#options.python, [this.#workerPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PARLOUR_PARAKEET_MODEL: this.#options.model,
          HF_HUB_DISABLE_PROGRESS_BARS: "1",
          PYTHONUNBUFFERED: "1",
        },
      });
      this.#proc = proc;
      this.#buffer = "";
      // A worker nobody is waiting on must not keep a command from exiting;
      // the timers of an utterance in flight keep the loop alive while it is.
      proc.unref();
      for (const stream of [proc.stdin, proc.stdout, proc.stderr]) {
        (stream as unknown as { unref?: () => void }).unref?.();
      }

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        fail(new Error(`Parakeet did not load within ${this.#options.loadTimeoutMs}ms`));
      }, this.#options.loadTimeoutMs);

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => this.#onStdout(chunk, succeed, fail));
      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        for (const line of chunk.split(/\r?\n/).filter(Boolean)) this.#log.debug(line);
      });

      proc.on("error", (error) => fail(error));
      proc.on("close", (code) => {
        const message = `Parakeet worker exited${code === null ? "" : ` with ${code}`}`;
        this.#rejectAll(new Error(message));
        if (this.#proc === proc) {
          this.#proc = null;
          this.#ready = null;
        }
        fail(new Error(message));
      });
    });
  }

  #onStdout(chunk: string, onReady: () => void, onReadyFail: (error: Error) => void): void {
    this.#buffer += chunk;
    let newline = this.#buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);
      newline = this.#buffer.indexOf("\n");
      if (!line) continue;
      const message = parseWorkerLine(line);
      if (!message) {
        this.#log.debug("ignored from worker:", line.slice(0, 120));
        continue;
      }
      if (message.kind === "ready") {
        this.#log.info("ready:", message.model ?? this.#options.model);
        onReady();
      } else if (message.kind === "failed") {
        onReadyFail(new Error(message.error));
      } else {
        const pending = this.#pending.get(message.id);
        if (!pending) continue;
        this.#pending.delete(message.id);
        if (message.ok) pending.resolve(message.text);
        else pending.reject(new Error(message.error));
      }
    }
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}

async function canImport(python: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(python, ["-c", "import parakeet_mlx"], { stdio: "ignore" });
    const timer = setTimeout(() => proc.kill("SIGTERM"), 20_000);
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

function defaultWorkerPath(): string {
  // Source: next to this file. Built: copied beside the compiled js.
  return join(dirname(fileURLToPath(import.meta.url)), "parakeet-worker.py");
}

export const parakeetMlx = defineProvider<SpeechToText>({
  kind: "stt",
  name: "parakeet-mlx",
  description: "NVIDIA's Parakeet on Apple silicon through MLX, kept warm in a local Python worker",
  schema: parakeetMlxSchema,
  create: (options, context: ProviderContext) => new ParakeetMlx(options as ParakeetMlxOptions, context.log),
});

registerProvider(parakeetMlx);
