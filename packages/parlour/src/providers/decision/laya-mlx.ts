import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { type Logger, logger } from "../../core/logger.ts";
import type {
  Check,
  DecisionAnswer,
  DecisionInstructions,
  DecisionModel,
  DecisionQuestion,
  DecisionResult,
  DecisionState,
} from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

/**
 * On-device Laya MLX: typed decisions on Apple Silicon without a cloud API.
 * A warm Python worker keeps the checkpoint loaded; each evaluate is a JSONL
 * round trip over stdin/stdout.
 * @see https://github.com/mizorewww/laya-mlx
 */
export const LayaMlxSchema = z.object({
  /** Hugging Face id or local path. Default is the English FP16 MLX checkpoint. */
  model: z.string().default("aac6fef/laya-mlx"),
  python: z.string().default("python3"),
  dtype: z.enum(["float16", "float32"]).default("float16"),
  device: z.enum(["gpu", "cpu"]).default("gpu"),
  /** How long to wait for the worker to finish loading the checkpoint. */
  loadTimeoutMs: z.number().int().positive().default(180_000),
  /** How long one evaluate may take once the model is warm. */
  timeoutMs: z.number().int().positive().default(15_000),
});

export type LayaMlxOptions = z.infer<typeof LayaMlxSchema>;

type Pending = {
  resolve: (result: DecisionResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class LayaMlxDecisionModel implements DecisionModel {
  readonly label: string;
  readonly #opts: LayaMlxOptions;
  readonly #log: Logger;
  readonly #workerPath: string;
  #proc: ChildProcessWithoutNullStreams | null = null;
  #ready: Promise<void> | null = null;
  #buffer = "";
  #nextId = 1;
  readonly #pending = new Map<string, Pending>();
  #modelId: string;

  constructor(opts: LayaMlxOptions, workerPath = defaultWorkerPath(), log?: Logger) {
    this.#opts = opts;
    this.#log = log ?? logger("laya-mlx");
    this.#workerPath = workerPath;
    this.#modelId = opts.model;
    this.label = `decision:laya-mlx:${opts.model}`;
  }

  async evaluate(state: DecisionState, questions: Record<string, DecisionQuestion>): Promise<DecisionResult> {
    await this.#ensureReady();
    const id = String(this.#nextId++);
    const payload = JSON.stringify({
      id,
      state,
      questions: prepareQuestions(questions),
    });

    return new Promise<DecisionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Laya MLX timed out after ${this.#opts.timeoutMs}ms`));
      }, this.#opts.timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#proc!.stdin.write(`${payload}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async doctor(): Promise<Check[]> {
    if (!existsSync(this.#workerPath)) {
      return [
        {
          name: "laya-mlx",
          status: "fail",
          detail: `worker missing at ${this.#workerPath}`,
        },
      ];
    }
    try {
      await this.#ensureReady();
      return [
        {
          name: "laya-mlx",
          status: "ok",
          detail: `${this.#modelId} warm on-device (${this.#opts.dtype})`,
        },
      ];
    } catch (error) {
      return [
        {
          name: "laya-mlx",
          status: "fail",
          detail: error instanceof Error ? error.message : String(error),
        },
      ];
    }
  }

  close(): void {
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Laya MLX worker closed"));
      this.#pending.delete(id);
    }
    this.#ready = null;
    const proc = this.#proc;
    this.#proc = null;
    if (!proc) return;
    proc.stdin.end();
    proc.kill("SIGTERM");
  }

  #ensureReady(): Promise<void> {
    if (!this.#ready) this.#ready = this.#start();
    return this.#ready;
  }

  #start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!existsSync(this.#workerPath)) {
        reject(new Error(`Laya MLX worker not found at ${this.#workerPath}`));
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

      const proc = spawn(this.#opts.python, [this.#workerPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PARLOUR_LAYA_MODEL: this.#opts.model,
          PARLOUR_LAYA_DTYPE: this.#opts.dtype,
          PARLOUR_LAYA_DEVICE: this.#opts.device,
          // Hugging Face downloads land in the user cache; keep them quiet.
          HF_HUB_DISABLE_PROGRESS_BARS: "1",
          PYTHONUNBUFFERED: "1",
        },
      });
      this.#proc = proc;
      this.#buffer = "";

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        fail(
          new Error(
            `Laya MLX did not become ready within ${this.#opts.loadTimeoutMs}ms. Is laya-mlx installed (pip install laya-mlx)?`,
          ),
        );
      }, this.#opts.loadTimeoutMs);

      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => this.#onStdout(chunk, succeed, fail));

      proc.stderr.setEncoding("utf8");
      proc.stderr.on("data", (chunk: string) => {
        for (const line of chunk.split(/\r?\n/).filter(Boolean)) this.#log.debug(line);
      });

      proc.on("error", (error) => fail(error));
      proc.on("close", (code) => {
        const message = `Laya MLX worker exited${code === null ? "" : ` with ${code}`}`;
        for (const [id, pending] of this.#pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error(message));
          this.#pending.delete(id);
        }
        this.#proc = null;
        this.#ready = null;
        if (!settled) fail(new Error(message));
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
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        this.#log.warn("ignored non-json from worker:", line.slice(0, 120));
        continue;
      }

      if (message.ready === true) {
        if (typeof message.model === "string") this.#modelId = message.model;
        this.#log.info("ready:", this.#modelId);
        onReady();
        continue;
      }
      if (message.ready === false) {
        onReadyFail(new Error(String(message.error ?? "Laya MLX failed to start")));
        continue;
      }

      const id = message.id === null || message.id === undefined ? null : String(message.id);
      if (id === null) continue;
      const pending = this.#pending.get(id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.#pending.delete(id);
      if (message.ok) {
        pending.resolve({
          model: typeof message.model === "string" ? message.model : this.#modelId,
          answers: (message.answers ?? {}) as Record<string, DecisionAnswer>,
        });
      } else {
        pending.reject(new Error(String(message.error ?? "Laya MLX evaluate failed")));
      }
    }
  }
}

/** Flatten structured instructions; Laya's examples use plain strings. */
export function prepareQuestions(
  questions: Record<string, DecisionQuestion>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, question] of Object.entries(questions)) {
    const prepared: Record<string, unknown> = {
      type: question.type,
      instructions: flattenInstructions(question.instructions),
    };
    if (question.type === "choice") prepared.criteria = question.criteria;
    else if (question.type === "score") prepared.criteria = question.criteria;
    else if (question.criteria) prepared.criteria = question.criteria;
    out[id] = prepared;
  }
  return out;
}

export function flattenInstructions(instructions: DecisionInstructions): string {
  if (typeof instructions === "string") return instructions;
  const question = instructions.question;
  if (typeof question === "string") {
    const extras = Object.entries(instructions)
      .filter(([key]) => key !== "question")
      .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
      .join("\n");
    return extras ? `${question}\n${extras}` : question;
  }
  return JSON.stringify(instructions);
}

function defaultWorkerPath(): string {
  // Source: next to this file. Built: copied beside the compiled js.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "laya-worker.py");
}

export function createLayaMlx(options: LayaMlxOptions, context: ProviderContext): LayaMlxDecisionModel {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("laya-mlx needs Apple Silicon (darwin/arm64)");
  }
  return new LayaMlxDecisionModel(options, defaultWorkerPath(), context.log);
}

export const layaMlxProvider = defineProvider<LayaMlxDecisionModel>({
  kind: "decision",
  name: "laya-mlx",
  description: "On-device Laya typed decisions via MLX on Apple Silicon",
  schema: LayaMlxSchema,
  create: (options, context) => createLayaMlx(options as LayaMlxOptions, context),
});

registerProvider(layaMlxProvider);
