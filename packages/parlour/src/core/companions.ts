import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, renameSync, statSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import type { Logger } from "./logger.ts";
import type { ServiceSpec } from "./ports.ts";
import { killOnExit } from "./process.ts";

/**
 * What launchd does for a Parlour outside the sandbox, done by `parlour
 * start` for one inside it: the servers the agent talks to (whisper, the
 * local model) started beside it and stopped with it. The App Store app may
 * not install a LaunchAgent, so the agent's own process is the only thing
 * left that can keep them warm.
 *
 * Each companion logs to the file its LaunchAgent would have, so `parlour
 * service logs` reads the same place either way. One that dies is restarted
 * after a pause, as launchd's KeepAlive would, until `stop` is called.
 */

/** What launchd's logs are held to, so a companion's are too. */
export const MAX_LOG_BYTES = 8 * 1024 * 1024;

/**
 * A log file that never grows past `max`: when a write would take it over, the
 * file becomes `<path>.1`, replacing the one before, and writing starts again.
 * A write that fails (a full disk, a deleted directory) is dropped and said
 * once, because the agent going down over a log is worse than a gap in it.
 */
export class BoundedLog {
  readonly #path: string;
  readonly #max: number;
  readonly #warn: (message: string) => void;
  #fd: number | null = null;
  #size = 0;
  #warned = false;

  constructor(path: string, warn: (message: string) => void, max = MAX_LOG_BYTES) {
    this.#path = path;
    this.#max = max;
    this.#warn = warn;
  }

  write(chunk: Buffer): void {
    try {
      if (this.#fd === null) this.#open();
      if (this.#size + chunk.length > this.#max && this.#size > 0) {
        this.close();
        renameSync(this.#path, `${this.#path}.1`);
        this.#open();
      }
      writeSync(this.#fd as number, chunk);
      this.#size += chunk.length;
    } catch (error) {
      if (!this.#warned)
        this.#warn(`${this.#path}: ${error instanceof Error ? error.message : String(error)}`);
      this.#warned = true;
    }
  }

  close(): void {
    if (this.#fd !== null) closeSync(this.#fd);
    this.#fd = null;
  }

  #open(): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    this.#fd = openSync(this.#path, "a");
    this.#size = statSync(this.#path).size;
  }
}

export type Spawn = (command: string, args: string[], env: Record<string, string>) => ChildProcess;

export interface CompanionOptions {
  log: Logger;
  /** Replaceable so a test can watch the calls without running anything. */
  spawn?: Spawn;
  /** How long a dead companion waits before it is started again. */
  restartMs?: number;
}

export interface Companions {
  stop(): void;
}

const defaultSpawn: Spawn = (command, args, env) =>
  spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });

export function startCompanions(specs: ServiceSpec[], options: CompanionOptions): Companions {
  const { log, restartMs = 5000 } = options;
  const run = options.spawn ?? defaultSpawn;
  const children = new Set<ChildProcess>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;

  const start = (spec: ServiceSpec) => {
    const [command, ...args] = spec.program;
    if (!command) return;
    log.info(`starting ${spec.what}`);
    const child = run(command, args, spec.env);
    children.add(child);
    killOnExit(child);

    // One file per companion however many times it restarts, held to the
    // same size launchd's logs are, so a crash loop cannot fill the container.
    const file = new BoundedLog(spec.logPath, (message) => log.warn(`${spec.what} log: ${message}`));
    const write = (chunk: Buffer) => file.write(chunk);
    child.stdout?.on("data", write);
    child.stderr?.on("data", write);

    child.on("error", (error) => log.warn(`${spec.what}: ${error.message}`));
    child.on("exit", (code, signal) => {
      children.delete(child);
      file.close();
      if (stopped) return;
      log.warn(`${spec.what} exited (${signal ?? code}), starting it again`);
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!stopped) start(spec);
      }, restartMs);
      timers.add(timer);
    });
  };

  for (const spec of specs) start(spec);

  return {
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      for (const child of children) child.kill("SIGTERM");
    },
  };
}
