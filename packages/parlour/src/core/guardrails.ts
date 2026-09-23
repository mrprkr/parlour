import { statSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";

/**
 * What keeps Parlour from taking the Mac down with it. The local model and
 * whisper share the machine with whoever is sitting at it, and on Apple
 * silicon they share its memory with the GPU too: a model that does not fit
 * does not fail politely, it pages the whole machine into the ground. So
 * everything that starts one of them asks here first, and the answers are the
 * same whether launchd, the sandbox or a client on the network is asking.
 */

/** Above this share of the machine's memory a model's weights are refused outright. */
export const MEMORY_REFUSE = 0.7;
/** Above this share it runs, and the doctor says the Mac will feel it. */
export const MEMORY_WARN = 0.5;

export interface MemoryVerdict {
  status: "ok" | "warn" | "refuse";
  detail: string;
}

/**
 * Whether a model file of `bytes` is safe to load on a machine with `total`
 * bytes of memory. The weights are only part of it: the context, whisper,
 * the agent and macOS itself want the rest, which is why the line is well
 * short of all of it.
 */
export function memoryVerdict(bytes: number, total: number = totalmem()): MemoryVerdict {
  const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
  const share = bytes / total;
  const sizes = `${gb(bytes)} of weights on a Mac with ${gb(total)}`;
  if (share > MEMORY_REFUSE) {
    return {
      status: "refuse",
      detail: `${sizes} leaves too little for macOS, so it is not started. parlour models suggests one that fits`,
    };
  }
  if (share > MEMORY_WARN) {
    return { status: "warn", detail: `${sizes}: it runs, and the rest of the Mac will feel it` };
  }
  return { status: "ok", detail: sizes };
}

/** The file a server is told to load with `--model`, if it is told one. */
export function modelFileOf(program: readonly string[]): string | undefined {
  const index = program.indexOf("--model");
  return index >= 0 ? program[index + 1] : undefined;
}

/** The verdict for a service's model, or null when it names no model or the file is missing. */
export function programMemoryVerdict(program: readonly string[], total?: number): MemoryVerdict | null {
  const file = modelFileOf(program);
  if (!file) return null;
  try {
    return memoryVerdict(statSync(file).size, total);
  } catch {
    return null;
  }
}

/**
 * Threads for a model server: most of the machine, never all of it, so the
 * window someone is typing in still gets a core when a long answer is being
 * generated. Six is where whisper and llama.cpp stop getting faster on the
 * performance cores of an M-series chip.
 */
export function threadBudget(cores: number = availableParallelism()): number {
  return Math.max(1, Math.min(6, cores - 2));
}

/**
 * How long to wait before starting a crashed companion again, or null to
 * give up. A model that dies on load dies again on the next load, and a loop
 * of loading a few gigabytes every five seconds is exactly the kind of
 * freeze this file exists to prevent.
 */
export class RestartBackoff {
  readonly #delays: readonly number[];
  readonly #window: number;
  readonly #limit: number;
  readonly #now: () => number;
  #crashes: number[] = [];

  constructor(options: { delaysMs?: number[]; windowMs?: number; limit?: number; now?: () => number } = {}) {
    this.#delays = options.delaysMs ?? [5_000, 15_000, 60_000];
    this.#window = options.windowMs ?? 10 * 60_000;
    this.#limit = options.limit ?? 5;
    this.#now = options.now ?? Date.now;
  }

  /** Records a crash and says how long to wait, or null when it has crashed too often to try again. */
  crashed(): number | null {
    const now = this.#now();
    this.#crashes = [...this.#crashes.filter((at) => now - at < this.#window), now];
    if (this.#crashes.length >= this.#limit) return null;
    return this.#delays[Math.min(this.#crashes.length - 1, this.#delays.length - 1)] ?? 0;
  }

  /** A deliberate start, which forgives what came before. */
  reset(): void {
    this.#crashes = [];
  }
}
